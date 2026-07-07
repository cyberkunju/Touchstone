/**
 * Optimal assignment (Hungarian / Munkres) for label↔value pairing (I1-lite).
 *
 * Replaces greedy highest-score-first resolution, whose classic failure is
 * label-stealing in stacked layouts: the globally best pairing sacrifices one
 * field's perfect match to a neighbor that had a slightly higher local score.
 * At document scale (≤ ~20 specs × ≤ ~150 candidates) the O(n³) exact solve
 * is sub-millisecond — no approximation is justified.
 */

/**
 * Solves maximum-total-profit assignment on a sparse bipartite profit map.
 *
 * @param rows Number of row entities (e.g. field specs).
 * @param cols Number of column entities (e.g. value candidates).
 * @param profit Sparse profits: profit[r][c] > 0 where pairing is feasible.
 *   Missing entries are infeasible (never assigned). All profits must be > 0.
 * @returns Array of [row, col] assignments, each row/col used at most once,
 *   maximizing total profit. Rows/cols with no profitable pairing stay
 *   unassigned (an infeasible pairing is never forced).
 */
export function assignOptimal(
  rows: number,
  cols: number,
  profit: ReadonlyMap<number, ReadonlyMap<number, number>>
): [number, number][] {
  if (rows === 0 || cols === 0) return [];

  // Square the problem: n×n cost matrix. Infeasible and dummy cells cost
  // exactly `maxProfit` — identical to a real cell of profit 0 — so leaving a
  // row unassigned is FREE relative to profit. (A BIG penalty here would be a
  // bug: it makes assignment cardinality dominate total profit, and the
  // solver would take two mediocre pairings over one excellent one. Found by
  // the brute-force equivalence fuzz.)
  const n = Math.max(rows, cols);
  let maxProfit = 0;
  for (const rowMap of profit.values()) {
    for (const p of rowMap.values()) {
      if (!(p > 0)) throw new Error('assignOptimal: profits must be > 0');
      if (p > maxProfit) maxProfit = p;
    }
  }
  if (maxProfit === 0) return [];

  const cost: number[][] = [];
  for (let r = 0; r < n; r++) {
    const row = new Array<number>(n).fill(maxProfit);
    const rowMap = r < rows ? profit.get(r) : undefined;
    if (rowMap) {
      for (const [c, p] of rowMap) {
        if (c < cols) row[c] = maxProfit - p; // smaller cost = larger profit
      }
    }
    cost.push(row);
  }

  const assignment = munkres(cost, n);

  const out: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    const c = assignment[r];
    if (c >= 0 && c < cols && profit.get(r)?.has(c)) {
      out.push([r, c]);
    }
  }
  return out;
}

/**
 * Canonical O(n³) Munkres on a square cost matrix. Returns col index per row.
 * Textbook implementation (star/prime/augment) — kept dependency-free and
 * exhaustively tested rather than pulling a package for 100 lines.
 */
function munkres(costInput: number[][], n: number): number[] {
  // Work on a copy — callers keep their matrix.
  const cost = costInput.map((row) => row.slice());

  // Step 1: subtract row minima; Step 2: subtract column minima.
  for (let r = 0; r < n; r++) {
    let min = Infinity;
    for (let c = 0; c < n; c++) min = Math.min(min, cost[r][c]);
    for (let c = 0; c < n; c++) cost[r][c] -= min;
  }
  for (let c = 0; c < n; c++) {
    let min = Infinity;
    for (let r = 0; r < n; r++) min = Math.min(min, cost[r][c]);
    for (let r = 0; r < n; r++) cost[r][c] -= min;
  }

  // 0 = none, 1 = starred, 2 = primed
  const mask: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const rowCover = new Array<boolean>(n).fill(false);
  const colCover = new Array<boolean>(n).fill(false);

  // Initial starring of independent zeros.
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (cost[r][c] === 0 && !rowCover[r] && !colCover[c]) {
        mask[r][c] = 1;
        rowCover[r] = true;
        colCover[c] = true;
      }
    }
  }
  rowCover.fill(false);
  colCover.fill(false);

  const coverStarredColumns = (): number => {
    let covered = 0;
    for (let c = 0; c < n; c++) {
      for (let r = 0; r < n; r++) {
        if (mask[r][c] === 1) {
          colCover[c] = true;
          covered++;
          break;
        }
      }
    }
    return covered;
  };

  const findUncoveredZero = (): [number, number] | null => {
    for (let r = 0; r < n; r++) {
      if (rowCover[r]) continue;
      for (let c = 0; c < n; c++) {
        if (!colCover[c] && cost[r][c] === 0) return [r, c];
      }
    }
    return null;
  };

  const starInRow = (r: number): number => mask[r].indexOf(1);
  const primeInRow = (r: number): number => mask[r].indexOf(2);
  const starInCol = (c: number): number => {
    for (let r = 0; r < n; r++) if (mask[r][c] === 1) return r;
    return -1;
  };

  while (coverStarredColumns() < n) {
    // Step 4: prime uncovered zeros until an augmenting path start is found.
    let path: [number, number] | null = null;
    for (;;) {
      const z = findUncoveredZero();
      if (z === null) {
        // Step 6: adjust the matrix by the smallest uncovered value.
        let min = Infinity;
        for (let r = 0; r < n; r++) {
          if (rowCover[r]) continue;
          for (let c = 0; c < n; c++) {
            if (!colCover[c]) min = Math.min(min, cost[r][c]);
          }
        }
        for (let r = 0; r < n; r++) {
          for (let c = 0; c < n; c++) {
            if (rowCover[r]) cost[r][c] += min;
            if (!colCover[c]) cost[r][c] -= min;
          }
        }
        continue;
      }
      const [r, c] = z;
      mask[r][c] = 2;
      const starCol = starInRow(r);
      if (starCol === -1) {
        path = [r, c];
        break;
      }
      rowCover[r] = true;
      colCover[starCol] = false;
    }

    // Step 5: augmenting path of alternating primes and stars.
    const series: [number, number][] = [path];
    for (;;) {
      const starRow = starInCol(series[series.length - 1][1]);
      if (starRow === -1) break;
      series.push([starRow, series[series.length - 1][1]]);
      const primeCol = primeInRow(starRow);
      series.push([starRow, primeCol]);
    }
    for (const [r, c] of series) {
      mask[r][c] = mask[r][c] === 1 ? 0 : 1;
    }
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (mask[r][c] === 2) mask[r][c] = 0;
      }
    }
    rowCover.fill(false);
    colCover.fill(false);
  }

  const result = new Array<number>(n).fill(-1);
  for (let r = 0; r < n; r++) {
    result[r] = starInRow(r);
  }
  return result;
}
