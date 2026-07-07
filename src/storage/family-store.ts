/**
 * Family store (P2.1) — CRUD + schema-edit law for document families.
 *
 * Laws enforced here (Documentation/11 §1, §5):
 *  - Schema edits NEVER rewrite records: removed fields stay readable in old
 *    records because records render from stored values, not the live schema.
 *  - Draft families are invisible to exports and STP stats until approved.
 *  - Stats are rolling and updated by the record store, never by callers.
 */

import { idbDelete, idbGet, idbGetAll, idbPut } from './workspace-db';
import { newId, type Family, type FamilyStats, type FormField } from '../workspace/types';

const STORE = 'families';

function nowIso(): string {
  return new Date().toISOString();
}

const EMPTY_STATS: FamilyStats = { records: 0, stp: 0, questionsPerDoc: 0 };

/** Creates a family (draft by default — J4 flow approves it). */
export async function createFamily(
  name: string,
  formSchema: FormField[],
  opts: { status?: Family['status']; templateIds?: string[] } = {},
): Promise<Family> {
  validateSchema(formSchema);
  const family: Family = {
    familyId: newId('fam'),
    name: name.trim() || 'Untitled family',
    status: opts.status ?? 'draft',
    formSchema,
    templateIds: opts.templateIds ?? [],
    stats: { ...EMPTY_STATS },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await idbPut(STORE, family);
  return family;
}

export async function getFamily(familyId: string): Promise<Family | undefined> {
  return idbGet<Family>(STORE, familyId);
}

export async function listFamilies(): Promise<Family[]> {
  const all = await idbGetAll<Family>(STORE);
  // createdAt ties within one millisecond — the monotonic id breaks them.
  return all.sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.familyId.localeCompare(b.familyId),
  );
}

export async function approveFamily(familyId: string): Promise<Family> {
  const f = await mustGet(familyId);
  const updated: Family = { ...f, status: 'active', updatedAt: nowIso() };
  await idbPut(STORE, updated);
  return updated;
}

export async function renameFamily(familyId: string, name: string): Promise<Family> {
  const f = await mustGet(familyId);
  const updated: Family = { ...f, name: name.trim() || f.name, updatedAt: nowIso() };
  await idbPut(STORE, updated);
  return updated;
}

/**
 * Replaces the form schema. Removed fields are NOT scrubbed from records —
 * the data model law: records render from stored values. Returns the fields
 * that were removed so the caller can surface "N legacy fields remain
 * readable in old records".
 */
export async function updateFamilySchema(
  familyId: string,
  formSchema: FormField[],
): Promise<{ family: Family; removedFieldIds: string[] }> {
  validateSchema(formSchema);
  const f = await mustGet(familyId);
  const newIds = new Set(formSchema.map((x) => x.fieldId));
  const removedFieldIds = f.formSchema.map((x) => x.fieldId).filter((id) => !newIds.has(id));
  const family: Family = { ...f, formSchema, updatedAt: nowIso() };
  await idbPut(STORE, family);
  return { family, removedFieldIds };
}

export async function attachTemplate(familyId: string, templateId: string): Promise<Family> {
  const f = await mustGet(familyId);
  if (f.templateIds.includes(templateId)) return f;
  const updated: Family = {
    ...f,
    templateIds: [...f.templateIds, templateId],
    updatedAt: nowIso(),
  };
  await idbPut(STORE, updated);
  return updated;
}

/** Internal (record store only): fold one record outcome into rolling stats. */
export async function foldRecordIntoStats(
  familyId: string,
  outcome: { straightThrough: boolean; questionsAsked: number },
): Promise<Family> {
  const f = await mustGet(familyId);
  const n = f.stats.records;
  const stats: FamilyStats = {
    records: n + 1,
    // Rolling means — exact, not decayed (spec: rolling rate).
    stp: (f.stats.stp * n + (outcome.straightThrough ? 1 : 0)) / (n + 1),
    questionsPerDoc: (f.stats.questionsPerDoc * n + outcome.questionsAsked) / (n + 1),
  };
  const updated: Family = { ...f, stats, updatedAt: nowIso() };
  await idbPut(STORE, updated);
  return updated;
}

/** USER-initiated deletion only (with confirm in UI). Machine code must
 *  never call this — append-only truth. Records are NOT cascaded here;
 *  the caller decides (spec: explicit user action with confirm). */
export async function deleteFamilyUserAction(familyId: string): Promise<void> {
  await idbDelete(STORE, familyId);
}

async function mustGet(familyId: string): Promise<Family> {
  const f = await idbGet<Family>(STORE, familyId);
  if (!f) throw new Error(`Family not found: ${familyId}`);
  return f;
}

function validateSchema(schema: FormField[]): void {
  const seen = new Set<string>();
  for (const f of schema) {
    if (!f.fieldId) throw new Error('FormField.fieldId is required');
    if (seen.has(f.fieldId)) throw new Error(`Duplicate fieldId: ${f.fieldId}`);
    seen.add(f.fieldId);
    if (f.valueType === 'enum' && (!f.enumValues || f.enumValues.length === 0)) {
      throw new Error(`Enum field ${f.fieldId} needs enumValues`);
    }
  }
}
