/**
 * Virtualized-table windowing math (P2.4). Pure — components consume it.
 *
 * The 200-row-smooth requirement is won here: render exactly the visible
 * slice plus symmetric overscan, positioned by absolute offset.
 *
 * DESTINATION: src/workspace/ui/windowing.ts
 */

export interface WindowSpec {
  /** First rendered row index (inclusive). */
  start: number;
  /** One past the last rendered row (exclusive). */
  end: number;
  /** Pixel offset of the first rendered row. */
  offsetY: number;
  /** Total scrollable height. */
  totalHeight: number;
}

export function computeWindow(
  scrollTop: number,
  viewportH: number,
  rowH: number,
  rowCount: number,
  overscan = 6,
): WindowSpec {
  if (rowH <= 0 || rowCount <= 0 || viewportH <= 0) {
    return { start: 0, end: 0, offsetY: 0, totalHeight: Math.max(0, rowCount * Math.max(rowH, 0)) };
  }
  const clampedTop = Math.max(0, Math.min(scrollTop, rowCount * rowH - viewportH));
  const first = Math.floor(clampedTop / rowH);
  const visible = Math.ceil(viewportH / rowH) + 1;
  const start = Math.max(0, first - overscan);
  const end = Math.min(rowCount, first + visible + overscan);
  return { start, end, offsetY: start * rowH, totalHeight: rowCount * rowH };
}

/** Scroll offset that brings `row` into view with minimal movement. */
export function scrollToRow(
  row: number,
  scrollTop: number,
  viewportH: number,
  rowH: number,
  rowCount: number,
): number {
  const clamped = Math.max(0, Math.min(row, rowCount - 1));
  const rowTop = clamped * rowH;
  const rowBottom = rowTop + rowH;
  if (rowTop < scrollTop) return rowTop;
  if (rowBottom > scrollTop + viewportH) return rowBottom - viewportH;
  return scrollTop;
}
