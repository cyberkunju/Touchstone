/**
 * Workspace database (P2.1) — the v1→v2 IndexedDB migration + typed access.
 *
 * MIGRATION LAW (Documentation/11 §1): v1 stores (docGraphs, templates,
 * jobs) are kept UNTOUCHED — v2 only ADDS stores and indexes. The upgrade
 * callback is idempotent by construction: every create is guarded by an
 * existence check, so any interrupted upgrade or repeat invocation converges
 * to the same schema. No data is ever read-modified-written during upgrade —
 * there is nothing a crash mid-migration can corrupt.
 *
 * This module OWNS the database connection for v2+. The legacy db.ts
 * delegates here after integration so exactly one open(version) exists.
 */

import { openDB, type IDBPDatabase } from 'idb';
import type { BenchRun, ConfusionPrior, DocRecord, Family, FormatPrior } from '../workspace/types';

export const WORKSPACE_DB_NAME = 'docgraph-engine-db';
export const WORKSPACE_DB_VERSION = 2;

/** Applies the FULL schema (v1 + v2 stores), idempotently. Exported for
 *  direct testing of migration idempotency. */
export function applySchema(db: IDBPDatabase): void {
  // --- v1 stores (unchanged; created here too so fresh installs work) ---
  if (!db.objectStoreNames.contains('docGraphs')) {
    db.createObjectStore('docGraphs', { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains('templates')) {
    const s = db.createObjectStore('templates', { keyPath: 'id' });
    s.createIndex('familyId', 'familyId', { unique: false });
    s.createIndex('docType', 'docType', { unique: false });
  }
  if (!db.objectStoreNames.contains('jobs')) {
    db.createObjectStore('jobs', { keyPath: 'id' });
  }

  // --- v2 stores (Documentation/11 §1) ---
  if (!db.objectStoreNames.contains('families')) {
    db.createObjectStore('families', { keyPath: 'familyId' });
  }
  if (!db.objectStoreNames.contains('records')) {
    const s = db.createObjectStore('records', { keyPath: 'recordId' });
    s.createIndex('familyId', 'familyId', { unique: false });
    s.createIndex('sha256', 'sourceFile.sha256', { unique: false });
  }
  if (!db.objectStoreNames.contains('priors')) {
    db.createObjectStore('priors'); // out-of-line string keys
  }
  if (!db.objectStoreNames.contains('benchruns')) {
    const s = db.createObjectStore('benchruns', { keyPath: 'runId' });
    s.createIndex('createdAt', 'createdAt', { unique: false });
  }
}

let instance: IDBPDatabase | null = null;

/** Opens (and migrates) the workspace database. Single shared connection. */
export async function getWorkspaceDb(): Promise<IDBPDatabase> {
  if (instance) return instance;
  instance = await openDB(WORKSPACE_DB_NAME, WORKSPACE_DB_VERSION, {
    upgrade(db) {
      applySchema(db);
    },
  });
  return instance;
}

/** Test/HMR hook: closes and forgets the shared connection. */
export function __closeWorkspaceDb(): void {
  instance?.close();
  instance = null;
}

/* ------------------------------ typed helpers ------------------------------ */
/* Thin, total-function wrappers. Store modules build the real APIs on top. */

export async function idbGet<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  return (await getWorkspaceDb()).get(store, key) as Promise<T | undefined>;
}
export async function idbPut(store: string, value: unknown, key?: IDBValidKey): Promise<void> {
  await (await getWorkspaceDb()).put(store, value, key);
}
export async function idbDelete(store: string, key: IDBValidKey): Promise<void> {
  await (await getWorkspaceDb()).delete(store, key);
}
export async function idbGetAll<T>(store: string): Promise<T[]> {
  return (await getWorkspaceDb()).getAll(store) as Promise<T[]>;
}
export async function idbGetAllFromIndex<T>(
  store: string,
  index: string,
  query: IDBValidKey,
): Promise<T[]> {
  return (await getWorkspaceDb()).getAllFromIndex(store, index, query) as Promise<T[]>;
}

/* ------------------------------- prior keys -------------------------------- */

export const PRIOR_KEY_CONFUSION = 'confusion';
export const priorKeyFamilyFormat = (familyId: string): string => `family:${familyId}:format`;

export async function getConfusionPrior(): Promise<ConfusionPrior | undefined> {
  return idbGet<ConfusionPrior>('priors', PRIOR_KEY_CONFUSION);
}
export async function getFormatPrior(familyId: string): Promise<FormatPrior | undefined> {
  return idbGet<FormatPrior>('priors', priorKeyFamilyFormat(familyId));
}
export async function putBenchRun(run: BenchRun): Promise<void> {
  return idbPut('benchruns', run);
}

// Re-exported store value types for consumers that only need shapes.
export type { DocRecord, Family };
