/**
 * Central registry of the real local AI model artifacts used by the engine.
 *
 * There are NO demo or placeholder models here. Every entry points at a real,
 * downloadable ONNX artifact (or character dictionary) with the exact input
 * contract the inference worker relies on.
 *
 * Models are PP-OCRv5 (server variants) sourced from a single Apache-2.0
 * Hugging Face repository, plus the matching 18,383-entry character dictionary.
 * The artifacts are fetched once and cached in OPFS (see model-loader.ts).
 *
 * Document-layout object detection (photo/signature/stamp/table zones) is
 * served by a custom-trained YOLOv11n model. No generic COCO detector is wired
 * in — a COCO model cannot detect document-layout classes and would be a fake.
 * The layout numeric core (src/ai-runtime/yolo.ts) is ready; it only activates
 * when a real layout model is registered via {@link LAYOUT_MODEL}.
 */

/** A downloadable ONNX model artifact. */
export interface OnnxModelSpec {
  /** Stable cache key + worker session id. */
  key: string;
  /** File name used for the OPFS cache entry. */
  fileName: string;
  /** Absolute download URL. */
  url: string;
  /** Role of the model in the pipeline. */
  kind: 'detection' | 'recognition' | 'layout' | 'orientation' | 'face';
  /**
   * Preferred execution provider. `'auto'` tries WebGPU then falls back to
   * WASM. PP-OCRv5 server models use ops ORT-web's WebGPU backend does not yet
   * support (MaxPool ceil_mode, recursive Transpose), so they declare `'wasm'`
   * to skip a wasted WebGPU session compile. A runtime fallback still applies.
   */
  executionProvider: 'webgpu' | 'wasm' | 'auto';
  /**
   * Square input side length (in pixels) the model was exported with — i.e.
   * `metadata.json.imgsz`. Detectors are exported with a STATIC input shape
   * (e.g. baseline=640, small=960), so the worker MUST build a
   * `[1,3,inputSize,inputSize]` tensor and letterbox to exactly this size or
   * `session.run` throws. Only meaningful for `kind: 'layout'`. Defaults to 640
   * when unset (see {@link DEFAULT_LAYOUT_INPUT_SIZE}).
   */
  inputSize?: number;
  /**
   * Class names shipped alongside the model in `classes.json`, ordered so the
   * array index equals the class id emitted by the model. When present the
   * worker passes these to layout post-processing instead of the hardcoded
   * default, keeping labels in lock-step with the trained model. Only
   * meaningful for `kind: 'layout'`.
   */
  classNames?: string[];
  /**
   * Optional version tag for the class set (mirrors a `classVersion` field in
   * the shipped metadata). Used only for diagnostics/logging so a class-order
   * drift between artifact and code can be traced. Only meaningful for
   * `kind: 'layout'`.
   */
  classVersion?: string;
}

/** A downloadable character-dictionary artifact (one character per line). */
export interface CharDictSpec {
  key: string;
  fileName: string;
  url: string;
}

/**
 * Base path for model artifacts. They are served from the application's own
 * origin (the `public/models/` directory in dev and build output), so the
 * engine fetches nothing from third-party hosts at runtime — fully offline.
 */
const MODEL_BASE = '/models';

/** PP-OCRv5 server text-detection model (DBNet). Output: prob map [1,1,H,W]. */
export const OCR_DET_MODEL: OnnxModelSpec = {
  key: 'ppocrv5_det',
  fileName: 'PP-OCRv5_server_det_infer.onnx',
  url: `${MODEL_BASE}/PP-OCRv5_server_det_infer.onnx`,
  kind: 'detection',
  executionProvider: 'wasm',
};

/**
 * PP-OCRv5 server text-recognition model (SVTR-LCNet, CTC head).
 * Input: [1,3,48,W] dynamic width. Output: logits [1,T,numClasses].
 */
export const OCR_REC_V5: OnnxModelSpec = {
  key: 'ppocrv5_rec',
  fileName: 'PP-OCRv5_server_rec_infer.onnx',
  url: `${MODEL_BASE}/PP-OCRv5_server_rec_infer.onnx`,
  kind: 'recognition',
  executionProvider: 'wasm',
};

/**
 * PP-OCRv6-small text-recognition (P3.6 tier candidate). Same input contract
 * as v5 ([N,3,48,W] dynamic); C=18710 = blank + 18708 dict chars + space —
 * verified by ONNX output probe. Raw-crop A/B verdict on file
 * (bench/baselines/ab-v6-rec.json): 2× MRZ-exact at 2.9× speed.
 */
export const OCR_REC_V6: OnnxModelSpec = {
  key: 'ppocrv6_rec',
  fileName: 'PP-OCRv6_small_rec_infer.onnx',
  url: `${MODEL_BASE}/PP-OCRv6_small_rec_infer.onnx`,
  kind: 'recognition',
  executionProvider: 'wasm',
};

export const PPOCR_DICT_V5: CharDictSpec = {
  key: 'ppocrv5_dict',
  fileName: 'ppocrv5_dict.txt',
  url: `${MODEL_BASE}/ppocrv5_dict.txt`,
};

export const PPOCR_DICT_V6: CharDictSpec = {
  key: 'ppocrv6_dict',
  fileName: 'ppocrv6_dict.txt',
  url: `${MODEL_BASE}/ppocrv6_dict.txt`,
};

/**
 * OCR tier lock (04 §1.1 enum). Build-time selected so the gate harness can
 * A/B the tiers on identical code: `VITE_OCR_TIER=v6-small vite build`.
 * v5-server stays the certified default until the v6 burst A/B passes
 * change control (raw-crop wins ≠ pipeline wins).
 */
export const OCR_TIER: 'v5-server' | 'v6-small' =
  (import.meta.env?.VITE_OCR_TIER as 'v5-server' | 'v6-small') ?? 'v5-server';

/** The ACTIVE recognition model + dictionary for the locked tier. */
export const OCR_REC_MODEL: OnnxModelSpec = OCR_TIER === 'v6-small' ? OCR_REC_V6 : OCR_REC_V5;
export const PPOCR_DICT: CharDictSpec = OCR_TIER === 'v6-small' ? PPOCR_DICT_V6 : PPOCR_DICT_V5;

/**
 * Custom-trained YOLOv11n document-layout detector (docdet_v1, 60k-image
 * Kaggle run). STATIC 640 input; output [1,16,8400] = attribute-major
 * [4+12 classes, anchors] — verified by ONNX probe at export. Ships IN the
 * repo (no upstream host; the repo is its source of truth).
 *
 * Consumption law (P4.1 activation): layout zones are FALLBACK-ONLY seeds —
 * they fill in where classical detection found nothing, never override it.
 */
export const LAYOUT_MODEL: OnnxModelSpec | null = {
  key: 'docdet_v1',
  fileName: 'docdet_v1.onnx',
  url: `${MODEL_BASE}/docdet_v1.onnx`,
  kind: 'layout',
  executionProvider: 'wasm',
  inputSize: 640,
  classNames: [
    'document_page', 'photo', 'signature', 'stamp', 'seal', 'logo',
    'qr_code', 'barcode', 'mrz_zone', 'table', 'checkbox', 'text_block',
  ],
  classVersion: 'docdet_v1_kaggle60k',
};

/**
 * YuNet face detector (OpenCV Zoo, MIT, ~0.23 MB). Detection + 5 landmarks
 * ONLY — drives the standardized portrait crop (P1.7); face recognition is a
 * permanent non-goal. The shipped 2023mar artifact is the STATIC 640×640
 * export (input verified `[1,3,640,640]` via onnx graph inspection — the
 * live session threw on 320; the dynamic 2026may re-export is not on the
 * HF mirror, verified 404). Decode is fully parameterized by this size.
 */
export const FACE_MODEL: OnnxModelSpec = {
  key: 'yunet_face',
  fileName: 'face_detection_yunet_2023mar.onnx',
  url: `${MODEL_BASE}/face_detection_yunet_2023mar.onnx`,
  kind: 'face',
  executionProvider: 'wasm', // tiny model; a WebGPU session compile costs more than it saves
  inputSize: 640,
};

/** All ONNX models required for the core OCR pipeline. */
export const CORE_OCR_MODELS: OnnxModelSpec[] = [OCR_DET_MODEL, OCR_REC_MODEL];

/* --- Inference input contracts --- */

/** Recognition input height in pixels (PP-OCRv5). */
export const REC_INPUT_HEIGHT = 48;
/**
 * Maximum recognition input width in pixels before clamping. PP-OCRv5
 * recognition has a dynamic width axis; clamping below the crop's NATURAL
 * aspect width squeezes glyphs into shared receptive fields and CTC merges
 * them (live-caught: the hi-res MRZ band crop is ~1860px natural width at
 * imgH=48 — the old 1280 cap compressed it 30%, greedy reads dropped to 43
 * chars and the checksum beam rightly refused every degraded rung). 2560
 * keeps the full-width MRZ at natural aspect while still bounding the very
 * rare pathological mega-line.
 */
export const REC_MAX_WIDTH = 2560;
/** Detection long-side limit; the image is resized to fit, snapped to /32. */
export const DET_LIMIT_SIDE = 960;
/** Detection size must be a multiple of this (DBNet stride requirement). */
export const DET_SIZE_MULTIPLE = 32;
/** Aspect ratio (h/w) above which full-page detection switches to BANDED
 *  mode (live-caught: tall A4 statements downscaled to 960 shrink 13px
 *  captions to ~7px — below DBNet's floor — and extraction reads NOTHING). */
export const DET_BAND_ASPECT = 1.25;
/** Per-band detection long-side limit. Bands are square-ish slices of a tall
 *  page; a higher per-band budget (1408 = 44×32) preserves caption glyph
 *  size while bounding per-pass DBNet compute. */
export const DET_BAND_SIDE = 1408;
/** Vertical overlap fraction between adjacent bands — any text line cut by
 *  a band boundary is fully contained in at least one neighbouring band. */
export const DET_BAND_OVERLAP = 0.12;

/**
 * Default square input side for the YOLOv11n layout detector, used when an
 * {@link OnnxModelSpec} does not declare an explicit {@link OnnxModelSpec.inputSize}
 * (i.e. no `imgsz` in the shipped metadata.json). Matches the baseline export.
 */
export const DEFAULT_LAYOUT_INPUT_SIZE = 640;

/**
 * Parses a PP-OCR character dictionary file into the CTC vocabulary.
 *
 * PaddleOCR's CTC decoder builds its label list as:
 *   ['blank'] + dictChars + [' ']
 * Index 0 is the blank token (handled by the decoder), so the vocabulary we
 * return is `dictChars + [' ']`: an emitted class index `i` maps to
 * `vocab[i - 1]`. The trailing space mirrors PaddleOCR's `use_space_char`.
 *
 * @param dictText Raw UTF-8 dictionary file contents.
 * @returns The recognition vocabulary (chars + trailing space).
 */
export function parseCharDictionary(dictText: string): string[] {
  // Preserve every dictionary line as a character; do NOT trim individual
  // entries (some entries are meaningful whitespace/symbols). Split on newlines
  // only and drop a trailing empty line introduced by the file's final newline.
  const lines = dictText.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return [...lines, ' '];
}
