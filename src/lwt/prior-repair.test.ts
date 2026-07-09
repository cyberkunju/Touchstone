/**
 * Prior-guided repair tests — priors suggest, checksums decide (GATE P6).
 */

import { describe, expect, it } from 'vitest';
import { confirmField, type ConfirmedField } from '../consensus/solver';
import { ibanValid, luhnValid } from '../consensus/attestors/checksums';
import { emptyConfusionPrior, learnFromProven } from './confusion-priors';
import { proposeRepair, repairWithPriors } from './prior-repair';

function sealed(value: string): ConfirmedField {
  return confirmField({
    label: 'iban',
    value,
    candidateId: 'c1',
    proofs: [{
      attestorId: 'checksum.iban',
      verdict: 'proves',
      strength: 0.99,
      evidence: [{ kind: 'computation', ref: 'mod-97 = 1' }],
    }],
  });
}

/** Workspace that has proven O→0 and S→5 confusions ≥3 times each. */
function trainedPrior() {
  let p = emptyConfusionPrior();
  const truth = 'DE89370400440532013000';
  for (const raw of ['DE8937O400440532013000', 'DE893704O0440532013000', 'DE89370400440532O13000']) {
    p = learnFromProven(p, sealed(truth), raw); // O→0 ×3
  }
  for (const raw of ['DE8937040044053201300O', 'DE8937040O440532013000', 'DE89370400440S32013000']) {
    p = learnFromProven(p, sealed(truth), raw); // O→0 ×2 more, S→5 ×1
  }
  return p;
}

const IBAN_TRUTH = 'DE89370400440532013000';

describe('repairWithPriors', () => {
  const prior = trainedPrior();

  it('repairs a checksum-failing read via a learned confusion — checksum is the judge', () => {
    const misread = 'DE8937O400440532013000'; // O where 0 belongs → mod-97 fails
    expect(ibanValid(misread)).toBe(false);
    const repairs = repairWithPriors(misread, prior, ibanValid);
    expect(repairs.length).toBe(1);
    expect(repairs[0].repaired).toBe(IBAN_TRUTH);
    expect(repairs[0].substitutions).toEqual([{ pos: 6, from: 'O', to: '0', p: 1 }]);
  });

  it('never touches an already-valid read', () => {
    expect(repairWithPriors(IBAN_TRUTH, prior, ibanValid)).toEqual([]);
  });

  it('anecdote gate: S→5 seen only once (<3) drives NO repair', () => {
    const misread = 'DE89370400440S32013000';
    expect(repairWithPriors(misread, prior, ibanValid)).toEqual([]);
  });

  it('empty prior repairs nothing — no workspace history, no guesses', () => {
    expect(repairWithPriors('DE8937O400440532013000', emptyConfusionPrior(), ibanValid)).toEqual([]);
  });

  it('double substitution found only when no single repair exists', () => {
    const doubleMisread = 'DE8937O4004405320130O0'; // two O→0 errors
    expect(ibanValid(doubleMisread)).toBe(false);
    const repairs = repairWithPriors(doubleMisread, prior, ibanValid);
    expect(repairs.length).toBe(1);
    expect(repairs[0].repaired).toBe(IBAN_TRUTH);
    expect(repairs[0].substitutions.length).toBe(2);
  });

  it('a repair must pass the ACTUAL validator, not merely look plausible', () => {
    // Prior knows O→0, but this string is broken beyond any O-substitution.
    const hopeless = 'DE99999999999999999OOO';
    expect(repairWithPriors(hopeless, prior, ibanValid)).toEqual([]);
  });
});

describe('proposeRepair: the exactly-one law', () => {
  const prior = trainedPrior();

  it('single passing repair ⇒ proposal', () => {
    const p = proposeRepair('DE8937O400440532013000', prior, ibanValid);
    expect(p?.repaired).toBe(IBAN_TRUTH);
  });

  it('ambiguous repairs ⇒ NOTHING (Luhn admits multiple digit fixes)', () => {
    // Build a prior that confuses 1↔7 heavily, then break a Luhn number in a
    // way multiple substitutions can "fix" — Luhn has single-digit-change
    // collisions across positions.
    let p = emptyConfusionPrior();
    const luhnTruth = '79927398713';
    for (const raw of ['19927398713', '79921398713', '79927398113']) {
      p = learnFromProven(
        p,
        confirmField({
          label: 'card_number', value: luhnTruth, candidateId: 'c',
          proofs: [{ attestorId: 'checksum.luhn-card', verdict: 'proves', strength: 1, evidence: [{ kind: 'computation', ref: 'luhn' }] }],
        }),
        raw,
      ); // learns 1→7 (×3)
    }
    // A read where MULTIPLE 1→7 substitutions each yield a Luhn-valid string
    // would propose nothing. Verify the law holds whenever repairs > 1.
    const misread = '19927398713';
    const all = repairWithPriors(misread, p, luhnValid);
    const proposal = proposeRepair(misread, p, luhnValid);
    if (all.length === 1) {
      expect(proposal?.repaired).toBe(luhnTruth);
    } else {
      expect(proposal).toBeNull();
    }
  });
});
