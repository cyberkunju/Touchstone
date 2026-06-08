# Security Policy

## 1. Supported versions

Until the project reaches stable release, security fixes target the latest main branch and latest tagged release.

A formal supported-version table should be added after public release.

---

## 2. Reporting a vulnerability

Please report security issues privately.

Do not open a public issue for:

- XSS,
- document data leakage,
- no-cloud policy bypass,
- unsafe import/export,
- path traversal,
- local file access bug,
- model tampering,
- sensitive logs,
- real document exposure,
- encryption/key handling issue.

Recommended report contents:

- affected version/commit,
- environment,
- reproduction steps using synthetic data,
- impact,
- suggested fix if known.

---

## 3. Sensitive document exposure

If a real document, passport, bank statement, signature, MRZ, or private invoice is accidentally posted:

1. notify maintainers immediately,
2. do not quote/repost it,
3. maintainers should remove/redact it,
4. rotate any exposed secrets if relevant.

---

## 4. Security scope

In scope:

- app code vulnerabilities,
- XSS,
- import/export safety,
- local storage privacy bugs,
- no-cloud policy violations,
- unsafe model/package loading,
- Tauri command vulnerabilities,
- sensitive logs,
- schema validation bypass,
- path traversal.

Out of scope unless caused by this project:

- compromised user device,
- malicious browser extension,
- OS malware,
- user manually sharing exported sensitive files,
- third-party sites opened manually by user.

---

## 5. No-cloud policy as security boundary

A bug that uploads document content, OCR text, field values, crops, corrections, templates, MRZ, or barcode payloads without explicit user action is a security/privacy vulnerability.

---

## 6. Disclosure

Please allow maintainers time to investigate and fix before public disclosure.

The project should add a dedicated security contact before public launch.

---

## 7. Security development rules

Maintainers will treat as release blockers:

- critical silent-error safety bugs,
- document upload without consent,
- XSS exposing document data,
- unsafe import path traversal,
- raw PII logging,
- encryption tamper not detected,
- Tauri command exposing arbitrary filesystem access.

---

## 8. Final note

This project handles sensitive documents. Security reports are taken seriously, and reports should use synthetic or redacted data whenever possible.
