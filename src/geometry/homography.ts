/**
 * Text-as-keypoints alignment (I7, P1.8) — Documentation/09 §4.
 *
 * Estimates the geometric transform between a saved template and a new page
 * using matched anchor-token centroids as correspondences, then projects
 * template ROIs through it. No feature descriptors, no models: the OCR'd
 * words ARE the keypoints.
 *
 * The degradation ladder is FROZEN (Documentation/09 §4.3):
 *   ≥ 6 inliers → full homography (RANSAC + DLT, re-estimated on inliers)
 *   3–5        → affine (least squares)
 *   2          → similarity (translation + uniform scale)
 *   < 2        → failed (caller falls back to unknown-document flow)
 *
 * The ladder position is reported so the template_consistency attestation
 * can threshold on it (a similarity-aligned page is weaker evidence than a
 * 40-inlier homography).
 */

import type { Box } from '../core/geometry';

export type Pt = [number, number];

/** Row-major 3×3 matrix. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export interface AnchorPair {
  /** Anchor centroid in template space (normalized page coords). */
  tpl: Pt;
  /** Matched token centroid in page space (normalized page coords). */
  page: Pt;
}

export type AlignmentKind = 'homography' | 'affine' | 'similarity' | 'failed';

export interface Alignment {
  kind: AlignmentKind;
  /** Transform template→page. Identity-shaped null when kind = 'failed'. */
  matrix: Mat3 | null;
  /** Correspondences that survived RANSAC/estimation. */
  inliers: number;
  /** Total correspondences offered. */
  total: number;
  /** Mean reprojection error of inliers (normalized units). */
  meanError: number;
}

/** RANSAC reprojection inlier threshold: 1.5 % of the page diagonal, in
 *  normalized coordinates (unit page diagonal = √2). */
const INLIER_THRESHOLD = 0.015 * Math.SQRT2;

/** RANSAC iterations. 200 gives >99.9 % success for 50 % outliers at s=4. */
const RANSAC_ITERS = 200;

/* --------------------------- linear algebra ------------------------------- */

/** Solve A·x = b (n×n) by Gaussian elimination with partial pivoting.
 *  Returns null when the system is singular. */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  // Augment.
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    // Pivot.
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    }
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    if (piv !== col) [M[piv], M[col]] = [M[col], M[piv]];
    // Eliminate below.
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  // Back-substitute.
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c];
    x[r] = s / M[r][r];
  }
  return x;
}

/** Apply a 3×3 homography to a point. Returns null at the horizon (w≈0). */
export function applyTransform(H: Mat3, p: Pt): Pt | null {
  const w = H[6] * p[0] + H[7] * p[1] + H[8];
  if (Math.abs(w) < 1e-12) return null;
  return [
    (H[0] * p[0] + H[1] * p[1] + H[2]) / w,
    (H[3] * p[0] + H[4] * p[1] + H[5]) / w,
  ];
}

/** Hartley normalization: translate centroid to origin, scale mean distance
 *  to √2. Dramatically conditions the DLT system. */
function normalizePoints(pts: Pt[]): { T: Mat3; out: Pt[] } | null {
  const n = pts.length;
  let cx = 0, cy = 0;
  for (const [x, y] of pts) { cx += x; cy += y; }
  cx /= n; cy /= n;
  let meanDist = 0;
  for (const [x, y] of pts) meanDist += Math.hypot(x - cx, y - cy);
  meanDist /= n;
  if (meanDist < 1e-12) return null; // all points coincident
  const s = Math.SQRT2 / meanDist;
  const T: Mat3 = [s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1];
  return { T, out: pts.map(([x, y]) => [s * (x - cx), s * (y - cy)] as Pt) };
}

function matMul(A: Mat3, B: Mat3): Mat3 {
  const C = new Array(9).fill(0) as Mat3;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
    }
  }
  return C;
}

function mat3Inverse(M: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = M;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  return [
    A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
    B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
    C / det, -(a * h - b * g) / det, (a * e - b * d) / det,
  ];
}

/* ----------------------------- estimators --------------------------------- */

/**
 * Direct Linear Transform homography from ≥4 correspondences, with Hartley
 * normalization, solved as an 8-unknown linear system (h9 = 1 in normalized
 * space — safe for document alignment, which is always near-affine).
 * Over-determined systems (n > 4) are solved via normal equations, which is
 * the standard least-squares refinement for the RANSAC consensus set.
 */
export function estimateHomographyDLT(src: Pt[], dst: Pt[]): Mat3 | null {
  const n = src.length;
  if (n < 4 || dst.length !== n) return null;
  const ns = normalizePoints(src);
  const nd = normalizePoints(dst);
  if (!ns || !nd) return null;

  // Build the 2n×8 design matrix (h9 = 1).
  const rows: number[][] = [];
  const rhs: number[] = [];
  for (let k = 0; k < n; k++) {
    const [x, y] = ns.out[k];
    const [u, v] = nd.out[k];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    rhs.push(u);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    rhs.push(v);
  }

  // Normal equations: (AᵀA) h = Aᵀb.
  const AtA: number[][] = Array.from({ length: 8 }, () => new Array(8).fill(0));
  const Atb = new Array(8).fill(0);
  for (let r = 0; r < rows.length; r++) {
    for (let i = 0; i < 8; i++) {
      Atb[i] += rows[r][i] * rhs[r];
      for (let j = i; j < 8; j++) AtA[i][j] += rows[r][i] * rows[r][j];
    }
  }
  for (let i = 0; i < 8; i++) for (let j = 0; j < i; j++) AtA[i][j] = AtA[j][i];

  const h = solveLinear(AtA, Atb);
  if (!h) return null;
  const Hn: Mat3 = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];

  // Denormalize: H = Td⁻¹ · Hn · Ts.
  const TdInv = mat3Inverse(nd.T);
  if (!TdInv) return null;
  return matMul(matMul(TdInv, Hn), ns.T);
}

/** Least-squares affine (6 params) from ≥3 correspondences. */
export function estimateAffineLS(src: Pt[], dst: Pt[]): Mat3 | null {
  const n = src.length;
  if (n < 3 || dst.length !== n) return null;
  // Two independent 3-unknown systems (x' and y' rows share the design).
  const AtA: number[][] = Array.from({ length: 3 }, () => new Array(3).fill(0));
  const Atbx = new Array(3).fill(0);
  const Atby = new Array(3).fill(0);
  for (let k = 0; k < n; k++) {
    const row = [src[k][0], src[k][1], 1];
    for (let i = 0; i < 3; i++) {
      Atbx[i] += row[i] * dst[k][0];
      Atby[i] += row[i] * dst[k][1];
      for (let j = 0; j < 3; j++) AtA[i][j] += row[i] * row[j];
    }
  }
  const hx = solveLinear(AtA.map((r) => [...r]), Atbx);
  const hy = solveLinear(AtA.map((r) => [...r]), Atby);
  if (!hx || !hy) return null;
  return [hx[0], hx[1], hx[2], hy[0], hy[1], hy[2], 0, 0, 1];
}

/** Similarity restricted per the frozen ladder: translation + UNIFORM scale
 *  (no rotation — the deskew stage already owns rotation). Exactly 2 pairs. */
export function estimateSimilarity(src: Pt[], dst: Pt[]): Mat3 | null {
  if (src.length < 2 || dst.length < 2) return null;
  const dSrc = Math.hypot(src[1][0] - src[0][0], src[1][1] - src[0][1]);
  const dDst = Math.hypot(dst[1][0] - dst[0][0], dst[1][1] - dst[0][1]);
  if (dSrc < 1e-9) return null;
  // Clamp scale: an anchor mismatch must not explode the projection.
  const s = Math.min(1.5, Math.max(0.6, dDst / dSrc));
  // Translation from the midpoint pair.
  const mx = (dst[0][0] + dst[1][0]) / 2 - s * (src[0][0] + src[1][0]) / 2;
  const my = (dst[0][1] + dst[1][1]) / 2 - s * (src[0][1] + src[1][1]) / 2;
  return [s, 0, mx, 0, s, my, 0, 0, 1];
}

/* ------------------------------- RANSAC ------------------------------------ */

/** Deterministic LCG so alignment is reproducible run-to-run (N4). */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function reprojError(H: Mat3, pair: AnchorPair): number {
  const p = applyTransform(H, pair.tpl);
  if (!p) return Infinity;
  return Math.hypot(p[0] - pair.page[0], p[1] - pair.page[1]);
}

/**
 * RANSAC homography over anchor correspondences: sample 4 → DLT → count
 * inliers (reprojection ≤ 1.5 % of page diagonal) → best consensus set →
 * final H re-estimated on ALL inliers.
 */
function ransacHomography(
  pairs: AnchorPair[],
): { H: Mat3; inlierIdx: number[] } | null {
  if (pairs.length < 4) return null;
  const rng = makeRng(0x5eed + pairs.length);
  let bestIdx: number[] = [];

  for (let iter = 0; iter < RANSAC_ITERS; iter++) {
    // Sample 4 distinct indices.
    const idx = new Set<number>();
    while (idx.size < 4) idx.add(Math.floor(rng() * pairs.length));
    const sample = [...idx];
    const H = estimateHomographyDLT(
      sample.map((i) => pairs[i].tpl),
      sample.map((i) => pairs[i].page),
    );
    if (!H) continue;
    const inl: number[] = [];
    for (let i = 0; i < pairs.length; i++) {
      if (reprojError(H, pairs[i]) <= INLIER_THRESHOLD) inl.push(i);
    }
    if (inl.length > bestIdx.length) bestIdx = inl;
  }

  if (bestIdx.length < 4) return null;
  const H = estimateHomographyDLT(
    bestIdx.map((i) => pairs[i].tpl),
    bestIdx.map((i) => pairs[i].page),
  );
  if (!H) return null;
  // Re-collect inliers under the refined H (can only be judged fairly now).
  const finalIdx: number[] = [];
  for (let i = 0; i < pairs.length; i++) {
    if (reprojError(H, pairs[i]) <= INLIER_THRESHOLD) finalIdx.push(i);
  }
  return { H, inlierIdx: finalIdx.length >= 4 ? finalIdx : bestIdx };
}

/* ------------------------------ the ladder --------------------------------- */

/**
 * Estimate the template→page alignment through the frozen degradation ladder.
 * Every rung reports its kind and inlier support — the caller records both
 * (they feed the template_consistency attestation threshold).
 */
export function estimateAlignment(pairs: AnchorPair[]): Alignment {
  const total = pairs.length;

  // Rung 1: homography (needs ≥6 surviving inliers to be trusted).
  if (total >= 6) {
    const res = ransacHomography(pairs);
    if (res && res.inlierIdx.length >= 6) {
      const errs = res.inlierIdx.map((i) => reprojError(res.H, pairs[i]));
      return {
        kind: 'homography',
        matrix: res.H,
        inliers: res.inlierIdx.length,
        total,
        meanError: errs.reduce((a, b) => a + b, 0) / errs.length,
      };
    }
  }

  // Rung 2: affine least squares (3–5 pairs, or homography under-supported).
  if (total >= 3) {
    const H = estimateAffineLS(pairs.map((p) => p.tpl), pairs.map((p) => p.page));
    if (H) {
      // Robustness: drop the worst pair once if its error is wild (a single
      // mismatched anchor must not shear every ROI off the page).
      let use = pairs;
      let errs = pairs.map((p) => reprojError(H, p));
      const worst = errs.indexOf(Math.max(...errs));
      let final = H;
      if (errs[worst] > INLIER_THRESHOLD * 2 && pairs.length > 3) {
        use = pairs.filter((_, i) => i !== worst);
        const H2 = estimateAffineLS(use.map((p) => p.tpl), use.map((p) => p.page));
        if (H2) {
          final = H2;
          errs = use.map((p) => reprojError(H2, p));
        }
      }
      return {
        kind: 'affine',
        matrix: final,
        inliers: use.length,
        total,
        meanError: errs.reduce((a, b) => a + b, 0) / errs.length,
      };
    }
  }

  // Rung 3: similarity (2 pairs).
  if (total >= 2) {
    const H = estimateSimilarity(
      pairs.slice(0, 2).map((p) => p.tpl),
      pairs.slice(0, 2).map((p) => p.page),
    );
    if (H) {
      const errs = pairs.map((p) => reprojError(H, p));
      return {
        kind: 'similarity',
        matrix: H,
        inliers: 2,
        total,
        meanError: errs.reduce((a, b) => a + b, 0) / errs.length,
      };
    }
  }

  return { kind: 'failed', matrix: null, inliers: 0, total, meanError: Infinity };
}

/**
 * Project a normalized ROI box through an alignment: all four corners are
 * transformed (a homography does not preserve axis alignment), the projected
 * quad's AABB is taken and clamped to the page.
 */
export function projectBox(alignment: Alignment, box: Box): Box {
  if (!alignment.matrix) return box;
  const [x1, y1, x2, y2] = box;
  const corners: Pt[] = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
  const out: Pt[] = [];
  for (const c of corners) {
    const p = applyTransform(alignment.matrix, c);
    if (!p) return box; // degenerate — refuse to project rather than invent
    out.push(p);
  }
  const xs = out.map((p) => p[0]);
  const ys = out.map((p) => p[1]);
  return [
    Math.max(0, Math.min(...xs)),
    Math.max(0, Math.min(...ys)),
    Math.min(1, Math.max(...xs)),
    Math.min(1, Math.max(...ys)),
  ] as Box;
}
