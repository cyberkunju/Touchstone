/**
 * P4.3 table closure tests — the failure message is the equation.
 */

import { describe, expect, it } from 'vitest';
import { closeTable, discoverEquations, type ParsedTable, type TableCell } from './table-closure';

/** Build a table from a string grid; '' cells are empty text. */
function table(rows: string[][], alternates?: Record<string, string[]>): ParsedTable {
  const cells: TableCell[] = [];
  rows.forEach((cols, r) =>
    cols.forEach((raw, c) => {
      cells.push({ row: r, col: c, raw, alternates: alternates?.[`${r}:${c}`] });
    }),
  );
  return { rows: rows.length, cols: rows[0].length, cells };
}

// Classic invoice: qty × unit = line; line column sums to total.
const CLEAN = [
  ['Widget', '2', '10.00', '20.00'],
  ['Gadget', '3', '5.50', '16.50'],
  ['Gizmo', '1', '63.50', '63.50'],
  ['', '', '', '100.00'],
];

describe('discoverEquations', () => {
  it('finds the line-column sum and the qty×unit=line triple', () => {
    const { equations } = discoverEquations(table(CLEAN));
    const sums = equations.filter((e) => e.kind === 'column_sum');
    const products = equations.filter((e) => e.kind === 'row_product');
    expect(sums.some((s) => s.kind === 'column_sum' && s.col === 3)).toBe(true);
    expect(products.length).toBe(3); // one per data row
    for (const p of products) {
      if (p.kind === 'row_product') {
        expect(p.qtyCol === 1 || p.qtyCol === 2).toBe(true); // q×u commutes
        expect(p.resultCol).toBe(3);
      }
    }
  });

  it('rosters without arithmetic discover nothing (no fake certainty)', () => {
    const roster = table([
      ['Alice', 'Monday'],
      ['Bob', 'Tuesday'],
      ['Cara', 'Friday'],
    ]);
    expect(discoverEquations(roster).equations).toEqual([]);
    expect(closeTable(roster)).toEqual({ kind: 'no_arithmetic' });
  });

  it('a failing column becomes a broken equation ONLY when the totals row is corroborated', () => {
    // Only one numeric column, sum does NOT hold ⇒ no corroboration ⇒ no equation.
    const lone = table([
      ['a', '5.00'],
      ['b', '7.00'],
      ['c', '99.00'], // not a total
    ]);
    expect(discoverEquations(lone).equations).toEqual([]);
  });
});

describe('closeTable', () => {
  it('clean table: fully closed, every participating cell attested', () => {
    const r = closeTable(table(CLEAN));
    expect(r.kind).toBe('closed');
    if (r.kind === 'closed') {
      expect(r.attested.length).toBeGreaterThanOrEqual(10); // 3 rows × 3 cells + total column cells
      expect(r.equations.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('single corrupted cell with the truth in its lattice ⇒ exactly-one repair proposed', () => {
    const corrupted = CLEAN.map((row) => [...row]);
    corrupted[1][3] = '76.50'; // OCR read 16.50 as 76.50 (1→7)
    const r = closeTable(
      table(corrupted, { '1:3': ['76.50', '16.50', '70.50'] }), // lattice top-k holds the truth
    );
    expect(r.kind).toBe('repaired');
    if (r.kind === 'repaired') {
      expect(r.proposal).toEqual({ cell: { row: 1, col: 3 }, from: '76.50', to: '16.50' });
      // Repair must satisfy ALL equations simultaneously (product AND sum).
      expect(r.attestedIfAccepted.length).toBeGreaterThanOrEqual(10);
    }
  });

  it('corrupted cell WITHOUT the truth in its lattice ⇒ review, message IS the equation', () => {
    const corrupted = CLEAN.map((row) => [...row]);
    corrupted[1][3] = '76.50';
    const r = closeTable(table(corrupted, { '1:3': ['76.50', '75.50'] }));
    expect(r.kind).toBe('review');
    if (r.kind === 'review') {
      expect(r.brokenEquations.length).toBeGreaterThan(0);
      expect(r.brokenEquations.join(' ')).toMatch(/76\.50|16\.50/);
      expect(r.implicated.some((c) => c.row === 1 && c.col === 3)).toBe(true);
      // Untouched rows' product equations still hold and attest.
      expect(r.attested.length).toBeGreaterThan(0);
    }
  });

  it('ambiguous repairs (multiple valid substitutions) ⇒ review, never guess', () => {
    // Two-term sum: 5 + 5 = 20 is broken; BOTH terms could repair to 15.
    const t = table(
      [
        ['a', '5.00'],
        ['b', '5.00'],
        ['sum', '20.00'],
        ['x', '1.00'],
        ['y', '2.00'],
        ['z', '3.00'],
      ],
      { '0:1': ['5.00', '15.00'], '1:1': ['5.00', '15.00'] },
    );
    // Corroborate the totals row via a second summing column? Simpler: the
    // x+y=z style column is the same column... Build a 2-col corroboration:
    const t2 = table(
      [
        ['5.00', '1.00'],
        ['5.00', '2.00'],
        ['20.00', '3.00'], // col 0 broken (5+5≠20), col 1 holds (1+2=3)
      ],
      { '0:0': ['5.00', '15.00'], '1:0': ['5.00', '15.00'] },
    );
    const r = closeTable(t2);
    expect(r.kind).toBe('review');
    if (r.kind === 'review') {
      expect(r.implicated.length).toBe(3); // all of column 0
      // Column 1 holds and its cells are not implicated ⇒ attested.
      expect(r.attested.length).toBe(3);
    }
    void t;
  });

  it('epsilon: banker\u2019s rounding within max(0.01, 0.5%) closes', () => {
    const t = table([
      ['a', '10.00'],
      ['b', '20.01'],
      ['total', '30.00'], // gap 0.01 ≤ ε = max(0.01, 0.15)
    ]);
    const r = closeTable(t);
    expect(r.kind).toBe('closed');
  });

  it('repair search only substitutes numeric alternates', () => {
    const corrupted = CLEAN.map((row) => [...row]);
    corrupted[1][3] = '76.50';
    const r = closeTable(table(corrupted, { '1:3': ['76.50', 'garbage', '16.50'] }));
    expect(r.kind).toBe('repaired');
    if (r.kind === 'repaired') expect(r.proposal.to).toBe('16.50');
  });
});
