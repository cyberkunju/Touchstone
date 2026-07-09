/**
 * Prior-guided repair (P6.1 read side, GATE P6) — the money path of
 * learning-without-training.
 *
 * When a self-verifying read FAILS its checksum, the confusion prior knows
 * which characters this workspace's documents habitually confuse (O↔0,
 * S↔5, …). Search single AND double substitutions over prior-plausible
 * confusions; a candidate only becomes a proposal when the VALIDATOR
 * passes — the checksum, not the prior, is the authority (priors suggest,
 * proofs decide; N1).
 *
 * Exactly-one passing repair ⇒ proposal (caller feeds it back through the
 * attestor path, where the checksum proves it and promotion confirms it —
 * new recall with zero silent risk). Zero or multiple ⇒ nothing; the field
 * stays review with suggestions ranked for the review lane.
 */

import type { ConfusionPrior } from '../workspace/types';
import { plausibleTruths } from './confusion-priors';

export interface PriorRepair {
  /** The corrected full string that PASSES the validator. */
  repaired: string;
  /** Substitutions applied, in position order. */
  substitutions: Array<{ pos: number; from: string; to: string; p: number }>;
  /** Joint prior probability of the substitution set (ranking only). */
  priorP: number;
}

/** Cap the search honestly: beyond 2 edits the "repair" is a rewrite. */
const MAX_SUBSTITUTIONS = 2;
/** Minimum observations before a confusion may drive repairs (anecdote gate). */
const MIN_OBSERVATIONS = 3;
/** Cap per-position alternatives to keep the search exact yet bounded. */
const MAX_ALTS_PER_POS = 3;

/**
 * Search prior-plausible repairs of `value` that make `isValid` pass.
 * Returns ALL passing repairs (ranked by joint prior probability) — the
 * caller applies the exactly-one law for auto-proposals.
 */
export function repairWithPriors(
  value: string,
  prior: ConfusionPrior,
  isValid: (s: string) => boolean,
): PriorRepair[] {
  if (isValid(value)) return []; // nothing to repair — never touch valid reads

  // Per-position prior-plausible alternatives.
  const perPos: Array<Array<{ to: string; p: number }>> = [];
  for (let i = 0; i < value.length; i++) {
    const alts = plausibleTruths(prior, value[i].toUpperCase(), MIN_OBSERVATIONS)
      .filter((a) => a.char !== value[i].toUpperCase())
      .slice(0, MAX_ALTS_PER_POS)
      .map((a) => ({ to: a.char, p: a.p }));
    perPos.push(alts);
  }

  const repairs: PriorRepair[] = [];
  const positions = perPos
    .map((alts, pos) => ({ pos, alts }))
    .filter((x) => x.alts.length > 0);

  // Single substitutions.
  for (const { pos, alts } of positions) {
    for (const alt of alts) {
      const candidate = value.slice(0, pos) + alt.to + value.slice(pos + 1);
      if (isValid(candidate)) {
        repairs.push({
          repaired: candidate,
          substitutions: [{ pos, from: value[pos], to: alt.to, p: alt.p }],
          priorP: alt.p,
        });
      }
    }
  }

  // Double substitutions (only when no single repair exists — the simplest
  // sufficient explanation wins; a double behind a valid single is noise).
  if (repairs.length === 0 && MAX_SUBSTITUTIONS >= 2) {
    for (let a = 0; a < positions.length; a++) {
      for (let b = a + 1; b < positions.length; b++) {
        const pa = positions[a];
        const pb = positions[b];
        for (const altA of pa.alts) {
          for (const altB of pb.alts) {
            const chars = [...value];
            chars[pa.pos] = altA.to;
            chars[pb.pos] = altB.to;
            const candidate = chars.join('');
            if (isValid(candidate)) {
              repairs.push({
                repaired: candidate,
                substitutions: [
                  { pos: pa.pos, from: value[pa.pos], to: altA.to, p: altA.p },
                  { pos: pb.pos, from: value[pb.pos], to: altB.to, p: altB.p },
                ],
                priorP: altA.p * altB.p,
              });
            }
          }
        }
      }
    }
  }

  repairs.sort((x, y) => y.priorP - x.priorP);
  return repairs;
}

/**
 * The exactly-one law: a single passing repair is proposable; ambiguity
 * (or nothing) proposes nothing. Mirrors table-closure's repair semantics.
 */
export function proposeRepair(
  value: string,
  prior: ConfusionPrior,
  isValid: (s: string) => boolean,
): PriorRepair | null {
  const repairs = repairWithPriors(value, prior, isValid);
  return repairs.length === 1 ? repairs[0] : null;
}
