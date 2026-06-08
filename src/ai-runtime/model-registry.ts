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
  kind: 'detection' | 'recognition' | 'layout' | 'orientation';
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
export const OCR_REC_MODEL: OnnxModelSpec = {
  key: 'ppocrv5_rec',
  fileName: 'PP-OCRv5_server_rec_infer.onnx',
  url: `${MODEL_BASE}/PP-OCRv5_server_rec_infer.onnx`,
  kind: 'recognition',
  executionProvider: 'wasm',
};

/** The PP-OCRv5 character dictionary (18,383 entries, one char per line). */
export const PPOCR_DICT: CharDictSpec = {
  key: 'ppocrv5_dict',
  fileName: 'ppocrv5_dict.txt',
  url: `${MODEL_BASE}/ppocrv5_dict.txt`,
};

/**
 * Custom-trained YOLOv11n document-layout detector. Intentionally `null` until
 * a real artifact is trained and published — we never substitute a generic
 * COCO model. When set, the worker's layout detection path activates.
 */
export const LAYOUT_MODEL: OnnxModelSpec | null = null;

/** All ONNX models required for the core OCR pipeline. */
export const CORE_OCR_MODELS: OnnxModelSpec[] = [OCR_DET_MODEL, OCR_REC_MODEL];

/* --- Inference input contracts --- */

/** Recognition input height in pixels (PP-OCRv5). */
export const REC_INPUT_HEIGHT = 48;
/**
 * Maximum recognition input width in pixels before clamping. Set wide enough
 * that very wide lines — especially the full-width MRZ (44 monospaced chars) —
 * keep enough horizontal resolution to be read instead of being squished into
 * an unreadable strip. PP-OCRv5 recognition accepts dynamic width.
 */
export const REC_MAX_WIDTH = 1280;
/** Detection long-side limit; the image is resized to fit, snapped to /32. */
export const DET_LIMIT_SIDE = 960;
/** Detection size must be a multiple of this (DBNet stride requirement). */
export const DET_SIZE_MULTIPLE = 32;

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
