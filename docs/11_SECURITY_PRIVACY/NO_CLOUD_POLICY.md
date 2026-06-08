# No Cloud Policy — Edge DocGraph Engine

**Purpose:** Define the strict rule that document processing, OCR, extraction, templates, corrections, and training data are local-only by default with no telemetry by default.

---

## 1. Policy statement

```text
The core product must work without uploading user documents or extracted document data to the cloud.
```

No cloud OCR.  
No cloud vision model.  
No cloud LLM extraction.  
No default telemetry containing document data.  
No silent training upload.

---

## 2. What is prohibited by default

The app must not send:

- original files
- page images
- crops
- OCR text
- field labels/values
- MRZ
- barcode/QR payloads
- tables
- signatures/photos
- DocGraph
- TemplateGraph
- corrections
- debug evidence
- private template names
- training exports
- screenshots

to any remote service by default.

---

## 3. Allowed network use

Allowed if transparent and non-document:

- downloading app assets
- downloading trusted model files
- checking model/app manifest
- opening documentation links by user action
- optional update checks without document data

Model downloads must not include document content.

---

## 4. Telemetry default

Default:

```text
telemetry disabled / not implemented
```

If telemetry is ever added, it must be:

- opt-in,
- value-free,
- document-free,
- crop-free,
- template-free,
- correction-free,
- clearly documented,
- easy to disable.

Allowed telemetry candidates only with opt-in:

- app version
- model version
- task duration bucket
- runtime mode
- non-sensitive error code
- device class bucket

Forbidden telemetry:

- OCR text
- field values
- image pixels
- MRZ
- QR payload
- document filenames
- template labels
- user correction values

---

## 5. Model update policy

Model update checks may fetch:

- manifest
- model metadata
- model files

Model update request must not include:

- document data
- extracted text
- template data
- user correction data

---

## 6. External APIs

Core pipeline must not depend on:

- Google Vision
- cloud OCR
- cloud LLM/VLM
- hosted document AI
- remote barcode parsing
- remote table extraction
- remote face/image APIs

Research/dev experiments using remote APIs must not be part of default product and must not use real user documents without explicit consent.

---

## 7. User-triggered export is not cloud processing

If user exports a file and manually uploads it elsewhere, that is outside default app processing.

The app must warn when export is sensitive.

Do not auto-upload export packages.

---

## 8. Documentation wording

Use:

```text
Processed locally by default.
```

```text
No document upload is required for extraction.
```

Avoid:

```text
Impossible to leak.
```

```text
Completely anonymous.
```

```text
Cloud-grade secure.
```

---

## 9. Development policy

Developers must not:

- add cloud OCR for convenience,
- add analytics SDK by default,
- add remote logging that includes errors with document values,
- use real user docs in remote debugging,
- upload sample documents to issue trackers,
- paste OCR text into external tools without redaction.

---

## 10. Testing no-cloud behavior

Tests should verify:

- processing works offline after models available,
- no network call during document extraction,
- no OCR text in network logs,
- no document image upload,
- no remote model inference call,
- export requires user action,
- telemetry disabled by default.

Use browser network interception tests where possible.

---

## 11. Offline behavior

If app and models are cached/packaged:

```text
upload → process → correct → save template → export
```

should work offline.

If a required model is missing:

```text
Required local model is not available offline. Connect once to download it or use the packaged desktop app.
```

---

## 12. Tauri policy

Tauri app must preserve no-cloud policy.

Native backend must not:

- upload documents,
- phone home with sensitive logs,
- bypass frontend privacy controls,
- send crash reports containing document data.

Crash reporting, if ever added, must be opt-in and redacted.

---

## 13. Exceptions

Any exception to no-cloud policy requires:

- explicit user opt-in,
- clear explanation,
- data preview,
- purpose limitation,
- no default enablement,
- security/privacy review,
- decision log entry.

For current project direction, avoid exceptions.

---

## 14. No-cloud checklist

- [ ] extraction works offline after model availability
- [ ] no cloud OCR dependency
- [ ] no cloud LLM/VLM dependency
- [ ] telemetry disabled by default
- [ ] network calls audited
- [ ] model downloads documented
- [ ] export is user-triggered
- [ ] debug logs local only
- [ ] no external scripts that inspect documents
- [ ] Tauri backend obeys same rule

---

## 15. Final rule

The no-cloud policy is a core product differentiator and trust boundary. If a feature requires sending document content to a server, it is not part of the default product.
