/**
 * Record store (P2.1) — append-only document records.
 *
 * THE APPEND-ONLY LAW (Documentation/11 §1): machine code appends records
 * and never deletes or rewrites them. The ONLY machine mutation is a user
 * edit folding into a value's status ('confirmed' with user provenance) and
 * review-lane bookkeeping. Row deletion is an explicit user action.
 *
 * Identity tiers (11 §3) surface here as lookups:
 *   tier 1: sha256 index — exact re-upload detection
 *   tier 2: dHash-64 Hamming ≤ 8 — near-duplicate suggestion
 */

import { idbDelete, idbGet, idbGetAll, idbGetAllFromIndex, idbPut } from './workspace-db';
import { foldRecordIntoStats } from './family-store';
import { newId, type DocRecord, type RecordValue } from '../workspace/types';

const STORE = 'records';

export interface AppendRecordInput {
  familyId: string;
  docGraphId: string;
  values: Record<string, RecordValue>;
  assetRefs?: Record<string, string>;
  sourceFile: DocRecord['sourceFile'];
  phash64: string;
  questionsAsked?: number;
}

/** Appends a record and folds its outcome into family stats atomically
 *  enough for a single-user local app (IDB has no cross-store tx via the
 *  helpers; the failure mode — stats lagging one record — self-heals on the
 *  next append and never corrupts truth). */
export async function appendRecord(input: AppendRecordInput): Promise<DocRecord> {
  const openFieldIds = Object.entries(input.values)
    .filter(([, v]) => v.status === 'needs_review' || v.status === 'conflict')
    .map(([fieldId]) => fieldId);

  const record: DocRecord = {
    recordId: newId('rec'),
    familyId: input.familyId,
    docGraphId: input.docGraphId,
    values: input.values,
    assetRefs: input.assetRefs ?? {},
    sourceFile: input.sourceFile,
    identity: { phash64: input.phash64 },
    createdAt: new Date().toISOString(),
    review: { open: openFieldIds.length > 0, openFieldIds },
  };
  await idbPut(STORE, record);
  await foldRecordIntoStats(input.familyId, {
    straightThrough: openFieldIds.length === 0 && (input.questionsAsked ?? 0) === 0,
    questionsAsked: input.questionsAsked ?? 0,
  });
  return record;
}

export async function getRecord(recordId: string): Promise<DocRecord | undefined> {
  return idbGet<DocRecord>(STORE, recordId);
}

export async function listRecordsByFamily(familyId: string): Promise<DocRecord[]> {
  const rows = await idbGetAllFromIndex<DocRecord>(STORE, 'familyId', familyId);
  // createdAt ties within one millisecond — the monotonic id breaks them.
  return rows.sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.recordId.localeCompare(b.recordId),
  );
}

/** Identity tier 1: exact re-upload (sha256 hit). */
export async function findBySha256(sha256: string): Promise<DocRecord[]> {
  return idbGetAllFromIndex<DocRecord>(STORE, 'sha256', sha256);
}

/** Identity tier 2: near-duplicates by dHash Hamming distance. Scans the
 *  family's records (local scale: hundreds — linear is honest and fast). */
export async function findNearDuplicates(
  familyId: string,
  phash64: string,
  hammingLimit = 8,
): Promise<DocRecord[]> {
  const rows = await listRecordsByFamily(familyId);
  return rows.filter((r) => hamming64(r.identity.phash64, phash64) <= hammingLimit);
}

/** USER EDIT path — the only value mutation that exists. Sets the value,
 *  marks it user-confirmed, and closes it in the review lane. */
export async function applyUserEdit(
  recordId: string,
  fieldId: string,
  value: string,
): Promise<DocRecord> {
  const r = await mustGet(recordId);
  const existing = r.values[fieldId];
  if (!existing) throw new Error(`Field ${fieldId} not present on record ${recordId}`);
  const updated: DocRecord = {
    ...r,
    values: {
      ...r.values,
      [fieldId]: {
        value,
        status: 'confirmed',
        justification: {
          attestations: [],
          confidence: 1,
          reasons: ['User corrected and approved value.'],
        },
      },
    },
    review: {
      open: r.review.openFieldIds.filter((id) => id !== fieldId).length > 0,
      openFieldIds: r.review.openFieldIds.filter((id) => id !== fieldId),
    },
  };
  await idbPut(STORE, updated);
  return updated;
}

/** USER accept-as-is: closes a review item without changing the value. */
export async function acceptFieldUserAction(recordId: string, fieldId: string): Promise<DocRecord> {
  const r = await mustGet(recordId);
  const v = r.values[fieldId];
  if (!v) throw new Error(`Field ${fieldId} not present on record ${recordId}`);
  return applyUserEdit(recordId, fieldId, v.value);
}

/** USER-initiated deletion only. Machine code must never call this. */
export async function deleteRecordUserAction(recordId: string): Promise<void> {
  await idbDelete(STORE, recordId);
}

export async function countAll(): Promise<number> {
  return (await idbGetAll<DocRecord>(STORE)).length;
}

async function mustGet(recordId: string): Promise<DocRecord> {
  const r = await idbGet<DocRecord>(STORE, recordId);
  if (!r) throw new Error(`Record not found: ${recordId}`);
  return r;
}

/** Hamming distance between two 16-hex-char (64-bit) hashes. Tolerant of
 *  malformed input: non-hex compares as maximal distance (honest miss). */
export function hamming64(a: string, b: string): number {
  if (!/^[0-9a-f]{16}$/i.test(a) || !/^[0-9a-f]{16}$/i.test(b)) return 64;
  let dist = 0;
  for (let i = 0; i < 16; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}
