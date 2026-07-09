/**
 * P6.1 — Confusion priors: learning without training.
 *
 * The system improves by counting which character confusions ACTUALLY occur
 * on this user's documents — harvested exclusively from proof:
 *
 * ════════════════════════ THE WRITE GATE IS A TYPE ════════════════════════
 * `learnFromProven` accepts only `ConfirmedField` — the sealed type from
 * solver.ts that cannot be constructed without a proves-attestation. There
 * is no other write path. An OCR guess can never teach the system; only a
 * checksum/closure/cross-channel-proven read can. This kills feedback loops
 * (model teaching itself its own errors) BY CONSTRUCTION.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Learning signal: when a proven field's accepted value differs from the raw
 * OCR read of the SAME candidate at some positions, each (seen → true) char
 * pair is one observation. Beam search reads the prior (Laplace-smoothed at
 * READ time — stored counts stay raw and auditable).
 */

import type { ConfusionPrior } from '../workspace/types';
import type { ConfirmedField } from '../consensus/solver';

/** Empty prior — counts are raw observations, smoothing happens at read. */
export function emptyConfusionPrior(): ConfusionPrior {
  return { counts: {}, total: 0 };
}

/**
 * Extract (seen → true) character observations by aligning the raw read
 * with the proven value. Conservative alignment: only EQUAL-LENGTH pairs
 * with ≤ maxSubstitutions differing positions teach — insertions/deletions
 * and heavy disagreement are ambiguous alignments and teach NOTHING (a
 * wrong lesson is worse than no lesson).
 */
export function extractConfusions(
  rawRead: string,
  provenValue: string,
  maxSubstitutions = 3,
): Array<{ seen: string; truth: string }> {
  const a = rawRead.toUpperCase();
  const b = provenValue.toUpperCase();
  if (a.length !== b.length || a.length === 0) return [];
  const diffs: Array<{ seen: string; truth: string }> = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      diffs.push({ seen: a[i], truth: b[i] });
      if (diffs.length > maxSubstitutions) return []; // ambiguous — refuse
    }
  }
  return diffs;
}

/**
 * THE ONLY WRITE PATH. Learns from a sealed ConfirmedField plus the raw
 * read that produced its winning candidate. Returns the updated prior
 * (pure — caller persists via workspace-db under PRIOR_KEY_CONFUSION).
 */
export function learnFromProven(
  prior: ConfusionPrior,
  proven: ConfirmedField,
  rawRead: string,
): ConfusionPrior {
  // Defense in depth: the type already guarantees this, but the prior is
  // durable state — verify the seal at the boundary anyway.
  if (proven.status !== 'confirmed' || proven.proofs.length === 0) {
    throw new Error('learnFromProven: only sealed ConfirmedFields may teach (N1)');
  }
  const observations = extractConfusions(rawRead, proven.value);
  if (observations.length === 0) return prior;

  const counts: ConfusionPrior['counts'] = { ...prior.counts };
  for (const { seen, truth } of observations) {
    const row = { ...(counts[seen] ?? {}) };
    row[truth] = (row[truth] ?? 0) + 1;
    counts[seen] = row;
  }
  return { counts, total: prior.total + observations.length };
}

/**
 * Read-side: P(truth | seen) with Laplace smoothing over the observed
 * alternative set plus the identity. Never returns 0 for identity — the
 * prior can bias beams, never veto the literal read (N1: priors suggest,
 * proofs decide).
 */
export function confusionProbability(
  prior: ConfusionPrior,
  seen: string,
  truth: string,
  alpha = 1,
): number {
  const s = seen.toUpperCase();
  const t = truth.toUpperCase();
  const row = prior.counts[s] ?? {};
  const alternatives = new Set([...Object.keys(row), s, t]);
  const denom = Object.values(row).reduce((x, y) => x + y, 0) + alpha * alternatives.size;
  const num = (row[t] ?? 0) + alpha + (s === t ? alpha : 0); // identity gets a double pseudo-count
  return num / (denom + alpha);
}

/**
 * Beam-search hook: ranked plausible truths for a seen character, capped by
 * `minObservations` (unreliable rows suggest nothing — one observation is
 * an anecdote, not a prior).
 */
export function plausibleTruths(
  prior: ConfusionPrior,
  seen: string,
  minObservations = 3,
  topK = 3,
): Array<{ char: string; p: number }> {
  const s = seen.toUpperCase();
  const row = prior.counts[s] ?? {};
  const mass = Object.values(row).reduce((x, y) => x + y, 0);
  if (mass < minObservations) return [];
  return Object.entries(row)
    .map(([char, n]) => ({ char, p: n / mass }))
    .sort((x, y) => y.p - x.p)
    .slice(0, topK);
}
