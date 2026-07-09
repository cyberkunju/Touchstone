/**
 * P5.3 quorum + P5.4 scheduler tests — compute goes only where proof is
 * missing; degradation is loud.
 */

import { describe, expect, it } from 'vitest';
import type { FieldCandidate } from './types';
import type { SolvedField } from './solver';
import { confirmField } from './solver';
import { judgeQuorum, planQuorum, quorumReadsAgree, type QuorumRequest } from './quorum';
import { MAX_FOVEATION_ROUNDS, planFoveation } from './scheduler';

let seq = 0;
function cand(partial: Partial<FieldCandidate> & { value: string }): FieldCandidate {
  return {
    id: `c${++seq}`,
    canonicalLabel: null,
    valueType: 'text',
    channel: 'ocr',
    marks: [],
    ...partial,
  };
}

const BOX: [number, number, number, number] = [0.1, 0.2, 0.3, 0.25];

function review(label: string, c: FieldCandidate): SolvedField {
  return { status: 'review', label, value: c.value, candidateId: c.id, supports: [], reason: 'no attestor applies' };
}

function confirmed(label: string, c: FieldCandidate): SolvedField {
  return confirmField({
    label,
    value: c.value,
    candidateId: c.id,
    proofs: [{ attestorId: 't', verdict: 'proves', strength: 1, evidence: [{ kind: 'computation', ref: 'x' }] }],
  });
}

function byId(...cs: FieldCandidate[]): Map<string, FieldCandidate> {
  return new Map(cs.map((c) => [c.id, c]));
}

describe('planQuorum: compute only where proof is missing (I10)', () => {
  it('targets review-status critical fields with geometry', () => {
    const amt = cand({ value: '$540.00', canonicalLabel: 'total', valueType: 'amount', boxNorm: BOX });
    const plan = planQuorum([review('total', amt)], byId(amt));
    expect(plan.length).toBe(1);
    expect(plan[0]).toMatchObject({ fieldLabel: 'total', firstRead: '$540.00', firstChannel: 'ocr' });
  });

  it('NEVER re-reads proven fields', () => {
    const amt = cand({ value: '$540.00', canonicalLabel: 'total', valueType: 'amount', boxNorm: BOX });
    expect(planQuorum([confirmed('total', amt)], byId(amt))).toEqual([]);
  });

  it('skips non-critical types and geometry-less candidates', () => {
    const name = cand({ value: 'Jane', canonicalLabel: 'full_name', valueType: 'name', boxNorm: BOX });
    const noBox = cand({ value: '$5.00', canonicalLabel: 'total', valueType: 'amount' });
    expect(planQuorum([review('full_name', name), review('total', noBox)], byId(name, noBox))).toEqual([]);
  });
});

describe('judgeQuorum: decorrelation is constitutional', () => {
  const req: QuorumRequest = {
    fieldLabel: 'total',
    candidateId: 'c1',
    firstRead: '$1,234.56',
    valueType: 'amount',
    boxNorm: BOX,
    firstChannel: 'ocr',
  };

  it('agreement across decorrelated channels proves with evidence', () => {
    const j = judgeQuorum(req, '1234.56', 'binarized');
    expect(j.kind).toBe('agree');
    if (j.kind === 'agree') {
      expect(j.attestation.verdict).toBe('proves');
      expect(j.attestation.evidence.length).toBe(2);
    }
  });

  it('REFUSES same-channel agreement — correlated errors prove nothing', () => {
    const j = judgeQuorum(req, '$1,234.56', 'ocr');
    expect(j.kind).toBe('cannot_judge');
  });

  it('disagreement is a loud conflict carrying both reads', () => {
    const j = judgeQuorum(req, '1284.56', 'binarized');
    expect(j.kind).toBe('conflict');
    if (j.kind === 'conflict') {
      expect(j.firstRead).toBe('$1,234.56');
      expect(j.secondRead).toBe('1284.56');
    }
  });

  it('empty second read cannot judge (not an agreement, not a conflict)', () => {
    expect(judgeQuorum(req, '   ', 'binarized').kind).toBe('cannot_judge');
  });

  it('normalization laws: amounts numeric, dates set-intersect, ids separator-free', () => {
    expect(quorumReadsAgree('amount', '$1,234.56', '1234.56')).toBe(true);
    expect(quorumReadsAgree('amount', '1.234,56', '1234.56')).toBe(true);
    expect(quorumReadsAgree('date', '23/04/1985', '1985-04-23')).toBe(true);
    expect(quorumReadsAgree('date', '05/06/2020', '06/05/2020')).toBe(true); // ambiguity overlap
    expect(quorumReadsAgree('date', '23/04/1985', '1985-04-24')).toBe(false);
    expect(quorumReadsAgree('id_number', 'AB-12 34', 'ab1234')).toBe(true);
  });
});

describe('planFoveation: verify-then-spend (I10)', () => {
  const budget = { remainingMs: 5000, estimatedMsPerRoi: 400 };

  it('all proven ⇒ done, zero compute', () => {
    const c = cand({ value: 'x', boxNorm: BOX, valueType: 'amount' });
    expect(planFoveation([confirmed('total', c)], byId(c), 0, budget)).toEqual({
      kind: 'done',
      reason: 'all_proven',
    });
  });

  it('dispatches only unproven critical ROIs, DPI doubling per round', () => {
    const amt = cand({ value: '$5', canonicalLabel: 'total', valueType: 'amount', boxNorm: BOX });
    const name = cand({ value: 'Jane', canonicalLabel: 'full_name', valueType: 'name', boxNorm: BOX });
    const plan = planFoveation([review('total', amt), review('full_name', name)], byId(amt, name), 0, budget);
    expect(plan.kind).toBe('dispatch');
    if (plan.kind === 'dispatch') {
      expect(plan.round).toBe(1);
      expect(plan.dpiScale).toBe(2);
      expect(plan.targets.map((t) => t.fieldLabel)).toEqual(['total']);
    }
    const round2 = planFoveation([review('total', amt)], byId(amt), 1, budget);
    if (round2.kind === 'dispatch') expect(round2.dpiScale).toBe(4);
  });

  it(`round cap is frozen at ${MAX_FOVEATION_ROUNDS}; exhaustion names unproven fields`, () => {
    const amt = cand({ value: '$5', canonicalLabel: 'total', valueType: 'amount', boxNorm: BOX });
    const plan = planFoveation([review('total', amt)], byId(amt), MAX_FOVEATION_ROUNDS, budget);
    expect(plan).toEqual({ kind: 'rounds_exhausted', unprovenFields: ['total'] });
  });

  it('budget breach is LOUD: names every starved field, dispatches nothing', () => {
    const a = cand({ value: '$5', canonicalLabel: 'total', valueType: 'amount', boxNorm: BOX });
    const b = cand({ value: '$6', canonicalLabel: 'tax', valueType: 'amount', boxNorm: BOX });
    const plan = planFoveation(
      [review('total', a), review('tax', b)],
      byId(a, b),
      0,
      { remainingMs: 500, estimatedMsPerRoi: 400 }, // 2×400 > 500
    );
    expect(plan).toEqual({ kind: 'budget_exceeded', starvedFields: ['total', 'tax'] });
  });

  it('refused fields with geometry get one recheck (contradicting witness may be the misread)', () => {
    const bad = cand({ value: 'LI898902C3', canonicalLabel: 'passport_number', valueType: 'id_number', boxNorm: BOX });
    const refused: SolvedField = {
      status: 'refused',
      label: 'passport_number',
      rejectedValue: 'LI898902C3',
      contradictions: [],
      reason: 'mrz disagrees',
    };
    const plan = planFoveation([refused], byId(bad), 0, budget);
    expect(plan.kind).toBe('dispatch');
    if (plan.kind === 'dispatch') expect(plan.targets[0].reason).toBe('refused_needs_recheck');
  });

  it('unproven but no actionable geometry ⇒ done honestly (no fabricated work)', () => {
    const noBox = cand({ value: 'Jane', canonicalLabel: 'full_name', valueType: 'name' });
    const plan = planFoveation([review('full_name', noBox)], byId(noBox), 0, budget);
    expect(plan).toEqual({ kind: 'done', reason: 'no_actionable_targets' });
  });
});
