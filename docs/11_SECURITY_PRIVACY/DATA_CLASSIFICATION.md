# Data Classification — Edge DocGraph Engine

**Purpose:** Classify all data handled by the system: PII, sensitive documents, extracted assets, templates, logs, models, training exports, and operational metadata.

---

## 1. Why classification is needed

The app handles passports, invoices, forms, bank statements, signatures, photos, MRZ, QR payloads, and user corrections.

Without classification, developers will accidentally:

- log sensitive values,
- export unsafe data,
- store unnecessary crops,
- commit real samples,
- treat templates as harmless,
- leak correction data into training.

Every data object must have a classification.

---

## 2. Classification levels

```ts
type DataSensitivity =
  | "public"
  | "internal"
  | "private"
  | "sensitive"
  | "highly_sensitive";
```

---

## 3. Public

Safe to publish.

Examples:

- synthetic demo documents
- public documentation
- public model cards without private data
- open-source code
- fake examples
- public benchmark summaries without samples

Rules:

- can be committed,
- can be shared,
- must still avoid secrets.

---

## 4. Internal

Project operational data that is not sensitive user data but not necessarily public.

Examples:

- non-sensitive performance metrics
- aggregate benchmark counts
- model version metadata
- non-sensitive runtime capability logs
- internal QA notes

Rules:

- no field values,
- no document images,
- no user identifiers unless consented/needed.

---

## 5. Private

User/project data that should remain local or controlled but may not be legally sensitive.

Examples:

- template names
- document filenames
- local settings
- local runtime preferences
- local model cache metadata
- non-sensitive local notes

Rules:

- local by default,
- export only by user action,
- avoid telemetry.

---

## 6. Sensitive

Data that can reveal personal, financial, legal, business, or document information.

Examples:

- OCR text
- field values
- names
- dates
- invoice amounts
- addresses
- phone/email
- document labels
- table cells
- barcode payloads
- template layouts
- correction events
- validation details containing values

Rules:

- no default network transmission,
- no default logs,
- encrypt at rest where configured,
- explicit export warning,
- redact for training export.

---

## 7. Highly sensitive

Data with identity, biometric-like, financial, legal, or authentication risk.

Examples:

- passports and IDs
- MRZ lines
- passport/ID numbers
- date of birth
- bank account numbers
- financial statements
- portrait photos
- signatures
- official stamps/seals
- QR/barcode identity payloads
- tax IDs
- evidence crops containing identity/financial data
- unredacted correction exports

Rules:

- local only,
- strongest deletion controls,
- avoid persistent storage unless needed/user allows,
- encrypt where possible,
- export only with explicit warning,
- never use in public dataset unless synthetic/redacted.

---

## 8. Data object classification table

| Data object | Classification | Notes |
|---|---|---|
| Original uploaded file | highly_sensitive | Default local only |
| Rendered page image | highly_sensitive | May contain full document |
| Normalized page image | highly_sensitive | Same as rendered page |
| OCR text | sensitive/highly_sensitive | Depends content |
| Field value | sensitive/highly_sensitive | Depends field type |
| MRZ raw lines | highly_sensitive | Identity data |
| QR/barcode payload | sensitive/highly_sensitive | Payload dependent |
| Portrait crop | highly_sensitive | Identity asset |
| Signature crop | highly_sensitive | Legal/identity asset |
| Stamp/seal crop | sensitive/highly_sensitive | Could reveal authority |
| Table cells | sensitive/highly_sensitive | Financial/PII possible |
| DocGraph | sensitive/highly_sensitive | Contains graph and evidence |
| TemplateGraph | sensitive | Layout/labels reveal info |
| User correction | sensitive/highly_sensitive | Often contains true values |
| Export package | sensitive/highly_sensitive | Depends contents |
| Model cache | public/internal | Unless user-trained private model |
| Runtime timings | internal | If no values |
| Error logs | internal/sensitive | Must not include values |
| Synthetic samples | public | If truly fake |
| Redacted samples | public/internal | Needs review |

---

## 9. Data labels in code

Every stored record should include sensitivity where feasible.

```ts
type ClassifiedRecord = {
  id: string;
  sensitivity: DataSensitivity;
  containsPii: boolean;
  containsDocumentImage: boolean;
  containsExtractedText: boolean;
  retentionPolicy: RetentionPolicy;
};
```

---

## 10. Retention policies

```ts
type RetentionPolicy =
  | "session_only"
  | "persist_until_user_deletes"
  | "template_memory"
  | "export_package"
  | "cache_evictable"
  | "not_persisted";
```

Examples:

- model cache → cache_evictable
- uploaded passport image → session_only or persist_until_user_deletes
- template → template_memory
- exported training package → export_package

---

## 11. Logging rules by classification

| Classification | Logging |
|---|---|
| public | allowed |
| internal | allowed if no identifiers |
| private | avoid unless necessary |
| sensitive | no raw values |
| highly_sensitive | never raw log |

Allowed log example:

```json
{
  "task": "ocr",
  "durationMs": 430,
  "fieldStatusCounts": { "confirmed": 12, "needs_review": 3 }
}
```

Forbidden:

```json
{
  "passportNumber": "A1234567",
  "mrz": "P<..."
}
```

---

## 12. Export rules by classification

| Classification | Export policy |
|---|---|
| public | allowed |
| internal | controlled |
| private | user explicit |
| sensitive | warning + user explicit |
| highly_sensitive | strong warning + redaction recommended |

---

## 13. Training rules by classification

Only these are allowed for public/open-source training:

- public synthetic
- public licensed samples
- redacted samples approved for release

Not allowed:

- private user docs
- unredacted corrections
- real signatures/photos
- raw MRZ
- raw QR identity payloads
- private templates

---

## 14. Template classification

Templates are usually `sensitive`.

Why:

- field labels reveal document type/process,
- layout may identify issuer/vendor,
- validators reveal expected fields,
- visual descriptors may reveal logos/emblems,
- template family names may reveal customer/project.

Export templates only with warning.

---

## 15. Derived data classification

Derived data inherits sensitivity from source unless proven safe.

Examples:

- OCR from passport image → highly_sensitive
- crop of DOB field → highly_sensitive
- hash/descriptor of logo → sensitive
- aggregate latency with no values → internal

---

## 16. Declassification

Data can be downgraded only by explicit transformation:

- synthetic generation
- redaction
- aggregation
- removal of identifiers
- human review

Example:

```text
passport image → not safe
redacted synthetic replacement image → maybe public after review
```

---

## 17. Classification checklist

For every new stored object, ask:

- Does it contain document image pixels?
- Does it contain extracted text?
- Does it contain PII?
- Does it contain financial/legal data?
- Does it contain identity assets?
- Can it identify a document template?
- Can it be safely logged?
- Can it be exported?
- Should it be encrypted?
- When should it be deleted?

---

## 18. Final rule

Treat document data as sensitive until proven otherwise. Derived data is not automatically safe. Templates, corrections, and logs can leak sensitive information even when original documents are not stored.
