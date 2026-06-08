# Privacy Model — Edge DocGraph Engine

**Purpose:** Define the local-only privacy promise, what never leaves the device, what is stored locally, what users explicitly control, and how privacy is communicated.

---

## 1. Core privacy promise

The product promise is:

```text
Your document is processed locally on your device.
The app does not upload documents, images, OCR text, extracted fields, visual assets, templates, or corrections by default.
```

This is not a marketing sentence. It is an architecture rule.

---

## 2. Privacy model in one sentence

```text
All document intelligence happens locally; users explicitly control storage, template learning, export, and deletion.
```

---

## 3. Data that must never leave the device by default

The following must not be sent to a server by default:

- original uploaded documents
- rendered PDF pages
- scanned images
- normalized page images
- extracted OCR text
- field labels and values
- identity document data
- MRZ lines and parsed MRZ fields
- QR/barcode payloads
- invoice totals and tax IDs
- bank statement values
- portrait photos
- signatures
- stamps/seals
- table cells
- visual crops
- DocGraph records
- TemplateGraph records
- user corrections
- validator results
- debug packages
- model inputs/outputs
- local performance logs that include sensitive values

No background upload.  
No hidden telemetry.  
No silent training upload.

---

## 4. Local processing boundary

Processing happens within:

```text
browser runtime / Tauri local app
  → Web Workers / local backend
  → local model inference
  → local OCR
  → local parser/validator
  → local storage
```

Allowed network use by default:

- loading app assets
- loading model files from trusted project release source if not already packaged/cached
- checking for application/model updates only if designed and disclosed

Not allowed:

- uploading user documents for OCR
- sending crops to cloud vision APIs
- sending OCR text to analytics
- sending error logs with extracted values
- sending template data
- sending user corrections

---

## 5. Local storage classes

The app may store locally:

- model cache
- document cache if user permits/session requires
- rendered pages
- crop artifacts
- DocGraph
- TemplateGraph
- user corrections
- local performance metrics
- local benchmark data
- export packages created by user

Storage must be clear, inspectable, and deletable.

---

## 6. User-controlled actions

User must explicitly control:

- saving document data
- saving template memory
- updating a template
- creating a template version
- exporting form values
- exporting evidence package
- exporting training/correction package
- importing template packages
- deleting document data
- deleting templates
- clearing model cache
- clearing all local data

No irreversible privacy-sensitive operation should happen silently.

---

## 7. Template privacy

Templates may not contain current document values by design, but they can still reveal:

- document type
- field labels
- layout
- issuer/vendor-like structure
- visual anchor descriptors
- table schema
- expected QR/MRZ regions
- sensitive business process structure

Therefore:

```text
Templates are sensitive local data.
```

Template export requires warning.

---

## 8. Correction privacy

Corrections can contain highly sensitive data.

Examples:

- corrected passport number
- corrected date of birth
- corrected invoice total
- corrected bank balance
- corrected signature crop
- corrected MRZ field

Corrections are local by default. They become training data only through explicit user export.

---

## 9. Privacy UX requirements

The UI should state:

```text
Processing locally. Your document is not uploaded.
```

For template save:

```text
This saves the layout and extraction rules, not this document’s private values.
```

For evidence export:

```text
This export may include document text, crops, and sensitive extracted data. Export only if safe.
```

For training export:

```text
Training exports may include sensitive data unless redacted. Review before sharing.
```

---

## 10. What the app must not claim

Do not claim:

- “military-grade encryption”
- “100% secure”
- “impossible to leak”
- “private even if browser/device is compromised”
- “documents cannot be accessed by malware”
- “templates reveal nothing”

Correct statement:

```text
The app is designed for local processing and no default document upload. Device, browser, extension, malware, and user-export risks still exist.
```

---

## 11. Privacy threat boundaries

The app can control:

- whether it uploads data
- what it stores
- how it encrypts local records
- whether it logs sensitive values
- whether templates/export packages contain sensitive data
- whether external scripts run

The app cannot fully control:

- compromised device
- malicious browser extension
- OS-level malware
- user manually sharing exports
- browser storage being cleared
- screenshots taken outside app
- other apps with local file access in Tauri if permissions allow

Document this honestly.

---

## 12. Privacy-by-default settings

Defaults:

| Feature | Default |
|---|---|
| cloud OCR | off / not implemented |
| telemetry | off / not implemented |
| document upload | off / not implemented |
| template learning | user choice |
| correction export | user choice |
| evidence export | user choice |
| local encryption | enabled where configured |
| model cache | allowed |
| debug logs with values | disabled |
| URL auto-open from QR | disabled |

---

## 13. Data minimization

Store only what is needed.

Examples:

- Store crop references, not repeated raw image bytes.
- Store template regions, not private values.
- Store performance timings without OCR text.
- Store validator status without raw payloads when possible.
- Store redacted correction exports by default.

---

## 14. Retention model

User should be able to choose:

- session-only processing
- save document locally
- save template only
- save full DocGraph for audit
- delete after export
- clear all documents/templates

Default for sensitive docs should lean conservative.

---

## 15. Privacy acceptance checklist

- [ ] No document upload path in core pipeline
- [ ] No OCR text telemetry
- [ ] No third-party analytics by default
- [ ] Template save explains what is learned
- [ ] Export warns about sensitive data
- [ ] Delete controls exist
- [ ] Debug logs avoid values
- [ ] Sensitive storage classified
- [ ] Threat model reviewed
- [ ] Open-source examples are synthetic/redacted

---

## 16. References

- Web Crypto API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API
- OWASP Threat Modeling Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html
- OWASP XSS Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html

---

## 17. Final rule

Privacy is not an optional feature. The local-only promise must be enforced by architecture, storage design, logging policy, export controls, template rules, and open-source hygiene.
