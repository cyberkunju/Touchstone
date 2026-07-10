/**
 * @file page-rectify.ts
 *
 * Projective page rectification — the real cure for camera keystone.
 *
 * Rotation deskew handles flat scans; a passport PHOTOGRAPHED on a table
 * converges (keystone) and no rotation can fix it (live-caught: a steep
 * French page bound the issue date into Date of Birth). This module finds
 * the document's four corners from luminance (documents are bright against
 * their surroundings) and inverse-warps the page to a flat rectangle with
 * bilinear sampling through a DLT homography.
 *
 * N1 for preprocessing: a wrong warp is worse than none. The estimator
 * returns null unless the quad is convex, plausibly page-shaped, large
 * enough, and meaningfully non-rectangular; callers keep the original
 * bitmap on null (identity fallback).
 */

import { estimateHomographyDLT, applyTransform, type Pt, type Mat3 } from './homography';

/** Minimal pixel-grid contract (ImageData-compatible; test-constructible). */
export interface PixelGrid {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface PageQuadResult {
  /** Corners in SOURCE pixels, ordered TL, TR, BR, BL. */
  corners: [Pt, Pt, Pt, Pt];
  /** Max corner-angle deviation from 90° (degrees) — keystone strength. */
  maxAngleDeviationDeg: number;
  /** Fraction of the frame the quad covers. */
  areaFraction: number;
}

/** Luminance of an RGBA pixel. */
function lum(data: Uint8ClampedArray, idx: number): number {
  return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
}

/** Otsu threshold over a 256-bin histogram. */
function otsu(hist: Uint32Array, total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/** Interior angle at corner `b` of the polyline a→b→c, in degrees. */
function cornerAngleDeg(a: Pt, b: Pt, c: Pt): number {
  const v1 = [a[0] - b[0], a[1] - b[1]];
  const v2 = [c[0] - b[0], c[1] - b[1]];
  const dot = v1[0] * v2[0] + v1[1] * v2[1];
  const m1 = Math.hypot(v1[0], v1[1]);
  const m2 = Math.hypot(v2[0], v2[1]);
  if (m1 < 1e-9 || m2 < 1e-9) return 0;
  const cos = Math.min(1, Math.max(-1, dot / (m1 * m2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Signed area of a quad (positive = counterclockwise in image coords). */
function quadArea(q: readonly Pt[]): number {
  let area = 0;
  for (let i = 0; i < q.length; i++) {
    const [x1, y1] = q[i];
    const [x2, y2] = q[(i + 1) % q.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

/** Convexity check: all cross products share a sign. */
function isConvex(q: readonly Pt[]): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = q[i];
    const [bx, by] = q[(i + 1) % 4];
    const [cx, cy] = q[(i + 2) % 4];
    const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (Math.abs(cross) < 1e-9) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return sign !== 0;
}

/**
 * Estimate the document page quad from luminance. Works on a DOWNSCALED
 * grid for speed; returns corners scaled back to the source dimensions.
 *
 * @returns quad + keystone metrics, or null when no trustworthy page quad
 *          exists (full-frame scans, low contrast, implausible shapes).
 */
export function estimatePageQuad(grid: PixelGrid): PageQuadResult | null {
  const { data, width, height } = grid;
  if (width < 32 || height < 32) return null;

  // Histogram → Otsu split into bright (page) vs dark (surroundings).
  const hist = new Uint32Array(256);
  const gray = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const g = lum(data, (y * width + x) * 4);
      gray[y * width + x] = g;
      hist[Math.min(255, Math.max(0, Math.round(g)))]++;
    }
  }
  const threshold = otsu(hist, width * height);

  // Largest bright connected component (iterative flood fill, 4-neighbour).
  const labels = new Int32Array(width * height).fill(-1);
  let bestLabel = -1;
  let bestCount = 0;
  let nextLabel = 0;
  const stack: number[] = [];
  for (let start = 0; start < width * height; start++) {
    if (labels[start] !== -1 || gray[start] <= threshold) continue;
    const label = nextLabel++;
    let count = 0;
    stack.length = 0;
    stack.push(start);
    labels[start] = label;
    while (stack.length > 0) {
      const p = stack.pop()!;
      count++;
      const px = p % width;
      const py = (p / width) | 0;
      if (px > 0 && labels[p - 1] === -1 && gray[p - 1] > threshold) { labels[p - 1] = label; stack.push(p - 1); }
      if (px < width - 1 && labels[p + 1] === -1 && gray[p + 1] > threshold) { labels[p + 1] = label; stack.push(p + 1); }
      if (py > 0 && labels[p - width] === -1 && gray[p - width] > threshold) { labels[p - width] = label; stack.push(p - width); }
      if (py < height - 1 && labels[p + width] === -1 && gray[p + width] > threshold) { labels[p + width] = label; stack.push(p + width); }
    }
    if (count > bestCount) {
      bestCount = count;
      bestLabel = label;
    }
  }
  if (bestLabel === -1) return null;

  const areaFraction = bestCount / (width * height);
  // A photographed document occupies a meaningful but not full frame; a
  // full-frame component is a scan (no warp needed / no edges visible).
  if (areaFraction < 0.2 || areaFraction > 0.95) return null;

  // BACKGROUND-CONTRAST LAW (live-caught: on a WHITE table the bright
  // component swallowed table + page together and produced a junk quad
  // that the warp then trusted — worse than no warp). The page must be
  // clearly brighter than the frame border ring, or there is no reliable
  // luminance boundary to rectify from.
  {
    let borderSum = 0;
    let borderCount = 0;
    for (let x = 0; x < width; x++) {
      borderSum += gray[x] + gray[(height - 1) * width + x];
      borderCount += 2;
    }
    for (let y = 1; y < height - 1; y++) {
      borderSum += gray[y * width] + gray[y * width + width - 1];
      borderCount += 2;
    }
    const borderMean = borderSum / borderCount;
    let compSum = 0;
    for (let i = 0; i < gray.length; i++) if (labels[i] === bestLabel) compSum += gray[i];
    const compMean = compSum / bestCount;
    if (compMean - borderMean < 30) return null;
  }

  // Corner extraction: extrema of x+y and x−y over the component.
  let tl: Pt = [0, 0]; let tr: Pt = [0, 0]; let br: Pt = [0, 0]; let bl: Pt = [0, 0];
  let minSum = Infinity; let maxSum = -Infinity; let minDiff = Infinity; let maxDiff = -Infinity;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (labels[y * width + x] !== bestLabel) continue;
      const s = x + y;
      const d = x - y;
      if (s < minSum) { minSum = s; tl = [x, y]; }
      if (s > maxSum) { maxSum = s; br = [x, y]; }
      if (d > maxDiff) { maxDiff = d; tr = [x, y]; }
      if (d < minDiff) { minDiff = d; bl = [x, y]; }
    }
  }
  const quad: [Pt, Pt, Pt, Pt] = [tl, tr, br, bl];

  // Shape sanity: convex, roughly quadrilateral (quad area covers most of
  // the component), opposite sides comparable.
  if (!isConvex(quad)) return null;
  const qArea = Math.abs(quadArea(quad));
  if (qArea < bestCount * 0.75 || qArea > bestCount * 1.35) return null;
  const side = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const top = side(tl, tr);
  const bottom = side(bl, br);
  const left = side(tl, bl);
  const right = side(tr, br);
  if (Math.min(top, bottom) < 8 || Math.min(left, right) < 8) return null;
  const hRatio = top / bottom;
  const vRatio = left / right;
  if (hRatio < 0.55 || hRatio > 1.8 || vRatio < 0.55 || vRatio > 1.8) return null;

  const angles = [
    cornerAngleDeg(bl, tl, tr),
    cornerAngleDeg(tl, tr, br),
    cornerAngleDeg(tr, br, bl),
    cornerAngleDeg(br, bl, tl),
  ];
  const maxAngleDeviationDeg = Math.max(...angles.map((a) => Math.abs(a - 90)));

  return { corners: quad, maxAngleDeviationDeg, areaFraction };
}

/**
 * Whether a detected page quad warrants a projective warp: meaningfully
 * non-rectangular (keystone) — a level rectangular page gains nothing and
 * risks resampling loss.
 */
export function quadNeedsRectification(quad: PageQuadResult): boolean {
  return quad.maxAngleDeviationDeg >= 3;
}

/** Output size for the rectified page: median opposite-side lengths. */
export function rectifiedSize(
  corners: readonly Pt[],
  maxSide = 2400,
): { width: number; height: number } {
  const [tl, tr, br, bl] = corners;
  const side = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  let w = Math.round((side(tl, tr) + side(bl, br)) / 2);
  let h = Math.round((side(tl, bl) + side(tr, br)) / 2);
  const scale = Math.min(1, maxSide / Math.max(w, h));
  w = Math.max(16, Math.round(w * scale));
  h = Math.max(16, Math.round(h * scale));
  return { width: w, height: h };
}

/**
 * Inverse-map projective warp with bilinear sampling: dst(x,y) samples
 * src(H·(x,y)). H maps DST corners → SRC quad corners, so straight page
 * geometry lands axis-aligned in the output.
 *
 * @returns the rectified pixel grid, or null when the homography is
 *          degenerate.
 */
export function warpPerspective(
  src: PixelGrid,
  srcQuad: readonly Pt[],
  outW: number,
  outH: number,
): PixelGrid | null {
  const dstRect: Pt[] = [
    [0, 0],
    [outW, 0],
    [outW, outH],
    [0, outH],
  ];
  const H: Mat3 | null = estimateHomographyDLT(dstRect, srcQuad as Pt[]);
  if (!H) return null;

  const out = new Uint8ClampedArray(outW * outH * 4);
  const { data, width, height } = src;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const mapped = applyTransform(H, [x + 0.5, y + 0.5]);
      const di = (y * outW + x) * 4;
      if (!mapped) {
        out[di] = out[di + 1] = out[di + 2] = 255;
        out[di + 3] = 255;
        continue;
      }
      const sx = mapped[0] - 0.5;
      const sy = mapped[1] - 0.5;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      if (x0 < 0 || y0 < 0 || x0 >= width - 1 || y0 >= height - 1) {
        out[di] = out[di + 1] = out[di + 2] = 255;
        out[di + 3] = 255;
        continue;
      }
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * width + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + width * 4;
      const i11 = i01 + 4;
      for (let c = 0; c < 3; c++) {
        const v =
          data[i00 + c] * (1 - fx) * (1 - fy) +
          data[i10 + c] * fx * (1 - fy) +
          data[i01 + c] * (1 - fx) * fy +
          data[i11 + c] * fx * fy;
        out[di + c] = v;
      }
      out[di + 3] = 255;
    }
  }
  return { data: out, width: outW, height: outH };
}
