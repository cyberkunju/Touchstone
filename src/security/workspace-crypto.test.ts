/**
 * P7.3 §2.1 tests — encryption is loud, tamper dies, wrong passphrase is an
 * answer (null), never an exception.
 *
 * Tests derive with LOW iteration counts (speed); the 600k default is
 * asserted as a value — the KDF math is identical at any count.
 */

import { describe, expect, it } from 'vitest';
import {
  KDF_ITERATIONS_DEFAULT,
  createKeyring,
  decryptObject,
  deriveMasterKey,
  encryptObject,
  unlockKeyring,
} from './workspace-crypto';

const FAST = 1_000; // test-speed iterations

describe('workspace-crypto (AES-GCM-256 + PBKDF2)', () => {
  it('defaults to 600k iterations (spec floor)', () => {
    expect(KDF_ITERATIONS_DEFAULT).toBeGreaterThanOrEqual(600_000);
  });

  it('round-trips objects through sealed envelopes', async () => {
    const keyring = await createKeyring('correct horse battery staple', FAST);
    const key = await unlockKeyring('correct horse battery staple', keyring);
    expect(key).not.toBeNull();

    const record = { docType: 'passport', fields: { passport_number: 'L898902C3' }, n: 42 };
    const env = await encryptObject(key!, keyring.keyId, record);
    expect(env.alg).toBe('AES-GCM-256');
    expect(env.keyId).toBe(keyring.keyId);
    // Ciphertext must not leak plaintext.
    expect(atob(env.ctB64)).not.toContain('L898902C3');

    const back = await decryptObject<typeof record>(key!, env);
    expect(back).toEqual(record);
  });

  it('wrong passphrase returns null — an answer, not an exception', async () => {
    const keyring = await createKeyring('right', FAST);
    expect(await unlockKeyring('wrong', keyring)).toBeNull();
    expect(await unlockKeyring('right', keyring)).not.toBeNull();
  });

  it('TAMPER DIES LOUDLY: any ciphertext bit-flip throws on decrypt', async () => {
    const keyring = await createKeyring('pw', FAST);
    const key = (await unlockKeyring('pw', keyring))!;
    const env = await encryptObject(key, keyring.keyId, { amount: '540.00' });

    const bytes = Uint8Array.from(atob(env.ctB64), (c) => c.charCodeAt(0));
    bytes[Math.floor(bytes.length / 2)] ^= 0x01;
    const tampered = { ...env, ctB64: btoa(String.fromCharCode(...bytes)) };

    await expect(decryptObject(key, tampered)).rejects.toThrow();
  });

  it('IVs are unique per envelope (96-bit random, never reused)', async () => {
    const keyring = await createKeyring('pw', FAST);
    const key = (await unlockKeyring('pw', keyring))!;
    const ivs = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const env = await encryptObject(key, keyring.keyId, { i });
      expect(ivs.has(env.ivB64)).toBe(false);
      ivs.add(env.ivB64);
      expect(atob(env.ivB64).length).toBe(12);
    }
  });

  it('keyring records the iteration count (upgrade path)', async () => {
    const keyring = await createKeyring('pw', FAST);
    expect(keyring.iterations).toBe(FAST);
    expect(keyring.kdf).toBe('PBKDF2-SHA-256');
    // Unlock honors the RECORDED count, not the current default.
    expect(await unlockKeyring('pw', keyring)).not.toBeNull();
  });

  it('unsupported envelope versions refuse loudly', async () => {
    const keyring = await createKeyring('pw', FAST);
    const key = (await unlockKeyring('pw', keyring))!;
    const env = await encryptObject(key, keyring.keyId, {});
    await expect(
      decryptObject(key, { ...env, v: 2 as unknown as 1 }),
    ).rejects.toThrow(/unsupported envelope/);
  });

  it('keys are non-extractable (never leave the crypto boundary)', async () => {
    const key = await deriveMasterKey('pw', new Uint8Array(16), FAST);
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  });
});
