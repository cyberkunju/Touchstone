/**
 * image-enhance.ts
 *
 * Pure, deterministic pixel-processing utilities to improve OCR accuracy on
 * poor-quality documents (low contrast, blur, dust, uneven lighting).
 *
 * All functions operate on RGBA byte arrays (Uint8ClampedArray, 4 bytes per
 * pixel, row-major) and return NEW arrays. There is no DOM/canvas usage, so
 * these run in Node (and therefore in vitest) as well as the browser.
 *
 * Conventions:
 *  - Length is always width * height * 4.
 *  - The alpha channel is preserved unless a function documents otherwise.
 *  - Integer math with round-to-nearest; results clamped to [0, 255].
 *  - Luma uses the Rec.601 luma weights: 0.299R + 0.587G + 0.114B.
 */

/** Round-to-nearest then clamp to the [0, 255] byte range. */
function clampByte(v: number): number {
  const r = Math.round(v);
  if (r < 0) return 0;
  if (r > 255) return 255;
  return r;
}

/** Compute the Rec.601 luma for a single RGB triple, rounded to an integer. */
function lumaOf(r: number, g: number, b: number): number {
  return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
}

/**
 * Build a 256-bin histogram of luma values for the image.
 */
function lumaHistogram(rgba: Uint8ClampedArray): Uint32Array {
  const hist = new Uint32Array(256);
  for (let i = 0; i < rgba.length; i += 4) {
    const l = lumaOf(rgba[i], rgba[i + 1], rgba[i + 2]);
    hist[l]++;
  }
  return hist;
}

/**
 * Convert to grayscale. R=G=B=luma (rounded), alpha preserved.
 */
export function toGrayscale(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    const l = lumaOf(rgba[i], rgba[i + 1], rgba[i + 2]);
    out[i] = l;
    out[i + 1] = l;
    out[i + 2] = l;
    out[i + 3] = rgba[i + 3];
  }
  return out;
}

/**
 * Percentile-based linear contrast stretch.
 *
 * Computes the lowPct and highPct percentile luma values from a 256-bin
 * histogram, then maps [lo, hi] -> [0, 255] linearly (per channel) with
 * clamping. If hi <= lo, returns an unchanged copy.
 *
 * Defaults: lowPct = 2, highPct = 98.
 */
export function contrastStretch(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  lowPct = 2,
  highPct = 98,
): Uint8ClampedArray {
  const total = w * h;
  const hist = lumaHistogram(rgba);

  // Percentile thresholds expressed as cumulative counts.
  const lowTarget = (lowPct / 100) * total;
  const highTarget = (highPct / 100) * total;

  // lo = smallest luma where cumulative count >= lowTarget.
  // hi = smallest luma where cumulative count >= highTarget.
  let cumulative = 0;
  let lo = 0;
  let hi = 255;
  let loFound = false;
  let hiFound = false;
  for (let v = 0; v < 256; v++) {
    cumulative += hist[v];
    // For lo we additionally require at least one pixel to have been counted,
    // so an all-zero lowTarget (lowPct = 0) skips leading empty bins and
    // lands on the smallest luma value that actually occurs.
    if (!loFound && cumulative >= lowTarget && cumulative > 0) {
      lo = v;
      loFound = true;
    }
    if (!hiFound && cumulative >= highTarget) {
      hi = v;
      hiFound = true;
    }
  }

  // Degenerate range: nothing meaningful to stretch -> return a copy.
  if (hi <= lo) {
    return new Uint8ClampedArray(rgba);
  }

  const scale = 255 / (hi - lo);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    out[i] = clampByte((rgba[i] - lo) * scale);
    out[i + 1] = clampByte((rgba[i + 1] - lo) * scale);
    out[i + 2] = clampByte((rgba[i + 2] - lo) * scale);
    out[i + 3] = rgba[i + 3];
  }
  return out;
}

/**
 * Simple 3x3 box blur with edge clamping. Operates per RGB channel; alpha is
 * preserved from the source. Used internally by unsharpMask.
 */
function boxBlur3x3(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        // Clamp sample coordinates to the image edges.
        const sy = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx++) {
          const sx = Math.min(w - 1, Math.max(0, x + dx));
          const si = (sy * w + sx) * 4;
          rSum += rgba[si];
          gSum += rgba[si + 1];
          bSum += rgba[si + 2];
        }
      }
      const di = (y * w + x) * 4;
      out[di] = clampByte(rSum / 9);
      out[di + 1] = clampByte(gSum / 9);
      out[di + 2] = clampByte(bSum / 9);
      out[di + 3] = rgba[di + 3];
    }
  }
  return out;
}

/**
 * Unsharp mask sharpening:
 *   sharp = original + amount * (original - blurred)
 * applied per channel, clamped to [0, 255]. Uses a 3x3 box blur with edge
 * clamping. Default amount = 0.8. Alpha is preserved.
 */
export function unsharpMask(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  amount = 0.8,
): Uint8ClampedArray {
  const blurred = boxBlur3x3(rgba, w, h);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const orig = rgba[i + c];
      const blur = blurred[i + c];
      out[i + c] = clampByte(orig + amount * (orig - blur));
    }
    out[i + 3] = rgba[i + 3];
  }
  return out;
}

/**
 * Otsu's threshold over luma using a 256-bin histogram and classic
 * between-class variance maximization.
 *
 * Returns the chosen threshold and a binary RGBA image where each pixel is
 * black (0,0,0,255) if its luma < threshold, else white (255,255,255,255).
 */
export function otsuThreshold(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
): { threshold: number; binary: Uint8ClampedArray } {
  const total = w * h;
  const hist = lumaHistogram(rgba);

  // Sum of (value * count) across all bins.
  let sumAll = 0;
  for (let v = 0; v < 256; v++) {
    sumAll += v * hist[v];
  }

  let sumBackground = 0;
  let weightBackground = 0;
  let maxVariance = -1;
  // Track the first and last t that achieve the maximum between-class
  // variance. When the variance plateaus (e.g. a clean bimodal image), the
  // optimal threshold is the midpoint of that plateau, which keeps the cut
  // strictly between the two modes.
  let bestFirst = 0;
  let bestLast = 0;

  for (let t = 0; t < 256; t++) {
    weightBackground += hist[t];
    if (weightBackground === 0) continue;

    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;

    sumBackground += t * hist[t];

    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sumAll - sumBackground) / weightForeground;

    const between =
      weightBackground *
      weightForeground *
      (meanBackground - meanForeground) *
      (meanBackground - meanForeground);

    if (between > maxVariance) {
      maxVariance = between;
      bestFirst = t;
      bestLast = t;
    } else if (between === maxVariance) {
      bestLast = t;
    }
  }

  const threshold = Math.round((bestFirst + bestLast) / 2);

  const binary = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    const l = lumaOf(rgba[i], rgba[i + 1], rgba[i + 2]);
    const val = l < threshold ? 0 : 255;
    binary[i] = val;
    binary[i + 1] = val;
    binary[i + 2] = val;
    binary[i + 3] = 255;
  }

  return { threshold, binary };
}

export interface EnhanceOptions {
  grayscale?: boolean;
  stretch?: boolean;
  sharpen?: boolean;
}

/**
 * OCR enhancement pipeline:
 *   optionally grayscale (default true)
 *   -> contrastStretch (default true)
 *   -> unsharpMask (default true)
 *
 * Returns enhanced RGBA. Does NOT binarize (binarization can destroy ID
 * photos); use otsuThreshold separately for MRZ-band use.
 */
export function enhanceForOcr(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  opts?: EnhanceOptions,
): Uint8ClampedArray {
  const grayscale = opts?.grayscale ?? true;
  const stretch = opts?.stretch ?? true;
  const sharpen = opts?.sharpen ?? true;

  let current: Uint8ClampedArray = new Uint8ClampedArray(rgba);
  if (grayscale) current = toGrayscale(current, w, h);
  if (stretch) current = contrastStretch(current, w, h);
  if (sharpen) current = unsharpMask(current, w, h);
  return current;
}
