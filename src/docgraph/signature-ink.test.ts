import { describe, expect, it } from 'vitest';
import {
  extractSignatureInk,
  rgbaToGray,
  sauvolaMask,
} from './signature-ink';

/* --------------------------- synthetic canvases --------------------------- */

const W = 200;
const H = 100;

/** White page. */
function page(): Uint8Array {
  return new Uint8Array(W * H).fill(240);
}

function stamp(gray: Uint8Array, x: number, y: number, r: number, v = 30): void {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const px = Math.round(x + dx);
      const py = Math.round(y + dy);
      if (px >= 0 && py >= 0 && px < W && py < H) gray[py * W + px] = v;
    }
  }
}

/** A signature-like flourish: sinusoidal curve with PRESSURE (radius varies
 *  1..3 px along the path) — the width variability that defines handwriting. */
function drawSignature(gray: Uint8Array, x0 = 30, y0 = 55, len = 120): void {
  for (let t = 0; t < len; t++) {
    const x = x0 + t;
    const y = y0 + 14 * Math.sin(t / 9) * Math.sin(t / 23);
    const r = 1 + 1.6 * (0.5 + 0.5 * Math.sin(t / 7)); // varying width
    stamp(gray, x, y, Math.round(r));
  }
}

/** Printed-text-like marks: constant-width short horizontal strokes. */
function drawPrintedRow(gray: Uint8Array, y: number): void {
  for (let word = 0; word < 4; word++) {
    const x0 = 15 + word * 45;
    for (let t = 0; t < 28; t++) stamp(gray, x0 + t, y, 1);
  }
}

/** A full-width ruled line. */
function drawRule(gray: Uint8Array, y: number): void {
  for (let x = 2; x < W - 2; x++) {
    gray[y * W + x] = 30;
    gray[(y + 1) * W + x] = 30;
  }
}

/* --------------------------------- tests ---------------------------------- */

describe('rgbaToGray / sauvolaMask', () => {
  it('converts RGBA to luma', () => {
    const rgba = new Uint8ClampedArray(8);
    rgba.set([255, 255, 255, 255, 0, 0, 0, 255]);
    const g = rgbaToGray(rgba, 2, 1);
    expect(g[0]).toBeGreaterThan(250);
    expect(g[1]).toBe(0);
  });

  it('binarizes dark ink on light paper, robust to a lighting gradient', () => {
    const gray = page();
    // Uneven lighting: left half darker paper.
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W / 2; x++) gray[y * W + x] = 190;
    }
    stamp(gray, 40, 50, 3, 30);  // ink on the dark half
    stamp(gray, 160, 50, 3, 80); // ink on the light half
    const mask = sauvolaMask(gray, W, H);
    expect(mask[50 * W + 40]).toBe(1);
    expect(mask[50 * W + 160]).toBe(1);
    // Paper stays background on both halves.
    expect(mask[10 * W + 40]).toBe(0);
    expect(mask[10 * W + 160]).toBe(0);
  });
});

describe('extractSignatureInk', () => {
  it('finds a variable-width flourish and reports a tight bbox', () => {
    const gray = page();
    drawSignature(gray);
    const res = extractSignatureInk(gray, W, H);
    expect(res.bbox).not.toBeNull();
    const [x1, y1, x2, y2] = res.bbox!;
    // The flourish spans x≈30..150, y≈40..70.
    expect(x1).toBeGreaterThanOrEqual(20);
    expect(x2).toBeLessThanOrEqual(160);
    expect(y1).toBeGreaterThanOrEqual(30);
    expect(y2).toBeLessThanOrEqual(80);
    expect(res.inkPixels).toBeGreaterThan(200);
    expect(res.strokeWidthCV).toBeGreaterThanOrEqual(0.3);
  });

  it('rejects printed-style constant-width text (honest null)', () => {
    const gray = page();
    drawPrintedRow(gray, 30);
    drawPrintedRow(gray, 60);
    const res = extractSignatureInk(gray, W, H);
    expect(res.bbox).toBeNull();
    expect(res.inkPixels).toBe(0);
  });

  it('ignores the ruled baseline under the signature', () => {
    const gray = page();
    drawSignature(gray);
    drawRule(gray, 72);
    const res = extractSignatureInk(gray, W, H);
    expect(res.bbox).not.toBeNull();
    // The rule at y=72 must not stretch the bbox to full page width.
    const [x1, , x2] = res.bbox!;
    expect(x2 - x1).toBeLessThan(W - 20);
    // No surviving mask pixels on the rule row far from the signature.
    expect(res.mask[72 * W + 5]).toBe(0);
    expect(res.mask[72 * W + (W - 6)]).toBe(0);
  });

  it('picks the signature over stray specks (largest ink cluster wins)', () => {
    const gray = page();
    drawSignature(gray);
    stamp(gray, 8, 8, 1);   // speck
    stamp(gray, 190, 90, 1); // speck
    const res = extractSignatureInk(gray, W, H);
    expect(res.bbox).not.toBeNull();
    expect(res.mask[8 * W + 8]).toBe(0);
    expect(res.mask[90 * W + 190]).toBe(0);
  });

  it('returns the honest empty result on a blank region', () => {
    const res = extractSignatureInk(page(), W, H);
    expect(res.bbox).toBeNull();
    expect(res.inkPixels).toBe(0);
  });

  it('returns empty for degenerate dimensions', () => {
    const res = extractSignatureInk(new Uint8Array(4), 2, 2);
    expect(res.bbox).toBeNull();
  });
});
