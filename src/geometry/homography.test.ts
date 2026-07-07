import { describe, expect, it } from 'vitest';
import {
  applyTransform,
  estimateAffineLS,
  estimateAlignment,
  estimateHomographyDLT,
  estimateSimilarity,
  projectBox,
  type AnchorPair,
  type Mat3,
  type Pt,
} from './homography';

/** Apply a ground-truth homography (with perspective) to a point. */
function warp(H: Mat3, p: Pt): Pt {
  const w = H[6] * p[0] + H[7] * p[1] + H[8];
  return [(H[0] * p[0] + H[1] * p[1] + H[2]) / w, (H[3] * p[0] + H[4] * p[1] + H[5]) / w];
}

/** Deterministic LCG for reproducible fuzz. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** A realistic document homography: mild rotation+scale+translation+keystone. */
const H_TRUE: Mat3 = [
  0.98 * Math.cos(0.05), -0.98 * Math.sin(0.05), 0.03,
  0.98 * Math.sin(0.05), 0.98 * Math.cos(0.05), 0.02,
  0.04, -0.03, 1,
];

const GRID: Pt[] = [];
for (let y = 0.1; y <= 0.9; y += 0.2) {
  for (let x = 0.1; x <= 0.9; x += 0.2) GRID.push([x, y]);
}

describe('estimateHomographyDLT', () => {
  it('recovers an exact homography from 4 clean correspondences', () => {
    const src: Pt[] = [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]];
    const dst = src.map((p) => warp(H_TRUE, p));
    const H = estimateHomographyDLT(src, dst);
    expect(H).not.toBeNull();
    for (const p of GRID) {
      const got = applyTransform(H!, p)!;
      const want = warp(H_TRUE, p);
      expect(got[0]).toBeCloseTo(want[0], 6);
      expect(got[1]).toBeCloseTo(want[1], 6);
    }
  });

  it('refuses degenerate input (collinear/coincident points)', () => {
    const src: Pt[] = [[0.1, 0.1], [0.1, 0.1], [0.1, 0.1], [0.1, 0.1]];
    expect(estimateHomographyDLT(src, src)).toBeNull();
  });
});

describe('estimateAffineLS / estimateSimilarity', () => {
  it('recovers a known affine from 3+ points', () => {
    const A: Mat3 = [1.05, 0.02, 0.04, -0.01, 0.97, 0.06, 0, 0, 1];
    const src: Pt[] = [[0.2, 0.2], [0.8, 0.3], [0.5, 0.8], [0.3, 0.6]];
    const dst = src.map((p) => warp(A, p));
    const H = estimateAffineLS(src, dst);
    expect(H).not.toBeNull();
    for (const p of GRID) {
      const got = applyTransform(H!, p)!;
      const want = warp(A, p);
      expect(got[0]).toBeCloseTo(want[0], 6);
      expect(got[1]).toBeCloseTo(want[1], 6);
    }
  });

  it('recovers translate+scale from 2 points', () => {
    const src: Pt[] = [[0.2, 0.3], [0.7, 0.6]];
    const dst: Pt[] = src.map(([x, y]) => [1.1 * x + 0.05, 1.1 * y - 0.02] as Pt);
    const H = estimateSimilarity(src, dst)!;
    const got = applyTransform(H, [0.5, 0.5])!;
    expect(got[0]).toBeCloseTo(1.1 * 0.5 + 0.05, 6);
    expect(got[1]).toBeCloseTo(1.1 * 0.5 - 0.02, 6);
  });
});

describe('estimateAlignment — the frozen ladder', () => {
  const pairsThrough = (H: Mat3, pts: Pt[]): AnchorPair[] =>
    pts.map((p) => ({ tpl: p, page: warp(H, p) }));

  it('≥6 clean pairs → homography, all inliers', () => {
    const a = estimateAlignment(pairsThrough(H_TRUE, GRID.slice(0, 8)));
    expect(a.kind).toBe('homography');
    expect(a.inliers).toBe(8);
    expect(a.meanError).toBeLessThan(1e-6);
  });

  it('RANSAC survives 40% outliers and still nails the transform (fuzz)', () => {
    const rng = makeRng(1234);
    const inl = pairsThrough(H_TRUE, GRID); // 25 clean pairs
    const outliers: AnchorPair[] = [];
    for (let i = 0; i < 16; i++) {
      outliers.push({ tpl: [rng(), rng()], page: [rng(), rng()] });
    }
    const a = estimateAlignment([...inl, ...outliers]);
    expect(a.kind).toBe('homography');
    expect(a.inliers).toBeGreaterThanOrEqual(25 - 1);
    // The recovered transform must reproject the true grid accurately.
    for (const p of GRID) {
      const got = applyTransform(a.matrix!, p)!;
      const want = warp(H_TRUE, p);
      expect(Math.hypot(got[0] - want[0], got[1] - want[1])).toBeLessThan(0.005);
    }
  });

  it('4 pairs → affine rung (homography needs ≥6 inlier support)', () => {
    const A: Mat3 = [1.02, 0, 0.03, 0, 1.02, 0.01, 0, 0, 1];
    const quad: Pt[] = [[0.1, 0.1], [0.9, 0.15], [0.2, 0.8], [0.85, 0.75]];
    const a = estimateAlignment(pairsThrough(A, quad));
    expect(a.kind).toBe('affine');
  });

  it('affine rung drops a single wild mismatched anchor', () => {
    const A: Mat3 = [1, 0, 0.05, 0, 1, 0.05, 0, 0, 1];
    const quad: Pt[] = [[0.1, 0.1], [0.9, 0.15], [0.2, 0.8], [0.85, 0.75]];
    const pairs = pairsThrough(A, quad);
    pairs.push({ tpl: [0.5, 0.5], page: [0.95, 0.05] }); // wild mismatch
    const a = estimateAlignment(pairs);
    expect(a.kind).toBe('affine');
    const got = applyTransform(a.matrix!, [0.4, 0.4])!;
    expect(got[0]).toBeCloseTo(0.45, 3);
    expect(got[1]).toBeCloseTo(0.45, 3);
  });

  it('2 pairs → similarity; 1 → failed', () => {
    const two = estimateAlignment([
      { tpl: [0.2, 0.2], page: [0.25, 0.22] },
      { tpl: [0.8, 0.7], page: [0.85, 0.72] },
    ]);
    expect(two.kind).toBe('similarity');
    const one = estimateAlignment([{ tpl: [0.2, 0.2], page: [0.25, 0.22] }]);
    expect(one.kind).toBe('failed');
    expect(one.matrix).toBeNull();
  });
});

describe('projectBox', () => {
  it('projects an ROI through a homography and clamps to the page', () => {
    const a = estimateAlignment(
      GRID.slice(0, 8).map((p) => ({ tpl: p, page: warp(H_TRUE, p) })),
    );
    const box = projectBox(a, [0.1, 0.1, 0.3, 0.2]);
    // Corners individually warped: the projected box must contain them.
    const corners: Pt[] = [[0.1, 0.1], [0.3, 0.1], [0.3, 0.2], [0.1, 0.2]];
    for (const c of corners) {
      const w = warp(H_TRUE, c);
      expect(w[0]).toBeGreaterThanOrEqual(box[0] - 1e-6);
      expect(w[0]).toBeLessThanOrEqual(box[2] + 1e-6);
      expect(w[1]).toBeGreaterThanOrEqual(box[1] - 1e-6);
      expect(w[1]).toBeLessThanOrEqual(box[3] + 1e-6);
    }
    expect(box[0]).toBeGreaterThanOrEqual(0);
    expect(box[3]).toBeLessThanOrEqual(1);
  });

  it('returns the box unchanged when alignment failed', () => {
    const failed = estimateAlignment([]);
    expect(projectBox(failed, [0.1, 0.2, 0.3, 0.4])).toEqual([0.1, 0.2, 0.3, 0.4]);
  });
});
