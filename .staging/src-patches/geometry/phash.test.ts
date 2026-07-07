/**
 * dHash-64 laws (P2.2). DESTINATION: src/geometry/phash.test.ts.
 *
 * Truth by construction: synthetic rasters with mathematically known
 * structure; invariance/sensitivity asserted, not vibed.
 */
import { describe, expect, it } from 'vitest';
import { dHash64, hammingDistance, isNearDuplicate, NEAR_DUP_HAMMING, toLumaGrid } from './phash';

/** Deterministic "document": dark text-like bands on white, seeded PRNG. */
function makeDoc(seed: number, w = 400, h = 300): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(w * h * 4).fill(255);
  let s = seed >>> 0 || 1;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff);
  for (let row = 20; row < h - 20; row += 24) {
    let x = 20;
    while (x < w - 30) {
      const runW = 10 + Math.floor(rand() * 50);
      const ink = 20 + Math.floor(rand() * 60);
      for (let y = row; y < row + 8; y++) {
        for (let xx = x; xx < Math.min(x + runW, w - 20); xx++) {
          const i = (y * w + xx) * 4;
          rgba[i] = rgba[i + 1] = rgba[i + 2] = ink;
        }
      }
      x += runW + 8 + Math.floor(rand() * 16);
    }
  }
  return rgba;
}

/** Global brightness shift, clamped. */
function brighten(rgba: Uint8ClampedArray, delta: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    out[i] = Math.min(255, Math.max(0, rgba[i] + delta));
    out[i + 1] = Math.min(255, Math.max(0, rgba[i + 1] + delta));
    out[i + 2] = Math.min(255, Math.max(0, rgba[i + 2] + delta));
    out[i + 3] = 255;
  }
  return out;
}

/** Nearest-neighbor resize (simulates a rescan at another resolution). */
function resizeNN(rgba: Uint8ClampedArray, w: number, h: number, nw: number, nh: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    const sy = Math.min(h - 1, Math.floor((y * h) / nh));
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(w - 1, Math.floor((x * w) / nw));
      const si = (sy * w + sx) * 4;
      const di = (y * nw + x) * 4;
      out[di] = rgba[si];
      out[di + 1] = rgba[si + 1];
      out[di + 2] = rgba[si + 2];
      out[di + 3] = 255;
    }
  }
  return out;
}

describe('toLumaGrid', () => {
  it('averages exactly on a half-black half-white image', () => {
    const w = 8, h = 8;
    const rgba = new Uint8ClampedArray(w * h * 4).fill(255);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < 4; x++) {
        const i = (y * w + x) * 4;
        rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
      }
    }
    const grid = toLumaGrid(rgba, w, h, 2, 1);
    expect(grid[0]).toBe(0);
    expect(grid[1]).toBe(255);
  });

  it('rejects impossible dimensions loudly', () => {
    expect(() => toLumaGrid(new Uint8ClampedArray(8), 100, 100, 9, 8)).toThrow();
  });
});

describe('dHash64 format and determinism', () => {
  it('emits 16 lowercase hex chars, deterministically', () => {
    const doc = makeDoc(7);
    const a = dHash64(doc, 400, 300);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(dHash64(doc, 400, 300)).toBe(a);
  });

  it('distinct documents produce distant hashes', () => {
    const a = dHash64(makeDoc(1), 400, 300);
    const b = dHash64(makeDoc(2), 400, 300);
    expect(hammingDistance(a, b)).toBeGreaterThan(NEAR_DUP_HAMMING);
  });
});

describe('rescan invariance (the reason tier 2 exists)', () => {
  it('same doc at another resolution is a near-duplicate', () => {
    const doc = makeDoc(11);
    const rescan = resizeNN(doc, 400, 300, 300, 225);
    const d = hammingDistance(dHash64(doc, 400, 300), dHash64(rescan, 300, 225));
    expect(d).toBeLessThanOrEqual(NEAR_DUP_HAMMING);
  });

  it('same doc under brightness drift is a near-duplicate', () => {
    const doc = makeDoc(13);
    const brighter = brighten(doc, 25);
    const d = hammingDistance(dHash64(doc, 400, 300), dHash64(brighter, 400, 300));
    expect(d).toBeLessThanOrEqual(NEAR_DUP_HAMMING);
  });
});

describe('hammingDistance laws', () => {
  it('is zero on identity and symmetric', () => {
    const a = dHash64(makeDoc(3), 400, 300);
    const b = dHash64(makeDoc(4), 400, 300);
    expect(hammingDistance(a, a)).toBe(0);
    expect(hammingDistance(a, b)).toBe(hammingDistance(b, a));
  });

  it('counts exactly: one flipped nibble bit = distance 1', () => {
    const a = '0000000000000000';
    const b = '0000000000000001';
    expect(hammingDistance(a, b)).toBe(1);
    expect(hammingDistance('0000000000000000', 'ffffffffffffffff')).toBe(64);
  });

  it('malformed input is maximum distance, never a match (N1)', () => {
    expect(hammingDistance('xyz', '0000000000000000')).toBe(64);
    expect(hammingDistance('', '')).toBe(64);
    expect(isNearDuplicate('garbage!', 'garbage!')).toBe(false);
  });
});
