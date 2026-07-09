/**
 * Workspace encryption gate (P7.3 §2.1 wiring) — the ONE seam between the
 * storage layer and the AES-GCM engine.
 *
 * Laws:
 *  - When a key is active, every docGraph write is sealed (envelope replaces
 *    plaintext; the record id stays cleartext — it's a random ULID, not
 *    content).
 *  - Reads handle BOTH shapes forever: records written before protection
 *    was enabled stay readable (migration on write, never a big-bang).
 *  - A LOCKED workspace (keyring exists, key not presented) reading a sealed
 *    record throws WorkspaceLocked — a typed answer the UI turns into the
 *    unlock prompt, never a crash.
 */

import type { CryptoEnvelope } from '../security/workspace-crypto';
import { decryptObject, encryptObject } from '../security/workspace-crypto';

export class WorkspaceLocked extends Error {
  constructor() {
    super('workspace is protected — unlock to read records');
    this.name = 'WorkspaceLocked';
  }
}

/** Shape of a sealed record at rest (id kept cleartext for the keyPath). */
export interface SealedRecord {
  id: string;
  __sealed: CryptoEnvelope;
}

let activeKey: CryptoKey | null = null;
let activeKeyId: string | null = null;

/** Set by the WorkspaceProtection flow on unlock/enable; null on lock. */
export function setWorkspaceKey(key: CryptoKey | null, keyId: string | null = null): void {
  activeKey = key;
  activeKeyId = keyId;
}

export function isProtectionActive(): boolean {
  return activeKey !== null;
}

export function isSealed(value: unknown): value is SealedRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__sealed' in value &&
    typeof (value as SealedRecord).__sealed === 'object'
  );
}

/** Seal for storage when protection is active; pass through otherwise. */
export async function sealForStore<T extends { [k: string]: unknown }>(
  value: T,
  idField: string,
): Promise<T | SealedRecord> {
  if (!activeKey) return value;
  const envelope = await encryptObject(activeKey, activeKeyId ?? 'active', value);
  return { id: String(value[idField]), __sealed: envelope };
}

/** Unseal after load; plaintext passes through (pre-protection records). */
export async function unsealFromStore<T>(stored: T | SealedRecord | undefined): Promise<T | undefined> {
  if (stored === undefined) return undefined;
  if (!isSealed(stored)) return stored as T;
  if (!activeKey) throw new WorkspaceLocked();
  return decryptObject<T>(activeKey, stored.__sealed);
}
