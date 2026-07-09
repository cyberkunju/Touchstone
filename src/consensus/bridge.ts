/**
 * Consensus bridge (P5.2 "verifier becomes consumer") — the seam between
 * the certified DocGraph pipeline and the attestation layer.
 *
 * ADDITIVE LAW (certification protection): consensus may only
 *   (a) ATTACH printable justification chains to hypotheses (GATE P5), and
 *   (b) DOWNGRADE a confirmed hypothesis that an attestor CONTRADICTS
 *       (turning a potential silent error into review — strictly safer).
 * It NEVER upgrades: a review-status field stays review even when proven —
 * promotion authority migrates here only after a dedicated A/B + burst
 * re-certification.
 */

import type { DocGraph, FieldHypothesis } from '../core/types';
import { attestAll } from './attestors';
import type { DocContext, FieldCandidate } from './types';

/** Map pipeline hypotheses onto consensus candidates. */
export function hypothesesToCandidates(hypotheses: readonly FieldHypothesis[]): FieldCandidate[] {
  const out: FieldCandidate[] = [];
  for (const h of hypotheses) {
    if (typeof h.value !== 'string' || h.value.length === 0) continue;
    const marks: string[] = [];
    let channel: FieldCandidate['channel'] = 'ocr';
    if (h.valueType === 'mrz') marks.push('mrz_text');
    if (h.valueType === 'barcode') {
      channel = 'payload';
      marks.push('barcode_payload');
    }
    out.push({
      id: h.id,
      canonicalLabel: h.canonicalLabel ?? null,
      valueType: h.valueType,
      value: h.value,
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
  /** Hypothesis ids that carry at least one 'proves' justification. */
  justified: string[];
}

/**
 * Run the attestor registry over the verified graph and apply the additive
 * law IN PLACE (the graph object is the pipeline's own mutable copy).
 */
export function augmentWithConsensus(graph: DocGraph, now: Date = new Date()): ConsensusAugmentation {
  const candidates = hypothesesToCandidates(graph.hypotheses);
  const ctx: DocContext = {
    docType: graph.metadata?.sourceFileType ?? 'unknown',
    allCandidates: candidates,
    dateOrder: null,
    now,
  };
  const outcomes = attestAll(ctx);
  const result: ConsensusAugmentation = { downgraded: [], justified: [] };

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
  }
  return result;
}
