/**
 * P5.4 — Anytime scheduler (I10): verify-then-spend.
 *
 * The ladder's decision layer, pure and testable:
 *  1. Discovery ran once. The solver marked what is PROVEN.
 *  2. Spend compute ONLY on unproven critical ROIs — foveation rounds
 *     (max 2, frozen) re-perceive those crops at higher DPI.
 *  3. Every round is budget-checked BEFORE dispatch; breach ⇒ explicit
 *     BUDGET_EXCEEDED per affected field — degradation is loud (N1 applies
 *     to performance too). Round 3 exists only as a user-invoked deep scan.
 *
 * The scheduler never blocks paint: callers stream confirmed fields
 * immediately and feed the plan's ROIs to /v1/reperceive asynchronously.
 */

import type { FieldCandidate } from './types';
import type { SolvedField } from './solver';
import { CRITICAL_TYPES } from './quorum';

/** Frozen by 13 §4. */
export const MAX_FOVEATION_ROUNDS = 2;

export interface FoveationTarget {
  fieldLabel: string;
  candidateId: string;
  boxNorm: [number, number, number, number];
  valueType: string;
  /** Why this ROI deserves compute — surfaced in evidence trails. */
  reason: 'unproven_critical' | 'refused_needs_recheck';
}

export interface RoundBudget {
  /** Wall-clock remaining for the whole document (ms). */
  remainingMs: number;
  /** Estimated cost per ROI re-read at the target DPI (ms). */
  estimatedMsPerRoi: number;
}

export type FoveationPlan =
  | { kind: 'dispatch'; round: number; dpiScale: number; targets: FoveationTarget[] }
  | { kind: 'done'; reason: 'all_proven' | 'no_actionable_targets' }
  | {
      kind: 'budget_exceeded';
      /** Fields that WOULD have re-perceived — each stays review with an
       *  explicit marker and a user-invocable deep-scan affordance. */
      starvedFields: string[];
    }
  | { kind: 'rounds_exhausted'; unprovenFields: string[] };

/**
 * Plan the next foveation round. `completedRounds` counts prior rounds
 * (0 before the first). DPI doubles per round from the discovery raster.
 */
export function planFoveation(
  fields: readonly SolvedField[],
  candidatesById: ReadonlyMap<string, FieldCandidate>,
  completedRounds: number,
  budget: RoundBudget,
): FoveationPlan {
  const targets: FoveationTarget[] = [];
  const unprovenLabels: string[] = [];

  for (const f of fields) {
    if (f.status === 'confirmed') continue;
    unprovenLabels.push(f.label);
    if (f.status === 'review') {
      const c = candidatesById.get(f.candidateId);
      if (c?.boxNorm && CRITICAL_TYPES.includes(c.valueType)) {
        targets.push({
          fieldLabel: f.label,
          candidateId: c.id,
          boxNorm: c.boxNorm,
          valueType: c.valueType,
          reason: 'unproven_critical',
        });
      }
    } else if (f.status === 'refused' && f.rejectedValue !== null) {
      // A refused field with geometry gets ONE recheck chance: the
      // contradiction may be a misread of the contradicting witness itself.
      const c = [...candidatesById.values()].find((x) => x.value === f.rejectedValue && x.boxNorm);
      if (c?.boxNorm) {
        targets.push({
          fieldLabel: f.label,
          candidateId: c.id,
          boxNorm: c.boxNorm,
          valueType: c.valueType,
          reason: 'refused_needs_recheck',
        });
      }
    }
  }

  if (unprovenLabels.length === 0) return { kind: 'done', reason: 'all_proven' };
  if (targets.length === 0) return { kind: 'done', reason: 'no_actionable_targets' };
  if (completedRounds >= MAX_FOVEATION_ROUNDS) {
    return { kind: 'rounds_exhausted', unprovenFields: unprovenLabels };
  }

  const estimatedCost = targets.length * budget.estimatedMsPerRoi;
  if (estimatedCost > budget.remainingMs) {
    // Partial dispatch would be silent triage — instead, LOUD breach with
    // every starved field named (deep scan stays available to the user).
    return { kind: 'budget_exceeded', starvedFields: targets.map((t) => t.fieldLabel) };
  }

  return {
    kind: 'dispatch',
    round: completedRounds + 1,
    dpiScale: 2 ** (completedRounds + 1),
    targets,
  };
}
