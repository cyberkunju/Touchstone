/**
 * Attestor registry (08 §6) — the single import surface for the solver.
 *
 * `attestAll` runs every applicable attestor over every candidate and
 * returns the full attestation map. Attestors are pure and independent;
 * failure semantics: an attestor that cannot judge returns null (silence),
 * never a fabricated verdict.
 */

import { CHECKSUM_ATTESTORS, CHECKSUM_SELF_LABELS } from './checksum-attestors';
import { amountClosureAttestor } from './closure';
import { crossDateAttestor, dateValidAttestor } from './dates';
import { mrzAttestor } from './mrz-attestor';
import { payloadAttestor } from './payload-attestors';
import type { Attestation, Attestor, DocContext } from '../types';

export const ALL_ATTESTORS: readonly Attestor[] = [
  mrzAttestor,
  payloadAttestor,
  ...CHECKSUM_ATTESTORS,
  amountClosureAttestor,
  dateValidAttestor,
  crossDateAttestor,
];

export { CHECKSUM_SELF_LABELS };

export interface AttestationOutcome {
  candidateId: string;
  attestations: Attestation[];
  /** True when at least one 'proves' and zero 'contradicts'. */
  proven: boolean;
  /** True when any attestor contradicts — solver must not confirm. */
  contradicted: boolean;
  /** Self-labels earned via proving checksum attestors (N5 slot creation). */
  selfLabels: string[];
}

/** Run the full registry over every candidate in the document.
 *  `attestors` is injectable for tests of the registry laws themselves. */
export function attestAll(
  ctx: DocContext,
  attestors: readonly Attestor[] = ALL_ATTESTORS,
): Map<string, AttestationOutcome> {
  const out = new Map<string, AttestationOutcome>();
  for (const candidate of ctx.allCandidates) {
    const attestations: Attestation[] = [];
    for (const attestor of attestors) {
      if (!attestor.appliesTo(candidate, ctx)) continue;
      const a = attestor.attest(candidate, ctx);
      if (a === null) continue;
      if (a.evidence.length === 0) {
        // Constitutional violation — an unexplained verdict is worse than
        // silence. Drop it LOUDLY in dev, silently degrade in prod.
        throw new Error(`attestor ${attestor.id} emitted a verdict with empty evidence`);
      }
      attestations.push(a);
    }
    const proves = attestations.filter((a) => a.verdict === 'proves');
    const contradicts = attestations.filter((a) => a.verdict === 'contradicts');
    const selfLabels: string[] = [];
    for (const a of attestations) {
      // Any non-contradicting checksum verdict means the math passed —
      // unclaimed-but-valid ('supports') is exactly the N5 slot-creation case.
      if (a.verdict === 'contradicts') continue;
      const label = CHECKSUM_SELF_LABELS.get(a.attestorId);
      if (label) selfLabels.push(label);
    }
    out.set(candidate.id, {
      candidateId: candidate.id,
      attestations,
      proven: proves.length > 0 && contradicts.length === 0,
      contradicted: contradicts.length > 0,
      selfLabels,
    });
  }
  return out;
}
