# 10 — Security & Privacy

**Purpose:** Define the local-only privacy model, data classification, PII handling, local encryption, threat model, export/import safety, and open-source hygiene. Privacy is enforced by architecture, not by promises.

---

## 1. Privacy model

Promise: **all document intelligence happens locally; the user explicitly controls storage, template learning, export, and deletion.** No document content leaves the device by default; no telemetry with document data; no hidden training upload.

Never sent to a server by default: original files, rendered/normalized pages, OCR text, field values, identity data, MRZ, QR/barcode payloads, totals/financials, photos, signatures, stamps, table cells, DocGraphs, TemplateGraphs, corrections, validator results, debug packages, model inputs/outputs.

Allowed network use (transparent, document-free): app assets; trusted/checksummed model files if not packaged; optional update checks without document data.

Honest wording — say "Processed locally by default / No document upload is required." Never claim "impossible to leak / 100% secure / military-grade." Be explicit that device compromise, malicious extensions, OS malware, user exports, and backups are outside app control.

## 2. No-cloud policy

The core pipeline must work without uploading user documents. No cloud OCR/VLM, no remote barcode/table/face APIs. If a required local model is missing offline, show a clear message — never upload to compensate. Telemetry is **off by default**; if ever added it must be opt-in, document-free, and value-free (app version, model version, duration bucket, runtime mode, non-sensitive error code, device class only). User-triggered export of a file is not cloud processing, but the app warns when an export is sensitive and never auto-uploads.

## 3. Data classification

Every stored object has a `Sensitivity` (`public|internal|private|sensitive|highly_sensitive`) and a retention policy (`session_only|persist_until_user_deletes|template_memory|export_package|cache_evictable|not_persisted`).

| Object | Classification |
|---|---|
| uploaded file, rendered/normalized page | highly_sensitive |
| OCR text, field value | sensitive / highly_sensitive |
| MRZ lines, portrait/signature crop, QR payload | highly_sensitive |
| DocGraph | sensitive / highly_sensitive |
| TemplateGraph | sensitive (reveals layout/labels/issuer) |
| user correction | sensitive / highly_sensitive |
| model cache | public/internal |
| runtime timings (value-free) | internal |
| synthetic samples | public |

Derived data inherits source sensitivity unless transformed (synthetic/redacted/aggregated) and reviewed. Logging by class: public/internal allowed (no identifiers); sensitive → no raw values; highly_sensitive → never raw.

## 4. PII handling

Treat as PII: names, DOB, ID/passport numbers, nationality, address, phone/email, MRZ, identity barcode payloads, photos, signatures, account numbers, tax IDs, financial transactions, corrections containing real values. Rule: extract only what's needed; store only when needed; show status + evidence; never upload; never log raw PII; delete on request; redact before any training/export.

Retention options: session-only (recommended for highly sensitive), persist-until-delete, template-only (discard values), export-then-delete. Deletion must remove IndexedDB records, OPFS artifacts, crops, DocGraph, corrections, and (if chosen) templates and locally generated exports — with accurate wording ("removes local app records; may not remove copies you exported or system backups"). TemplateGraphs must never store variable PII values.

## 5. Local encryption

Reduces risk if local storage is copied; it does **not** defend against active malware, malicious extensions, a compromised browser, runtime XSS after decryption, or user-exported plaintext — state this honestly.

- Use **WebCrypto AES-GCM** (never custom crypto). Unique random 96-bit IV per encryption; authenticated; bind context via AAD (record id/type/schema/document id).
- Encrypt where feasible: DocGraph, TemplateGraph, corrections, sensitive OCR/MRZ/barcode records, crops, export packages. Keys: app-managed or passphrase-derived (PBKDF2-HMAC-SHA-256, high iterations, random salt, versioned params) in browser; OS keychain via Tauri for serious v1.
- Versioned encrypted-record format (`encryptionVersion`, `keyId`, `iv`, `ciphertext`, optional `kdf`, `aad`); decrypt on demand; never log plaintext; design for key rotation.

## 6. Threat model (key threats → mitigations)

- **XSS reads document data** → never inject OCR/document text as HTML; framework escaping; strict CSP; no third-party scripts; Trusted Types if adopted; XSS tests with malicious document text.
- **Malicious PDF** → maintained renderer in a worker; ignore scripts/remote resources; page/size limits; timeouts; sandbox.
- **Model tampering** → manifest + sha256 verify before load; HTTPS/trusted source; pin versions; no arbitrary user models by default.
- **Local storage exposure** → minimize data; encrypt sensitive; session-only mode; deletion; no raw logs.
- **Malicious browser extension** → limited from web app; minimize plaintext lifetime; Tauri reduces risk; don't claim protection.
- **Unsafe export** → warnings, redaction, encryption option, status-preserving, no auto-upload.
- **Malicious import** → validate manifest/schema; size limits; reject path traversal/executables; import templates as draft; no code execution.
- **QR URL auto-open** → never auto-open; escape; user-initiated only.
- **Telemetry leakage** → off by default; value-free; redaction tests.
- **Repo leaks** → `.gitignore` private dirs; secret + PII scans; synthetic-only examples.
- **Silent wrong extraction** → the entire Verifier + silent-error policy ([06_VERIFICATION.md](06_VERIFICATION.md)).

Maintain a living risk register. Security regression tests are mandatory (XSS payload, path traversal, oversized import, checksum failure, encrypted-record tamper, no-cloud network check, export warnings).

## 7. Export / import safety

Exports preserve status and warn on sensitive content; offer redaction and passphrase encryption; include a manifest (`packageType`, `containsSensitiveData`, `redactionStatus`, files + sha256). Redaction replaces values with synthetic equivalents, removes portraits/signatures/MRZ/payloads, keeps geometry/types/status. Imports are untrusted: validate manifest + schema, enforce size limits, reject path traversal (`../`, absolute paths, drive letters, null bytes) and executables, verify checksums, store imported templates as **draft**, never execute code, never auto-load imported models.

## 8. Open-source hygiene

Public repo must contain **no** real documents, real PII, real MRZ/payloads, real signatures/photos, private templates, correction exports, secrets, or keys. Use synthetic/redacted/public-license examples only. `.gitignore`: `private_data/ user_exports/ private_benchmarks/ local_templates/ debug_exports/ correction_exports/ *.env* *.key *.pem *.sqlite *.log`. CI runs secret + PII + forbidden-path scans. Issue/PR templates warn against uploading real documents. Ship `LICENSE`, `THIRD_PARTY_NOTICES`, `MODEL_LICENSES`, `SECURITY.md`. Note Ultralytics YOLO11 is AGPL-3.0-or-Enterprise — if shipped, assume AGPL obligations or obtain Enterprise licensing; legal review before release.

## 9. Invariants

1. No document upload path exists in the core pipeline.
2. No telemetry contains document data; off by default.
3. No raw OCR/PII/MRZ/payload in logs.
4. Sensitive records encrypted at rest where feasible; never custom crypto.
5. Templates store no variable values; treated as sensitive.
6. Exports preserve status and warn; imports are validated and untrusted.
7. Deletion is available and honestly described.
8. Security settings are never weakened to make demos easier.
