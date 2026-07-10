/**
 * Consensus bridge (P5.2 "verifier becomes consumer") — the seam between
 * the certified DocGraph pipeline and the attestation layer.
 *
 * THE LAW (post promotion A/B):
 *   (a) ATTACH printable justification chains to hypotheses (GATE P5);
 *   (b) DOWNGRADE a confirmed hypothesis that an attestor CONTRADICTS
 *       (turning a potential silent error into review — strictly safer);
 *   (c) PROMOTE a plain review hypothesis that an attestor PROVES — under
 *       three iron guards:
 *         • NEVER a reviewCap'd hypothesis: caps mark spots where a checksum
 *           was BLIND to an ambiguity — the same math cannot buy them back;
 *         • NEVER below PROMOTION_MIN_STRENGTH (0.9): schemes with fat
 *           measured blind spots (IMO ~11%) may support, not auto-confirm;
 *         • `proven` requires ZERO contradictions (attestAll's definition).
 *       Promotion is flag-gated; the full-universe burst A/B is the judge
 *       (recall may only rise, SILENT stays 0).
 */

import type { DocGraph, FieldHypothesis } from '../core/types';
import { attestAll } from './attestors';
import type { DocContext, FieldCandidate } from './types';

/** Proof strength floor for auto-confirmation (see measured blind spots). */
export const PROMOTION_MIN_STRENGTH = 0.9;

/** Map pipeline hypotheses onto consensus candidates. */
export function hypothesesToCandidates(hypotheses: readonly FieldHypothesis[]): FieldCandidate[] {
  const out: FieldCandidate[] = [];
  for (const h of hypotheses) {
    let value: string;
    if (typeof h.value === 'string') {
      value = h.value;
    } else if (h.valueType === 'mrz' && h.value && typeof h.value === 'object') {
      const parsed = h.value as { rawLines?: unknown; normalizedLines?: unknown };
      const lines = Array.isArray(parsed.rawLines) && parsed.rawLines.length >= 2
        ? parsed.rawLines
        : parsed.normalizedLines;
      if (!Array.isArray(lines) || lines.length < 2 || !lines.every((line) => typeof line === 'string')) {
        continue;
      }
      value = lines.join('\n');
    } else {
      continue;
    }
    if (value.length === 0) continue;
    const marks: string[] = [];
    let channel: FieldCandidate['channel'] = 'ocr';
    const mrzCanProve = h.valueType === 'mrz' && !h.reviewCap;
    if (mrzCanProve) marks.push('mrz_text');
    if (h.valueType === 'barcode') {
      channel = 'payload';
      marks.push('barcode_payload');
    }
    out.push({
      id: h.id,
      canonicalLabel: h.valueType === 'mrz'
        ? mrzCanProve ? h.canonicalLabel ?? 'mrz' : null
        : h.canonicalLabel ?? null,
      valueType: h.valueType,
      value,
      channel,
      boxNorm: h.boxNorm,
      marks,
    });
  }
  return out;
}

export interface ConsensusAugmentation {
  /** Hypothesis ids downgraded confirmed → needs_review (with reasons). */
  downgraded: Array<{ id: string; label: string; reason: string }>;
  /** Hypothesis ids promoted needs_review → confirmed by proof. */
  promoted: Array<{ id: string; label: string; attestors: string[] }>;
  /** Hypothesis ids that carry at least one 'proves' justification. */
  justified: string[];
}

/**
 * Run the attestor registry over the verified graph and apply the law IN
 * PLACE (the graph object is the pipeline's own mutable copy).
 * `promote` gates (c) — default ON post-A/B; set false to reproduce the
 * additive-only behavior for comparisons.
 */
export function augmentWithConsensus(
  graph: DocGraph,
  now: Date = new Date(),
  promote = true,
): ConsensusAugmentation {
  const candidates = hypothesesToCandidates(graph.hypotheses);
  const ctx: DocContext = {
    docType: graph.metadata?.sourceFileType ?? 'unknown',
    allCandidates: candidates,
    dateOrder: null,
    now,
  };
  const outcomes = attestAll(ctx);
  const result: ConsensusAugmentation = { downgraded: [], promoted: [], justified: [] };

  for (const h of graph.hypotheses) {
    const o = outcomes.get(h.id);
    if (!o || o.attestations.length === 0) continue;

    // (a) printable justification chain — every attestation, with evidence.
    for (const a of o.attestations) {
      const evidence = a.evidence.map((e) => e.ref).join('; ');
      h.reasons.push(`⚖ ${a.attestorId} ${a.verdict} (${a.strength.toFixed(2)}): ${evidence}`);
    }
    if (o.proven) result.justified.push(h.id);

    // (b) contradiction downgrades a confirmed field — silent-error killer.
    if (o.contradicted && h.status === 'confirmed' && !h.userEdited) {
      const contras = o.attestations.filter((a) => a.verdict === 'contradicts');
      const reason = `consensus contradiction: ${contras.map((a) => a.attestorId).join(', ')}`;
      h.status = 'needs_review';
      h.reasons.push(`⛔ downgraded — ${reason}`);
      result.downgraded.push({ id: h.id, label: h.label, reason });
    }

    // (c) proof promotes a PLAIN review field — the three iron guards.
    if (
      promote &&
      o.proven && // ≥1 proves AND zero contradictions
      h.status === 'needs_review' &&
      !h.reviewCap && // capped ambiguity is NEVER bought back by the same math
      !h.userEdited &&
      !result.downgraded.some((d) => d.id === h.id) // never re-promote a downgrade
    ) {
      const proofs = o.attestations.filter(
        (a) => a.verdict === 'proves' && a.strength >= PROMOTION_MIN_STRENGTH,
      );
      if (proofs.length > 0) {
        h.status = 'confirmed';
        h.confidence.overall = Math.max(
          h.confidence.overall,
          Math.max(...proofs.map((p) => p.strength)),
        );
        h.reasons.push(
          `⚡ promoted — proven by ${proofs.map((p) => p.attestorId).join(', ')} (N1: proof, not confidence)`,
        );
        result.promoted.push({ id: h.id, label: h.label, attestors: proofs.map((p) => p.attestorId) });
      }
    }
  }
  return result;
}
