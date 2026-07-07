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

/* ------------------------- rotated-quad detection ------------------------- */

/** A detected text line as a rotated quadrilateral (min-area rectangle).
 *  `quadNorm` corners are normalized [x,y], ordered TL, TR, BR, BL with the
 *  TL→TR edge along the text's long axis. `boxNorm` is the axis-aligned
 *  bounding box of the quad (clamped) for downstream geometry. */
export interface DetectedQuad {
  boxNorm: Box;
  quadNorm: [number, number][];
}

type Pt = [number, number];

/** Andrew's monotone-chain convex hull. Input order irrelevant; collinear
 *  points dropped. Returns counter-clockwise hull (screen coords, y-down). */
function convexHull(points: Pt[]): Pt[] {
  if (points.length <= 2) return points.slice();
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Minimum-area enclosing rectangle via rotating calipers over hull edges.
 *  Returns center, half-extents and the unit axis of the rect's WIDER side. */
function minAreaRect(hull: Pt[]): { cx: number; cy: number; hw: number; hh: number; ux: number; uy: number } {
  if (hull.length === 1) {
    return { cx: hull[0][0], cy: hull[0][1], hw: 0.5, hh: 0.5, ux: 1, uy: 0 };
  }
  let best = { area: Infinity, cx: 0, cy: 0, hw: 0, hh: 0, ux: 1, uy: 0 };
  for (let i = 0; i < hull.length; i++) {
    const [x1, y1] = hull[i];
    const [x2, y2] = hull[(i + 1) % hull.length];
    const elen = Math.hypot(x2 - x1, y2 - y1);
    if (elen === 0) continue;
    const ux = (x2 - x1) / elen;
    const uy = (y2 - y1) / elen;
    // Project hull onto edge axis (u) and its normal (v = (-uy, ux)).
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const [px, py] of hull) {
      const pu = px * ux + py * uy;
      const pv = -px * uy + py * ux;
      if (pu < minU) minU = pu;
      if (pu > maxU) maxU = pu;
      if (pv < minV) minV = pv;
      if (pv > maxV) maxV = pv;
    }
    const w = maxU - minU;
    const h = maxV - minV;
    const area = w * h;
    if (area < best.area) {
      const cu = (minU + maxU) / 2;
      const cv = (minV + maxV) / 2;
      best = {
        area,
        cx: cu * ux - cv * uy,
        cy: cu * uy + cv * ux,
        hw: w / 2,
        hh: h / 2,
        ux,
        uy,
      };
    }
  }
  return best;
}

/**
 * DBNet post-processing that emits ROTATED quads (min-area rectangles).
 *
 * Same flood fill / thresholds / unclip law as {@link postProcessDBNet}, but
 * each component's shape is captured by the minimum-area rotated rectangle
 * of its pixels instead of the axis-aligned bbox. Under perspective/rotation
 * an axis-aligned crop feeds the recognizer slanted text plus neighbor
 * bleed-through (live-caught: persp rungs read "P<XB1<<W|<<<…" from a
 * perfectly legible MRZ); the rotated quad lets the caller rectify the line
 * before recognition — the same normalization PaddleOCR's reference pipeline
 * performs (get_rotate_crop_image).
 */
export function postProcessDBNetQuads(
  probabilityMap: Float32Array,
  mapW: number,
  mapH: number,
  options?: DbnetPostOptions
): DetectedQuad[] {
  const binaryThreshold = options?.binaryThreshold ?? 0.3;
  const boxThreshold = options?.boxThreshold ?? 0.6;
  const unclipRatio = options?.unclipRatio ?? 1.5;
  const minSize = options?.minSize ?? 3;

  const visited = new Uint8Array(mapW * mapH);
  const out: DetectedQuad[] = [];

  for (let y = 0; y < mapH; y++) {
    for (let x = 0; x < mapW; x++) {
      const idx = y * mapW + x;
      if (visited[idx] !== 0 || probabilityMap[idx] < binaryThreshold) continue;

      // Flood fill (4-neighborhood), collecting component pixels.
      const pixels: Pt[] = [];
      let probSum = 0;
      const queue: number[] = [idx];
      visited[idx] = 1;
      while (queue.length > 0) {
        const cur = queue.pop()!;
        const cx = cur % mapW;
        const cy = (cur - cx) / mapW;
        pixels.push([cx, cy]);
        probSum += probabilityMap[cur];
        if (cx + 1 < mapW) {
          const n = cur + 1;
          if (visited[n] === 0 && probabilityMap[n] >= binaryThreshold) { visited[n] = 1; queue.push(n); }
        }
        if (cx - 1 >= 0) {
          const n = cur - 1;
          if (visited[n] === 0 && probabilityMap[n] >= binaryThreshold) { visited[n] = 1; queue.push(n); }
        }
        if (cy + 1 < mapH) {
          const n = cur + mapW;
          if (visited[n] === 0 && probabilityMap[n] >= binaryThreshold) { visited[n] = 1; queue.push(n); }
        }
        if (cy - 1 >= 0) {
          const n = cur - mapW;
          if (visited[n] === 0 && probabilityMap[n] >= binaryThreshold) { visited[n] = 1; queue.push(n); }
        }
      }

      const meanProb = probSum / pixels.length;
      if (meanProb < boxThreshold) continue;

      const rect = minAreaRect(convexHull(pixels));
      // Half-extent +0.5: pixel centers → pixel bounds.
      let hw = rect.hw + 0.5;
      let hh = rect.hh + 0.5;
      let { ux, uy } = rect;
      // Text axis = the LONGER side.
      if (hh > hw) {
        [hw, hh] = [hh, hw];
        [ux, uy] = [-uy, ux];
      }
      if (2 * hw < minSize || 2 * hh < minSize) continue;

      // Same unclip law as the bbox path, applied along the rect's own axes.
      const area = 4 * hw * hh;
      const perimeter = 4 * (hw + hh);
      const d = perimeter > 0 ? (area * unclipRatio) / perimeter : 0;
      hw += d;
      hh += d;

      // Orient: u mostly +x (reading direction), v = u rotated +90° (down).
      if (ux < 0) { ux = -ux; uy = -uy; }
      const vx = -uy;
      const vy = ux;
      const corners: Pt[] = [
        [rect.cx - hw * ux - hh * vx, rect.cy - hw * uy - hh * vy], // TL
        [rect.cx + hw * ux - hh * vx, rect.cy + hw * uy - hh * vy], // TR
        [rect.cx + hw * ux + hh * vx, rect.cy + hw * uy + hh * vy], // BR
        [rect.cx - hw * ux + hh * vx, rect.cy - hw * uy + hh * vy], // BL
      ];

      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      out.push({
        boxNorm: [
          Math.max(0, Math.min(...xs)) / mapW,
          Math.max(0, Math.min(...ys)) / mapH,
          Math.min(mapW, Math.max(...xs)) / mapW,
          Math.min(mapH, Math.max(...ys)) / mapH,
        ],
        quadNorm: corners.map(([qx, qy]) => [qx / mapW, qy / mapH] as [number, number]),
      });
    }
  }

  out.sort((a, b) => (a.boxNorm[1] - b.boxNorm[1]) || (a.boxNorm[0] - b.boxNorm[0]));
  return out;
}

/* ------------------------- banded tall-page detection ---------------------- */

/** One horizontal band of a tall page, in source-pixel coordinates. */
export interface DetBand {
  /** Source-pixel y offset of the band's top edge. */
  sy: number;
  /** Source-pixel band height. */
  sh: number;
}

/**
 * Plans overlapping horizontal bands for tall-page detection.
 *
 * THE TALL-PAGE LAW (live-caught: bank statements extracted ZERO fields):
 * single-pass detection downscales the LONG side to the detector limit, so a
 * portrait A4 page shrinks its width — and its caption glyphs — far below the
 * detector's floor. Banding spends multiple detector passes instead: each
 * band is a square-ish slice whose width is the full page width, so per-band
 * downscale is bounded by width (mild), not height (brutal).
 *
 * Bands overlap by `overlapFrac` so any line cut by one boundary is whole in
 * the neighbouring band; the duplicate detections are IoU-deduped after
 * coordinate remapping.
 */
export function planDetBands(
  srcW: number,
  srcH: number,
  aspectThreshold: number,
  overlapFrac: number,
): DetBand[] {
  if (srcW <= 0 || srcH <= 0 || srcH / srcW <= aspectThreshold) {
    return [{ sy: 0, sh: srcH }]; // single pass — the certified wide-page path
  }
  const bandH = Math.round(srcW); // square bands: downscale bounded by width
  const step = Math.max(1, Math.round(bandH * (1 - overlapFrac)));
  const bands: DetBand[] = [];
  for (let sy = 0; sy < srcH; sy += step) {
    const sh = Math.min(bandH, srcH - sy);
    bands.push({ sy, sh });
    if (sy + sh >= srcH) break;
  }
  // A trailing sliver shorter than the overlap is already covered — drop it.
  if (bands.length >= 2) {
    const last = bands[bands.length - 1];
    const prev = bands[bands.length - 2];
    if (last.sh < bandH * overlapFrac && prev.sy + prev.sh >= srcH) bands.pop();
  }
  return bands;
}

/**
 * Deduplicates text boxes re-detected in band overlap zones: boxes whose IoU
 * exceeds `iouThreshold` collapse to the LARGER box (the fuller detection of
 * the two partial views). Output keeps reading order (top→bottom, left→right).
 */
export function dedupeBoxes(boxes: Box[], iouThreshold = 0.5): Box[] {
  const area = (b: Box) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  const iou = (a: Box, b: Box) => {
    const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
    const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
    const inter = ix * iy;
    const union = area(a) + area(b) - inter;
    return union > 0 ? inter / union : 0;
  };
  const sorted = boxes.slice().sort((a, b) => area(b) - area(a)); // big first
  const kept: Box[] = [];
  for (const b of sorted) {
    if (!kept.some((k) => iou(k, b) > iouThreshold)) kept.push(b);
  }
  kept.sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));
  return kept;
}
