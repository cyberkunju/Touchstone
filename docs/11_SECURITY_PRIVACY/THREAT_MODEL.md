# Threat Model — Edge DocGraph Engine

**Purpose:** Identify and mitigate threats: browser threats, malicious PDFs, XSS, model tampering, local storage risks, unsafe exports, malicious imports, and open-source supply-chain risks.

---

## 1. Threat modeling method

Use the OWASP-style four-question framing:

1. What are we working on?
2. What can go wrong?
3. What are we going to do about it?
4. Did we do a good job?

Threat modeling is continuous. Update this document when architecture changes.

---

## 2. System overview

Assets:

- uploaded documents
- page images
- OCR text
- extracted fields
- MRZ/barcode payloads
- visual crops
- DocGraph
- TemplateGraph
- user corrections
- local encryption keys
- model files
- export packages
- source code
- build/release artifacts

Trust boundaries:

```text
user file system
  → browser/Tauri app
  → workers/local backend
  → local storage
  → exports/imports
  → open-source repository/release pipeline
```

---

## 3. Primary security goals

1. No default document upload.
2. No sensitive telemetry.
3. No XSS access to document data.
4. Safe handling of malicious files.
5. Safe local storage.
6. Safe export/import.
7. Model integrity.
8. Open-source repo contains no secrets/private data.
9. User can delete local data.
10. App does not silently weaken privacy for convenience.

---

## 4. Threat: XSS reads document data

### Scenario

OCR text, MRZ payload, or image crop is inserted into DOM unsafely. Attacker-controlled document text becomes script.

### Impact

High. Sensitive data can be read/exfiltrated.

### Mitigations

- never insert OCR/document text as raw HTML,
- use framework escaping,
- sanitize if rich HTML unavoidable,
- strict CSP,
- no third-party scripts,
- Trusted Types if adopted,
- encode by output context,
- security tests with malicious document text.

---

## 5. Threat: malicious PDF exploits parser/rendering

### Scenario

User uploads hostile PDF designed to exploit PDF renderer or trigger heavy memory/CPU.

### Impact

High.

### Mitigations

- use maintained PDF renderer,
- render in worker when possible,
- disable/ignore scripts and external resources,
- limit page count/size,
- timeouts/cancellation,
- memory limits,
- Tauri/native sandbox strategy if possible,
- fuzz/negative tests.

---

## 6. Threat: model tampering

### Scenario

Model file in cache or download path is modified.

### Impact

Medium to high. Model could behave incorrectly or exploit runtime bug.

### Mitigations

- manifest with SHA-256,
- checksum before load,
- HTTPS for downloads,
- signed release artifacts if possible,
- version pinning,
- do not load arbitrary user models by default,
- clear corrupted cache.

---

## 7. Threat: local storage exposure

### Scenario

Attacker accesses browser profile/app data.

### Impact

High if documents/crops/DocGraph stored plaintext.

### Mitigations

- data minimization,
- encrypt sensitive records,
- session-only mode,
- deletion controls,
- avoid raw logs,
- classify data,
- warn about device compromise limits.

---

## 8. Threat: malicious browser extension

### Scenario

Extension reads page DOM, canvas, IndexedDB, or clipboard.

### Impact

High.

### Mitigations

Limited from web app side.

- minimize plaintext lifetime,
- avoid third-party scripts,
- educate user,
- Tauri app path reduces extension risk,
- do not claim protection against compromised browser/extensions.

---

## 9. Threat: unsafe export leaks PII

### Scenario

User exports evidence/training package with real passport, MRZ, signature.

### Impact

High.

### Mitigations

- export warnings,
- redaction options,
- encrypted export option,
- status-preserving export,
- no automatic upload,
- privacy metadata in package,
- confirmed-only export option.

---

## 10. Threat: malicious import package

### Scenario

Imported template/training package contains path traversal, oversized files, executable content, or corrupt schema.

### Impact

Medium/high.

### Mitigations

- manifest validation,
- schema validation,
- size limits,
- path traversal prevention,
- store imported templates as draft,
- no code execution,
- reject unknown executable content.

---

## 11. Threat: QR/barcode URL auto-open

### Scenario

QR payload contains malicious URL and app opens it.

### Impact

Medium/high.

### Mitigations

- never auto-open URLs,
- display as escaped text,
- user must explicitly copy/open,
- safety warning,
- no network fetch of payload.

---

## 12. Threat: telemetry leakage

### Scenario

Performance/error logs include OCR text, document name, MRZ, field values.

### Impact

High.

### Mitigations

- telemetry off by default,
- no cloud telemetry by default,
- log only non-sensitive metrics,
- redaction tests,
- developer-mode local logs only,
- never log raw values.

---

## 13. Threat: template leaks private layout

### Scenario

User exports template or commits template that reveals private business/identity document layout.

### Impact

Medium/high.

### Mitigations

- classify templates as sensitive,
- export warning,
- remove private thumbnails by default,
- no variable values in templates,
- imported/exported template metadata.

---

## 14. Threat: silent wrong extraction

### Scenario

System outputs wrong passport number/amount as confirmed.

### Impact

High product integrity/security risk.

### Mitigations

- verifier,
- validators,
- confidence model,
- silent error policy,
- status-preserving export,
- cross-field validation,
- review queue,
- benchmark gates.

---

## 15. Threat: open-source repo leaks secrets/data

### Scenario

Developer commits private samples, API keys, real documents, private templates.

### Impact

High.

### Mitigations

- `.gitignore` for private_data/user_exports,
- secret scanning,
- data review checklist,
- synthetic-only examples,
- no real docs in repo,
- pre-commit checks,
- release audit.

---

## 16. Threat: dependency/supply-chain compromise

### Scenario

NPM/WASM/model dependency is compromised.

### Impact

High.

### Mitigations

- lockfiles,
- dependency review,
- minimal dependencies,
- checksums for models,
- signed releases if possible,
- no dynamic remote scripts,
- CSP,
- regular security updates.

---

## 17. Threat: denial of service by huge files

### Scenario

Huge PDF/image causes memory crash.

### Impact

Medium.

### Mitigations

- file size limits,
- page count limits,
- render scale caps,
- task cancellation,
- memory warnings,
- one-page-at-a-time processing,
- user message.

---

## 18. Risk register

```ts
type ThreatRisk = {
  id: string;
  threat: string;
  likelihood: "low" | "medium" | "high";
  impact: "low" | "medium" | "high" | "critical";
  mitigations: string[];
  status: "open" | "mitigated" | "accepted";
};
```

Maintain a living risk register in security review.

---

## 19. Security tests

Required tests:

- XSS payload in OCR text
- malicious file names
- malicious QR URL
- path traversal import
- oversized import
- corrupted model checksum
- encrypted record tamper
- export warning flows
- no sensitive logs
- CSP blocks inline script
- no document upload in pipeline

---

## 20. References

- OWASP Threat Modeling Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html
- OWASP XSS Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
- OWASP DOM-based XSS Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/DOM_based_XSS_Prevention_Cheat_Sheet.html

---

## 21. Final rule

Threat modeling is not a one-time document. Every new parser, model, export path, import path, storage object, or dependency must be checked against this threat model before release.
