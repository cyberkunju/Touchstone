/**
 * Crypto-gate wiring tests (P7.3 §2.1) — sealed at rest, both shapes
 * readable forever, locked reads are typed answers.
 */

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deriveMasterKey } from '../security/workspace-crypto';
import {
  WorkspaceLocked,
  isSealed,
  sealForStore,
  setWorkspaceKey,
  unsealFromStore,
} from './crypto-gate';
import { getAllDocGraphs, getDocGraph, saveDocGraph } from './db';
import { __closeWorkspaceDb } from './workspace-db';
import type { DocGraph } from '../core/types';

const FAST = 1_000;

function graph(id: string): DocGraph {
  return {
    id,
    documentId: id,
    schemaVersion: '1',
    metadata: { sourceFileType: 'image' },
    pages: [],
    nodes: [],
    edges: [],
    evidence: [],
    hypotheses: [],
    validations: [],
    provenance: [],
    quality: {},
    createdAt: 0,
    updatedAt: 0,
  } as unknown as DocGraph;
}

async function key(): Promise<CryptoKey> {
  return deriveMasterKey('test-passphrase', new Uint8Array(16), FAST);
}

beforeEach(() => {
  indexedDB.deleteDatabase('docgraph-engine-db');
  __closeWorkspaceDb();
  setWorkspaceKey(null);
});

afterEach(() => {
  setWorkspaceKey(null);
  __closeWorkspaceDb();
});

describe('crypto gate primitives', () => {
  it('pass-through when unprotected', async () => {
    const g = { id: 'a', secret: 'value' };
    const stored = await sealForStore(g, 'id');
    expect(stored).toBe(g);
    expect(await unsealFromStore(stored)).toBe(g);
  });

  it('seals when a key is active; id stays cleartext; content does not', async () => {
    setWorkspaceKey(await key(), 'k1');
    const stored = await sealForStore({ id: 'doc-1', secret: 'PASSPORT L898902C3' }, 'id');
    expect(isSealed(stored)).toBe(true);
    if (isSealed(stored)) {
      expect(stored.id).toBe('doc-1');
      expect(JSON.stringify(stored)).not.toContain('L898902C3');
    }
  });

  it('locked workspace reading a sealed record throws the typed answer', async () => {
    setWorkspaceKey(await key(), 'k1');
    const stored = await sealForStore({ id: 'doc-1', secret: 'x' }, 'id');
    setWorkspaceKey(null); // locked
    await expect(unsealFromStore(stored)).rejects.toThrow(WorkspaceLocked);
  });
});

describe('db wiring end-to-end', () => {
  it('protected save → unprotected-looking store → unlocked read round-trips', async () => {
    setWorkspaceKey(await key(), 'k1');
    await saveDocGraph(graph('g1'));
    const back = await getDocGraph('g1');
    expect(back?.documentId).toBe('g1');
  });

  it('MIXED WORKSPACE: pre-protection plaintext + sealed records both load', async () => {
    await saveDocGraph(graph('plain-1'));           // unprotected write
    setWorkspaceKey(await key(), 'k1');
    await saveDocGraph(graph('sealed-1'));          // protected write
    const all = await getAllDocGraphs();
    expect(new Set(all.map((g) => g.documentId))).toEqual(new Set(['plain-1', 'sealed-1']));
  });

  it('lock after write ⇒ sealed record read throws WorkspaceLocked', async () => {
    setWorkspaceKey(await key(), 'k1');
    await saveDocGraph(graph('g2'));
    setWorkspaceKey(null);
    await expect(getDocGraph('g2')).rejects.toThrow(WorkspaceLocked);
  });
});
