/**
 * Windowing math laws (P2.4) — exact slice/offset arithmetic, edge safety.
 * DESTINATION: src/workspace/ui/windowing.test.ts
 */
import { describe, expect, it } from 'vitest';
import { computeWindow, scrollToRow } from './windowing';

describe('computeWindow', () => {
  it('renders exactly the visible slice plus overscan', () => {
    // 200 rows × 32px, viewport 480px, scrolled to row 50.
    const w = computeWindow(50 * 32, 480, 32, 200, 6);
    expect(w.start).toBe(44);                        // 50 − 6 overscan
    expect(w.end).toBe(50 + 16 + 6);                 // 15 visible + 1 + overscan
    expect(w.offsetY).toBe(44 * 32);
    expect(w.totalHeight).toBe(200 * 32);
    expect(w.end - w.start).toBeLessThan(40);        // never renders 200 rows
  });

  it('clamps at the top', () => {
    const w = computeWindow(0, 480, 32, 200);
    expect(w.start).toBe(0);
    expect(w.offsetY).toBe(0);
  });

  it('clamps at the bottom (scrollTop past end)', () => {
    const w = computeWindow(999999, 480, 32, 200);
    expect(w.end).toBe(200);
    expect(w.start).toBeGreaterThan(150);
  });

  it('degenerate inputs return an empty, non-crashing window', () => {
    expect(computeWindow(0, 0, 32, 200).end).toBe(0);
    expect(computeWindow(0, 480, 0, 200).end).toBe(0);
    expect(computeWindow(0, 480, 32, 0).totalHeight).toBe(0);
  });

  it('every row is covered by some window (no gaps while scrolling)', () => {
    const rowH = 28;
    const count = 200;
    const covered = new Set<number>();
    for (let top = 0; top <= count * rowH; top += 100) {
      const w = computeWindow(top, 500, rowH, count);
      for (let r = w.start; r < w.end; r++) covered.add(r);
    }
    expect(covered.size).toBe(count);
  });
});

describe('scrollToRow', () => {
  it('no movement when the row is already visible', () => {
    expect(scrollToRow(10, 200, 480, 32, 200)).toBe(200); // row 10 at 320px, visible
  });

  it('scrolls up minimally for a row above', () => {
    expect(scrollToRow(2, 500, 480, 32, 200)).toBe(64);
  });

  it('scrolls down minimally for a row below', () => {
    const top = scrollToRow(60, 0, 480, 32, 200);
    expect(top).toBe(60 * 32 + 32 - 480);
  });

  it('clamps out-of-range rows', () => {
    expect(scrollToRow(9999, 0, 480, 32, 200)).toBe(199 * 32 + 32 - 480);
    expect(scrollToRow(-5, 100, 480, 32, 200)).toBe(0);
  });
});
