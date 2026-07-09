/**
 * P6.1 tests — the write gate is a type; priors suggest, never veto.
 */

import { describe, expect, it } from 'vitest';
import { confirmField, type ConfirmedField } from '../consensus/solver';
import {
  confusionProbability,
  emptyConfusionPrior,
  extractConfusions,
  learnFromProven,
  plausibleTruths,
} from './confusion-priors';

function sealedField(value: string): ConfirmedField {
  return confirmField({
    label: 'iban',
    value,
    candidateId: 'c1',
    proofs: [
      {
        attestorId: 'checksum.iban',
        verdict: 'proves',
        strength: 0.99,
        evidence: [{ kind: 'computation', ref: 'mod-97 = 1' }],
      },
    ],
  });
}

describe('extractConfusions: conservative alignment', () => {
  it('captures single substitutions', () => {
    expect(extractConfusions('DE89370400440532013O00', 'DE89370400440532013000')).toEqual([
      { seen: 'O', truth: '0' },
    ]);
  });

  it('refuses length mismatches (ambiguous alignment teaches nothing)', () => {
    expect(extractConfusions('DE8937', 'DE89370')).toEqual([]);
    expect(extractConfusions('', '')).toEqual([]);
  });

  it('refuses heavy disagreement (> max substitutions)', () => {
    expect(extractConfusions('AAAAAAAA', 'BBBBBBBB')).toEqual([]);
  });

  it('is case-insensitive', () => {
    expect(extractConfusions('de8937o', 'DE89370')).toEqual([{ seen: 'O', truth: '0' }]);
  });
});

describe('learnFromProven: the sealed write gate', () => {
  it('learns O→0 from a checksum-proven IBAN', () => {
    const prior = learnFromProven(
      emptyConfusionPrior(),
      sealedField('DE89370400440532013000'),
      'DE89370400440532013O00',
    );
    expect(prior.counts['O']['0']).toBe(1);
    expect(prior.total).toBe(1);
  });

  it('identical raw read teaches nothing (no observation, prior unchanged)', () => {
    const p0 = emptyConfusionPrior();
    const p1 = learnFromProven(p0, sealedField('DE89370400440532013000'), 'DE89370400440532013000');
    expect(p1).toBe(p0); // same object — pure no-op
  });

  it('is pure: never mutates the input prior', () => {
    const p0 = emptyConfusionPrior();
    learnFromProven(p0, sealedField('DE89370400440532013000'), 'DE89370400440532013O00');
    expect(p0.total).toBe(0);
    expect(p0.counts).toEqual({});
  });

  it('unsealed objects cannot teach — even structurally-convincing forgeries', () => {
    const forged = {
      status: 'confirmed',
      label: 'iban',
      value: 'DE89370400440532013000',
      candidateId: 'c1',
      proofs: [],
      supports: [],
    } as unknown as ConfirmedField;
    expect(() =>
      learnFromProven(emptyConfusionPrior(), forged, 'DE89370400440532013O00'),
    ).toThrow(/only sealed/);
  });
});

describe('read side: priors suggest, never veto', () => {
  const trained = (() => {
    let p = emptyConfusionPrior();
    const truth = 'DE89370400440532013000';
    for (const raw of [
      'DE8937O400440532013000',
      'DE893704O0440532013000',
      'DE89370400440532013O00',
      'DE8937040044O532013000',
      'DE89370400440S32013000', // S→5
    ]) {
      p = learnFromProven(p, sealedField(truth), raw);
    }
    return p;
  })();

  it('accumulates observations across proven reads', () => {
    expect(trained.counts['O']['0']).toBe(4);
    expect(trained.counts['S']['5']).toBe(1);
    expect(trained.total).toBe(5);
  });

  it('P(0|O) dominates after evidence, but identity NEVER hits zero', () => {
    const pCorrect = confusionProbability(trained, 'O', '0');
    const pIdentity = confusionProbability(trained, 'O', 'O');
    expect(pCorrect).toBeGreaterThan(pIdentity);
    expect(pIdentity).toBeGreaterThan(0); // priors can never veto the literal read
  });

  it('unseen characters fall back to smoothed uniform (no fabricated confidence)', () => {
    const p = confusionProbability(trained, 'Q', 'X');
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(0.6);
  });

  it('plausibleTruths gates on minimum observations — anecdotes suggest nothing', () => {
    expect(plausibleTruths(trained, 'S', 3)).toEqual([]);       // 1 obs < 3
    const forO = plausibleTruths(trained, 'O', 3);
    expect(forO[0]).toEqual({ char: '0', p: 1 });
    expect(plausibleTruths(emptyConfusionPrior(), 'O')).toEqual([]);
  });
});
