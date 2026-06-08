import { Box } from '../core/geometry';

/**
 * Result of a single PP-OCRv5 recognition pass over a text-line crop.
 *
 * `confidence` is ALWAYS derived from real model softmax probabilities
 * (never hardcoded). It lives in the closed interval [0, 1].
 */
export interface OcrRecResult {
  /** Decoded text for the crop (may be empty when nothing was emitted). */
  text: string;
  /** Mean softmax probability of the emitted characters, in [0, 1]. */
  confidence: number;
}

/**
 * Computes the target width used when resizing a recognition crop.
 *
 * PP-OCR recognition resizes every crop to a fixed height `imgH` while
 * preserving aspect ratio, then clamps the resulting width to `maxW`.
 *
 *   ratio = srcW / srcH
 *   width = ceil(imgH * ratio), clamped to [1, maxW]
 *
 * Degenerate inputs (`srcW <= 0` or `srcH <= 0`) return 1.
 *
 * @param srcW Source crop width in pixels.
 * @param srcH Source crop height in pixels.
 * @param imgH Fixed recognition input height (e.g. 48).
 * @param maxW Maximum allowed recognition width (e.g. 320).
 * @returns Integer target width >= 1.
 */
export function computeRecTargetWidth(
  srcW: number,
  srcH: number,
  imgH: number,
  maxW: number
): number {
  if (srcW <= 0 || srcH <= 0) {
    return 1;
  }
  const ratio = srcW / srcH;
  let width = Math.ceil(imgH * ratio);
  if (width < 1) {
    width = 1;
  }
  if (width > maxW) {
    width = maxW;
  }
  return width;
}

/**
 * Normalizes an already-resized RGBA recognition crop into a CHW tensor.
 *
 * The input `rgba` is row-major RGBA (4 bytes/px) for an image of size
 * (`srcW` x `imgH`). Output is a planar CHW Float32Array of length
 * `3 * imgH * padW` containing the R plane, then G plane, then B plane.
 *
 * PP-OCR recognition normalization per channel:
 *   v = (pixel / 255 - 0.5) / 0.5   // maps [0,255] -> [-1, 1]
 *
 * Columns in the range [srcW, padW) are zero-padded for every channel/row.
 * Assumes `padW >= srcW`.
 *
 * @param rgba Row-major RGBA pixels of the (srcW x imgH) image.
 * @param srcW Actual image width before padding.
 * @param imgH Image height (== recognition input height).
 * @param padW Padded width (>= srcW); tensor width.
 * @returns CHW Float32Array of length 3 * imgH * padW.
 */
export function normalizeRecognitionTensor(
  rgba: Uint8ClampedArray,
  srcW: number,
  imgH: number,
  padW: number
): Float32Array {
  const plane = imgH * padW;
  const tensor = new Float32Array(3 * plane);

  for (let y = 0; y < imgH; y++) {
    for (let x = 0; x < srcW; x++) {
      const srcIdx = (y * srcW + x) * 4;
      const dstIdx = y * padW + x;

      const r = rgba[srcIdx] / 255 - 0.5;
      const g = rgba[srcIdx + 1] / 255 - 0.5;
      const b = rgba[srcIdx + 2] / 255 - 0.5;

      tensor[dstIdx] = r / 0.5;
      tensor[plane + dstIdx] = g / 0.5;
      tensor[2 * plane + dstIdx] = b / 0.5;
    }
    // Columns [srcW, padW) remain 0.0 (Float32Array is zero-initialized).
  }

  return tensor;
}

/**
 * Greedy CTC decoder for PP-OCRv5 recognition output.
 *
 * PP-OCRv5 recognition ONNX models apply softmax internally, so `probs` is a
 * row-major [timeSteps, numClasses] matrix of PROBABILITIES (each row sums to
 * ~1), where the probability for class `c` at timestep `t` is
 * `probs[t * numClasses + c]`. For each timestep we take the argmax class and
 * read its probability directly (no further softmax — doing so would flatten
 * confidence across thousands of classes).
 *
 * Decoding rules (standard CTC greedy collapse):
 *   - Class index 0 is the BLANK token and is skipped.
 *   - Consecutive duplicate indices collapse (emit only when idx != prev).
 *   - An emitted index `idx` (>= 1) maps to character `vocab[idx - 1]`.
 *     If `idx - 1` is out of range it is skipped entirely (not emitted).
 *
 * `confidence` is the arithmetic mean of the probabilities of the EMITTED
 * characters, or 0 when nothing was emitted — a real model confidence in
 * [0, 1], matching PaddleOCR's CTCLabelDecode.
 *
 * @param probs Row-major [timeSteps, numClasses] probabilities (post-softmax).
 * @param timeSteps Number of timesteps (rows).
 * @param numClasses Number of classes per timestep (columns, incl. blank).
 * @param vocab Character vocabulary; index 0 corresponds to vocab[0].
 * @returns Decoded text and real mean-probability confidence.
 */
export function decodeCTCGreedy(
  probs: Float32Array,
  timeSteps: number,
  numClasses: number,
  vocab: string[]
): OcrRecResult {
  let text = '';
  let prevIdx = -1;
  let probSum = 0;
  let emitted = 0;

  for (let t = 0; t < timeSteps; t++) {
    const base = t * numClasses;

    // Argmax over the row and its probability.
    let maxProb = probs[base];
    let argmax = 0;
    for (let c = 1; c < numClasses; c++) {
      const v = probs[base + c];
      if (v > maxProb) {
        maxProb = v;
        argmax = c;
      }
    }

    const idx = argmax;

    // CTC collapse: skip blank (0) and consecutive duplicates.
    if (idx !== 0 && idx !== prevIdx) {
      const charIdx = idx - 1;
      if (charIdx < vocab.length) {
        text += vocab[charIdx];
        probSum += maxProb;
        emitted++;
      }
      // Out-of-range index: skipped entirely, not counted.
    }

    prevIdx = idx;
  }

  return {
    text,
    confidence: emitted > 0 ? probSum / emitted : 0,
  };
}

/**
 * Normalizes an RGBA image into a CHW tensor for DBNet text detection.
 *
 * DBNet uses ImageNet-style per-channel normalization:
 *   v = (pixel / 255 - mean[c]) / std[c]
 *   mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225]
 *
 * Output is planar CHW in RGB order (R plane, G plane, B plane) of length
 * `3 * w * h`.
 *
 * @param rgba Row-major RGBA pixels of the (w x h) image.
 * @param w Image width.
 * @param h Image height.
 * @returns CHW Float32Array of length 3 * w * h.
 */
export function normalizeDetectorTensor(
  rgba: Uint8ClampedArray,
  w: number,
  h: number
): Float32Array {
  const plane = w * h;
  const tensor = new Float32Array(3 * plane);
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];

  for (let i = 0; i < plane; i++) {
    const src = i * 4;
    tensor[i] = (rgba[src] / 255 - mean[0]) / std[0];
    tensor[plane + i] = (rgba[src + 1] / 255 - mean[1]) / std[1];
    tensor[2 * plane + i] = (rgba[src + 2] / 255 - mean[2]) / std[2];
  }

  return tensor;
}

/**
 * Tunable thresholds for DBNet post-processing.
 */
export interface DbnetPostOptions {
  /** Probability threshold for binarizing the map. Default 0.3. */
  binaryThreshold?: number;
  /** Minimum mean component probability to keep a box. Default 0.6. */
  boxThreshold?: number;
  /** Box expansion ratio used during unclipping. Default 1.5. */
  unclipRatio?: number;
  /** Minimum box side length (map pixels) to keep. Default 3. */
  minSize?: number;
}

/**
 * Post-processes a DBNet probability map into normalized text boxes.
 *
 * `probabilityMap` is row-major [mapH, mapW] with values in [0, 1]. The map
 * is binarized at `binaryThreshold`, connected components are found via
 * 4-neighborhood flood fill, and each component yields an axis-aligned bbox
 * plus the mean probability of its pixels.
 *
 * Filtering:
 *   - Drop components whose width or height is < `minSize`.
 *   - Drop components whose mean probability is < `boxThreshold`.
 *
 * Unclipping expands the surviving bbox outward by
 *   distance = area * unclipRatio / perimeter
 * where area = boxW * boxH and perimeter = 2 * (boxW + boxH). Each side is
 * pushed out by `distance` and clamped to the map bounds.
 *
 * Returned boxes are normalized to [0, 1]
 * (`[xMin/mapW, yMin/mapH, xMax/mapW, yMax/mapH]`) and sorted top-to-bottom
 * then left-to-right (by yMin, then xMin).
 *
 * @param probabilityMap Row-major [mapH, mapW] probabilities.
 * @param mapW Map width.
 * @param mapH Map height.
 * @param options Optional thresholds; see {@link DbnetPostOptions}.
 * @returns Normalized, sorted text boxes.
 */
export function postProcessDBNet(
  probabilityMap: Float32Array,
  mapW: number,
  mapH: number,
  options?: DbnetPostOptions
): Box[] {
  const binaryThreshold = options?.binaryThreshold ?? 0.3;
  const boxThreshold = options?.boxThreshold ?? 0.6;
  const unclipRatio = options?.unclipRatio ?? 1.5;
  const minSize = options?.minSize ?? 3;

  const visited = new Uint8Array(mapW * mapH);
  const boxes: Box[] = [];

  for (let y = 0; y < mapH; y++) {
    for (let x = 0; x < mapW; x++) {
      const idx = y * mapW + x;
      if (visited[idx] !== 0 || probabilityMap[idx] < binaryThreshold) {
        continue;
      }

      // Flood fill this connected component (4-neighborhood).
      let xMin = x;
      let xMax = x;
      let yMin = y;
      let yMax = y;
      let probSum = 0;
      let count = 0;

      const queue: number[] = [idx];
      visited[idx] = 1;

      while (queue.length > 0) {
        const cur = queue.pop()!;
        const cx = cur % mapW;
        const cy = (cur - cx) / mapW;

        if (cx < xMin) xMin = cx;
        if (cx > xMax) xMax = cx;
        if (cy < yMin) yMin = cy;
        if (cy > yMax) yMax = cy;
        probSum += probabilityMap[cur];
        count++;

        // 4-neighborhood.
        if (cx + 1 < mapW) {
          const n = cur + 1;
          if (visited[n] === 0 && probabilityMap[n] >= binaryThreshold) {
            visited[n] = 1;
            queue.push(n);
          }
        }
        if (cx - 1 >= 0) {
          const n = cur - 1;
          if (visited[n] === 0 && probabilityMap[n] >= binaryThreshold) {
            visited[n] = 1;
            queue.push(n);
          }
        }
        if (cy + 1 < mapH) {
          const n = cur + mapW;
          if (visited[n] === 0 && probabilityMap[n] >= binaryThreshold) {
            visited[n] = 1;
            queue.push(n);
          }
        }
        if (cy - 1 >= 0) {
          const n = cur - mapW;
          if (visited[n] === 0 && probabilityMap[n] >= binaryThreshold) {
            visited[n] = 1;
            queue.push(n);
          }
        }
      }

      const boxW = xMax - xMin;
      const boxH = yMax - yMin;

      if (boxW < minSize || boxH < minSize) {
        continue;
      }

      const meanProb = probSum / count;
      if (meanProb < boxThreshold) {
        continue;
      }

      // Unclip: expand outward by distance = area * ratio / perimeter.
      const area = boxW * boxH;
      const perimeter = 2 * (boxW + boxH);
      const distance = perimeter > 0 ? (area * unclipRatio) / perimeter : 0;

      let exMin = xMin - distance;
      let eyMin = yMin - distance;
      let exMax = xMax + distance;
      let eyMax = yMax + distance;

      // Clamp to map bounds.
      if (exMin < 0) exMin = 0;
      if (eyMin < 0) eyMin = 0;
      if (exMax > mapW) exMax = mapW;
      if (eyMax > mapH) eyMax = mapH;

      boxes.push([
        exMin / mapW,
        eyMin / mapH,
        exMax / mapW,
        eyMax / mapH,
      ]);
    }
  }

  // Sort top-to-bottom, then left-to-right (by yMin, then xMin).
  boxes.sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));

  return boxes;
}
