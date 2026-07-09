import { IDBPDatabase } from 'idb';
import { DocGraph, TemplateGraph } from '../core/types';
import { getWorkspaceDb } from './workspace-db';
import { sealForStore, unsealFromStore } from './crypto-gate';

export interface ProcessingJob {
  id: string;
  documentName: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Legacy accessor — DELEGATES to the workspace database (P2 integration).
 *
 * workspace-db.ts owns the single connection and the v1→v2 migration
 * (adds-only, idempotent, tested against a real populated v1 db). Keeping
 * this thin alias preserves every existing call site while guaranteeing
 * exactly ONE open(name, version) exists in the app.
 */
export async function getDb(): Promise<IDBPDatabase> {
  return getWorkspaceDb();
}

/* --- DOCGRAPH DATABASE ACTIONS --- */

export async function saveDocGraph(graph: DocGraph): Promise<void> {
  const db = await getDb();
  // P7.3 §2.1: sealed at rest when "Protect this workspace" is active;
  // plaintext otherwise. Reads accept both shapes forever. The store's
  // keyPath is 'id' — the sealed record keeps it cleartext (random ULID).
  await db.put('docGraphs', await sealForStore(graph as unknown as Record<string, unknown>, 'id') as unknown as DocGraph);
}

export async function getDocGraph(id: string): Promise<DocGraph | undefined> {
  const db = await getDb();
  return unsealFromStore<DocGraph>(await db.get('docGraphs', id));
}

export async function deleteDocGraph(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('docGraphs', id);
}

export async function getAllDocGraphs(): Promise<DocGraph[]> {
  const db = await getDb();
  const all = await db.getAll('docGraphs');
  return Promise.all(all.map((g) => unsealFromStore<DocGraph>(g) as Promise<DocGraph>));
}

/* --- TEMPLATEGRAPH DATABASE ACTIONS --- */

export async function saveTemplate(template: TemplateGraph): Promise<void> {
  const db = await getDb();
  await db.put('templates', template);
}

export async function getTemplate(id: string): Promise<TemplateGraph | undefined> {
  const db = await getDb();
  return db.get('templates', id);
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('templates', id);
}

export async function getAllTemplates(): Promise<TemplateGraph[]> {
  const db = await getDb();
  return db.getAll('templates');
}

export async function getTemplatesByType(docType: string): Promise<TemplateGraph[]> {
  const db = await getDb();
  return db.getAllFromIndex('templates', 'docType', docType);
}

/* --- JOB QUEUE ACTIONS --- */

export async function saveJob(job: ProcessingJob): Promise<void> {
  const db = await getDb();
  await db.put('jobs', job);
}

export async function getJob(id: string): Promise<ProcessingJob | undefined> {
  const db = await getDb();
  return db.get('jobs', id);
}

export async function getAllJobs(): Promise<ProcessingJob[]> {
  const db = await getDb();
  return db.getAll('jobs');
}

export async function deleteJob(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('jobs', id);
}
