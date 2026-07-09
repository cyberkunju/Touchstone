/**
 * Beam prior adapter (I5, GATE P6) — stored confusion statistics → beam
 * re-weighting.
 *
 * THE LAW: priors SUGGEST, proofs DECIDE. The adapter only ever BOOSTS
 * candidates (weight ≥ 1): when this workspace has PROVEN (≥3 checksum-
 * verified observations, the anecdote gate) that the step's top-1 char `t`
 * is habitually a misread of `c`, hypothesizing `c` gets a mild nudge so it
 * survives beam pruning long enough for the checksums to judge it. Nothing
 * is ever penalized or vetoed — a prior that can suppress a reading is a
 * feedback loop waiting to lie.
 */

import type { ConfusionPrior as BeamPriorHook, } from '../beam/beam-search';
import type { LatticeStep } from '../beam/lattice';
import type { ConfusionPrior as StoredPrior } from '../workspace/types';
import { plausibleTruths } from './confusion-priors';

/** Boost factor cap: weight ∈ [1, 1 + MAX_BOOST]. Calibrated as a nudge —
 *  enough to keep a known confusable in a width-50 beam, never enough to
 *  outweigh real lattice evidence. */
const MAX_BOOST = 0.5;
const MIN_OBSERVATIONS = 3;

/**
 * Build the beam hook from the stored per-workspace prior.
 * Returns undefined for empty/thin priors — the beam then runs identity
 * weighting (exactly the certified pre-P6 behavior).
 */
export function makeBeamPrior(stored: StoredPrior | undefined): BeamPriorHook | undefined {
  if (!stored || stored.total < MIN_OBSERVATIONS) return undefined;

  // Precompute suggestion tables: seen-char → (truth-char → p).
  const table = new Map<string, Map<string, number>>();
  for (const seen of Object.keys(stored.counts)) {
    const truths = plausibleTruths(stored, seen, MIN_OBSERVATIONS);
    if (truths.length > 0) {
      table.set(seen, new Map(truths.map((t) => [t.char, t.p])));
    }
  }
  if (table.size === 0) return undefined;

  return {
    weight(candidate: string, step: LatticeStep): number {
      if (candidate === '') return 1; // blanks are never re-weighted
      const top = step[0];
      if (!top || top[0] === candidate) return 1; // agreeing with top-1 needs no help
      const suggestions = table.get(top[0].toUpperCase());
      if (!suggestions) return 1;
      const p = suggestions.get(candidate.toUpperCase());
      return p === undefined ? 1 : 1 + MAX_BOOST * p;
    },
  };
}
