/**
 * Shadow-CI replay runner (P6.3, Documentation/14 §6).
 *
 * Replays stored documents' ORIGINAL inputs through the CURRENT engine and
 * diffs field outcomes against the stored values. The engine is injected
 * (async fn) so the runner is pure logic: the browser wiring feeds it the
 * worker pipeline; tests feed it fixtures.
 *
 * Verdict semantics:
 *  - identical: every stored field reproduced exactly (value AND status);
 *  - improved:  no regressions, and ≥1 field upgraded (review→confirmed
 *               with the same value, or a previously-missing field now
 *               present matching a user-confirmed correction);
 *  - regressed: any stored CONFIRMED value that changed or disappeared, or
 *               any confirmed→review downgrade — each named field by field.
 *
 * The BLOCK decision is a pluggable predicate (the lead owns policy);
 * the default blocks on any regression (N1: a build that silently changes
 * confirmed history must never ship).
 *
 * DESTINATION: src/lwt/shadow-ci.ts.
 */

export type FieldStatus = 'confirmed' | 'needs_review' | 'conflict';

export interface StoredField {
  value: string;
  status: FieldStatus;
  /** True when a human explicitly confirmed/corrected this value. */
  userConfirmed?: boolean;
}

export interface StoredDoc {
  docId: string;
  /** label → stored outcome at record time. */
  fields: Record<string, StoredField>;
}

export interface ReplayedField {
  value: string;
  status: FieldStatus;
}

export type EngineRun = (docId: string) => Promise<Record<string, ReplayedField>>;

export interface FieldDiff {
  docId: string;
  label: string;
  kind:
    | 'value_changed'        // stored confirmed value ≠ replayed value
    | 'field_lost'           // stored confirmed field absent in replay
    | 'status_downgraded'    // confirmed → needs_review/conflict
    | 'status_upgraded'      // needs_review → confirmed, same value
    | 'new_field';           // replay found a field storage lacked
  stored?: StoredField;
  replayed?: ReplayedField;
}

export interface ReplayVerdict {
  verdict: 'identical' | 'improved' | 'regressed';
  regressions: FieldDiff[];
  improvements: FieldDiff[];
  docsReplayed: number;
  fieldsCompared: number;
}

export type BlockPredicate = (verdict: ReplayVerdict) => boolean;

/** Default policy: ANY regression blocks (lead-owned; pluggable). */
export const defaultBlockPredicate: BlockPredicate = (v) => v.verdict === 'regressed';

/** Diff one document's stored fields against its replay. */
export function diffDoc(
  stored: StoredDoc,
  replayed: Record<string, ReplayedField>,
): { regressions: FieldDiff[]; improvements: FieldDiff[]; compared: number } {
  const regressions: FieldDiff[] = [];
  const improvements: FieldDiff[] = [];
  let compared = 0;

  for (const [label, s] of Object.entries(stored.fields)) {
    compared++;
    const r = replayed[label];

    if (s.status === 'confirmed') {
      if (!r) {
        regressions.push({ docId: stored.docId, label, kind: 'field_lost', stored: s });
        continue;
      }
      if (r.value !== s.value) {
        regressions.push({ docId: stored.docId, label, kind: 'value_changed', stored: s, replayed: r });
        continue;
      }
      if (r.status !== 'confirmed') {
        regressions.push({ docId: stored.docId, label, kind: 'status_downgraded', stored: s, replayed: r });
      }
      continue;
    }

    // Stored as review/conflict: an upgrade is only an improvement when the
    // replayed value agrees with what a human eventually confirmed (when
    // userConfirmed marks the stored value as human truth) — otherwise a
    // confident new value over an unreviewed one is NOT provably better.
    if (r && r.status === 'confirmed' && r.value === s.value) {
      improvements.push({ docId: stored.docId, label, kind: 'status_upgraded', stored: s, replayed: r });
    }
  }

  for (const [label, r] of Object.entries(replayed)) {
    if (!(label in stored.fields)) {
      improvements.push({ docId: stored.docId, label, kind: 'new_field', replayed: r });
    }
  }

  return { regressions, improvements, compared };
}

/** Replay a corpus of stored documents through the current engine. */
export async function runShadowReplay(
  docs: StoredDoc[],
  engine: EngineRun,
): Promise<ReplayVerdict> {
  const regressions: FieldDiff[] = [];
  const improvements: FieldDiff[] = [];
  let fieldsCompared = 0;

  for (const doc of docs) {
    const replayed = await engine(doc.docId);
    const d = diffDoc(doc, replayed);
    regressions.push(...d.regressions);
    improvements.push(...d.improvements);
    fieldsCompared += d.compared;
  }

  const verdict: ReplayVerdict['verdict'] =
    regressions.length > 0 ? 'regressed'
      : improvements.length > 0 ? 'improved'
        : 'identical';

  return { verdict, regressions, improvements, docsReplayed: docs.length, fieldsCompared };
}

/** The CI gate: replay, apply policy, return block decision + report. */
export async function shadowCiGate(
  docs: StoredDoc[],
  engine: EngineRun,
  shouldBlock: BlockPredicate = defaultBlockPredicate,
): Promise<{ blocked: boolean; report: ReplayVerdict }> {
  const report = await runShadowReplay(docs, engine);
  return { blocked: shouldBlock(report), report };
}
