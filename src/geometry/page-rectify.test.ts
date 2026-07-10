import { describe, expect, it } from 'vitest';
import {
  estimatePageQuad,
  quadNeedsRectification,
  rectifiedSize,
  warpPerspective,
  type PixelGrid,
} from './page-rectify';
import type { Pt } from './homography';

/** Dark canvas with a bright convex quad painted via half-plane tests. */
function synthesize(width: number, height: number, quad: Pt[]): PixelGrid {
  const data = new Uint8ClampedArray(width * height * 4);
  const inside = (x: number, y: number): boolean => {
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = quad[i];
      const [bx, by] = quad[(i + 1) % 4];
      if ((bx - ax) * (y - ay) - (by - ay) * (x - ax) < 0) return false;
    }
    return true;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const v = inside(x, y) ? 235 : 25;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

const KEYSTONE: Pt[] = [
  [70, 40],   // TL
  [250, 60],  // TR (right side higher/narrower — converging)
  [235, 190], // BR
  [45, 205],  // BL
];

describe('estimatePageQuad', () => {
  it('finds the corners of a keystoned bright page on a dark background', () => {
    const grid = synthesize(320, 240, KEYSTONE);
    const result = estimatePageQuad(grid);
    expect(result).not.toBeNull();
    const got = result!.corners;
    const want = KEYSTONE;
    for (let i = 0; i < 4; i++) {
      expect(Math.hypot(got[i][0] - want[i][0], got[i][1] - want[i][1])).toBeLessThan(8);
    }
    expect(result!.maxAngleDeviationDeg).toBeGreaterThan(3);
    expect(quadNeedsRectification(result!)).toBe(true);
  });

  it('returns null for a full-frame page (scan — no visible edges)', () => {
    const grid = synthesize(320, 240, [
      [0, 0],
      [320, 0],
      [320, 240],
      [0, 240],
    ]);
    expect(estimatePageQuad(grid)).toBeNull();
  });

  it('does not demand rectification for a level rectangular page', () => {
    const grid = synthesize(320, 240, [
      [60, 50],
      [260, 50],
      [260, 190],
      [60, 190],
    ]);
    const result = estimatePageQuad(grid);
    expect(result).not.toBeNull();
    expect(quadNeedsRectification(result!)).toBe(false);
  });

  it('returns null on a blank dark frame (nothing to find)', () => {
    const data = new Uint8ClampedArray(320 * 240 * 4);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    expect(estimatePageQuad({ data, width: 320, height: 240 })).toBeNull();
  });
});

describe('warpPerspective', () => {
  it('maps the keystoned quad onto an axis-aligned rectangle', () => {
    // Paint a distinctive dark probe INSIDE the page near its TL corner.
    const grid = synthesize(320, 240, KEYSTONE);
    const probe: Pt = [
      KEYSTONE[0][0] * 0.75 + KEYSTONE[2][0] * 0.25,
      KEYSTONE[0][1] * 0.75 + KEYSTONE[2][1] * 0.25,
    ];
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const i = ((Math.round(probe[1]) + dy) * 320 + Math.round(probe[0]) + dx) * 4;
        grid.data[i] = grid.data[i + 1] = grid.data[i + 2] = 0;
      }
    }
    const { width, height } = rectifiedSize(KEYSTONE);
    const out = warpPerspective(grid, KEYSTONE, width, height);
    expect(out).not.toBeNull();

    // Page corners → output corners: the four output corners must be BRIGHT
    // page pixels (not dark background), proving edge-to-edge coverage.
    const lumAt = (x: number, y: number) => {
      const i = (y * out!.width + x) * 4;
      return out!.data[i];
    };
    expect(lumAt(3, 3)).toBeGreaterThan(180);
    expect(lumAt(out!.width - 4, 3)).toBeGreaterThan(180);
    expect(lumAt(out!.width - 4, out!.height - 4)).toBeGreaterThan(180);
    expect(lumAt(3, out!.height - 4)).toBeGreaterThan(180);

    // The probe (25% along the TL→BR diagonal in SOURCE page space) must
    // land near 25% of the OUTPUT diagonal — projective mapping is not
    // affine, so allow a tolerant window; the probe must simply be found
    // in the upper-left quadrant as a dark blob.
    let found = false;
    for (let y = 0; y < Math.floor(out!.height / 2) && !found; y++) {
      for (let x = 0; x < Math.floor(out!.width / 2) && !found; x++) {
        if (lumAt(x, y) < 60) found = true;
      }
    }
    expect(found).toBe(true);
  });
});
