# PII Handling — Edge DocGraph Engine

**Purpose:** Define how personally identifiable information and sensitive financial/legal document data are handled, retained, redacted, exported, deleted, and logged.

---

## 1. PII definition for this project

Treat as PII or sensitive personal data:

- names
- dates of birth
- passport/ID numbers
- nationality
- address
- phone/email
- MRZ lines
- barcode/QR identity payloads
- portrait photos
- signatures
- bank account numbers
- tax IDs
- financial transactions
- invoices tied to individuals
- government document fields
- user corrections containing real values

---

## 2. Sensitive document categories

High-risk categories:

- passport
- national ID
- driver license
- visa
- bank statement
- tax document
- medical/insurance document
- legal form
- payroll/income document
- signed contract
- invoice with personal or business identifiers

Default classification:

```text
sensitive or highly_sensitive
```

---

## 3. PII handling principle

```text
Extract only what is needed.
Store only when needed.
Show status and evidence.
Do not upload by default.
Do not log raw PII.
Delete on user request.
Redact before training/export.
```

---

## 4. PII in DocGraph

DocGraph may contain PII in:

- EvidenceRecord payloads
- TextLineNode metadata
- FieldHypothesis value
- ValidationResult details
- MRZNode parsed data
- BarcodeNode payload
- CorrectionNode before/after
- crop artifact references

Therefore DocGraph is sensitive.

---

## 5. PII in TemplateGraph

TemplateGraph should not store variable PII values.

Allowed:

- field label
- field type
- field ROI
- validators
- anchors based on stable labels/layout

Not allowed as reusable values:

- name
- ID number
- DOB
- MRZ parsed values
- invoice number
- account number
- address
- phone/email
- QR payload

---

## 6. PII in logs

Forbidden:

- raw field values
- OCR lines
- MRZ
- barcode payloads
- image/crop data
- document filename if sensitive
- user names/emails
- full error payloads containing values

Allowed:

- status counts
- duration
- model version
- error code
- field type without value
- page count
- memory warning

---

## 7. PII retention

Retention options:

### Session only

Data deleted when document/session closed.

Recommended for highly sensitive documents.

### Persist until user deletes

User explicitly saves project/document.

### Template only

Save layout/template but discard document values.

### Export only

User exports, then local project can be deleted.

---

## 8. Deletion requirements

User must be able to delete:

- current document
- all document artifacts
- DocGraph
- OCR text
- crops
- correction history
- template
- model cache
- export packages generated in app storage
- all local data

Message should be accurate:

```text
This removes local app records and artifacts. It may not remove copies you exported or backups made by your system.
```

---

## 9. Redaction rules

Redact before training/debug sharing:

- replace names with fake names
- replace IDs with fake IDs
- replace dates with safe fake dates
- remove/blur portraits
- remove/replace signatures
- remove/replace MRZ lines
- remove QR/barcode payloads
- blur financial values
- remove addresses/phone/email

Preserve useful metadata:

- field type
- region
- status
- validator type
- error category
- quality tag

---

## 10. PII in exports

Export must include warnings.

For form export:

- include status,
- allow confirmed-only export,
- warn for unresolved critical fields.

For evidence/debug/training export:

- strong warning,
- redaction recommended,
- optional encryption,
- manifest sensitivity flag.

---

## 11. PII in UI

UI must avoid accidental exposure where possible:

- do not show raw sensitive values in logs/debug panels by default,
- allow hiding sensitive values if privacy mode exists,
- do not auto-copy sensitive values to clipboard,
- do not auto-open QR URLs,
- do not show sensitive toast messages that persist unnecessarily.

---

## 12. PII in browser memory

While processing, PII exists in memory.

Mitigations:

- avoid unnecessary copies,
- do not store raw values in global debug objects,
- clear temporary buffers,
- decrypt on demand,
- close documents when done.

Limitations:

- JS memory cannot guarantee secure wipe,
- active browser/device compromise can access data.

---

## 13. Consent and training

No user PII may be used for public training without explicit export and review.

Correction export must say:

```text
This package may include sensitive values. Redact before sharing.
```

No automatic dataset upload.

---

## 14. PII handling checklist

- [ ] classification assigned
- [ ] storage policy chosen
- [ ] encryption enabled if configured
- [ ] no raw logs
- [ ] export warning exists
- [ ] deletion path exists
- [ ] redaction path exists
- [ ] template excludes variable values
- [ ] correction export opt-in only

---

## 15. Legal note

This document is an engineering privacy specification, not legal advice. If the product is distributed commercially or used in regulated environments, obtain legal review for applicable privacy/data protection obligations.

---

## 16. Final rule

PII must be treated as highly sensitive from upload to deletion. The system should be useful without becoming a hidden collector of identity, financial, or legal document data.
