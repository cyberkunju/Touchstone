/**
 * P2.1 tests — migration idempotency + store laws.
 * Runs against fake-indexeddb (no browser needed).
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import {
  WORKSPACE_DB_NAME,
  applySchema,
  getWorkspaceDb,
  __closeWorkspaceDb,
} from './workspace-db';
import { createFamily, approveFamily, getFamily, listFamilies, updateFamilySchema, foldRecordIntoStats } from './family-store';
import {
  appendRecord,
  applyUserEdit,
  acceptFieldUserAction,
  findBySha256,
  findNearDuplicates,
  getRecord,
  hamming64,
  listRecordsByFamily,
} from './record-store';
import type { FormField, RecordValue } from '../workspace/types';

// fake-indexeddb keeps DBs in a global registry — flush between tests.
beforeEach(async () => {
  __closeWorkspaceDb();
  indexedDB.deleteDatabase(WORKSPACE_DB_NAME);
});

const SCHEMA: FormField[] = [
  { fieldId: 'f_name', label: 'Full Name', valueType: 'text', required: true, critical: false, column: true },
  { fieldId: 'f_total', label: 'Total', valueType: 'amount', required: true, critical: true, column: true },
];

const confirmedValue = (value: string): RecordValue => ({
  value,
  status: 'confirmed',
  justification: { attestations: [{ attestorId: 'test', verdict: 'proves' }], confidence: 0.95, reasons: ['test'] },
});
const reviewValue = (value: string): RecordValue => ({
  value,
  status: 'needs_review',
  justification: { attestations: [], confidence: 0.4, reasons: ['weak'] },
});

function sourceFile(sha = 'a'.repeat(64)) {
  return { name: 'x.png', sha256: sha, opfsPath: `files/${sha}`, kind: 'image' as const };
}

describe('v1→v2 migration (P2.1 law: adds only, idempotent)', () => {
  it('migrates a REAL v1 database without touching v1 data', async () => {
    // Build a genuine v1 DB with data (mirrors src/storage/db.ts v1 schema).
    const v1 = await openDB(WORKSPACE_DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore('docGraphs', { keyPath: 'id' });
        const t = db.createObjectStore('templates', { keyPath: 'id' });
        t.createIndex('familyId', 'familyId', { unique: false });
        t.createIndex('docType', 'docType', { unique: false });
        db.createObjectStore('jobs', { keyPath: 'id' });
      },
    });
    await v1.put('docGraphs', { id: 'g1', payload: 'precious' });
    await v1.put('templates', { id: 't1', familyId: 'f1', docType: 'passport' });
    v1.close();

    // Open at the current version through the real module.
    const db = await getWorkspaceDb();
    expect([...db.objectStoreNames].sort()).toEqual(
      ['benchruns', 'docGraphs', 'families', 'jobs', 'keyring', 'priors', 'records', 'templates'].sort(),
    );
    // v1 data survived byte-for-byte.
    expect(await db.get('docGraphs', 'g1')).toEqual({ id: 'g1', payload: 'precious' });
    expect(await db.get('templates', 't1')).toEqual({ id: 't1', familyId: 'f1', docType: 'passport' });
  });

  it('fresh install (no v1) creates the full schema', async () => {
    const db = await getWorkspaceDb();
    expect(db.objectStoreNames.contains('families')).toBe(true);
    expect(db.objectStoreNames.contains('records')).toBe(true);
    expect(db.objectStoreNames.contains('priors')).toBe(true);
    expect(db.objectStoreNames.contains('benchruns')).toBe(true);
    expect(db.objectStoreNames.contains('keyring')).toBe(true);
  });

  it('applySchema is idempotent (double-apply converges, never throws)', async () => {
    const db = await openDB(`${WORKSPACE_DB_NAME}-idem`, 1, {
      upgrade(d) {
        applySchema(d as never);
        applySchema(d as never); // second apply inside the same upgrade
      },
    });
    expect(db.objectStoreNames.contains('records')).toBe(true);
    db.close();
    indexedDB.deleteDatabase(`${WORKSPACE_DB_NAME}-idem`);
  });

  it('records store carries the familyId and sha256 indexes', async () => {
    const db = await getWorkspaceDb();
    const tx = db.transaction('records');
    expect([...tx.store.indexNames].sort()).toEqual(['familyId', 'sha256']);
  });
});

describe('family store laws', () => {
  it('creates as draft; approval flips to active', async () => {
    const f = await createFamily('Invoices', SCHEMA);
    expect(f.status).toBe('draft');
    const approved = await approveFamily(f.familyId);
    expect(approved.status).toBe('active');
    expect((await getFamily(f.familyId))!.status).toBe('active');
  });

  it('schema edits report removed fields and never touch records', async () => {
    const f = await createFamily('Fam', SCHEMA, { status: 'active' });
    const rec = await appendRecord({
      familyId: f.familyId,
      docGraphId: 'g1',
      values: { f_name: confirmedValue('ANNA'), f_total: confirmedValue('12.00') },
      sourceFile: sourceFile(),
      phash64: 'a'.repeat(16),
    });
    const { removedFieldIds } = await updateFamilySchema(f.familyId, [SCHEMA[0]]);
    expect(removedFieldIds).toEqual(['f_total']);
    // The record still holds the removed field's value — renders from data.
    const after = await getRecord(rec.recordId);
    expect(after!.values.f_total.value).toBe('12.00');
  });

  it('rejects duplicate fieldIds and empty enums', async () => {
    await expect(
      createFamily('bad', [SCHEMA[0], { ...SCHEMA[0] }]),
    ).rejects.toThrow(/Duplicate fieldId/);
    await expect(
      createFamily('bad2', [
        { fieldId: 'e', label: 'E', valueType: 'enum', required: false, critical: false, column: false },
      ]),
    ).rejects.toThrow(/enumValues/);
  });

  it('rolling stats are exact means', async () => {
    const f = await createFamily('Fam', SCHEMA, { status: 'active' });
    await foldRecordIntoStats(f.familyId, { straightThrough: true, questionsAsked: 0 });
    await foldRecordIntoStats(f.familyId, { straightThrough: false, questionsAsked: 2 });
    await foldRecordIntoStats(f.familyId, { straightThrough: true, questionsAsked: 1 });
    const s = (await getFamily(f.familyId))!.stats;
    expect(s.records).toBe(3);
    expect(s.stp).toBeCloseTo(2 / 3, 10);
    expect(s.questionsPerDoc).toBeCloseTo(1, 10);
  });

  it('lists families in creation order', async () => {
    await createFamily('A', SCHEMA);
    await createFamily('B', SCHEMA);
    const names = (await listFamilies()).map((f) => f.name);
    expect(names).toEqual(['A', 'B']);
  });
});

describe('record store laws (append-only)', () => {
  it('append computes the review lane from value statuses', async () => {
    const f = await createFamily('Fam', SCHEMA, { status: 'active' });
    const rec = await appendRecord({
      familyId: f.familyId,
      docGraphId: 'g1',
      values: { f_name: confirmedValue('ANNA'), f_total: reviewValue('12.00') },
      sourceFile: sourceFile(),
      phash64: 'a'.repeat(16),
    });
    expect(rec.review.open).toBe(true);
    expect(rec.review.openFieldIds).toEqual(['f_total']);
  });

  it('STP accounting: fully-attested + zero questions = straight-through', async () => {
    const f = await createFamily('Fam', SCHEMA, { status: 'active' });
    await appendRecord({
      familyId: f.familyId,
      docGraphId: 'g1',
      values: { f_name: confirmedValue('A'), f_total: confirmedValue('1.00') },
      sourceFile: sourceFile('b'.repeat(64)),
      phash64: 'b'.repeat(16),
    });
    await appendRecord({
      familyId: f.familyId,
      docGraphId: 'g2',
      values: { f_name: reviewValue('B'), f_total: confirmedValue('2.00') },
      sourceFile: sourceFile('c'.repeat(64)),
      phash64: 'c'.repeat(16),
    });
    const s = (await getFamily(f.familyId))!.stats;
    expect(s.records).toBe(2);
    expect(s.stp).toBeCloseTo(0.5, 10);
  });

  it('sha256 exact-duplicate lookup hits', async () => {
    const f = await createFamily('Fam', SCHEMA, { status: 'active' });
    const sha = 'd'.repeat(64);
    await appendRecord({
      familyId: f.familyId, docGraphId: 'g', values: { f_name: confirmedValue('A'), f_total: confirmedValue('1') },
      sourceFile: sourceFile(sha), phash64: 'a'.repeat(16),
    });
    expect((await findBySha256(sha)).length).toBe(1);
    expect((await findBySha256('e'.repeat(64))).length).toBe(0);
  });

  it('near-duplicate lookup respects the Hamming ≤ 8 law', async () => {
    const f = await createFamily('Fam', SCHEMA, { status: 'active' });
    const base = '0'.repeat(16);
    const near = '0'.repeat(15) + '3'; // 2 bits away
    const far = 'f'.repeat(16); // 64 bits away
    await appendRecord({
      familyId: f.familyId, docGraphId: 'g', values: { f_name: confirmedValue('A'), f_total: confirmedValue('1') },
      sourceFile: sourceFile(), phash64: base,
    });
    expect((await findNearDuplicates(f.familyId, near)).length).toBe(1);
    expect((await findNearDuplicates(f.familyId, far)).length).toBe(0);
  });

  it('user edit is the only mutation: value confirmed, review closes', async () => {
    const f = await createFamily('Fam', SCHEMA, { status: 'active' });
    const rec = await appendRecord({
      familyId: f.familyId, docGraphId: 'g',
      values: { f_name: confirmedValue('A'), f_total: reviewValue('12.00') },
      sourceFile: sourceFile(), phash64: 'a'.repeat(16),
    });
    const edited = await applyUserEdit(rec.recordId, 'f_total', '13.00');
    expect(edited.values.f_total.value).toBe('13.00');
    expect(edited.values.f_total.status).toBe('confirmed');
    expect(edited.review.open).toBe(false);
    // Accept-as-is path
    const rec2 = await appendRecord({
      familyId: f.familyId, docGraphId: 'g2',
      values: { f_name: confirmedValue('A'), f_total: reviewValue('9.00') },
      sourceFile: sourceFile('f'.repeat(64)), phash64: 'b'.repeat(16),
    });
    const accepted = await acceptFieldUserAction(rec2.recordId, 'f_total');
    expect(accepted.values.f_total.value).toBe('9.00');
    expect(accepted.values.f_total.status).toBe('confirmed');
  });

  it('records list per family in append order', async () => {
    const f = await createFamily('Fam', SCHEMA, { status: 'active' });
    for (let i = 0; i < 3; i++) {
      await appendRecord({
        familyId: f.familyId, docGraphId: `g${i}`,
        values: { f_name: confirmedValue(`P${i}`), f_total: confirmedValue('1') },
        sourceFile: sourceFile(String(i).repeat(64).slice(0, 64)), phash64: 'a'.repeat(16),
      });
    }
    const rows = await listRecordsByFamily(f.familyId);
    expect(rows.map((r) => r.values.f_name.value)).toEqual(['P0', 'P1', 'P2']);
  });
});

describe('hamming64', () => {
  it('is 0 for identical, 64 for inverse, symmetric', () => {
    expect(hamming64('0123456789abcdef', '0123456789abcdef')).toBe(0);
    expect(hamming64('0'.repeat(16), 'f'.repeat(16))).toBe(64);
    expect(hamming64('00000000000000ff', '0'.repeat(16))).toBe(8);
    expect(hamming64('abc', '0'.repeat(16))).toBe(64); // malformed = max distance
  });
});
