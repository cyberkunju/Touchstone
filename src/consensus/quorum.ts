/**
 * P5.3 — Quorum channel (I6).
 *
 * For CRITICAL fields (money, IDs, dates) that survive the solve with zero
 * attestations: re-read the value ROI through a decorrelated channel
 * (binarized/deskewed variant or the alternate recognizer tier); normalize
 * both reads; equality ⇒ quorum attestation (proves); inequality ⇒ conflict
 * with BOTH candidates surfaced (a caught inconsistency is a feature).
 *
 * Discipline (I10): never invoked for fields already attested — compute
 * goes only where proof is missing. planQuorum enforces this by only
 * emitting requests for review-status fields of critical types WITH
 * geometry (no ROI ⇒ nothing to re-read ⇒ stays review).
 *
 * Decorrelation is a REQUIREMENT, not a hint: judgeQuorum refuses to judge
 * when both reads came from the same channel tier — agreement between
 * correlated errors proves nothing (same law as cross-date).
 */

import type { Attestation, FieldCandidate } from './types';
import type { SolvedField } from './solver';
import { parseAmount } from './attestors/closure';
import { plausibleIsoDates } from './attestors/dates';
import { stripSeparators } from './attestors/checksums';

/** Field value types where an unproven value is too dangerous to ship. */
export const CRITICAL_TYPES: readonly string[] = ['amount', 'date', 'id_number'];

export interface QuorumRequest {
  fieldLabel: string;
  candidateId: string;
  /** The first read (what the solve currently holds). */
  firstRead: string;
  valueType: string;
  /** Normalized page box to re-perceive. */
  boxNorm: [number, number, number, number];
  /** Channel of the first read — the re-read MUST differ. */
  firstChannel: string;
}

/**
 * Plan quorum re-reads: review-status critical fields with geometry.
 * Proven fields never re-read (I10); refused fields are already loud.
 */
export function planQuorum(
  fields: readonly SolvedField[],
  candidatesById: ReadonlyMap<string, FieldCandidate>,
): QuorumRequest[] {
  const out: QuorumRequest[] = [];
  for (const f of fields) {
    if (f.status !== 'review') continue;
    const c = candidatesById.get(f.candidateId);
    if (!c || !CRITICAL_TYPES.includes(c.valueType)) continue;
    if (!c.boxNorm) continue; // nothing to re-read — stays review honestly
    out.push({
      fieldLabel: f.label,
      candidateId: c.id,
      firstRead: c.value,
      valueType: c.valueType,
      boxNorm: c.boxNorm,
      firstChannel: c.channel,
    });
  }
  return out;
}

export type QuorumJudgment =
  | { kind: 'agree'; attestation: Attestation }
  | { kind: 'conflict'; firstRead: string; secondRead: string; reason: string }
  | { kind: 'cannot_judge'; reason: string };

/** Type-aware normalization equality — the same laws the attestors use. */
export function quorumReadsAgree(valueType: string, a: string, b: string): boolean {
  if (valueType === 'amount') {
    const pa = parseAmount(a);
    const pb = parseAmount(b);
    return pa !== null && pb !== null && Math.abs(pa - pb) < 0.005;
  }
  if (valueType === 'date') {
    // Set intersection (canonDates law) — locale-free.
    const sa = new Set(plausibleIsoDates(a));
    return plausibleIsoDates(b).some((iso) => sa.has(iso));
  }
  return stripSeparators(a).toUpperCase() === stripSeparators(b).toUpperCase();
}

/**
 * Judge a completed quorum re-read.
 * `secondChannel` names the decorrelated path ('binarized', 'alt_recognizer',
 * …) — refusal when it equals the first channel is constitutional.
 */
export function judgeQuorum(
  request: QuorumRequest,
  secondRead: string,
  secondChannel: string,
): QuorumJudgment {
  if (secondChannel === request.firstChannel) {
    return {
      kind: 'cannot_judge',
      reason: 'quorum requires a DECORRELATED channel — same-channel agreement proves nothing',
    };
  }
  if (secondRead.trim().length === 0) {
    return { kind: 'cannot_judge', reason: 'decorrelated channel produced no read' };
  }
  if (quorumReadsAgree(request.valueType, request.firstRead, secondRead)) {
    return {
      kind: 'agree',
      attestation: {
        attestorId: 'quorum.dual-channel',
        verdict: 'proves',
        strength: 0.9, // strong, but below checksum/payload proof
        evidence: [
          { kind: 'candidate', ref: request.candidateId, note: `${request.firstChannel}: "${request.firstRead}"` },
          { kind: 'computation', ref: `${secondChannel}: "${secondRead}" — normalized reads agree (I6)` },
        ],
      },
    };
  }
  return {
    kind: 'conflict',
    firstRead: request.firstRead,
    secondRead,
    reason: `decorrelated channels disagree: "${request.firstRead}" (${request.firstChannel}) vs "${secondRead}" (${secondChannel})`,
  };
}
