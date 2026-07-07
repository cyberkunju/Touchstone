import * as Comlink from 'comlink';
import * as ort from 'onnxruntime-web';
import {
  postProcessYolo,
  computeLetterbox,
  normalizeYoloTensor,
  YoloDetection,
} from '../ai-runtime/yolo';
import {
  normalizeDetectorTensor,
  postProcessDBNet,
  postProcessDBNetQuads,
  normalizeRecognitionTensor,
  computeRecTargetWidth,
  decodeCTCGreedy,
  planDetBands,
  dedupeBoxes,
  OcrRecResult,
  DbnetPostOptions,
  type DetectedQuad,
} from '../ai-runtime/ocr';
import { extractLattice, extractProjectedLattice, greedyFromLattice, type Lattice } from '../beam/lattice';
import {
  YUNET_INPUT_SIZE,
  buildYuNetBlob,
  decodeYuNet,
  type FaceDetection,
  type YuNetOutputs,
} from '../ai-runtime/yunet';
import { enhanceForOcr } from '../ai-runtime/image-enhance';

/** Recognition result carrying the top-k CTC lattice (contract: Documentation/06 §3). */
export type OcrRecWithLattice = OcrRecResult & { lattice: Lattice };
import {
  REC_INPUT_HEIGHT,
  REC_MAX_WIDTH,
  DET_LIMIT_SIDE,
  DET_SIZE_MULTIPLE,
  DET_BAND_ASPECT,
  DET_BAND_SIDE,
  DET_BAND_OVERLAP,
  DEFAULT_LAYOUT_INPUT_SIZE,
} from '../ai-runtime/model-registry';
import { Box } from '../core/geometry';

// onnxruntime-web loads its wasm runtime from the app's own origin (/ort/,
// served from public/ort) — never a CDN — so inference runs fully on-device
// per the local-only directive.
ort.env.wasm.wasmPaths = '/ort/';
// Use multiple threads when cross-origin isolation (SharedArrayBuffer) is
// available. This dramatically speeds up the WASM execution path, which the
// PP-OCRv5 models use. Falls back to single-thread when SAB is unavailable.
{
  const sabAvailable = typeof SharedArrayBuffer !== 'undefined';
  const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
  ort.env.wasm.numThreads = sabAvailable ? Math.min(8, Math.max(2, cores)) : 1;
}

interface ModelSession {
  session: ort.InferenceSession;
  modelName: string;
  ep: 'webgpu' | 'wasm';
  /** Kept until the working execution provider is confirmed, then released. */
  buffer?: ArrayBuffer;
  /**
   * Square input side (px) the layout model was exported with (metadata.imgsz).
   * The worker letterboxes to this exact size and builds a
   * `[1,3,inputSize,inputSize]` tensor. Static-shape detectors throw on
   * `session.run` if the tensor side differs. Only set for layout models.
   */
  inputSize?: number;
  /** Class names (index == class id) from the model's classes.json. Layout only. */
  classNames?: string[];
}

const loadedSessions: Record<string, ModelSession> = {};

/** Recognition vocabulary (dictionary chars + trailing space). Set by the app. */
let recognitionVocab: string[] | null = null;

/**
 * Runs a model session with a transparent WebGPU→WASM fallback. ORT's WebGPU
 * backend does not implement every ONNX op (e.g. MaxPool with ceil_mode), so a
 * session can create on WebGPU yet throw on the first run. When that happens we
 * rebuild the session on WASM (which has full op coverage) and retry, then keep
 * using WASM for that model. The model buffer is released once the working EP
 * is confirmed.
 */
async function runSession(
  info: ModelSession,
  feeds: Record<string, ort.Tensor>,
): Promise<ort.InferenceSession.OnnxValueMapType> {
  try {
    const out = await info.session.run(feeds);
    // First successful run confirms the current EP; drop the retained buffer.
    info.buffer = undefined;
    return out;
  } catch (e) {
    if (info.ep === 'webgpu' && info.buffer) {
      console.warn(
        `[Inference Worker] WebGPU run failed for ${info.modelName} (likely an unsupported op); rebuilding on WASM.`,
        e,
      );
      const session = await ort.InferenceSession.create(info.buffer, {
        executionProviders: ['wasm'],
      });
      info.session = session;
      info.ep = 'wasm';
      const out = await info.session.run(feeds);
      info.buffer = undefined;
      return out;
    }
    throw e;
  }
}

/** Snap a dimension to a multiple of `mult`, with a minimum of `mult`. */
function snapToMultiple(value: number, mult: number): number {
  const snapped = Math.round(value / mult) * mult;
  return Math.max(mult, snapped);
}

/** Core DBNet forward pass on a bitmap → raw probability map.
 *  `limitSide` overrides the long-side budget (bands run at DET_BAND_SIDE). */
async function runDetForward(
  sessionInfo: ModelSession,
  imageBitmap: ImageBitmap,
  limitSide: number = DET_LIMIT_SIDE,
): Promise<{ outputData: Float32Array; mapW: number; mapH: number }> {
  const srcW = imageBitmap.width;
  const srcH = imageBitmap.height;
  const longSide = Math.max(srcW, srcH);
  const scale = longSide > limitSide ? limitSide / longSide : 1;
  const targetW = snapToMultiple(srcW * scale, DET_SIZE_MULTIPLE);
  const targetH = snapToMultiple(srcH * scale, DET_SIZE_MULTIPLE);

  const canvas = new OffscreenCanvas(targetW, targetH);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(imageBitmap, 0, 0, targetW, targetH);

  const imageData = ctx.getImageData(0, 0, targetW, targetH);
  const enhanced = enhanceForOcr(imageData.data, targetW, targetH, {
    grayscale: false,
    stretch: true,
    sharpen: false,
  });
  const floatData = normalizeDetectorTensor(enhanced, targetW, targetH);
  const inputTensor = new ort.Tensor('float32', floatData, [1, 3, targetH, targetW]);

  const results = await runSession(sessionInfo, { [sessionInfo.session.inputNames[0]]: inputTensor });
  const outputTensor = results[sessionInfo.session.outputNames[0]];
  return {
    outputData: outputTensor.data as Float32Array,
    mapW: outputTensor.dims[3],
    mapH: outputTensor.dims[2],
  };
}

/** Core DBNet text detection on a bitmap → normalized line boxes.
 *
 * TALL-PAGE BANDING (live-caught: A4 statements read ZERO fields): portrait
 * pages are sliced into overlapping square bands, each detected at the
 * higher per-band budget, boxes remapped to page space and IoU-deduped.
 * Wide pages (every certified card/passport family) keep the exact
 * single-pass path — bit-identical to pre-banding behavior.
 */
async function detectLinesCore(
  sessionInfo: ModelSession,
  imageBitmap: ImageBitmap,
  options?: DbnetPostOptions,
): Promise<Box[]> {
  const bands = planDetBands(
    imageBitmap.width,
    imageBitmap.height,
    DET_BAND_ASPECT,
    DET_BAND_OVERLAP,
  );
  if (bands.length === 1) {
    const { outputData, mapW, mapH } = await runDetForward(sessionInfo, imageBitmap);
    return postProcessDBNet(outputData, mapW, mapH, options);
  }

  const all: Box[] = [];
  for (const band of bands) {
    const c = new OffscreenCanvas(imageBitmap.width, band.sh);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(imageBitmap, 0, band.sy, imageBitmap.width, band.sh, 0, 0, imageBitmap.width, band.sh);
    const bandBitmap = await createImageBitmap(c);
    try {
      const { outputData, mapW, mapH } = await runDetForward(sessionInfo, bandBitmap, DET_BAND_SIDE);
      for (const b of postProcessDBNet(outputData, mapW, mapH, options)) {
        // Band-normalized → page-normalized (x unchanged: bands are full-width).
        all.push([
          b[0],
          (band.sy + b[1] * band.sh) / imageBitmap.height,
          b[2],
          (band.sy + b[3] * band.sh) / imageBitmap.height,
        ]);
      }
    } finally {
      bandBitmap.close();
    }
  }
  return dedupeBoxes(all);
}

/** Core DBNet text detection → rotated quads (for rectified line crops). */
async function detectQuadsCore(
  sessionInfo: ModelSession,
  imageBitmap: ImageBitmap,
  options?: DbnetPostOptions,
): Promise<DetectedQuad[]> {
  const { outputData, mapW, mapH } = await runDetForward(sessionInfo, imageBitmap);
  return postProcessDBNetQuads(outputData, mapW, mapH, options);
}

/** Core PP-OCRv5 recognition on a single line-crop bitmap.
 *
 * `projectAlphabet` (optional): additionally emit `projectedLattice` — the
 * posterior projected onto a restricted alphabet (see extractProjectedLattice)
 * for constrained decoders whose legal charset is tiny (MRZ). The plain text/
 * lattice outputs are unchanged.
 */
async function recognizeCropCore(
  sessionInfo: ModelSession,
  textCropBitmap: ImageBitmap,
  projectAlphabet?: ReadonlySet<string>,
): Promise<OcrRecWithLattice & { projectedLattice?: Lattice }> {
  if (!recognitionVocab) {
    throw new Error('Recognition vocabulary not set. Call setRecognitionVocab first.');
  }
  const imgH = REC_INPUT_HEIGHT;
  const targetW = computeRecTargetWidth(textCropBitmap.width, textCropBitmap.height, imgH, REC_MAX_WIDTH);

  const canvas = new OffscreenCanvas(targetW, imgH);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(textCropBitmap, 0, 0, targetW, imgH);

  const imageData = ctx.getImageData(0, 0, targetW, imgH);
  const enhanced = enhanceForOcr(imageData.data, targetW, imgH, {
    grayscale: false,
    stretch: true,
    sharpen: true,
  });
  const floatData = normalizeRecognitionTensor(enhanced, targetW, imgH, targetW);
  const inputTensor = new ort.Tensor('float32', floatData, [1, 3, imgH, targetW]);

  const results = await runSession(sessionInfo, { [sessionInfo.session.inputNames[0]]: inputTensor });
  const outputTensor = results[sessionInfo.session.outputNames[0]];
  const outputData = outputTensor.data as Float32Array;
  const timeSteps = outputTensor.dims[1];
  const numClasses = outputTensor.dims[2];
  const greedy = decodeCTCGreedy(outputData, timeSteps, numClasses, recognitionVocab);
  // Lattice tap (P1.1/I2): capture top-k BEFORE the collapse discards the
  // distribution — constrained decoders (MRZ/grammars) consume this, not text.
  const lattice = extractLattice(outputData, timeSteps, numClasses, recognitionVocab);
  // Projected top-k is WIDER than the raw lattice's frozen k=5 (plan §17
  // freezes the raw structure; the projection is a separate object): after
  // dropping thousands of illegal classes, rank 6-8 legal chars are exactly
  // where blur-buried truth lives, and beam width (50) absorbs the branching.
  const projectedLattice = projectAlphabet
    ? extractProjectedLattice(outputData, timeSteps, numClasses, recognitionVocab, projectAlphabet, 8)
    : undefined;
  return { ...greedy, lattice, projectedLattice };
}

/** Crop a normalized box out of a bitmap into a new ImageBitmap. */
async function cropBitmap(bitmap: ImageBitmap, box: Box): Promise<ImageBitmap | null> {
  const w = bitmap.width;
  const h = bitmap.height;
  const x1 = Math.max(0, Math.round(box[0] * w));
  const y1 = Math.max(0, Math.round(box[1] * h));
  const x2 = Math.min(w, Math.round(box[2] * w));
  const y2 = Math.min(h, Math.round(box[3] * h));
  const cw = x2 - x1;
  const ch = y2 - y1;
  if (cw <= 0 || ch <= 0) return null;
  const c = new OffscreenCanvas(cw, ch);
  const cx = c.getContext('2d')!;
  cx.drawImage(bitmap, x1, y1, cw, ch, 0, 0, cw, ch);
  return createImageBitmap(c);
}

/**
 * Rectify a rotated-quad line region into an axis-aligned crop (the canvas
 * equivalent of PaddleOCR's get_rotate_crop_image). The quad is a rotated
 * RECTANGLE (TL,TR,BR,BL), so the mapping is exactly affine: TL→(0,0),
 * TR→(W,0), BL→(0,H). Out-of-bounds source pixels land on white — the
 * recognizer's expected background.
 */
async function rectifyQuadBitmap(
  bitmap: ImageBitmap,
  quadNorm: [number, number][],
): Promise<ImageBitmap | null> {
  const w = bitmap.width;
  const h = bitmap.height;
  const [tl, tr, , bl] = quadNorm.map(([qx, qy]) => [qx * w, qy * h] as [number, number]);
  const W = Math.round(Math.hypot(tr[0] - tl[0], tr[1] - tl[1]));
  const H = Math.round(Math.hypot(bl[0] - tl[0], bl[1] - tl[1]));
  if (W < 2 || H < 2) return null;

  // src(dest) = TL + (dx/W)·(TR−TL) + (dy/H)·(BL−TL); invert for canvas.
  const a = (tr[0] - tl[0]) / W;
  const b = (tr[1] - tl[1]) / W;
  const c = (bl[0] - tl[0]) / H;
  const d = (bl[1] - tl[1]) / H;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-9) return null;
  const ia = d / det;
  const ib = -b / det;
  const ic = -c / det;
  const id = a / det;
  const ie = -(ia * tl[0] + ic * tl[1]);
  const iff = -(ib * tl[0] + id * tl[1]);

  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingQuality = 'high';
  ctx.setTransform(ia, ib, ic, id, ie, iff);
  ctx.drawImage(bitmap, 0, 0);
  return createImageBitmap(canvas);
}

const inferenceApi = {
  async isModelLoaded(modelName: string): Promise<boolean> {
    return !!loadedSessions[modelName];
  },

  /** The ACTUAL execution provider a model landed on — for honest runtime
   *  metadata (a WebGPU request can silently fall back to WASM). */
  async getEp(modelName: string): Promise<'webgpu' | 'wasm' | null> {
    return loadedSessions[modelName]?.ep ?? null;
  },

  /** Stores the CTC recognition vocabulary loaded from the dictionary file. */
  async setRecognitionVocab(vocab: string[]): Promise<void> {
    recognitionVocab = vocab;
    console.log(`[Inference Worker] Recognition vocabulary set (${vocab.length} entries).`);
  },

  /**
   * Loads an ONNX model into a session. Prefers WebGPU for performance and
   * uses WASM for portability on devices without WebGPU. Both run fully
   * on-device; no inference data leaves the machine.
   */
  async loadModel(
    modelName: string,
    modelBuffer: ArrayBuffer,
    preferredEp: 'webgpu' | 'wasm' | 'auto' = 'auto',
    layoutOptions?: { inputSize?: number; classNames?: string[] },
  ): Promise<void> {
    console.log(`[Inference Worker] Loading ${modelName} session (prefer ${preferredEp})...`);

    // Layout-detector metadata (sourced from the model spec, which reflects the
    // shipped metadata.json / classes.json). Stored on the session handle so
    // runLayoutDetection can size the tensor and label detections correctly.
    const inputSize = layoutOptions?.inputSize;
    const classNames = layoutOptions?.classNames;

    // Models known to use ops ORT-web's WebGPU backend lacks load straight on
    // WASM, avoiding a wasted WebGPU session compile.
    if (preferredEp === 'wasm') {
      const session = await ort.InferenceSession.create(modelBuffer, {
        executionProviders: ['wasm'],
      });
      console.log(`[Inference Worker] ${modelName} (WASM). Inputs:`, session.inputNames, 'Outputs:', session.outputNames);
      loadedSessions[modelName] = { session, modelName, ep: 'wasm', inputSize, classNames };
      return;
    }

    try {
      const session = await ort.InferenceSession.create(modelBuffer, {
        executionProviders: ['webgpu'],
      });
      console.log(`[Inference Worker] ${modelName} (WebGPU). Inputs:`, session.inputNames, 'Outputs:', session.outputNames);
      // Retain the buffer so we can rebuild on WASM if a WebGPU run fails on an
      // unsupported op. It is released after the first successful inference.
      loadedSessions[modelName] = { session, modelName, ep: 'webgpu', buffer: modelBuffer, inputSize, classNames };
    } catch (e) {
      console.warn(`[Inference Worker] WebGPU unavailable for ${modelName}; using WASM.`, e);
      const session = await ort.InferenceSession.create(modelBuffer, {
        executionProviders: ['wasm'],
      });
      console.log(`[Inference Worker] ${modelName} (WASM). Inputs:`, session.inputNames, 'Outputs:', session.outputNames);
      loadedSessions[modelName] = { session, modelName, ep: 'wasm', inputSize, classNames };
    }
  },

  /**
   * Runs the custom YOLOv11n document-layout detector on a full page image.
   * Uses aspect-preserving letterboxing and maps detections back to original
   * normalized coordinates. Only callable once a real layout model is loaded.
   */
  async runLayoutDetection(
    modelName: string,
    imageBitmap: ImageBitmap,
    confidenceThreshold: number,
    nmsThreshold: number,
  ): Promise<YoloDetection[]> {
    const sessionInfo = loadedSessions[modelName];
    if (!sessionInfo) throw new Error(`Model ${modelName} is not loaded in worker`);

    // Size everything from the model's exported input side (metadata.imgsz),
    // NOT a hardcoded 640. A static-shape model (e.g. 960) throws on
    // session.run if the tensor side doesn't match, yielding zero detections.
    const modelSize = sessionInfo.inputSize ?? DEFAULT_LAYOUT_INPUT_SIZE;
    const srcW = imageBitmap.width;
    const srcH = imageBitmap.height;
    const lb = computeLetterbox(srcW, srcH, modelSize);

    const canvas = new OffscreenCanvas(modelSize, modelSize);
    const ctx = canvas.getContext('2d')!;
    // Fill with 114 gray to match the letterbox padding used in training/export
    // (Ultralytics default). Black padding skews the pixel distribution and
    // produces degraded confidence and seam false-positives.
    ctx.fillStyle = 'rgb(114,114,114)';
    ctx.fillRect(0, 0, modelSize, modelSize);
    const drawW = srcW * lb.scale;
    const drawH = srcH * lb.scale;
    ctx.drawImage(imageBitmap, lb.padX, lb.padY, drawW, drawH);

    const imageData = ctx.getImageData(0, 0, modelSize, modelSize);
    const floatData = normalizeYoloTensor(imageData.data, modelSize);

    const inputTensor = new ort.Tensor('float32', floatData, [1, 3, modelSize, modelSize]);
    const results = await runSession(sessionInfo, { [sessionInfo.session.inputNames[0]]: inputTensor });
    const outputTensor = results[sessionInfo.session.outputNames[0]];
    const outputData = outputTensor.data as Float32Array;

    // YOLOv11 output [1, 4 + numClasses, numAnchors].
    const numClasses = outputTensor.dims[1] - 4;
    const numAnchors = outputTensor.dims[2];

    return postProcessYolo(
      outputData,
      numClasses,
      numAnchors,
      confidenceThreshold,
      nmsThreshold,
      lb,
      srcW,
      srcH,
      sessionInfo.classNames,
    );
  },

  /**
   * YuNet face detection (P1.7): boxes + 5 landmarks in source-normalized
   * coordinates. Presence + geometry ONLY — no recognition, ever.
   * The 2023mar artifact is static 320×320: the source is scaled long-side to
   * 320, top-left anchored, zero-padded (OpenCV padWithDivisor semantics).
   */
  async detectFaces(
    modelName: string,
    imageBitmap: ImageBitmap,
    scoreThreshold = 0.7,
    nmsThreshold = 0.3,
  ): Promise<FaceDetection[]> {
    const sessionInfo = loadedSessions[modelName];
    if (!sessionInfo) throw new Error(`Model ${modelName} is not loaded in worker`);

    const size = sessionInfo.inputSize ?? YUNET_INPUT_SIZE;
    const scale = size / Math.max(imageBitmap.width, imageBitmap.height);
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#000'; // zero padding, matching BORDER_CONSTANT 0
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(
      imageBitmap,
      0, 0, imageBitmap.width, imageBitmap.height,
      0, 0, Math.round(imageBitmap.width * scale), Math.round(imageBitmap.height * scale),
    );

    const blob = buildYuNetBlob(ctx.getImageData(0, 0, size, size).data, size);
    const inputTensor = new ort.Tensor('float32', blob, [1, 3, size, size]);
    const results = await runSession(sessionInfo, { [sessionInfo.session.inputNames[0]]: inputTensor });

    // Outputs are named cls_8/obj_8/bbox_8/kps_8 … _16 … _32.
    const outputs: YuNetOutputs = { cls: {}, obj: {}, bbox: {}, kps: {} };
    for (const name of sessionInfo.session.outputNames) {
      const m = /^(cls|obj|bbox|kps)_(8|16|32)$/.exec(name);
      if (!m) continue;
      outputs[m[1] as keyof YuNetOutputs][Number(m[2])] = results[name].data as Float32Array;
    }

    return decodeYuNet(
      outputs, scale, imageBitmap.width, imageBitmap.height,
      scoreThreshold, nmsThreshold, size,
    );
  },

  /**
   * Runs PP-OCRv5 DBNet text detection on a page image. The image is resized
   * to fit DET_LIMIT_SIDE with both sides snapped to a multiple of 32, then
   * post-processed into normalized text-line boxes.
   */
  async detectText(
    modelName: string,
    imageBitmap: ImageBitmap,
    options?: DbnetPostOptions,
  ): Promise<Box[]> {
    const sessionInfo = loadedSessions[modelName];
    if (!sessionInfo) throw new Error(`Model ${modelName} is not loaded in worker`);
    return detectLinesCore(sessionInfo, imageBitmap, options);
  },

  /**
   * Runs PP-OCRv5 recognition on a single text-line crop. Returns the decoded
   * text, a REAL confidence derived from the CTC softmax probabilities, and
   * the top-k probability lattice for constrained re-decoding (I2/I3).
   */
  async recognizeText(
    modelName: string,
    textCropBitmap: ImageBitmap,
  ): Promise<OcrRecWithLattice> {
    const sessionInfo = loadedSessions[modelName];
    if (!sessionInfo) throw new Error(`Model ${modelName} is not loaded in worker`);
    return recognizeCropCore(sessionInfo, textCropBitmap);
  },

  /**
   * High-resolution region OCR: detects text lines within an already-cropped,
   * upscaled region bitmap and recognizes each, returning lines ordered
   * top-to-bottom. Used to re-read small zones (e.g. the MRZ band) at full
   * resolution instead of relying on the downscaled full-page pass.
   */
  async ocrRegionLines(
    detModelName: string,
    recModelName: string,
    regionBitmap: ImageBitmap,
    options?: DbnetPostOptions & { projectAlphabet?: string; unifyLineWidths?: boolean },
  ): Promise<{ text: string; confidence: number; boxNorm: Box; lattice: Lattice; projectedLattice?: Lattice; projectedText?: string }[]> {
    const detInfo = loadedSessions[detModelName];
    const recInfo = loadedSessions[recModelName];
    if (!detInfo || !recInfo) throw new Error('Detection/recognition model not loaded in worker');

    // Alphabet crosses the Comlink boundary as a plain string (structured
    // clone friendliness); rebuilt into a set here.
    const alphaSet = options?.projectAlphabet
      ? new Set([...options.projectAlphabet])
      : undefined;

    // Rotated quads + affine rectification: under perspective/rotation the
    // axis-aligned crop feeds the recognizer slanted text and neighbor bleed.
    const quads = await detectQuadsCore(detInfo, regionBitmap, options);

    // MRZ-band width unification (live-caught): under heavy blur DBNet loses
    // the faint trailing filler run (`ZOFIA<<<<…` detected only to `ZOFIA`),
    // making the fixed-length format structurally undecodable. ICAO MRZ lines
    // span EQUAL width by spec — so sibling wide lines are extended to their
    // union along their own axis, and the RECOGNIZER (which sees local
    // contrast the detector's threshold discards) judges the faint glyphs.
    // Only lines already ≥35% of the widest width participate — a heavily
    // truncated MRZ line 1 (name span read, filler run lost) sits near 50%,
    // while captions ("PASSPORT", dates) stay under ~25% of a 44-char line.
    if (options?.unifyLineWidths && quads.length >= 2) {
      const widthOf = (q: DetectedQuad) => q.boxNorm[2] - q.boxNorm[0];
      const maxW = Math.max(...quads.map(widthOf));
      const wide = quads.filter((q) => widthOf(q) >= 0.35 * maxW);
      if (wide.length >= 2) {
        const ux1 = Math.min(...wide.map((q) => q.boxNorm[0]));
        const ux2 = Math.max(...wide.map((q) => q.boxNorm[2]));
        for (const q of wide) {
          const extL = q.boxNorm[0] - ux1;
          const extR = ux2 - q.boxNorm[2];
          if (extL < 0.02 && extR < 0.02) continue;
          const [tl, tr, br, bl] = q.quadNorm;
          const wLen = Math.hypot(tr[0] - tl[0], tr[1] - tl[1]);
          if (wLen < 1e-6) continue;
          const ux = (tr[0] - tl[0]) / wLen;
          const uy = (tr[1] - tl[1]) / wLen;
          q.quadNorm = [
            [tl[0] - ux * extL, tl[1] - uy * extL],
            [tr[0] + ux * extR, tr[1] + uy * extR],
            [br[0] + ux * extR, br[1] + uy * extR],
            [bl[0] - ux * extL, bl[1] - uy * extL],
          ];
          q.boxNorm = [
            Math.max(0, Math.min(q.boxNorm[0], ux1)),
            q.boxNorm[1],
            Math.min(1, Math.max(q.boxNorm[2], ux2)),
            q.boxNorm[3],
          ];
        }
      }
    }
    const out: { text: string; confidence: number; boxNorm: Box; lattice: Lattice; projectedLattice?: Lattice; projectedText?: string }[] = [];
    for (const q of quads) {
      const crop =
        (await rectifyQuadBitmap(regionBitmap, q.quadNorm)) ??
        (await cropBitmap(regionBitmap, q.boxNorm));
      if (!crop) continue;
      try {
        const r = await recognizeCropCore(recInfo, crop, alphaSet);
        if (r.text.trim() !== '') {
          out.push({
            text: r.text,
            confidence: r.confidence,
            boxNorm: q.boxNorm,
            lattice: r.lattice,
            projectedLattice: r.projectedLattice,
            // Greedy read over the PROJECTED lattice: already folded to the
            // target alphabet, so shape filters (isMrzLine) see the line as
            // the constrained decoder will — not with raw CJK noise.
            projectedText: r.projectedLattice ? greedyFromLattice(r.projectedLattice).text : undefined,
          });
        }
      } finally {
        crop.close();
      }
    }
    out.sort((a, b) => a.boxNorm[1] - b.boxNorm[1] || a.boxNorm[0] - b.boxNorm[0]);
    return out;
  },
};

Comlink.expose(inferenceApi);
export type InferenceWorkerApi = typeof inferenceApi;
