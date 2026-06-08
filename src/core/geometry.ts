/**
 * Geometry types and utilities for coordinate-grounded document understanding.
 * All coordinates in DocGraph are normalized relative to page bounds (0.0 to 1.0)
 * and mapped internally to a 1000x1000 canonical coordinate system.
 */

export type Point = [number, number]; // [x, y]
export type Box = [number, number, number, number]; // [x_min, y_min, x_max, y_max]
export type Polygon = Point[];

/**
 * Computes the Intersection over Union (IoU) of two bounding boxes.
 */
export function getIoU(boxA: Box, boxB: Box): number {
  const [ax1, ay1, ax2, ay2] = boxA;
  const [bx1, by1, bx2, by2] = boxB;

  const ix1 = Math.max(ax1, bx1);
  const iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);

  const iWidth = Math.max(0, ix2 - ix1);
  const iHeight = Math.max(0, iy2 - iy1);
  const iArea = iWidth * iHeight;

  if (iArea === 0) return 0;

  const areaA = (ax2 - ax1) * (ay2 - ay1);
  const areaB = (bx2 - bx1) * (by2 - by1);

  return iArea / (areaA + areaB - iArea);
}

/**
 * Checks if a point [x, y] lies inside a bounding box.
 */
export function isPointInBox(point: Point, box: Box): boolean {
  const [px, py] = point;
  const [x1, y1, x2, y2] = box;
  return px >= x1 && px <= x2 && py >= y1 && py <= y2;
}

/**
 * Checks if boxA completely contains boxB.
 */
export function containsBox(boxA: Box, boxB: Box): boolean {
  const [ax1, ay1, ax2, ay2] = boxA;
  const [bx1, by1, bx2, by2] = boxB;
  return bx1 >= ax1 && bx2 <= ax2 && by1 >= ay1 && by2 <= ay2;
}

/**
 * Normalizes absolute coordinates [x1, y1, x2, y2] relative to page width and height.
 */
export function normalizeBox(box: Box, width: number, height: number): Box {
  const [x1, y1, x2, y2] = box;
  return [
    x1 / width,
    y1 / height,
    x2 / width,
    y2 / height
  ];
}

/**
 * Scales normalized coordinates [x1, y1, x2, y2] back to target width and height.
 */
export function scaleBox(box: Box, width: number, height: number): Box {
  const [x1, y1, x2, y2] = box;
  return [
    x1 * width,
    y1 * height,
    x2 * width,
    y2 * height
  ];
}

/**
 * Calculates Euclidean distance between two points.
 */
export function getDistance(pointA: Point, pointB: Point): number {
  const [ax, ay] = pointA;
  const [bx, by] = pointB;
  return Math.sqrt(Math.pow(ax - bx, 2) + Math.pow(ay - by, 2));
}

/**
 * Computes the center point of a bounding box.
 */
export function getBoxCenter(box: Box): Point {
  const [x1, y1, x2, y2] = box;
  return [x1 + (x2 - x1) / 2, y1 + (y2 - y1) / 2];
}
