/**
 * Beam prior adapter + MRZ learning site (GATE P6) — the loop that makes
 * the engine improve with use, proven at the unit level:
 *
 *  1. NEVER VETO: every weight ≥ 1 for every candidate at every step.
 *  2. ANECDOTE GATE: thin priors (<3 obs) produce no adapter at all.
 *  3. THE BOOST WORKS: on a synthetic lattice where the truth trails the
 *     confusable top-1, a warmed prior lifts the truth into the beam's
 *     surviving hypotheses (the exact O↔0 rescue scenario).
 *  4. LEARNING REFUSALS: unaligned reads, non-proven paths, and identical
 *     reads all teach nothing.
 */
import { describe, expect, it } from 'vitest';

import { beamDecode, type Grammar } from '../beam/beam-search';
import type { Lattice } from '../beam/lattice';
import { makeBeamPrior } from './beam-prior';
import { emptyConfusionPrior, learnFromProven } from './confusion-priors';
import { learnFromProvenMrz } from './mrz-learning';
import { confirmField, type ProvesAttestation } from '../consensus/solver';
import type { ConfusionPrior as StoredPrior } from '../workspace/types';

/* ---------------------------- fixtures ---------------------------------- */

const proof: ProvesAttestation = {
  attestorId: 'checksum.mrz',
  verdict: 'proves',
  strength: 1.0,
  evidence: [{ kind: 'computation', ref: 'test' }],
};

function sealed(value: string) {
  return confirmField({ label: 'f', value, candidateId: 'c', proofs: [proof] });
}

/** A prior that has repeatedly PROVEN that 'O' on this workspace means '0'. */
function warmedPrior(times = 5): StoredPrior {
  let p = emptyConfusionPrior();
  for (let i = 0; i < times; i++) p = learnFromProven(p, sealed('0'), 'O');
  return p;
}

/* ------------------------------- laws ----------------------------------- */

describe('makeBeamPrior — the boost-only law', () => {
  it('returns undefined for empty and thin priors (anecdote gate)', () => {
    expect(makeBeamPrior(undefined)).toBeUndefined();
    expect(makeBeamPrior(emptyConfusionPrior())).toBeUndefined();
    // two observations: still an anecdote
    let thin = emptyConfusionPrior();
    thin = learnFromProven(thin, sealed('0'), 'O');
    thin = learnFromProven(thin, sealed('0'), 'O');
    expect(makeBeamPrior(thin)).toBeUndefined();
  });

  it('NEVER weights any candidate below 1 (priors cannot veto)', () => {
    const hook = makeBeamPrior(warmedPrior())!;
    expect(hook).toBeDefined();
    const step: Lattice[number] = [
      ['O', 0.6],
      ['0', 0.3],
      ['D', 0.1],
    ];
    for (const ch of ['O', '0', 'D', 'X', '']) {
      expect(hook.weight(ch, step)).toBeGreaterThanOrEqual(1);
    }
  });

  it('boosts ONLY the proven confusion target, only when disagreeing with top-1', () => {
    const hook = makeBeamPrior(warmedPrior())!;
    const step: Lattice[number] = [
      ['O', 0.6],
      ['0', 0.3],
    ];
    expect(hook.weight('0', step)).toBeGreaterThan(1); // the proven truth
    expect(hook.weight('O', step)).toBe(1); // agreeing with top-1: no help needed
    expect(hook.weight('X', step)).toBe(1); // never-observed: nothing
    // top-1 is not a known confusable → identity everywhere
    const cleanStep: Lattice[number] = [
      ['A', 0.9],
      ['4', 0.1],
    ];
    expect(hook.weight('4', cleanStep)).toBe(1);
  });

  it('rescues the truth when grammar cannot disambiguate (the O↔0 scenario)', () => {
    // Grammar: one ALNUM char — like an MRZ document-number slot where both
    // 'O' and '0' are legal, so only ranking can pick the reading.
    const alnum: Grammar<number> = {
      start: 0,
      next: (state, ch) => (state === 0 && /[A-Z0-9]/.test(ch) ? 1 : null),
      accept: (state) => state === 1,
    };
    const lattice: Lattice = [
      [
        ['O', 0.55],
        ['0', 0.45],
      ],
    ];
    const cold = beamDecode(lattice, alnum, {});
    const warm = beamDecode(lattice, alnum, { prior: makeBeamPrior(warmedPrior()) });
    expect(cold!.text).toBe('O'); // lattice alone: the habitual misread wins
    expect(warm!.text).toBe('0'); // workspace experience tips it — checksums judge next
  });

  it('NEVER TESTIFIES: pathProb reports raw lattice evidence, prior or not', () => {
    // Same decoded text under both runs → identical pathProb. A prior that
    // could inflate pathProb would smuggle hypotheses past the plausibility
    // gate (MAX_LOGPROB_GAP) — the search may be steered, never the judge.
    const digitOnly: Grammar<number> = {
      start: 0,
      next: (state, ch) => (state === 0 && /[0-9]/.test(ch) ? 1 : null),
      accept: (state) => state === 1,
    };
    const lattice: Lattice = [
      [
        ['O', 0.85], // grammar-illegal top-1: dies either way
        ['0', 0.1],
        ['D', 0.05],
      ],
    ];
    const cold = beamDecode(lattice, digitOnly, {});
    const warm = beamDecode(lattice, digitOnly, { prior: makeBeamPrior(warmedPrior()) });
    expect(cold!.text).toBe('0');
    expect(warm!.text).toBe('0');
    expect(warm!.pathProb).toBeCloseTo(cold!.pathProb, 12);
  });
});

describe('learnFromProvenMrz — the write site refuses everything unproven', () => {
  const latticeFor = (text: string): Lattice =>
    text.split('').map((ch) => [
      [ch, 0.9],
      ['#', 0.1],
    ]);

  it('learns exactly the observed substitutions from a proven decode', () => {
    const prior = emptyConfusionPrior();
    // Greedy read said 'ABO' where the proven line is 'AB0'.
    const lattice = latticeFor('ABO');
    const after = learnFromProvenMrz(prior, ['AB0'], [lattice]);
    expect(after.total).toBe(1);
    expect(after.counts['O']?.['0']).toBe(1);
  });

  it('refuses unaligned reads (length mismatch teaches nothing)', () => {
    const prior = emptyConfusionPrior();
    const after = learnFromProvenMrz(prior, ['AB0'], [latticeFor('ABCD')]);
    expect(after).toBe(prior);
  });

  it('identical reads teach nothing (no phantom observations)', () => {
    const prior = emptyConfusionPrior();
    const after = learnFromProvenMrz(prior, ['AB0'], [latticeFor('AB0')]);
    expect(after).toBe(prior);
  });

  it('line-count mismatch refuses wholesale', () => {
    const prior = emptyConfusionPrior();
    const after = learnFromProvenMrz(prior, ['AB0', 'CD1'], [latticeFor('ABO')]);
    expect(after).toBe(prior);
  });
});
