/**
 * Shadow-CI replay (P6.3, Documentation/11 §6) — after an engine update,
 * re-solve the workspace's OWN documents from their stored evidence and
 * diff the outcomes. The user's corpus is the regression suite nobody had
 * to build.
 *
 * Pure over (stored graph, current engine): the stored DocGraph carries the
 * full evidence (nodes, hypotheses, boxes, caps); replay re-runs the
 * CURRENT verifier + consensus over it and photographs what changed.
 *
 * VERDICT LAW (N1-shaped):
 *  - any VALUE change, or any confirmed→non-confirmed transition on the
 *    same value, is a REGRESSION — the engine must never quietly change
 *    what a workspace already holds;
 *  - review→confirmed on the SAME value is an improvement (a proof arrived);
 *  - anything else identical ⇒ identical.
 * A run with both improvements and regressions is REGRESSED — safety wins.
 */

import type { DocGraph } from '../core/types';
import { VerifierService } from '../verifier/verifier';
import { augmentWithConsensus } from '../consensus/bridge';
import type { BenchRun } from './types';
import { newId } from './types';

export interface FieldDiff {
  fieldId: string;
  from: string;
  to: string;
}

export interface RecordReplay {
  recordId: string;
  fieldDiffs: FieldDiff[];
  /** confirmed→review/other on same value (loud, never silent). */
  downgrades: number;
  /** review→confirmed on same value (a proof arrived). */
  upgrades: number;
}

/** Deep-clone a stored graph so replay can never mutate workspace truth. */
function cloneGraph(g: DocGraph): DocGraph {
  return JSON.parse(JSON.stringify(g)) as DocGraph;
}

const summary = (h: { value: unknown; status: string }): string =>
  `${typeof h.value === 'string' ? h.value : JSON.stringify(h.value ?? '')}∣${h.status}`;

/**
 * Replays one stored graph through the CURRENT engine (verify + consensus).
 * User-edited fields are untouchable by law (the verifier already honors
 * userEdited) — they can never diff.
 */
export function replayGraph(recordId: string, stored: DocGraph): RecordReplay {
  const fresh = cloneGraph(stored);
  const reVerified = VerifierService.verify(fresh);
  augmentWithConsensus(reVerified);

  const before = new Map(stored.hypotheses.map((h) => [h.id, h]));
  const fieldDiffs: FieldDiff[] = [];
  let downgrades = 0;
  let upgrades = 0;
  for (const now of reVerified.hypotheses) {
    const was = before.get(now.id);
    if (!was) continue;
    const from = summary(was);
    const to = summary(now);
    if (from === to) continue;
    fieldDiffs.push({ fieldId: now.label, from, to });
    const sameValue =
      (typeof was.value === 'string' ? was.value : JSON.stringify(was.value ?? '')) ===
      (typeof now.value === 'string' ? now.value : JSON.stringify(now.value ?? ''));
    if (sameValue && was.status === 'confirmed' && now.status !== 'confirmed') downgrades++;
    else if (sameValue && was.status !== 'confirmed' && now.status === 'confirmed') upgrades++;
  }
  return { recordId, fieldDiffs, downgrades, upgrades };
}

/** Folds per-record replays into the stored BenchRun verdict. */
export function buildBenchRun(
  engineFrom: string,
  engineTo: string,
  replays: RecordReplay[],
  now: () => string = () => new Date().toISOString(),
): BenchRun {
  let anyDiff = false;
  let regressed = false;
  let improved = false;
  for (const r of replays) {
    if (r.fieldDiffs.length > 0) anyDiff = true;
    // VALUE changes are regressions by definition; status downgrades too.
    const valueChanges = r.fieldDiffs.length - r.downgrades - r.upgrades;
    if (valueChanges > 0 || r.downgrades > 0) regressed = true;
    if (r.upgrades > 0) improved = true;
  }
  return {
    runId: newId('bench'),
    createdAt: now(),
    engineFrom,
    engineTo,
    perRecord: replays.map((r) => ({ recordId: r.recordId, fieldDiffs: r.fieldDiffs })),
    verdict: regressed ? 'regressed' : anyDiff && improved ? 'improved' : 'identical',
  };
}
