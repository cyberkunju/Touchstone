/**
 * Consensus solver (08 §4-5) — from candidates + attestations to a
 * justified extraction.
 *
 * ══════════════════════════ THE LAW AS A TYPE ══════════════════════════
 * `ConfirmedField` can ONLY be built by `confirmField`, which statically
 * requires a non-empty proves-attestation array and runtime-verifies every
 * member. `status: 'confirmed'` cannot be forged by construction — the
 * forge-fuzz test tries and must fail. Everything else is 'review' or
 * 'refused'. Zero silent errors is not a policy here; it is the type system.
 * ════════════════════════════════════════════════════════════════════════
 *
 * Solve pipeline:
 *  1. Document-global variables (date order, decimal style) — exact search
 *     over the tiny cross-product; each hypothesis re-scored by how many
 *     attestations survive under it. No per-field locale guessing (the
 *     forge_193 law: locale is a DOCUMENT property).
 *  2. Slot assignment — Hungarian on label×candidate profit (channel
 *     strength × attestation bonus); optimal, never greedy.
 *  3. Field status — confirmed (proof, no contradiction), review
 *     (supported/unopposed), refused (contradicted or unreadable).
 */

import { attestAll, type AttestationOutcome } from './attestors';
import { assignOptimal } from './hungarian';
import { CHANNEL_STRENGTH, type Attestation, type DocContext, type FieldCandidate } from './types';

// ───────────────────────────── the sealed type ─────────────────────────────

// Module-private brand: not exported, so no other module can construct a
// ConfirmedField literal that type-checks. Runtime checks in confirmField
// are the second wall.
const CONFIRMED: unique symbol = Symbol('docutract.confirmed');

/** A proves-verdict attestation — the only currency that buys confirmation. */
export type ProvesAttestation = Attestation & { verdict: 'proves' };

export interface ConfirmedField {
  readonly status: 'confirmed';
  readonly label: string;
  readonly value: string;
  readonly candidateId: string;
  /** Non-empty BY TYPE — [ProvesAttestation, ...]. */
  readonly proofs: readonly [ProvesAttestation, ...ProvesAttestation[]];
  readonly supports: readonly Attestation[];
  /** Brand: unforgeable outside confirmField. */
  readonly [CONFIRMED]: true;
}

export interface ReviewField {
  readonly status: 'review';
  readonly label: string;
  readonly value: string;
  readonly candidateId: string;
  readonly supports: readonly Attestation[];
  /** Why this is review and not confirmed — never empty. */
  readonly reason: string;
}

export interface RefusedField {
  readonly status: 'refused';
  readonly label: string;
  /** The best-guess value, shown struck-through in review UI — never exported. */
  readonly rejectedValue: string | null;
  readonly contradictions: readonly Attestation[];
  readonly reason: string;
}

export type SolvedField = ConfirmedField | ReviewField | RefusedField;

/**
 * THE ONLY DOOR to `status: 'confirmed'`.
 *
 * Statically: `proofs` is a non-empty tuple of proves-attestations.
 * Dynamically: re-verifies every member's verdict and evidence, and refuses
 * when any contradiction exists. Throws on violation — a caller trying to
 * confirm without proof is a programming error, not a data condition.
 */
export function confirmField(args: {
  label: string;
  value: string;
  candidateId: string;
  proofs: readonly [ProvesAttestation, ...ProvesAttestation[]];
  supports?: readonly Attestation[];
  contradictions?: readonly Attestation[];
}): ConfirmedField {
  if (args.proofs.length === 0) {
    throw new Error('confirmField: confirmation requires at least one proof (N1)');
  }
  for (const p of args.proofs) {
    if (p.verdict !== 'proves') {
      throw new Error(`confirmField: non-proves attestation smuggled in (${p.attestorId}: ${p.verdict})`);
    }
    if (p.evidence.length === 0) {
      throw new Error(`confirmField: proof without evidence (${p.attestorId})`);
    }
  }
  if (args.contradictions && args.contradictions.length > 0) {
    throw new Error('confirmField: cannot confirm a contradicted field');
  }
  return {
    status: 'confirmed',
    label: args.label,
    value: args.value,
    candidateId: args.candidateId,
    proofs: args.proofs,
    supports: args.supports ?? [],
    [CONFIRMED]: true,
  } as ConfirmedField;
}

// ─────────────────────── document-global variables ─────────────────────────

const DATE_ORDERS = [null, 'DMY', 'MDY'] as const;

export interface GlobalHypothesis {
  dateOrder: (typeof DATE_ORDERS)[number];
  /** Attestations surviving under this hypothesis. */
  score: number;
}

/**
 * Exact search over document-global variables: pick the hypothesis under
 * which the most attestation mass survives. Ties prefer null (no unforced
 * commitment). The space is tiny (3) — exact enumeration, no heuristics.
 */
export function solveGlobals(baseCtx: DocContext): GlobalHypothesis {
  let best: GlobalHypothesis = { dateOrder: null, score: -1 };
  for (const dateOrder of DATE_ORDERS) {
    const ctx: DocContext = { ...baseCtx, dateOrder };
    const outcomes = attestAll(ctx);
    let score = 0;
    for (const o of outcomes.values()) {
      for (const a of o.attestations) {
        if (a.verdict === 'proves') score += a.strength * 2;
        else if (a.verdict === 'supports') score += a.strength;
        else score -= a.strength * 2; // contradictions penalize the hypothesis
      }
    }
    if (score > best.score) best = { dateOrder, score };
  }
  return best;
}

// ───────────────────────────── the solve ───────────────────────────────────

export interface SolveResult {
  fields: SolvedField[];
  globals: GlobalHypothesis;
  outcomes: Map<string, AttestationOutcome>;
}

/**
 * Solve one document: globals → optimal assignment → sealed statuses.
 * `wantedLabels` are the schema slots to fill; candidates carrying other
 * labels can still self-label new slots via checksum attestors (N5).
 */
export function solveDocument(baseCtx: DocContext, wantedLabels: readonly string[]): SolveResult {
  const globals = solveGlobals(baseCtx);
  const ctx: DocContext = { ...baseCtx, dateOrder: globals.dateOrder };
  const outcomes = attestAll(ctx);

  // Self-labeled slots (N5): a candidate that PROVED itself to be an iban
  // creates the iban slot even when the schema didn't ask.
  const labels = [...wantedLabels];
  for (const o of outcomes.values()) {
    for (const sl of o.selfLabels) {
      if (!labels.includes(sl)) labels.push(sl);
    }
  }

  // Profit matrix: label × candidate.
  const candidates = ctx.allCandidates;
  const profit = new Map<number, Map<number, number>>();
  labels.forEach((label, li) => {
    const row = new Map<number, number>();
    candidates.forEach((c, ci) => {
      const o = outcomes.get(c.id);
      const labelMatch =
        c.canonicalLabel === label ? 1.0 : o?.selfLabels.includes(label) ? 0.8 : 0;
      if (labelMatch === 0) return;
      if (o?.contradicted) return; // contradicted candidates never win slots
      let p = labelMatch * CHANNEL_STRENGTH[c.channel];
      if (o?.proven) p += 2; // proof dominates channel strength
      else if (o && o.attestations.some((a) => a.verdict === 'supports')) p += 0.5;
      row.set(ci, p);
    });
    if (row.size > 0) profit.set(li, row);
  });

  const assignment = assignOptimal(labels.length, candidates.length, profit);
  const assigned = new Map<string, FieldCandidate>();
  for (const [li, ci] of assignment) assigned.set(labels[li], candidates[ci]);

  const fields: SolvedField[] = [];
  for (const label of labels) {
    const winner = assigned.get(label);
    if (!winner) {
      // No assignable candidate. If ALL candidates for this label were
      // contradicted, surface the refusal loudly (never silently drop).
      const contradicted = candidates.filter(
        (c) => c.canonicalLabel === label && outcomes.get(c.id)?.contradicted,
      );
      if (contradicted.length > 0) {
        const best = contradicted[0];
        const o = outcomes.get(best.id)!;
        const cons = o.attestations.filter((a) => a.verdict === 'contradicts');
        fields.push({
          status: 'refused',
          label,
          rejectedValue: best.value,
          contradictions: cons,
          reason: `every candidate for this field is contradicted (${cons
            .map((a) => a.attestorId)
            .join(', ')})`,
        });
      }
      continue; // schema slot simply absent from this document
    }

    const o = outcomes.get(winner.id)!;
    const proves = o.attestations.filter((a): a is ProvesAttestation => a.verdict === 'proves');
    const supports = o.attestations.filter((a) => a.verdict === 'supports');
    const contradicts = o.attestations.filter((a) => a.verdict === 'contradicts');

    if (contradicts.length > 0) {
      fields.push({
        status: 'refused',
        label,
        rejectedValue: winner.value,
        contradictions: contradicts,
        reason: `contradicted by ${contradicts.map((a) => a.attestorId).join(', ')}`,
      });
    } else if (proves.length > 0) {
      fields.push(
        confirmField({
          label,
          value: winner.value,
          candidateId: winner.id,
          proofs: [proves[0], ...proves.slice(1)],
          supports,
        }),
      );
    } else {
      fields.push({
        status: 'review',
        label,
        value: winner.value,
        candidateId: winner.id,
        supports,
        reason:
          supports.length > 0
            ? 'supported but not proven — no attestor could prove this value'
            : 'no attestor applies — single-channel read',
      });
    }
  }

  return { fields, globals, outcomes };
}

/** Type-level witness used by tests: a value is exportable iff confirmed. */
export function isConfirmed(f: SolvedField): f is ConfirmedField {
  return f.status === 'confirmed';
}
