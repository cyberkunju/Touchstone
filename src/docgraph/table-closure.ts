/**
 * P4.3 — Table arithmetic closure + single-cell repair (10 §4.3, I1/I4 #19).
 *
 * The acceptance test for a parsed table is arithmetic, not vibes:
 *  - Equations auto-discovered: column sums vs a corroborated totals row;
 *    row products (qty × unit ≈ line) via majority column-triple detection.
 *  - ALL discovered equations satisfied ⇒ every participating cell earns
 *    `arithmetic_closure` (the whole table self-attests).
 *  - One broken ⇒ search the broken cells' lattice top-k for the SINGLE
 *    substitution satisfying ALL equations simultaneously. Exactly one ⇒
 *    high-confidence PROPOSAL (marked, auto-confirmed only when an
 *    independent attestation also lands — luck-fabrication dies in review).
 *    Zero or multiple ⇒ implicated cells go to review carrying the broken
 *    equation TEXT — the failure message is the equation.
 *  - Tables without discoverable arithmetic (rosters, schedules) get
 *    nothing. No fake certainty.
 */

import { parseAmount } from '../consensus/attestors/closure';

export interface TableCell {
  row: number;
  col: number;
  raw: string;
  /** Lattice top-k alternate READINGS of this cell (repair search space). */
  alternates?: readonly string[];
}

export interface ParsedTable {
  rows: number;
  cols: number;
  cells: readonly TableCell[];
}

export interface CellRef {
  row: number;
  col: number;
}

export type Equation =
  | { kind: 'column_sum'; col: number; termRows: readonly number[]; resultRow: number }
  | { kind: 'row_product'; row: number; qtyCol: number; unitCol: number; resultCol: number };

export type TableClosureResult =
  | { kind: 'no_arithmetic' }
  | { kind: 'closed'; attested: CellRef[]; equations: string[] }
  | {
      kind: 'repaired';
      proposal: { cell: CellRef; from: string; to: string };
      /** All equations (they ALL hold after the repair). */
      equations: string[];
      /** Cells attested contingent on the proposal being accepted. */
      attestedIfAccepted: CellRef[];
    }
  | { kind: 'review'; brokenEquations: string[]; implicated: CellRef[]; attested: CellRef[] };

const key = (r: number, c: number) => `${r}:${c}`;

function numericGrid(table: ParsedTable): Map<string, number> {
  const g = new Map<string, number>();
  for (const cell of table.cells) {
    const n = parseAmount(cell.raw);
    if (n !== null) g.set(key(cell.row, cell.col), n);
  }
  return g;
}

function epsilonFor(terms: number[]): number {
  return Math.max(0.01, Math.max(...terms.map(Math.abs), 0.01) * 0.005);
}

function evalEquation(eq: Equation, grid: Map<string, number>): { holds: boolean; text: string } {
  if (eq.kind === 'column_sum') {
    const terms = eq.termRows.map((r) => grid.get(key(r, eq.col)));
    const result = grid.get(key(eq.resultRow, eq.col));
    if (terms.some((t) => t === undefined) || result === undefined) {
      return { holds: false, text: `col ${eq.col}: sum has unreadable terms` };
    }
    const lhs = (terms as number[]).reduce((a, b) => a + b, 0);
    const eps = epsilonFor([...(terms as number[]), result]);
    const holds = Math.abs(lhs - result) <= eps;
    return {
      holds,
      text: `col ${eq.col}: ${(terms as number[]).join(' + ')} = ${lhs.toFixed(2)} vs total ${result.toFixed(2)}`,
    };
  }
  const q = grid.get(key(eq.row, eq.qtyCol));
  const u = grid.get(key(eq.row, eq.unitCol));
  const l = grid.get(key(eq.row, eq.resultCol));
  if (q === undefined || u === undefined || l === undefined) {
    return { holds: false, text: `row ${eq.row}: product has unreadable terms` };
  }
  const eps = epsilonFor([l]);
  const holds = Math.abs(q * u - l) <= eps;
  return { holds, text: `row ${eq.row}: ${q} × ${u} = ${(q * u).toFixed(2)} vs line ${l.toFixed(2)}` };
}

function equationCells(eq: Equation): CellRef[] {
  if (eq.kind === 'column_sum') {
    return [...eq.termRows.map((row) => ({ row, col: eq.col })), { row: eq.resultRow, col: eq.col }];
  }
  return [
    { row: eq.row, col: eq.qtyCol },
    { row: eq.row, col: eq.unitCol },
    { row: eq.row, col: eq.resultCol },
  ];
}

/**
 * Discover candidate equations.
 *
 * Column sums: per column, terms = numeric cells above the LAST numeric
 * row, result = that last cell; requires ≥2 terms. A failing sum is only a
 * BROKEN equation when the totals row is corroborated (≥1 other column's
 * sum holds) — otherwise the column simply has no arithmetic (no fake
 * certainty about qty columns that don't total).
 *
 * Row products: the (qty, unit, line) column triple that holds on ≥60% of
 * rows (min 2) is structural; rows where it fails become broken equations.
 */
export function discoverEquations(table: ParsedTable): { equations: Equation[]; grid: Map<string, number> } {
  const grid = numericGrid(table);
  const equations: Equation[] = [];

  // ---- column sums
  // Discovery is structural, three signals (any suffices):
  //  (a) the sum HOLDS — self-evident arithmetic;
  //  (b) same-row corroboration — another column's HOLDING sum ends on the
  //      same result row (that row IS a totals row, so this column's failing
  //      sum is a BROKEN equation, not a non-equation);
  //  (c) totals-row layout — the result row has fewer than half the numeric
  //      cells of the row above it (classic ['','','','100.00'] layout).
  //  A qty column whose last DATA row merely ends the numeric run matches
  //  none of these — it has no arithmetic, and claiming it's "broken" would
  //  be fake certainty.
  const numericPerRow: number[] = new Array(table.rows).fill(0);
  for (const k of grid.keys()) numericPerRow[Number(k.split(':')[0])]++;

  interface SumCandidate { eq: Equation & { kind: 'column_sum' }; holds: boolean }
  const candidates: SumCandidate[] = [];
  for (let c = 0; c < table.cols; c++) {
    const numericRows: number[] = [];
    for (let r = 0; r < table.rows; r++) if (grid.has(key(r, c))) numericRows.push(r);
    if (numericRows.length < 3) continue; // ≥2 terms + result
    const resultRow = numericRows[numericRows.length - 1];
    const termRows = numericRows.slice(0, -1);
    const eq = { kind: 'column_sum' as const, col: c, termRows, resultRow };
    candidates.push({ eq, holds: evalEquation(eq, grid).holds });
  }
  const holdingResultRows = new Set(candidates.filter((x) => x.holds).map((x) => x.eq.resultRow));
  for (const { eq, holds } of candidates) {
    const corroborated = holdingResultRows.has(eq.resultRow) &&
      candidates.some((x) => x.holds && x.eq.col !== eq.col && x.eq.resultRow === eq.resultRow);
    const layoutSignal =
      eq.resultRow > 0 && numericPerRow[eq.resultRow] * 2 < numericPerRow[eq.resultRow - 1];
    if (holds || corroborated || layoutSignal) equations.push(eq);
  }

  // ---- row products: majority column-triple
  let bestTriple: { q: number; u: number; l: number; holdRows: number[]; totalRows: number } | null = null;
  for (let qc = 0; qc < table.cols; qc++) {
    for (let uc = 0; uc < table.cols; uc++) {
      if (uc === qc) continue;
      for (let lc = 0; lc < table.cols; lc++) {
        if (lc === qc || lc === uc) continue;
        const holdRows: number[] = [];
        let total = 0;
        for (let r = 0; r < table.rows; r++) {
          const q = grid.get(key(r, qc));
          const u = grid.get(key(r, uc));
          const l = grid.get(key(r, lc));
          if (q === undefined || u === undefined || l === undefined) continue;
          total++;
          if (Math.abs(q * u - l) <= epsilonFor([l])) holdRows.push(r);
        }
        if (total >= 2 && holdRows.length / total >= 0.6) {
          if (!bestTriple || holdRows.length > bestTriple.holdRows.length) {
            bestTriple = { q: qc, u: uc, l: lc, holdRows, totalRows: total };
          }
        }
      }
    }
  }
  if (bestTriple) {
    for (let r = 0; r < table.rows; r++) {
      const q = grid.get(key(r, bestTriple.q));
      const u = grid.get(key(r, bestTriple.u));
      const l = grid.get(key(r, bestTriple.l));
      if (q === undefined || u === undefined || l === undefined) continue;
      equations.push({ kind: 'row_product', row: r, qtyCol: bestTriple.q, unitCol: bestTriple.u, resultCol: bestTriple.l });
    }
  }

  return { equations, grid };
}

/** Run closure: attest, repair, or review — never silently accept. */
export function closeTable(table: ParsedTable): TableClosureResult {
  const { equations, grid } = discoverEquations(table);
  if (equations.length === 0) return { kind: 'no_arithmetic' };

  const evaluated = equations.map((eq) => ({ eq, ...evalEquation(eq, grid) }));
  const broken = evaluated.filter((e) => !e.holds);

  if (broken.length === 0) {
    const attested = dedupe(evaluated.flatMap((e) => equationCells(e.eq)));
    return { kind: 'closed', attested, equations: evaluated.map((e) => e.text) };
  }

  // ---- single-cell repair search over implicated cells' lattice top-k
  const implicated = dedupe(broken.flatMap((e) => equationCells(e.eq)));
  const cellByKey = new Map(table.cells.map((c) => [key(c.row, c.col), c]));
  const repairs: Array<{ cell: CellRef; from: string; to: string }> = [];

  for (const ref of implicated) {
    const cell = cellByKey.get(key(ref.row, ref.col));
    if (!cell?.alternates) continue;
    for (const alt of cell.alternates) {
      if (alt === cell.raw) continue;
      const altValue = parseAmount(alt);
      if (altValue === null) continue;
      const patched = new Map(grid);
      patched.set(key(ref.row, ref.col), altValue);
      const allHold = equations.every((eq) => evalEquation(eq, patched).holds);
      if (allHold) repairs.push({ cell: ref, from: cell.raw, to: alt });
    }
  }

  if (repairs.length === 1) {
    const patched = new Map(grid);
    const v = parseAmount(repairs[0].to)!;
    patched.set(key(repairs[0].cell.row, repairs[0].cell.col), v);
    return {
      kind: 'repaired',
      proposal: repairs[0],
      equations: equations.map((eq) => evalEquation(eq, patched).text),
      attestedIfAccepted: dedupe(equations.flatMap(equationCells)),
    };
  }

  // Zero or multiple repairs ⇒ review; cells in fully-holding equations
  // that are NOT implicated still attest.
  const implicatedKeys = new Set(implicated.map((c) => key(c.row, c.col)));
  const attested = dedupe(
    evaluated
      .filter((e) => e.holds)
      .flatMap((e) => equationCells(e.eq))
      .filter((c) => !implicatedKeys.has(key(c.row, c.col))),
  );
  return {
    kind: 'review',
    brokenEquations: broken.map((e) => e.text),
    implicated,
    attested,
  };
}

function dedupe(cells: CellRef[]): CellRef[] {
  const seen = new Set<string>();
  const out: CellRef[] = [];
  for (const c of cells) {
    const k = key(c.row, c.col);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(c);
    }
  }
  return out;
}
