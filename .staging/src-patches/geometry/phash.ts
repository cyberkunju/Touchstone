/**
 * dHash-64 — identity tier 2 (I13, Documentation/11 §3).
 *
 * A 64-bit difference hash over the normalized page raster: resize to 9×8
 * luma, then each bit = (pixel brighter than its right neighbor). Survives
 * re-scans, small crops, compression and lighting drift; Hamming distance
 * ≤ 8 flags a near-duplicate (rescan of the same physical document),
 * surfaced as a dedupe SUGGESTION — the user decides, never the machine.
 *
 * Deterministic by construction: fixed box-filter downsample (no browser
 * canvas interpolation — the same bytes hash identically everywhere).
 *
 * DESTINATION: src/geometry/phash.ts (staged during the certification
 * freeze; move verbatim when the chain ends).
 */

/** Luma (BT.601) of an RGBA pixel. */
function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Box-filter downsample of RGBA pixels to a w×h luma grid.
 *
 * Every source pixel belongs to exactly one destination cell (integer bucket
 * by scaled coordinate); cells average their members. Deterministic and
 * dependency-free — no canvas, no smoothing flags.
 */
export function toLumaGrid(
  rgba: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  w: number,
  h: number,
): Float64Array {
  if (srcW <= 0 || srcH <= 0 || rgba.length < srcW * srcH * 4) {
    throw new Error(`toLumaGrid: bad dimensions ${srcW}x${srcH} for ${rgba.length} bytes`);
  }
  const sum = new Float64Array(w * h);
  const count = new Uint32Array(w * h);

  for (let y = 0; y < srcH; y++) {
    // Integer bucket; clamp guards the srcH-multiple edge exactly.
    const gy = Math.min(h - 1, Math.floor((y * h) / srcH));
    for (let x = 0; x < srcW; x++) {
      const gx = Math.min(w - 1, Math.floor((x * w) / srcW));
      const i = (y * srcW + x) * 4;
      const g = gy * w + gx;
      sum[g] += luma(rgba[i], rgba[i + 1], rgba[i + 2]);
      count[g] += 1;
    }
  }

  const grid = new Float64Array(w * h);
  for (let i = 0; i < grid.length; i++) {
    grid[i] = count[i] > 0 ? sum[i] / count[i] : 0;
  }
  return grid;
}

/**
 * dHash-64 of an RGBA raster → 16-char lowercase hex string.
 *
 * 9×8 grid; bit(row r, col c) = grid[r][c] > grid[r][c+1], packed MSB-first
 * row-major into 64 bits.
 */
export function dHash64(rgba: Uint8ClampedArray, srcW: number, srcH: number): string {
  const grid = toLumaGrid(rgba, srcW, srcH, 9, 8);
  let hi = 0;
  let lo = 0;
  let bit = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const on = grid[r * 9 + c] > grid[r * 9 + c + 1] ? 1 : 0;
      if (bit < 32) {
        hi = (hi << 1) | on;
      } else {
        lo = (lo << 1) | on;
      }
      bit++;
    }
  }
  // >>> 0 coerces to unsigned before hex.
  return (hi >>> 0).toString(16).padStart(8, '0') + (lo >>> 0).toString(16).padStart(8, '0');
}

/**
 * Hamming distance between two dHash-64 hex strings (0..64).
 *
 * Malformed input (wrong length / non-hex) returns 64 — maximum distance,
 * never a false duplicate (N1: garbage must not match anything).
 */
export function hammingDistance(a: string, b: string): number {
  if (!/^[0-9a-f]{16}$/.test(a) || !/^[0-9a-f]{16}$/.test(b)) {
    return 64;
  }
  let dist = 0;
  for (let i = 0; i < 16; i += 8) {
    let x = parseInt(a.slice(i, i + 8), 16) ^ parseInt(b.slice(i, i + 8), 16);
    // Kernighan popcount on the 32-bit half.
    while (x !== 0) {
      x &= x - 1;
      dist++;
    }
  }
  return dist;
}

/** Near-duplicate threshold (11 §3): Hamming ≤ 8 ⇒ suggest dedupe. */
export const NEAR_DUP_HAMMING = 8;

/** True when two hashes are near-duplicates under the frozen threshold. */
export function isNearDuplicate(a: string, b: string): boolean {
  return hammingDistance(a, b) <= NEAR_DUP_HAMMING;
}
