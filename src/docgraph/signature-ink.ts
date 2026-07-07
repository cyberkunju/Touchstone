/**
 * Signature ink extraction (F12, P1.7) — Documentation/10 §2.
 *
 * Deterministic, model-free pipeline that isolates handwritten ink inside a
 * candidate region:
 *
 *   1. Sauvola local adaptive threshold (integral-image implementation) —
 *      robust to uneven lighting where a global Otsu fails.
 *   2. Ruled-baseline removal: long horizontal ink runs are paper structure,
 *      not signature.
 *   3. Despeckle: sub-3px components are sensor noise.
 *   4. Stroke-width statistics (chamfer distance transform): handwriting has
 *      VARYING stroke width (pressure), printed text is near-constant. Only
 *      variable-width components are kept as ink candidates.
 *   5. Largest spatial cluster of surviving components wins — a signature is
 *      one connected gesture, not scattered marks.
 *
 * Honesty (N1): the product is signature PRESENCE + a clean crop. This module
 * never claims identity/verification — that is an explicit non-goal.
 */

export interface SignatureInkOptions {
  /** Sauvola k (sensitivity). Default 0.2 — the literature standard. */
  k?: number;
  /** Sauvola dynamic range of std dev. Default 128. */
  R?: number;
  /** Window half-size for local stats. Default max(8, ~dim/24). */
  window?: number;
  /** Fraction of region width above which a horizontal run is a ruled line. */
  ruleRunFraction?: number;
  /** Minimum component area (px) to survive despeckle. Default 8. */
  minComponentArea?: number;
  /** Minimum stroke-width coefficient of variation (std/mean) for ink to
   *  count as handwriting. Printed glyphs sit well below this. Default 0.3. */
  minWidthVariation?: number;
}

export interface SignatureInkResult {
  /** 1 = signature ink, 0 = background. Length w*h. */
  mask: Uint8Array;
  width: number;
  height: number;
  /** Tight pixel bbox [x1, y1, x2, y2] (inclusive-exclusive), or null when
   *  no signature-like ink was found. */
  bbox: [number, number, number, number] | null;
  /** Total surviving ink pixels. */
  inkPixels: number;
  /** Stroke-width stats of the winning cluster (0s when none). */
  strokeWidthMean: number;
  strokeWidthCV: number;
}

/** Luma conversion (Rec. 601) from RGBA. */
export function rgbaToGray(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    out[i] = (0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2]) | 0;
  }
  return out;
}

/**
 * Sauvola adaptive threshold via integral images (O(n) regardless of window):
 *   T(x,y) = m(x,y) · (1 + k·(s(x,y)/R − 1))
 * Pixel is ink when gray < T.
 */
export function sauvolaMask(
  gray: Uint8Array,
  w: number,
  h: number,
  k = 0.2,
  R = 128,
  window?: number,
): Uint8Array {
  const half = window ?? Math.max(8, Math.round(Math.min(w, h) / 24));
  // Integral images of value and value² (double precision — w*h*255² fits).
  const I = new Float64Array((w + 1) * (h + 1));
  const I2 = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    let rowSum2 = 0;
    for (let x = 0; x < w; x++) {
      const v = gray[y * w + x];
      rowSum += v;
      rowSum2 += v * v;
      I[(y + 1) * (w + 1) + (x + 1)] = I[y * (w + 1) + (x + 1)] + rowSum;
      I2[(y + 1) * (w + 1) + (x + 1)] = I2[y * (w + 1) + (x + 1)] + rowSum2;
    }
  }
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - half);
    const y2 = Math.min(h, y + half + 1);
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - half);
      const x2 = Math.min(w, x + half + 1);
      const n = (x2 - x1) * (y2 - y1);
      const sum = I[y2 * (w + 1) + x2] - I[y1 * (w + 1) + x2] - I[y2 * (w + 1) + x1] + I[y1 * (w + 1) + x1];
      const sum2 = I2[y2 * (w + 1) + x2] - I2[y1 * (w + 1) + x2] - I2[y2 * (w + 1) + x1] + I2[y1 * (w + 1) + x1];
      const mean = sum / n;
      const variance = Math.max(0, sum2 / n - mean * mean);
      const T = mean * (1 + k * (Math.sqrt(variance) / R - 1));
      if (gray[y * w + x] < T) mask[y * w + x] = 1;
    }
  }
  return mask;
}

/** Remove ruled baselines: horizontal ink runs longer than `frac`·w. Only the
 *  run is cleared — ink crossing the line (descenders) survives above/below. */
function removeRuledLines(mask: Uint8Array, w: number, h: number, frac: number): void {
  const minRun = Math.max(8, Math.round(w * frac));
  for (let y = 0; y < h; y++) {
    let runStart = -1;
    for (let x = 0; x <= w; x++) {
      const ink = x < w && mask[y * w + x] === 1;
      if (ink && runStart < 0) runStart = x;
      if (!ink && runStart >= 0) {
        if (x - runStart >= minRun) {
          for (let c = runStart; c < x; c++) mask[y * w + c] = 0;
        }
        runStart = -1;
      }
    }
  }
}

/** Two-pass 3-4 chamfer distance transform to nearest background (in mask
 *  units; divide by 3 for ~pixels). Stroke width ≈ 2·dt at the ridge. */
function chamferDT(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e9;
  const dt = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) dt[i] = mask[i] ? INF : 0;
  // Forward.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (dt[i] === 0) continue;
      let best = dt[i];
      if (x > 0) best = Math.min(best, dt[i - 1] + 3);
      if (y > 0) {
        best = Math.min(best, dt[i - w] + 3);
        if (x > 0) best = Math.min(best, dt[i - w - 1] + 4);
        if (x < w - 1) best = Math.min(best, dt[i - w + 1] + 4);
      }
      dt[i] = best;
    }
  }
  // Backward.
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (dt[i] === 0) continue;
      let best = dt[i];
      if (x < w - 1) best = Math.min(best, dt[i + 1] + 3);
      if (y < h - 1) {
        best = Math.min(best, dt[i + w] + 3);
        if (x < w - 1) best = Math.min(best, dt[i + w + 1] + 4);
        if (x > 0) best = Math.min(best, dt[i + w - 1] + 4);
      }
      dt[i] = best;
    }
  }
  return dt;
}

interface Component {
  pixels: number[];
  x1: number; y1: number; x2: number; y2: number;
  /** Stroke-width mean / coefficient of variation over RIDGE pixels. */
  widthMean: number;
  widthCV: number;
}

/** 8-connected components with per-component stroke-width statistics.
 *  Width is sampled at ridge pixels (local DT maxima) — interior gradient
 *  pixels would bias the variance of thick strokes upward. */
function components(mask: Uint8Array, w: number, h: number, dt: Float32Array): Component[] {
  const seen = new Uint8Array(w * h);
  const out: Component[] = [];
  for (let start = 0; start < w * h; start++) {
    if (mask[start] === 0 || seen[start] !== 0) continue;
    const pixels: number[] = [];
    const stack = [start];
    seen[start] = 1;
    let x1 = w, y1 = h, x2 = 0, y2 = 0;
    while (stack.length > 0) {
      const i = stack.pop()!;
      pixels.push(i);
      const x = i % w;
      const y = (i - x) / w;
      if (x < x1) x1 = x;
      if (x > x2) x2 = x;
      if (y < y1) y1 = y;
      if (y > y2) y2 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (mask[n] === 1 && seen[n] === 0) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
    }
    // Ridge pixels: DT ≥ all 4-neighbors (plateau tolerated).
    const widths: number[] = [];
    for (const i of pixels) {
      const x = i % w;
      const y = (i - x) / w;
      const v = dt[i];
      const up = y > 0 ? dt[i - w] : 0;
      const dn = y < h - 1 ? dt[i + w] : 0;
      const lf = x > 0 ? dt[i - 1] : 0;
      const rt = x < w - 1 ? dt[i + 1] : 0;
      if (v >= up && v >= dn && v >= lf && v >= rt) {
        widths.push((2 * v) / 3); // chamfer units → ~pixels, ×2 = full width
      }
    }
    let mean = 0;
    for (const wv of widths) mean += wv;
    mean = widths.length ? mean / widths.length : 0;
    let variance = 0;
    for (const wv of widths) variance += (wv - mean) * (wv - mean);
    variance = widths.length ? variance / widths.length : 0;
    out.push({
      pixels,
      x1, y1, x2: x2 + 1, y2: y2 + 1,
      widthMean: mean,
      widthCV: mean > 0 ? Math.sqrt(variance) / mean : 0,
    });
  }
  return out;
}

/**
 * Extract signature-like ink from a grayscale region.
 * See module docs for the pipeline. Returns an all-zero mask with null bbox
 * when nothing handwriting-like survives — the honest "no signature here".
 */
export function extractSignatureInk(
  gray: Uint8Array,
  w: number,
  h: number,
  options: SignatureInkOptions = {},
): SignatureInkResult {
  const empty: SignatureInkResult = {
    mask: new Uint8Array(w * h),
    width: w,
    height: h,
    bbox: null,
    inkPixels: 0,
    strokeWidthMean: 0,
    strokeWidthCV: 0,
  };
  if (w < 8 || h < 8) return empty;

  const mask = sauvolaMask(gray, w, h, options.k ?? 0.2, options.R ?? 128, options.window);
  removeRuledLines(mask, w, h, options.ruleRunFraction ?? 0.5);

  const dt = chamferDT(mask, w, h);
  const comps = components(mask, w, h, dt);

  const minArea = options.minComponentArea ?? 8;
  const minCV = options.minWidthVariation ?? 0.3;

  // Keep components that are (a) big enough and (b) handwriting-like:
  // variable stroke width. Thin+constant = printed text or line residue.
  const candidates = comps.filter(
    (c) => c.pixels.length >= minArea && c.widthCV >= minCV,
  );
  if (candidates.length === 0) return empty;

  // Cluster candidates by bbox proximity (gap ≤ ~4% of region width): a
  // signature is one gesture but pen lifts split it into a few components.
  const gap = Math.max(4, Math.round(w * 0.04));
  const clusterOf = candidates.map((_, i) => i);
  const find = (i: number): number => (clusterOf[i] === i ? i : (clusterOf[i] = find(clusterOf[i])));
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      const overlapX = a.x1 - gap < b.x2 && b.x1 - gap < a.x2;
      const overlapY = a.y1 - gap < b.y2 && b.y1 - gap < a.y2;
      if (overlapX && overlapY) clusterOf[find(i)] = find(j);
    }
  }
  const clusters = new Map<number, Component[]>();
  candidates.forEach((c, i) => {
    const root = find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(c);
  });

  // Winner: the cluster with the most ink.
  let best: Component[] | null = null;
  let bestInk = 0;
  for (const cl of clusters.values()) {
    const ink = cl.reduce((s, c) => s + c.pixels.length, 0);
    if (ink > bestInk) {
      bestInk = ink;
      best = cl;
    }
  }
  if (!best) return empty;

  const outMask = new Uint8Array(w * h);
  let x1 = w, y1 = h, x2 = 0, y2 = 0;
  let widthSum = 0;
  let cvSum = 0;
  for (const c of best) {
    for (const i of c.pixels) outMask[i] = 1;
    if (c.x1 < x1) x1 = c.x1;
    if (c.y1 < y1) y1 = c.y1;
    if (c.x2 > x2) x2 = c.x2;
    if (c.y2 > y2) y2 = c.y2;
    widthSum += c.widthMean;
    cvSum += c.widthCV;
  }

  return {
    mask: outMask,
    width: w,
    height: h,
    bbox: [x1, y1, x2, y2],
    inkPixels: bestInk,
    strokeWidthMean: widthSum / best.length,
    strokeWidthCV: cvSum / best.length,
  };
}
