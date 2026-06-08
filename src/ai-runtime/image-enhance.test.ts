import { describe, it, expect } from 'vitest';
import {
  toGrayscale,
  contrastStretch,
  unsharpMask,
  otsuThreshold,
  enhanceForOcr,
  EnhanceOptions,
} from './image-enhance';

/**
 * Build a solid-color RGBA image of the given size.
 */
function solid(
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = a;
  }
  return out;
}

/**
 * Build a grayscale image from a flat list of luma values (one per pixel).
 */
function grayFromLumas(lumas: number[], a = 255): Uint8ClampedArray {
  const out = new Uint8ClampedArray(lumas.length * 4);
  for (let p = 0; p < lumas.length; p++) {
    const i = p * 4;
    out[i] = lumas[p];
    out[i + 1] = lumas[p];
    out[i + 2] = lumas[p];
    out[i + 3] = a;
  }
  return out;
}

describe('toGrayscale', () => {
  it('maps a 1x1 pure-red pixel to luma 76 with R=G=B', () => {
    const red = new Uint8ClampedArray([255, 0, 0, 255]);
    const out = toGrayscale(red, 1, 1);
    expect(Array.from(out)).toEqual([76, 76, 76, 255]);
  });

  it('maps red then green and preserves alpha', () => {
    // red -> 76, green -> 150 (0.587*255 = 149.685 -> 150)
    const img = new Uint8ClampedArray([255, 0, 0, 200, 0, 255, 0, 123]);
    const out = toGrayscale(img, 2, 1);
    expect(Array.from(out)).toEqual([76, 76, 76, 200, 150, 150, 150, 123]);
  });

  it('preserves length', () => {
    const img = solid(4, 3, 10, 20, 30);
    const out = toGrayscale(img, 4, 3);
    expect(out.length).toBe(4 * 3 * 4);
  });
});

describe('contrastStretch', () => {
  it('maps [50,100,150] -> endpoints 0 and 255 with midpoint ~128 (lowPct=0, highPct=100)', () => {
    const img = grayFromLumas([50, 100, 150]);
    const out = contrastStretch(img, 3, 1, 0, 100);
    // lo=50, hi=150 -> scale = 255/100 = 2.55
    expect(out[0]).toBe(0); // 50 -> 0
    // 100 -> (100-50)*255/100 = 127.5 (~128); float scaling lands at 127
    expect(out[4]).toBeGreaterThanOrEqual(127);
    expect(out[4]).toBeLessThanOrEqual(128);
    expect(out[8]).toBe(255); // 150 -> 255
    // alpha preserved
    expect(out[3]).toBe(255);
    expect(out[7]).toBe(255);
    expect(out[11]).toBe(255);
  });

  it('returns an unchanged copy when hi <= lo (all-same-color image)', () => {
    const img = solid(3, 2, 120, 120, 120);
    const out = contrastStretch(img, 3, 2, 0, 100);
    expect(out).not.toBe(img); // a new array
    expect(Array.from(out)).toEqual(Array.from(img)); // identical content
  });

  it('preserves length and alpha', () => {
    const img = grayFromLumas([10, 60, 110, 160, 210], 200);
    const out = contrastStretch(img, 5, 1, 0, 100);
    expect(out.length).toBe(5 * 4);
    for (let p = 0; p < 5; p++) {
      expect(out[p * 4 + 3]).toBe(200);
    }
  });
});

describe('unsharpMask', () => {
  it('leaves a uniform image unchanged (blur equals original)', () => {
    const img = solid(5, 5, 130, 130, 130);
    const out = unsharpMask(img, 5, 5);
    expect(Array.from(out)).toEqual(Array.from(img));
  });

  it('increases local contrast: bright center gets brighter', () => {
    const w = 3;
    const h = 3;
    // dark edges (50), bright center (200)
    const lumas = [50, 50, 50, 50, 200, 50, 50, 50, 50];
    const img = grayFromLumas(lumas);
    const out = unsharpMask(img, w, h);
    const centerIdx = (1 * w + 1) * 4;
    const edgeIdx = 0;
    expect(out[centerIdx]).toBeGreaterThan(200); // center brighter than original
    expect(out[edgeIdx]).toBeLessThan(50); // edge darker than original
    expect(out[centerIdx + 3]).toBe(255); // alpha preserved
  });

  it('preserves length', () => {
    const img = solid(4, 4, 80, 90, 100);
    const out = unsharpMask(img, 4, 4);
    expect(out.length).toBe(4 * 4 * 4);
  });
});

describe('otsuThreshold', () => {
  it('finds a threshold between the two modes of a bimodal image', () => {
    // half pixels luma 30, half luma 220
    const lumas: number[] = [];
    for (let i = 0; i < 50; i++) lumas.push(30);
    for (let i = 0; i < 50; i++) lumas.push(220);
    const img = grayFromLumas(lumas);
    const { threshold, binary } = otsuThreshold(img, 100, 1);

    expect(threshold).toBeGreaterThan(30);
    expect(threshold).toBeLessThan(220);

    // dark half -> black, bright half -> white
    for (let p = 0; p < 50; p++) {
      const i = p * 4;
      expect(binary[i]).toBe(0);
      expect(binary[i + 1]).toBe(0);
      expect(binary[i + 2]).toBe(0);
      expect(binary[i + 3]).toBe(255);
    }
    for (let p = 50; p < 100; p++) {
      const i = p * 4;
      expect(binary[i]).toBe(255);
      expect(binary[i + 1]).toBe(255);
      expect(binary[i + 2]).toBe(255);
      expect(binary[i + 3]).toBe(255);
    }
  });

  it('produces a binary image with the correct length', () => {
    const img = solid(4, 4, 100, 100, 100);
    const { binary } = otsuThreshold(img, 4, 4);
    expect(binary.length).toBe(4 * 4 * 4);
  });
});

describe('enhanceForOcr', () => {
  const w = 6;
  const h = 4;

  function noisyImage(): Uint8ClampedArray {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let p = 0; p < w * h; p++) {
      const i = p * 4;
      out[i] = (p * 7) % 200;
      out[i + 1] = (p * 13) % 200;
      out[i + 2] = (p * 29) % 200;
      out[i + 3] = 255;
    }
    return out;
  }

  it('returns the correct length and preserves alpha 255', () => {
    const img = noisyImage();
    const out = enhanceForOcr(img, w, h);
    expect(out.length).toBe(w * h * 4);
    for (let p = 0; p < w * h; p++) {
      expect(out[p * 4 + 3]).toBe(255);
    }
  });

  it('is deterministic (same input twice -> identical output)', () => {
    const img = noisyImage();
    const a = enhanceForOcr(img, w, h);
    const b = enhanceForOcr(img, w, h);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('does not mutate the input array', () => {
    const img = noisyImage();
    const before = Array.from(img);
    enhanceForOcr(img, w, h);
    expect(Array.from(img)).toEqual(before);
  });

  it('respects options (all disabled -> unchanged copy)', () => {
    const img = noisyImage();
    const opts: EnhanceOptions = {
      grayscale: false,
      stretch: false,
      sharpen: false,
    };
    const out = enhanceForOcr(img, w, h, opts);
    expect(out).not.toBe(img);
    expect(Array.from(out)).toEqual(Array.from(img));
  });
});
