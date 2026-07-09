/**
 * Amount-closure attestor (08 §6 #19) — the accounting-identity proof.
 *
 * When a document's amounts close (subtotal + tax = total; gross − deductions
 * = net; opening + credits − debits = closing), EVERY participating amount is
 * proven simultaneously — corruption of any digit breaks the equation.
 *
 * Laws carried over from the certified engine (App.tsx closure families):
 *  - FULL equations only. total = a + b with a missing proves NOTHING
 *    (live-caught: partial closures rubber-stamped wrong invoice totals).
 *  - ε = max(0.01, 0.5% of the largest term) — captures banker's rounding
 *    without admitting real errors; a closure that only works at the loose
 *    end of ε is flagged in evidence.
 *  - Lone amounts NEVER prove (composites lone-amount law).
 */

import type { Attestation, Attestor, DocContext, FieldCandidate } from '../types';

/** Parse a printed money string to a number; null when not money-like. */
export function parseAmount(value: string): number | null {
  const cleaned = value.replace(/[^\d.,()-]/g, '');
  if (!/\d/.test(cleaned)) return null;
  const negative = /^\(.*\)$/.test(cleaned.trim()) || cleaned.includes('-');
  let digits = cleaned.replace(/[()-]/g, '');
  // Decide decimal separator: the LAST of . or , followed by exactly 2 digits.
  const lastDot = digits.lastIndexOf('.');
  const lastComma = digits.lastIndexOf(',');
  const sep = Math.max(lastDot, lastComma);
  if (sep >= 0 && digits.length - sep - 1 === 2) {
    digits = digits.slice(0, sep).replace(/[.,]/g, '') + '.' + digits.slice(sep + 1);
  } else if (sep >= 0 && digits.length - sep - 1 === 3 && (digits.match(/[.,]/g) ?? []).length === 1) {
    // single separator with 3 trailing digits = thousands sep, no decimals
    digits = digits.replace(/[.,]/g, '');
  } else {
    digits = digits.replace(/,/g, '');
  }
  const n = Number(digits);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** A closure equation shape: sum(plus) − sum(minus) = result. */
export interface ClosureShape {
  /** Canonical labels contributing positively. */
  plus: readonly string[];
  /** Canonical labels contributing negatively. */
  minus: readonly string[];
  /** Canonical label of the result. */
  result: string;
  name: string;
}

export const CLOSURE_SHAPES: readonly ClosureShape[] = [
  { name: 'invoice', plus: ['subtotal', 'tax'], minus: [], result: 'total' },
  { name: 'payslip', plus: ['gross_pay'], minus: ['total_deductions'], result: 'net_pay' },
  { name: 'bank', plus: ['opening_balance', 'total_credits'], minus: ['total_debits'], result: 'closing_balance' },
  { name: 'receipt', plus: ['subtotal', 'tip'], minus: ['discount'], result: 'total' },
];

interface Term { label: string; candidate: FieldCandidate; amount: number }

/** Find one candidate per label; null when any label is missing/unparseable
 *  or ambiguous (multiple distinct parsed values for one label). */
function bindTerms(labels: readonly string[], ctx: DocContext): Term[] | null {
  const out: Term[] = [];
  for (const label of labels) {
    const matches = ctx.allCandidates.filter((c) => c.canonicalLabel === label);
    if (matches.length === 0) return null;
    const parsed = matches
      .map((candidate) => ({ label, candidate, amount: parseAmount(candidate.value) }))
      .filter((t): t is Term => t.amount !== null);
    if (parsed.length === 0) return null;
    const distinct = new Set(parsed.map((t) => t.amount));
    if (distinct.size > 1) return null; // ambiguous — the solver disambiguates, not us
    out.push(parsed[0]);
  }
  return out;
}

export const amountClosureAttestor: Attestor = {
  id: 'closure.amount',

  appliesTo(field: FieldCandidate): boolean {
    if (field.valueType !== 'amount') return false;
    return parseAmount(field.value) !== null;
  },

  attest(field: FieldCandidate, ctx: DocContext): Attestation | null {
    const myAmount = parseAmount(field.value);
    if (myAmount === null || field.canonicalLabel === null) return null;

    for (const shape of CLOSURE_SHAPES) {
      const role =
        shape.result === field.canonicalLabel ? 'result'
        : shape.plus.includes(field.canonicalLabel) ? 'plus'
        : shape.minus.includes(field.canonicalLabel) ? 'minus'
        : null;
      if (!role) continue;

      // FULL equation only: bind every term (this candidate included).
      const plus = bindTerms(shape.plus, ctx);
      const minus = bindTerms(shape.minus, ctx);
      const result = bindTerms([shape.result], ctx);
      if (!plus || !minus || !result) continue;

      const lhs = plus.reduce((s, t) => s + t.amount, 0) - minus.reduce((s, t) => s + t.amount, 0);
      const rhs = result[0].amount;
      const largest = Math.max(...[...plus, ...minus, ...result].map((t) => Math.abs(t.amount)), 0.01);
      const epsilon = Math.max(0.01, largest * 0.005);
      const gap = Math.abs(lhs - rhs);
      const terms = [...plus, ...minus, ...result];
      const termRefs = terms.map((t) => ({
        kind: 'candidate' as const,
        ref: t.candidate.id,
        note: `${t.label} = ${t.amount}`,
      }));

      if (gap <= epsilon) {
        const nearEdge = gap > 0.01;
        return {
          attestorId: this.id,
          verdict: 'proves',
          strength: nearEdge ? 0.9 : 0.99,
          evidence: [
            ...termRefs,
            {
              kind: 'computation',
              ref: `${shape.name}: |${lhs.toFixed(2)} − ${rhs.toFixed(2)}| = ${gap.toFixed(4)} ≤ ε=${epsilon.toFixed(4)}`,
              note: nearEdge ? 'closes only within rounding tolerance' : 'closes exactly',
            },
          ],
        };
      }
      // Full equation bound but does NOT close: real contradiction.
      return {
        attestorId: this.id,
        verdict: 'contradicts',
        strength: 0.95,
        evidence: [
          ...termRefs,
          {
            kind: 'computation',
            ref: `${shape.name}: |${lhs.toFixed(2)} − ${rhs.toFixed(2)}| = ${gap.toFixed(2)} > ε=${epsilon.toFixed(4)}`,
            note: 'equation fails — at least one term is wrong',
          },
        ],
      };
    }
    return null; // no full equation reachable — lone amounts prove nothing
  },
};
