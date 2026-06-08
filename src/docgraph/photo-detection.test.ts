import { describe, it, expect } from 'vitest';
import {
  localStdDevGrid,
  detectPhotoRegion,
  PhotoRegion,
} from './photo-detection';

const GRID = 20;

/** Create a flat luma grid filled with `bg`. */
function makeFlat(w: number, h: number, bg: number): Uint8Array {
  const g = new Uint8Array(w * h);
  g.fill(bg);
  return g;
}

/**
 * Stamp a high-variance checkerboard block into `g` over the inclusive cell
 * range [x0..x1] x [y0..y1]. Alternates 0/255 so local 3x3 std is very high.
 */
function stampCheckerboard(
  g: Uint8Array,
  w: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      g[y * w + x] = (x + y) % 2 === 0 ? 255 : 0;
    }
  }
}

function zeroMask(w: number, h: number): Uint8Array {
  return new Uint8Array(w * h);
}

describe('localStdDevGrid', () => {
  it('reports ~0 std for a perfectly flat region and high std for a checkerboard', () => {
    const w = 10;
    const h = 10;
    const g = makeFlat(w, h, 200);
    // Checkerboard region in the interior so a centre cell has a full 3x3 nbhd.
    stampCheckerboard(g, w, 3, 3, 7, 7);

    const std = localStdDevGrid(g, w, h);

    // A flat corner far from the checkerboard => exactly 0.
    expect(std[0 * w + 0]).toBe(0);
    expect(std[9 * w + 0]).toBe(0);

    // An interior checkerboard cell => high std (well above the default 18).
    const center = std[5 * w + 5];
    expect(center).toBeGreaterThan(50);
  });

  it('returns a Float32Array of length gridW*gridH', () => {
    const w = 4;
    const h = 5;
    const std = localStdDevGrid(makeFlat(w, h, 120), w, h);
    expect(std).toBeInstanceOf(Float32Array);
    expect(std.length).toBe(w * h);
  });
});

describe('detectPhotoRegion', () => {
  it('detects a 6x6 high-variance block on flat paper (no text)', () => {
    // Background = mid-grey (mean of the checkerboard) so the 1-cell "bleed"
    // of std into adjacent flat cells stays below threshold while every block
    // cell (incl. corners) stays above it -> the detected box equals the block.
    const g = makeFlat(GRID, GRID, 127);
    // Block over inclusive cells cols 2..7, rows 2..7.
    stampCheckerboard(g, GRID, 2, 2, 7, 7);

    const region = detectPhotoRegion(g, GRID, GRID, zeroMask(GRID, GRID), {
      varianceThreshold: 80,
    });

    expect(region).not.toBeNull();
    const r = region as PhotoRegion;
    // Box roughly covers [2/20, 2/20, 8/20, 8/20].
    expect(r.boxNorm[0]).toBeCloseTo(2 / GRID, 5);
    expect(r.boxNorm[1]).toBeCloseTo(2 / GRID, 5);
    expect(r.boxNorm[2]).toBeCloseTo(8 / GRID, 5);
    expect(r.boxNorm[3]).toBeCloseTo(8 / GRID, 5);
    // score ~ 36/400 = 0.09
    expect(r.score).toBeCloseTo(36 / 400, 5);
  });

  it('does NOT return a block that is fully covered by text', () => {
    const g = makeFlat(GRID, GRID, 127);
    stampCheckerboard(g, GRID, 2, 2, 7, 7);

    // Mark every block cell as text-covered.
    const mask = zeroMask(GRID, GRID);
    for (let y = 2; y <= 7; y++) {
      for (let x = 2; x <= 7; x++) {
        mask[y * GRID + x] = 1;
      }
    }

    const region = detectPhotoRegion(g, GRID, GRID, mask, {
      varianceThreshold: 80,
    });

    // The text-covered block must not be reported. With only that block
    // present, the result is null.
    expect(region).toBeNull();
  });

  it('returns null for a completely flat image (no variance)', () => {
    const g = makeFlat(GRID, GRID, 200);
    const region = detectPhotoRegion(g, GRID, GRID, zeroMask(GRID, GRID));
    expect(region).toBeNull();
  });

  it('returns the LARGER of two variance blocks', () => {
    const g = makeFlat(GRID, GRID, 127);
    // Large block 6x6 (cols 2..7, rows 2..7) => 36 cells.
    stampCheckerboard(g, GRID, 2, 2, 7, 7);
    // Small block 4x4 (cols 12..15, rows 12..15) => 16 cells.
    stampCheckerboard(g, GRID, 12, 12, 15, 15);

    const region = detectPhotoRegion(g, GRID, GRID, zeroMask(GRID, GRID), {
      varianceThreshold: 80,
    });

    expect(region).not.toBeNull();
    const r = region as PhotoRegion;
    // Should be the large block, not the small one.
    expect(r.boxNorm[0]).toBeCloseTo(2 / GRID, 5);
    expect(r.boxNorm[1]).toBeCloseTo(2 / GRID, 5);
    expect(r.boxNorm[2]).toBeCloseTo(8 / GRID, 5);
    expect(r.boxNorm[3]).toBeCloseTo(8 / GRID, 5);
    expect(r.score).toBeCloseTo(36 / 400, 5);
  });

  it('returns null when the only variance block is below minAreaFrac', () => {
    const g = makeFlat(GRID, GRID, 127);
    // Tiny 2x2 block => 4 cells => 4/400 = 0.01 < default minAreaFrac 0.015.
    stampCheckerboard(g, GRID, 2, 2, 3, 3);

    const region = detectPhotoRegion(g, GRID, GRID, zeroMask(GRID, GRID), {
      varianceThreshold: 80,
    });

    expect(region).toBeNull();
  });

  it('accepts the small block when minAreaFrac is lowered', () => {
    const g = makeFlat(GRID, GRID, 127);
    stampCheckerboard(g, GRID, 2, 2, 3, 3);

    const region = detectPhotoRegion(g, GRID, GRID, zeroMask(GRID, GRID), {
      varianceThreshold: 80,
      minAreaFrac: 0.005,
    });

    expect(region).not.toBeNull();
    const r = region as PhotoRegion;
    expect(r.score).toBeCloseTo(4 / 400, 5);
  });
});

describe('detectPhotoRegion - background (border) rejection', () => {
  it('ignores a high-variance component touching the page border (e.g. desk)', () => {
    const W = 20;
    const H = 20;
    // Flat mid-grey page.
    const luma = new Uint8Array(W * H).fill(127);
    const textMask = new Uint8Array(W * H);

    // Background "desk": a high-variance ring along the top + left border.
    for (let x = 0; x < W; x++) {
      luma[0 * W + x] = (x % 2) * 255; // top row alternating -> high std, touches border
      luma[1 * W + x] = ((x + 1) % 2) * 255;
    }
    for (let y = 0; y < H; y++) {
      luma[y * W + 0] = (y % 2) * 255; // left column, touches border
      luma[y * W + 1] = ((y + 1) % 2) * 255;
    }

    // An inner portrait block well away from the border (cols 8..13, rows 8..13).
    for (let y = 8; y <= 13; y++) {
      for (let x = 8; x <= 13; x++) {
        luma[y * W + x] = ((x + y) % 2) * 255;
      }
    }

    const region = detectPhotoRegion(luma, W, H, textMask, { varianceThreshold: 80 });
    expect(region).not.toBeNull();
    // The returned region must be the inner block, not the border ring.
    expect(region!.boxNorm[0]).toBeGreaterThanOrEqual(7 / W);
    expect(region!.boxNorm[1]).toBeGreaterThanOrEqual(7 / H);
    expect(region!.boxNorm[2]).toBeLessThanOrEqual(15 / W);
    expect(region!.boxNorm[3]).toBeLessThanOrEqual(15 / H);
  });

  it('rejects an oversized blob above maxAreaFrac', () => {
    const W = 20;
    const H = 20;
    const luma = new Uint8Array(W * H).fill(127);
    const textMask = new Uint8Array(W * H);
    // Fill ~60% of the interior with high variance (not touching border).
    for (let y = 2; y <= 15; y++) {
      for (let x = 2; x <= 17; x++) {
        luma[y * W + x] = ((x + y) % 2) * 255;
      }
    }
    const region = detectPhotoRegion(luma, W, H, textMask, {
      varianceThreshold: 80,
      maxAreaFrac: 0.45,
    });
    expect(region).toBeNull();
  });
});
