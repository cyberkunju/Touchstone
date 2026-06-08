import { openDB, IDBPDatabase } from 'idb';
import { DocGraph, TemplateGraph } from '../core/types';

const DB_NAME = 'docgraph-engine-db';
const DB_VERSION = 1;

export interface ProcessingJob {
  id: string;
  documentName: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

let dbInstance: IDBPDatabase | null = null;

/**
 * Initializes the IndexedDB database with object stores.
 */
export async function getDb(): Promise<IDBPDatabase> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Store for processed document graphs
      if (!db.objectStoreNames.contains('docGraphs')) {
        db.createObjectStore('docGraphs', { keyPath: 'id' });
      }

      // Store for learned TemplateGraphs
      if (!db.objectStoreNames.contains('templates')) {
        const templateStore = db.createObjectStore('templates', { keyPath: 'id' });
        templateStore.createIndex('familyId', 'familyId', { unique: false });
        templateStore.createIndex('docType', 'docType', { unique: false });
      }

      // Store for orchestration job states
      if (!db.objectStoreNames.contains('jobs')) {
        db.createObjectStore('jobs', { keyPath: 'id' });
      }
    },
  });

  return dbInstance;
}

/* --- DOCGRAPH DATABASE ACTIONS --- */

export async function saveDocGraph(graph: DocGraph): Promise<void> {
  const db = await getDb();
  await db.put('docGraphs', graph);
}

export async function getDocGraph(id: string): Promise<DocGraph | undefined> {
  const db = await getDb();
  return db.get('docGraphs', id);
}

export async function deleteDocGraph(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('docGraphs', id);
}

export async function getAllDocGraphs(): Promise<DocGraph[]> {
  const db = await getDb();
  return db.getAll('docGraphs');
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
