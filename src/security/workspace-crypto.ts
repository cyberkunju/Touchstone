/**
 * P7.3 §2.1 — Workspace encryption at rest ("Protect this workspace").
 *
 * WebCrypto AES-GCM-256; per-installation master key derived from a user
 * passphrase via PBKDF2-SHA-256 (600k iterations default; the keyring
 * records the count so future installs can raise it without breaking old
 * workspaces). OPTIONAL by design — a forced passphrase harms a single-user
 * local product; default remains OS-user-level trust.
 *
 * Envelope: per-object random 96-bit IV; key id + algorithm version in the
 * header. GCM's auth tag makes tampering LOUD (decrypt throws) — integrity
 * and confidentiality in one primitive.
 *
 * Export remains plaintext by definition (explicit user act, warned in UX).
 */

export const KDF_ITERATIONS_DEFAULT = 600_000;

export interface KeyringRecord {
  version: 1;
  keyId: string;
  kdf: 'PBKDF2-SHA-256';
  /** Recorded per keyring — the upgrade path for future hardening. */
  iterations: number;
  saltB64: string;
  /** Known-plaintext envelope: decrypts ⟺ the passphrase is correct. */
  verifier: CryptoEnvelope;
  createdAt: string;
}

export interface CryptoEnvelope {
  v: 1;
  keyId: string;
  alg: 'AES-GCM-256';
  ivB64: string;
  ctB64: string;
}

const VERIFIER_PLAINTEXT = 'docutract-keyring-verifier-v1';

const te = new TextEncoder();
const td = new TextDecoder();

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** PBKDF2-SHA-256 → non-extractable AES-GCM-256 key. */
export async function deriveMasterKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = KDF_ITERATIONS_DEFAULT,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', te.encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable — the key never leaves the crypto boundary
    ['encrypt', 'decrypt'],
  );
}

/** Encrypt any JSON-serializable object into a sealed envelope. */
export async function encryptObject(
  key: CryptoKey,
  keyId: string,
  obj: unknown,
): Promise<CryptoEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit, per spec
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    te.encode(JSON.stringify(obj)),
  );
  return { v: 1, keyId, alg: 'AES-GCM-256', ivB64: toB64(iv), ctB64: toB64(ct) };
}

/** Decrypt an envelope. THROWS on tamper (GCM auth) or wrong key — loud. */
export async function decryptObject<T>(key: CryptoKey, envelope: CryptoEnvelope): Promise<T> {
  if (envelope.v !== 1 || envelope.alg !== 'AES-GCM-256') {
    throw new Error(`unsupported envelope: v=${envelope.v} alg=${envelope.alg}`);
  }
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(envelope.ivB64) as BufferSource },
    key,
    fromB64(envelope.ctB64) as BufferSource,
  );
  return JSON.parse(td.decode(pt)) as T;
}

/** Create a keyring for a new passphrase (the "Protect this workspace" act). */
export async function createKeyring(
  passphrase: string,
  iterations: number = KDF_ITERATIONS_DEFAULT,
): Promise<KeyringRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyId = toB64(crypto.getRandomValues(new Uint8Array(8)));
  const key = await deriveMasterKey(passphrase, salt, iterations);
  const verifier = await encryptObject(key, keyId, VERIFIER_PLAINTEXT);
  return {
    version: 1,
    keyId,
    kdf: 'PBKDF2-SHA-256',
    iterations,
    saltB64: toB64(salt),
    verifier,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Unlock: derive from the presented passphrase and PROVE it by decrypting
 * the verifier. Returns null on a wrong passphrase — callers show retry UX,
 * never a stack trace. (There is NO recovery path — the warning UX says so.)
 */
export async function unlockKeyring(
  passphrase: string,
  keyring: KeyringRecord,
): Promise<CryptoKey | null> {
  const key = await deriveMasterKey(passphrase, fromB64(keyring.saltB64), keyring.iterations);
  try {
    const check = await decryptObject<string>(key, keyring.verifier);
    return check === VERIFIER_PLAINTEXT ? key : null;
  } catch {
    return null;
  }
}
