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
  normalizeRecognitionTensor,
  computeRecTargetWidth,
  decodeCTCGreedy,
  OcrRecResult,
  DbnetPostOptions,
} from '../ai-runtime/ocr';
import { enhanceForOcr } from '../ai-runtime/image-enhance';
import {
  REC_INPUT_HEIGHT,
  REC_MAX_WIDTH,
  DET_LIMIT_SIDE,
  DET_SIZE_MULTIPLE,
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

/** Core DBNet text detection on a bitmap → normalized line boxes. */
async function detectLinesCore(
  sessionInfo: ModelSession,
  imageBitmap: ImageBitmap,
  options?: DbnetPostOptions,
): Promise<Box[]> {
  const srcW = imageBitmap.width;
  const srcH = imageBitmap.height;
  const longSide = Math.max(srcW, srcH);
  const scale = longSide > DET_LIMIT_SIDE ? DET_LIMIT_SIDE / longSide : 1;
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
  const outputData = outputTensor.data as Float32Array;
  const mapH = outputTensor.dims[2];
  const mapW = outputTensor.dims[3];
  return postProcessDBNet(outputData, mapW, mapH, options);
}

/** Core PP-OCRv5 recognition on a single line-crop bitmap. */
async function recognizeCropCore(
  sessionInfo: ModelSession,
  textCropBitmap: ImageBitmap,
): Promise<OcrRecResult> {
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
  return decodeCTCGreedy(outputData, timeSteps, numClasses, recognitionVocab);
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

const inferenceApi = {
  async isModelLoaded(modelName: string): Promise<boolean> {
    return !!loadedSessions[modelName];
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
   * text and a REAL confidence derived from the CTC softmax probabilities.
   */
  async recognizeText(
    modelName: string,
    textCropBitmap: ImageBitmap,
  ): Promise<OcrRecResult> {
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
    options?: DbnetPostOptions,
  ): Promise<{ text: string; confidence: number; boxNorm: Box }[]> {
    const detInfo = loadedSessions[detModelName];
    const recInfo = loadedSessions[recModelName];
    if (!detInfo || !recInfo) throw new Error('Detection/recognition model not loaded in worker');

    const boxes = await detectLinesCore(detInfo, regionBitmap, options);
    const out: { text: string; confidence: number; boxNorm: Box }[] = [];
    for (const box of boxes) {
      const crop = await cropBitmap(regionBitmap, box);
      if (!crop) continue;
      try {
        const r = await recognizeCropCore(recInfo, crop);
        if (r.text.trim() !== '') out.push({ text: r.text, confidence: r.confidence, boxNorm: box });
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
