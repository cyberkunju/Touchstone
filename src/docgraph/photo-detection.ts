import { Box } from '../core/geometry';

/** A detected photographic region on the page. */
export interface PhotoRegion {
  boxNorm: Box;
  /** Area fraction of the page covered by the region. */
  score: number;
}

export interface PhotoDetectOptions {
  /** Min region area as a fraction of the page to accept. Default 0.015. */
  minAreaFrac?: number;
  /** Local std-dev (0..255 scale) above which a cell is "photographic". Default 18. */
  varianceThreshold?: number;
  /** Max region area as a fraction of the page to accept. Default 0.45. */
  maxAreaFrac?: number;
  /**
   * Ignore components that touch the page border. The textured background of a
   * photographed document (desk, table) forms a high-variance ring touching the
   * border; excluding it prevents mistaking the background for the portrait.
   * Default true.
   */
  ignoreBorderComponents?: boolean;
}

/**
 * Local std-dev of luma over a 3x3 neighbourhood for each grid cell.
 * Edges are clamped (neighbour indices saturate to the grid bounds).
 */
export function localStdDevGrid(
  luma: Uint8Array,
  gridW: number,
  gridH: number
): Float32Array {
  const out = new Float32Array(gridW * gridH);
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      let sum = 0;
      let sumSq = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = clamp(y + dy, 0, gridH - 1);
          const nx = clamp(x + dx, 0, gridW - 1);
          const v = luma[ny * gridW + nx];
          sum += v;
          sumSq += v * v;
          count++;
        }
      }
      const mean = sum / count;
      const variance = sumSq / count - mean * mean;
      out[y * gridW + x] = Math.sqrt(Math.max(0, variance));
    }
  }
  return out;
}

/**
 * Detect the dominant photographic region.
 * @param luma  Row-major luminance (0..255), length gridW*gridH.
 * @param gridW grid width in cells.
 * @param gridH grid height in cells.
 * @param textMask Row-major Uint8Array length gridW*gridH; 1 = cell covered by text, else 0.
 * @returns the largest qualifying region as a normalized Box, or null.
 */
export function detectPhotoRegion(
  luma: Uint8Array,
  gridW: number,
  gridH: number,
  textMask: Uint8Array,
  options?: PhotoDetectOptions
): PhotoRegion | null {
  const minAreaFrac = options?.minAreaFrac ?? 0.015;
  const varianceThreshold = options?.varianceThreshold ?? 18;
  const maxAreaFrac = options?.maxAreaFrac ?? 0.45;
  const ignoreBorder = options?.ignoreBorderComponents ?? true;

  const std = localStdDevGrid(luma, gridW, gridH);
  const total = gridW * gridH;

  // Photographic cell mask.
  const photo = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    if (std[i] >= varianceThreshold && textMask[i] === 0) {
      photo[i] = 1;
    }
  }

  // 4-connected flood fill to find components.
  const visited = new Uint8Array(total);
  const stack: number[] = [];

  let best: {
    area: number;
    xMin: number;
    yMin: number;
    xMax: number;
    yMax: number;
  } | null = null;

  for (let start = 0; start < total; start++) {
    if (photo[start] === 0 || visited[start] === 1) continue;

    let area = 0;
    let xMin = Infinity;
    let yMin = Infinity;
    let xMax = -Infinity;
    let yMax = -Infinity;
    let touchesBorder = false;

    visited[start] = 1;
    stack.length = 0;
    stack.push(start);

    while (stack.length > 0) {
      const idx = stack.pop()!;
      const cx = idx % gridW;
      const cy = (idx - cx) / gridW;

      area++;
      if (cx < xMin) xMin = cx;
      if (cy < yMin) yMin = cy;
      if (cx > xMax) xMax = cx;
      if (cy > yMax) yMax = cy;
      if (cx === 0 || cy === 0 || cx === gridW - 1 || cy === gridH - 1) {
        touchesBorder = true;
      }

      // 4-connected neighbours.
      if (cx > 0) pushIf(idx - 1, photo, visited, stack);
      if (cx < gridW - 1) pushIf(idx + 1, photo, visited, stack);
      if (cy > 0) pushIf(idx - gridW, photo, visited, stack);
      if (cy < gridH - 1) pushIf(idx + gridW, photo, visited, stack);
    }

    const frac = area / total;
    // Reject the textured background (touches border) and oversized blobs.
    if (ignoreBorder && touchesBorder) continue;
    if (frac > maxAreaFrac) continue;

    // Largest qualifying area wins; deterministic tie-break by earlier start.
    if (best === null || area > best.area) {
      best = { area, xMin, yMin, xMax, yMax };
    }
  }

  if (best === null) return null;

  const areaFrac = best.area / total;
  if (areaFrac < minAreaFrac) return null;

  const boxNorm: Box = [
    best.xMin / gridW,
    best.yMin / gridH,
    (best.xMax + 1) / gridW,
    (best.yMax + 1) / gridH,
  ];

  return { boxNorm, score: areaFrac };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function pushIf(
  idx: number,
  photo: Uint8Array,
  visited: Uint8Array,
  stack: number[]
): void {
  if (photo[idx] === 1 && visited[idx] === 0) {
    visited[idx] = 1;
    stack.push(idx);
  }
}
