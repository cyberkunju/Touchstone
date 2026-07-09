/**
 * Spec-mandated acceptance tests (22_HANDOFF P2.2), beyond the core laws:
 * rotation distinctness, seeded-noise mean, symmetry property, and THE
 * acceptance: real corpus rescan pairs (clean vs blur/jpeg of the same
 * identity) land at Hamming ≤ 8. Fixtures are precomputed RGBA (spec's
 * sanctioned alternative to a pngjs dep).
 *
 * DESTINATION: src/geometry/phash.acceptance.test.ts (fixtures move too).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { dHash64, hammingDistance } from './phash';

const here = dirname(fileURLToPath(import.meta.url));

function rot90(rgba: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const di = (x * h + (h - 1 - y)) * 4; // new dims: w'=h, h'=w
      out[di] = rgba[si];
      out[di + 1] = rgba[si + 1];
      out[di + 2] = rgba[si + 2];
      out[di + 3] = 255;
    }
  }
  return out;
}

function noiseImage(seed: number, w = 128, h = 96): Uint8ClampedArray {
  let s = seed >>> 0 || 1;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) & 0xff);
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    const v = rand();
    rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
    rgba[i + 3] = 255;
  }
  return rgba;
}

/** Structured test doc (bands of ink), seeded. */
function makeDoc(seed: number, w = 320, h = 240): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(w * h * 4).fill(255);
  let s = seed >>> 0 || 1;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff);
  for (let row = 16; row < h - 16; row += 20) {
    let x = 16;
    while (x < w - 24) {
      const runW = 8 + Math.floor(rand() * 40);
      for (let y = row; y < row + 7; y++) {
        for (let xx = x; xx < Math.min(x + runW, w - 16); xx++) {
          const i = (y * w + xx) * 4;
          rgba[i] = rgba[i + 1] = rgba[i + 2] = 30;
        }
      }
      x += runW + 6 + Math.floor(rand() * 12);
    }
  }
  return rgba;
}

describe('spec acceptance: rotation is distinct', () => {
  it('90-degree rotation lands far away (>= 20)', () => {
    const doc = makeDoc(21);
    const rotated = rot90(doc, 320, 240);
    const d = hammingDistance(dHash64(doc, 320, 240), dHash64(rotated, 240, 320));
    expect(d).toBeGreaterThanOrEqual(20);
  });
});

describe('spec acceptance: seeded noise statistics', () => {
  it('random noise pairs average near 32 (uncorrelated bits)', () => {
    const dists: number[] = [];
    for (let i = 0; i < 12; i++) {
      const a = dHash64(noiseImage(100 + i), 128, 96);
      const b = dHash64(noiseImage(200 + i), 128, 96);
      dists.push(hammingDistance(a, b));
    }
    const mean = dists.reduce((s, d) => s + d, 0) / dists.length;
    expect(mean).toBeGreaterThan(20);
    expect(mean).toBeLessThan(44);
  });

  it('distance is symmetric and bounded by 64 (property, seeded sweep)', () => {
    for (let i = 0; i < 10; i++) {
      const a = dHash64(noiseImage(300 + i), 128, 96);
      const b = dHash64(noiseImage(400 + i), 128, 96);
      const d = hammingDistance(a, b);
      expect(hammingDistance(b, a)).toBe(d);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(64);
    }
  });
});

describe('THE acceptance: corpus rescan pairs are near-duplicates', () => {
  interface Fixture { file: string; w: number; h: number; src: string }
  const meta = JSON.parse(
    readFileSync(join(here, 'fixtures', 'fixtures.json'), 'utf-8'),
  ) as Fixture[];

  it('3 clean-vs-degraded pairs of the same identity land at Hamming <= 8', () => {
    for (let p = 0; p < meta.length; p += 2) {
      const a = meta[p];
      const b = meta[p + 1];
      const ra = new Uint8ClampedArray(readFileSync(join(here, 'fixtures', a.file)));
      const rb = new Uint8ClampedArray(readFileSync(join(here, 'fixtures', b.file)));
      const d = hammingDistance(dHash64(ra, a.w, a.h), dHash64(rb, b.w, b.h));
      expect(d, `${a.src} vs ${b.src}`).toBeLessThanOrEqual(8);
    }
  });
});
