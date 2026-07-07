import { describe, expect, it } from 'vitest';
import { estimateSkewDeg } from './preprocess';

/** Renders synthetic "text lines": glyph-like DASHED dark stripes on white,
 *  rotated by `angleDeg`. Dashes matter: the estimator's run-length filter
 *  (which rejects backgrounds/graphics) would erase solid full-width bars,
 *  and real text is short ink runs anyway — the synthetic must be truthful. */
function stripes(angleDeg: number, w = 400, h = 300): ImageData {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  const rad = (angleDeg * Math.PI) / 180;
  const t = Math.tan(rad);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const yy = y - (x - w / 2) * t;
      const phase = ((yy % 24) + 24) % 24;
      const dash = x % 10 < 6; // glyph-scale runs (6px ink, 4px gap)
      if (phase < 6 && dash) {
        const i = (y * w + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 20;
      }
    }
  }
  return { data, width: w, height: h, colorSpace: 'srgb' } as ImageData;
}

describe('estimateSkewDeg', () => {
  for (const angle of [-7, -3, 0, 2.5, 5, 9]) {
    it(`recovers ${angle}° within ±0.7°`, () => {
      const est = estimateSkewDeg(stripes(angle));
      expect(Math.abs(est - angle)).toBeLessThanOrEqual(0.7);
    });
  }

  it('returns exactly 0 for structureless noise — never guesses (N1)', () => {
    const w = 400, h = 300;
    const data = new Uint8ClampedArray(w * h * 4);
    let seed = 5;
    const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 0xffffffff;
    for (let i = 0; i < data.length; i += 4) {
      const v = Math.floor(rand() * 256);
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
    const noise = { data, width: w, height: h, colorSpace: 'srgb' } as ImageData;
    expect(estimateSkewDeg(noise)).toBe(0);
  });

  it('returns 0 for a blank page', () => {
    const w = 200, h = 150;
    const data = new Uint8ClampedArray(w * h * 4).fill(255);
    const blank = { data, width: w, height: h, colorSpace: 'srgb' } as ImageData;
    expect(estimateSkewDeg(blank)).toBe(0);
  });
});
