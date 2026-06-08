# Local Encryption — Edge DocGraph Engine

**Purpose:** Define local encryption strategy using Web Crypto, AES-GCM, key derivation, encrypted records, rotation, limitations, and implementation rules.

---

## 1. Encryption goal

Local encryption reduces risk if local storage files are copied, browser profile data is exposed, or export packages are stored insecurely.

It is not a complete defense against:

- active malware,
- compromised browser,
- malicious extensions,
- attacker with unlocked app/session,
- user exporting unencrypted data,
- XSS that can access decrypted data during runtime.

Be honest about this.

---

## 2. Recommended algorithm

Use authenticated encryption.

Recommended:

```text
AES-GCM
```

Reason:

- provides confidentiality and integrity,
- supported by Web Crypto,
- suitable for encrypting local records/blobs when used correctly.

---

## 3. Web Crypto API

Browser implementation should use Web Crypto `SubtleCrypto`.

Do not implement custom cryptography.

Core APIs:

- `crypto.subtle.generateKey`
- `crypto.subtle.importKey`
- `crypto.subtle.deriveKey`
- `crypto.subtle.encrypt`
- `crypto.subtle.decrypt`
- `crypto.getRandomValues`

---

## 4. Encryption scope

Encrypt where feasible:

- DocGraph records
- TemplateGraph records
- correction events
- sensitive OCR records
- MRZ records
- barcode payloads
- visual crop artifacts
- export packages
- private benchmark data

May not need encryption:

- public model files
- public model manifest
- non-sensitive runtime cache
- app static assets

---

## 5. Key models

### 5.1 App-managed local key

Key generated and stored locally.

Pros:

- transparent UX,
- protects against casual file inspection.

Cons:

- if attacker/browser can access storage, key may also be accessible.

### 5.2 User passphrase-derived key

User provides passphrase.

Pros:

- stronger protection when app is closed,
- key not stored directly.

Cons:

- UX friction,
- forgotten passphrase means data loss,
- weaker if passphrase poor.

### 5.3 OS keychain integration in Tauri

Use platform keychain through backend where possible.

Pros:

- stronger native integration,
- better serious-app path.

Cons:

- platform-specific implementation.

Recommended:

```text
Browser prototype: app-managed or optional passphrase.
Tauri serious v1: OS keychain-backed key storage.
```

---

## 6. Key derivation

For passphrase-derived keys, use a KDF.

Browser options:

- PBKDF2 via Web Crypto
- Argon2 via vetted WASM library if selected later

Initial browser baseline:

```text
PBKDF2-HMAC-SHA-256 with high iteration count + random salt
```

KDF parameters must be versioned.

```ts
type KdfParams = {
  algorithm: "PBKDF2";
  hash: "SHA-256";
  iterations: number;
  salt: string;
};
```

Do not hardcode weak parameters forever. Benchmark device impact.

---

## 7. IV/nonce rules

AES-GCM requires unique IV per key.

Rules:

- use random 96-bit IV for each encryption,
- never reuse IV with same key,
- store IV with ciphertext,
- generate with `crypto.getRandomValues`.

Example:

```ts
const iv = crypto.getRandomValues(new Uint8Array(12));
```

---

## 8. Encrypted record format

```ts
type EncryptedRecord = {
  encrypted: true;
  encryptionVersion: "local-aes-gcm-v1";

  keyId: string;

  algorithm: {
    name: "AES-GCM";
    iv: string;
    tagLength: 128;
  };

  kdf?: KdfParams;

  aad?: string;

  ciphertext: string;

  createdAt: number;
};
```

Use base64url for binary fields if stored in JSON.

---

## 9. Additional authenticated data

Use AAD to bind ciphertext to context.

Examples:

- record ID
- record type
- schema version
- document ID

This prevents encrypted payload being swapped between contexts without detection.

---

## 10. Blob encryption

For OPFS blobs/crops:

```text
read blob/stream
  → encrypt bytes
  → write encrypted blob
```

Metadata stored in IndexedDB:

```json
{
  "artifactId": "crop_123",
  "encrypted": true,
  "opfsPath": "/documents/doc_1/crops/crop_123.enc",
  "encryptionRecordId": "enc_123"
}
```

Large streaming encryption may need careful implementation; avoid loading huge files if possible.

---

## 11. Decryption lifecycle

Decrypt only when needed.

Rules:

- decrypt on demand,
- keep plaintext in memory briefly,
- do not log plaintext,
- clear references after use,
- do not store decrypted copies,
- do not put plaintext into long-lived global state unnecessarily.

---

## 12. Key rotation

Support future rotation.

Metadata:

```ts
type KeyMetadata = {
  keyId: string;
  createdAt: number;
  algorithm: string;
  status: "active" | "retired" | "revoked";
};
```

Rotation flow:

```text
load encrypted record
  → decrypt with old key
  → encrypt with new key
  → update keyId
```

Do not require v1 full automation, but design format for it.

---

## 13. Export encryption

Export packages can be:

- plaintext with warning,
- encrypted with passphrase,
- redacted.

Recommended default for sensitive evidence package:

```text
offer encrypted export
```

Export encryption must include manifest and integrity.

---

## 14. Error handling

Decryption failures:

- wrong passphrase
- corrupted record
- wrong key
- tampering
- incompatible encryption version

User messages:

```text
This encrypted local record could not be opened. The key may be missing or the data may be corrupted.
```

Do not expose cryptographic internals in normal UI.

---

## 15. Limitations

Local encryption does not protect against:

- XSS after data is decrypted,
- malicious extension reading page memory,
- compromised OS,
- app code compromise,
- user exporting plaintext,
- screenshots,
- clipboard leaks.

Therefore encryption must be paired with:

- CSP,
- no third-party scripts,
- strict export controls,
- XSS prevention,
- local-only architecture.

---

## 16. Testing

Test:

- encrypt/decrypt round trip
- wrong key fails
- modified ciphertext fails
- modified AAD fails
- IV uniqueness
- KDF parameter migration
- export encryption
- large blob encryption
- corrupted record handling
- key rotation path

---

## 17. Implementation rules

1. Use Web Crypto / OS keychain, not custom crypto.
2. Use AES-GCM with unique random IV.
3. Use authenticated encryption.
4. Version encrypted record format.
5. Do not log plaintext.
6. Decrypt on demand.
7. Warn before plaintext export.
8. Do not claim encryption solves all threats.

---

## 18. References

- Web Crypto API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API
- SubtleCrypto encrypt(): https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt
- AesGcmParams: https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams
- Web Cryptography Level 2: https://www.w3.org/TR/webcrypto-2/

---

## 19. Final rule

Local encryption is a defense layer, not the privacy model itself. The privacy model is local-only processing plus minimization, strict storage rules, export controls, and encryption for sensitive at-rest records.
