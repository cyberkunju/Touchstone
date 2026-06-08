import { Box, getIoU } from '../core/geometry';

/**
 * A single object detection produced by the YOLOv11 layout detector.
 * The `box` is expressed in ORIGINAL image normalized coordinates [0..1],
 * laid out as [x_min, y_min, x_max, y_max].
 */
export interface YoloDetection {
  classId: number;
  className: string;
  box: Box; // [x_min, y_min, x_max, y_max] normalized to [0,1]
  score: number;
}

/**
 * Describes an aspect-preserving letterbox transform used to fit an
 * arbitrary (srcW x srcH) image into a square (modelSize x modelSize)
 * input tensor without distorting the aspect ratio.
 *
 * - `scale`: factor applied to source pixels to obtain model pixels.
 * - `padX` / `padY`: padding (in model pixels) added on each side to center
 *   the scaled image inside the square.
 * - `modelSize`: side length of the square model input.
 */
export interface Letterbox {
  scale: number;
  padX: number;
  padY: number;
  modelSize: number;
}

/**
 * YOLOv11n document layout class map.
 * The order is fixed and must match the trained model's class indices.
 */
export const YOLO_CLASSES = [
  'document_page',
  'photo',
  'signature',
  'stamp',
  'seal',
  'logo',
  'qr_code',
  'barcode',
  'mrz_zone',
  'table',
  'checkbox',
  'text_block'
];

/**
 * Computes an aspect-preserving letterbox transform that fits a source image
 * of size (srcW x srcH) into a square canvas of (modelSize x modelSize).
 *
 * The scale is chosen as `min(modelSize/srcW, modelSize/srcH)` so the entire
 * source fits within the square, and the scaled image is centered with
 * symmetric padding on the shorter axis.
 *
 * Degenerate dimensions (srcW <= 0 or srcH <= 0) are guarded to avoid a
 * division by zero and return an identity-like transform.
 *
 * @param srcW Source image width in pixels.
 * @param srcH Source image height in pixels.
 * @param modelSize Side length of the square model input in pixels.
 * @returns The computed {@link Letterbox} transform.
 */
export function computeLetterbox(srcW: number, srcH: number, modelSize: number): Letterbox {
  if (srcW <= 0 || srcH <= 0) {
    return { scale: 1, padX: 0, padY: 0, modelSize };
  }

  const scale = Math.min(modelSize / srcW, modelSize / srcH);
  const scaledW = srcW * scale;
  const scaledH = srcH * scale;
  const padX = (modelSize - scaledW) / 2;
  const padY = (modelSize - scaledH) / 2;

  return { scale, padX, padY, modelSize };
}

/**
 * Post-processes a raw YOLOv11 ONNX output tensor into a list of detections in
 * ORIGINAL image normalized coordinates [0..1].
 *
 * The tensor is attribute-major with logical shape [4 + numClasses, numAnchors];
 * the value at (attr, anchor) lives at `tensorData[attr * numAnchors + anchor]`.
 * Rows 0..3 are the box center/size (cx, cy, w, h) in MODEL pixel space
 * (0..modelSize). Rows 4..(4+numClasses-1) are per-class scores already in
 * [0..1] (YOLOv8/v11 have no separate objectness term).
 *
 * For each anchor the highest class score is selected. Anchors below
 * `confidenceThreshold` are discarded. Surviving boxes are converted to corner
 * form in model space, mapped back through the inverse {@link Letterbox}
 * transform into original-image pixel space, normalized by the source
 * dimensions, and clamped to [0,1]. Finally, per-class Non-Maximum Suppression
 * removes overlapping duplicates.
 *
 * @param tensorData Flat YOLOv11 output buffer, layout [4 + numClasses, numAnchors].
 * @param numClasses Number of class score rows.
 * @param numAnchors Number of candidate anchors (columns).
 * @param confidenceThreshold Minimum class score to keep a candidate.
 * @param nmsThreshold IoU threshold above which same-class boxes are suppressed.
 * @param letterbox The letterbox transform applied during preprocessing.
 * @param srcW Original image width in pixels.
 * @param srcH Original image height in pixels.
 * @param classNames Optional class-name list (index == class id), typically
 *   sourced from the model's shipped `classes.json`. When provided its length
 *   MUST equal `numClasses`, otherwise a class-order drift could silently
 *   mislabel detections, so a mismatch throws. Defaults to {@link YOLO_CLASSES}.
 * @returns Kept detections with normalized boxes in [0,1].
 */
export function postProcessYolo(
  tensorData: Float32Array,
  numClasses: number,
  numAnchors: number,
  confidenceThreshold: number,
  nmsThreshold: number,
  letterbox: Letterbox,
  srcW: number,
  srcH: number,
  classNames?: string[]
): YoloDetection[] {
  // Resolve the label set. When the model ships its own class names we require
  // an exact count match against the tensor's class rows — a mismatch means the
  // labels and the trained head are out of sync, which would mislabel every
  // detection, so we fail loudly instead of guessing.
  const labels = classNames ?? YOLO_CLASSES;
  if (classNames && classNames.length !== numClasses) {
    throw new Error(
      `[YOLO] Class-name count mismatch: model emits ${numClasses} classes but ` +
        `${classNames.length} names were supplied. Refusing to decode to avoid ` +
        `mislabeling detections (check the model's classes.json ordering/version).`,
    );
  }

  const detections: YoloDetection[] = [];
  const { scale, padX, padY } = letterbox;

  const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

  // Map a model-space pixel coordinate back to original normalized space.
  const mapX = (modelX: number): number => clamp01(((modelX - padX) / scale) / srcW);
  const mapY = (modelY: number): number => clamp01(((modelY - padY) / scale) / srcH);

  for (let col = 0; col < numAnchors; col++) {
    // 1. Find the highest-scoring class for this anchor.
    let maxScore = -Infinity;
    let maxClassId = -1;

    for (let c = 0; c < numClasses; c++) {
      const score = tensorData[(4 + c) * numAnchors + col];
      if (score > maxScore) {
        maxScore = score;
        maxClassId = c;
      }
    }

    // 2. Filter by confidence threshold.
    if (maxScore < confidenceThreshold) continue;

    // 3. Decode box in MODEL pixel space (center form -> corner form).
    const cx = tensorData[0 * numAnchors + col];
    const cy = tensorData[1 * numAnchors + col];
    const w = tensorData[2 * numAnchors + col];
    const h = tensorData[3 * numAnchors + col];

    const x1 = cx - w / 2;
    const y1 = cy - h / 2;
    const x2 = cx + w / 2;
    const y2 = cy + h / 2;

    // 4. Map corners back to ORIGINAL image normalized [0..1] space.
    const nx1 = mapX(x1);
    const ny1 = mapY(y1);
    const nx2 = mapX(x2);
    const ny2 = mapY(y2);

    detections.push({
      classId: maxClassId,
      className: labels[maxClassId] ?? `class_${maxClassId}`,
      box: [nx1, ny1, nx2, ny2],
      score: maxScore
    });
  }

  // 5. Per-class Non-Maximum Suppression on normalized boxes.
  return runNMS(detections, nmsThreshold);
}

/**
 * Non-Maximum Suppression over normalized detection boxes.
 *
 * Detections are sorted by descending score. A lower-scoring box is suppressed
 * if its IoU with an already-kept box of the SAME `classId` is >= `nmsThreshold`.
 *
 * @param detections Candidate detections (normalized boxes).
 * @param nmsThreshold IoU suppression threshold.
 * @returns The retained detections.
 */
function runNMS(detections: YoloDetection[], nmsThreshold: number): YoloDetection[] {
  const sorted = [...detections].sort((a, b) => b.score - a.score);
  const keep: YoloDetection[] = [];
  const suppressed = new Set<number>();

  for (let i = 0; i < sorted.length; i++) {
    if (suppressed.has(i)) continue;

    const current = sorted[i];
    keep.push(current);

    for (let j = i + 1; j < sorted.length; j++) {
      if (suppressed.has(j)) continue;

      const compare = sorted[j];
      if (current.classId !== compare.classId) continue;

      if (getIoU(current.box, compare.box) >= nmsThreshold) {
        suppressed.add(j);
      }
    }
  }

  return keep;
}

/**
 * Converts a letterboxed square RGBA image into a CHW planar Float32 tensor.
 *
 * The output is normalized to [0,1] (pixel / 255), ordered as three contiguous
 * channel planes (R, then G, then B), each `size * size` long. The alpha
 * channel is ignored.
 *
 * @param rgba Source RGBA pixel buffer of length `size * size * 4`.
 * @param size Side length of the square image.
 * @returns Float32Array of length `3 * size * size` in CHW order.
 */
export function normalizeYoloTensor(rgba: Uint8ClampedArray, size: number): Float32Array {
  const pixelCount = size * size;
  const out = new Float32Array(3 * pixelCount);

  for (let i = 0; i < pixelCount; i++) {
    const r = rgba[i * 4 + 0];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];

    out[i] = r / 255;                    // R plane
    out[pixelCount + i] = g / 255;       // G plane
    out[2 * pixelCount + i] = b / 255;   // B plane
  }

  return out;
}
