import { describe, expect, it } from 'vitest';
import { assignOptimal } from './hungarian';

/** Helper: profits from a dense matrix (0/undefined = infeasible). */
function fromMatrix(m: (number | undefined)[][]): Map<number, Map<number, number>> {
  const out = new Map<number, Map<number, number>>();
  m.forEach((row, r) => {
    const rowMap = new Map<number, number>();
    row.forEach((p, c) => {
      if (p !== undefined && p > 0) rowMap.set(c, p);
    });
    if (rowMap.size > 0) out.set(r, rowMap);
  });
  return out;
}

describe('assignOptimal', () => {
  it('solves the label-stealing case greedy gets wrong', () => {
    // Greedy takes (0,0)=0.9 first, forcing (1,?) to nothing (row 1 only
    // pairs with col 0 at 0.8). Optimal: (0,1)=0.7 + (1,0)=0.8 = 1.5 > 0.9.
    const profit = fromMatrix([
      [0.9, 0.7],
      [0.8, undefined],
    ]);
    const res = new Map(assignOptimal(2, 2, profit));
    expect(res.get(0)).toBe(1);
    expect(res.get(1)).toBe(0);
  });

  it('never forces an infeasible pairing (unassigned beats bogus)', () => {
    const profit = fromMatrix([
      [0.9, undefined],
      [undefined, undefined], // row 1 has no feasible value
    ]);
    const res = assignOptimal(2, 2, profit);
    expect(res).toEqual([[0, 0]]);
  });

  it('handles rectangular problems (more candidates than specs)', () => {
    const profit = fromMatrix([[0.2, 0.9, 0.5]]);
    expect(assignOptimal(1, 3, profit)).toEqual([[0, 1]]);
  });

  it('handles more specs than candidates', () => {
    const profit = fromMatrix([
      [0.6],
      [0.9],
      [0.3],
    ]);
    // Only one candidate: the highest-profit spec must win it.
    expect(assignOptimal(3, 1, profit)).toEqual([[1, 0]]);
  });

  it('matches brute force on random instances (200 rounds ≤ 6×6)', () => {
    let seed = 99;
    const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 0xffffffff;

    const bruteBest = (
      rows: number,
      cols: number,
      profit: Map<number, Map<number, number>>
    ): number => {
      let best = 0;
      const usedCols = new Array<boolean>(cols).fill(false);
      const walk = (r: number, acc: number) => {
        if (r === rows) {
          best = Math.max(best, acc);
          return;
        }
        walk(r + 1, acc); // leave row unassigned
        const rowMap = profit.get(r);
        if (rowMap) {
          for (const [c, p] of rowMap) {
            if (!usedCols[c]) {
              usedCols[c] = true;
              walk(r + 1, acc + p);
              usedCols[c] = false;
            }
          }
        }
      };
      walk(0, 0);
      return best;
    };

    for (let round = 0; round < 200; round++) {
      const rows = 1 + Math.floor(rand() * 6);
      const cols = 1 + Math.floor(rand() * 6);
      const profit = new Map<number, Map<number, number>>();
      for (let r = 0; r < rows; r++) {
        const rowMap = new Map<number, number>();
        for (let c = 0; c < cols; c++) {
          if (rand() < 0.6) rowMap.set(c, Math.round(rand() * 100) / 100 + 0.01);
        }
        if (rowMap.size > 0) profit.set(r, rowMap);
      }

      const assigned = assignOptimal(rows, cols, profit);
      let total = 0;
      const seenR = new Set<number>();
      const seenC = new Set<number>();
      for (const [r, c] of assigned) {
        expect(seenR.has(r)).toBe(false);
        expect(seenC.has(c)).toBe(false);
        seenR.add(r);
        seenC.add(c);
        total += profit.get(r)!.get(c)!;
      }
      expect(total).toBeCloseTo(bruteBest(rows, cols, profit), 9);
    }
  });

  it('rejects non-positive profits loudly', () => {
    const bad = new Map([[0, new Map([[0, 0]])]]);
    expect(() => assignOptimal(1, 1, bad)).toThrow();
  });
});
