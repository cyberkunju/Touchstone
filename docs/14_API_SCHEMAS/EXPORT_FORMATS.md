# Export Formats — API and Schema Reference

**Purpose:** Define supported export formats: JSON, CSV, visual assets, evidence packages, template exports, training/correction exports, and import safety.

---

## 1. Export principle

Exports must preserve uncertainty.

The system must never export uncertain values as clean truth unless the user explicitly chooses a mode that includes or excludes statuses.

Default export:

```text
JSON with values, statuses, reasons, evidence references, and validation references.
```

---

## 2. Export types

```ts
type ExportType =
  | "form_json"
  | "form_csv"
  | "confirmed_only_json"
  | "confirmed_only_csv"
  | "assets_zip"
  | "evidence_package"
  | "template_package"
  | "training_correction_package"
  | "debug_package";
```

---

## 3. Export manifest

Every package export should include a manifest.

```json
{
  "packageVersion": "1.0.0",
  "packageType": "form_json",
  "createdAt": 1780000000000,
  "appVersion": "0.1.0",
  "containsSensitiveData": true,
  "redactionStatus": "none",
  "files": [
    {
      "path": "form.json",
      "type": "application/json",
      "sha256": "optional",
      "sizeBytes": 1234
    }
  ]
}
```

---

## 4. Form JSON export

Recommended default.

```json
{
  "schemaVersion": "form-export-v1",
  "documentId": "doc_001",
  "exportedAt": 1780000000000,
  "reviewSummary": {
    "confirmed": 10,
    "needsReview": 1,
    "missing": 0,
    "conflict": 0,
    "invalid": 0,
    "exportReady": true
  },
  "fields": [
    {
      "id": "field_passport_number",
      "label": "Passport Number",
      "type": "id_number",
      "value": "A1234567",
      "status": "confirmed",
      "confidence": 0.94,
      "reasons": ["OCR confidence high", "MRZ cross-check passed"],
      "evidenceIds": ["ev_ocr_passport_number", "ev_mrz_parse"],
      "validationIds": ["val_mrz_doc_number_match"]
    }
  ]
}
```

---

## 5. Confirmed-only export

Includes only fields with:

```text
status = confirmed
```

Must include a summary of excluded fields.

```json
{
  "schemaVersion": "confirmed-only-export-v1",
  "fields": [],
  "excluded": {
    "needsReview": 2,
    "missing": 1,
    "conflict": 1,
    "invalid": 0
  }
}
```

---

## 6. CSV export

CSV is lossy. It cannot represent evidence well.

Required columns:

```text
field_id,label,type,value,status,confidence,reasons
```

Optional columns:

```text
page,source_box,evidence_ids,validation_ids
```

CSV must not be the only export when auditability matters.

---

## 7. Asset export

Assets package:

```text
assets/
  photo_field.png
  signature_field.png
  stamp_field.png
manifest.json
```

Manifest entry:

```json
{
  "fieldId": "field_signature",
  "assetType": "signature",
  "status": "needs_review",
  "sourcePageId": "page_1",
  "boxNorm": [0.5, 0.7, 0.8, 0.78],
  "file": "assets/signature_field.png"
}
```

Warn before exporting portraits/signatures/stamps.

---

## 8. Evidence package export

Contains:

- form JSON
- DocGraph subset
- evidence records
- validation records
- crops if included
- model/runtime metadata

Default should be redacted.

Warning:

```text
This evidence package may include sensitive document text, crops, signatures, photos, MRZ, and barcode payloads.
```

---

## 9. Template export

Template package:

```text
template.json
manifest.json
descriptors/
thumbnails/ optional
```

Rules:

- no current document values,
- field labels and layout included,
- warning required,
- imported templates become draft by default.

---

## 10. Training/correction export

Contains:

- correction events
- graph snippets
- before/after values only if user allows,
- redaction metadata,
- optional crops/masks.

Default:

```text
redacted or synthetic replacement recommended
```

---

## 11. Import safety

All imports are untrusted.

Rules:

- validate manifest,
- validate schema,
- enforce size limits,
- reject path traversal,
- reject executable content,
- verify checksums if present,
- import templates as draft,
- never auto-run imported code.

---

## 12. Export readiness

Before export, compute:

```ts
type ExportReadiness = {
  exportReady: boolean;
  criticalUnresolved: number;
  warnings: string[];
  recommendedMode: "with_statuses" | "confirmed_only" | "review_first";
};
```

If critical unresolved fields exist, show warning.

---

## 13. Final rule

Exports must not destroy trust metadata. Status, reasons, evidence references, and validation references are part of the data, not optional decoration.
