/**
 * MRZ learning site (GATE P6, write side) — the highest-integrity teacher
 * the system has.
 *
 * When the checksum-guided beam PROVES an MRZ (every check digit passes on
 * a guided decode), the proven lines are ground truth for this workspace's
 * capture conditions. Comparing each proven line against the UNGUIDED
 * greedy read of the same lattice reveals exactly which glyph confusions
 * this installation's documents actually produce (O↔0 on this laminate,
 * 8↔B under this scanner…). Those observations — and ONLY those — feed the
 * confusion prior via the sealed-ConfirmedField gate.
 *
 * No proof → no lesson. A refused or legacy-parsed MRZ teaches nothing.
 */

import { greedyFromLattice, type Lattice } from '../beam/lattice';
import { confirmField, type ProvesAttestation } from '../consensus/solver';
import type { ConfusionPrior } from '../workspace/types';
import { learnFromProven } from './confusion-priors';

/**
 * Learn per-character confusions from a beam-PROVEN MRZ.
 *
 * @param prior       current stored prior (or the empty prior)
 * @param provenLines the beam result's lines — checksum-proven text
 * @param lattices    the SAME lattices the beam decoded, in line order
 * @returns the updated prior, or the input prior unchanged when there was
 *          nothing (or nothing safe) to learn. Pure — caller persists.
 */
export function learnFromProvenMrz(
  prior: ConfusionPrior,
  provenLines: readonly string[],
  lattices: readonly Lattice[],
): ConfusionPrior {
  if (provenLines.length === 0 || provenLines.length !== lattices.length) return prior;

  let next = prior;
  for (let i = 0; i < provenLines.length; i++) {
    const proven = provenLines[i];
    const greedy = greedyFromLattice(lattices[i]).text.toUpperCase().replace(/\s+/g, '');
    if (greedy === proven || greedy.length !== proven.length) continue; // nothing to learn / unaligned — refuse

    // Seal the lesson through THE door: the proof is the beam decode itself
    // (checksum.mrz semantics, strength 1.0 — every check digit passed on a
    // guided decode; the same standard the attestor grants 'proves' for).
    const proof: ProvesAttestation = {
      attestorId: 'checksum.mrz',
      verdict: 'proves',
      strength: 1.0,
      evidence: [
        {
          kind: 'computation',
          ref: `mrz_beam_line_${i}`,
          note: 'checksum-guided beam decode; all check digits pass',
        },
      ],
    };
    const sealed = confirmField({
      label: `mrz_line_${i}`,
      value: proven,
      candidateId: `mrz-learn-${i}`,
      proofs: [proof],
    });
    next = learnFromProven(next, sealed, greedy);
  }
  return next;
}
