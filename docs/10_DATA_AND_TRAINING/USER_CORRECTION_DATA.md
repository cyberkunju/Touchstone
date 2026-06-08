# User Correction Data — Edge DocGraph Engine

**Purpose:** Define how user corrections are stored locally, how they update DocGraph/TemplateGraph, how they can optionally be exported, and how privacy is protected.

---

## 1. Correction data role

User corrections are the most valuable learning signal.

They tell the system:

- which labels were wrong,
- which values were wrong,
- which regions were wrong,
- which field types were wrong,
- which table cells were wrong,
- which assets were cropped wrong,
- which template decision was correct.

Corrections power template memory and future datasets.

---

## 2. Local-first rule

Corrections are stored locally by default.

They are not uploaded.

They are used for:

- current DocGraph correction,
- TemplateGraph learning,
- local benchmark/debug,
- optional user-controlled export.

---

## 3. Correction event schema

```ts
type CorrectionEvent = {
  id: string;
  documentId: string;
  docGraphId: string;
  targetId: string;

  correctionKind:
    | "label_edit"
    | "value_edit"
    | "type_change"
    | "region_edit"
    | "asset_crop_edit"
    | "asset_type_change"
    | "table_cell_edit"
    | "table_structure_edit"
    | "checkbox_state_edit"
    | "field_reject"
    | "field_add"
    | "merge_fields"
    | "split_field"
    | "conflict_resolution"
    | "template_decision";

  before: unknown;
  after: unknown;

  evidenceIdsBefore: string[];
  evidenceIdsAfter: string[];

  createdAt: number;

  privacy: {
    containsSensitiveValue: boolean;
    exportAllowedByUser: boolean;
    redactionStatus: "not_redacted" | "redacted" | "synthetic" | "not_exportable";
  };
};
```

---

## 4. Correction evidence

Every correction also creates DocGraph EvidenceRecord:

```ts
type UserCorrectionEvidencePayload = {
  correctionKind: string;
  targetId: string;
  before: unknown;
  after: unknown;
};
```

Original model evidence is preserved.

---

## 5. Correction storage

Store in:

```text
IndexedDB:
  correctionEvents
  correctionIndexes

OPFS:
  correction crops if needed
  before/after asset previews if user permits
```

Do not store unnecessary private crops.

---

## 6. What corrections update

### 6.1 DocGraph

Immediately updates:

- FieldHypothesis
- GraphNode
- GraphEdge
- ValidationResult
- confidence/status
- provenance

### 6.2 TemplateGraph

Only updates when user explicitly chooses:

- save as template
- update template
- create new version

### 6.3 Training dataset

Only becomes training data if user exports and privacy rules allow.

---

## 7. Correction kinds

### label_edit

User renames label.

Useful for:

- aliases
- canonical labels
- field discovery improvement

### value_edit

User corrects value.

Sensitive. Do not export raw value unless explicit.

### type_change

User changes field type.

Useful for type classifier/rules.

### region_edit

User redraws source region.

Useful for field ROI/template learning.

### asset_crop_edit

User corrects photo/signature/stamp crop.

Useful for asset detector/segmentation evaluation.

### table_cell_edit

User edits table cell value.

Useful for OCR/table evaluation.

### table_structure_edit

User fixes rows/columns/cells.

Useful for table model/evaluator.

### conflict_resolution

User chooses source or enters corrected value.

Useful for verifier evaluation.

### template_decision

User chooses same template/new version/unknown/do not learn.

Useful for template matching evaluation.

---

## 8. Correction-derived datasets

Corrections can produce local datasets:

```text
correction_exports/
  detector_hard_cases/
  ocr_field_errors/
  table_errors/
  asset_crop_errors/
  verifier_conflicts/
  template_versioning/
```

Each export must have redaction status.

---

## 9. Optional export flow

User-controlled export:

1. user opens export correction package,
2. app shows what data will be included,
3. app offers redaction,
4. user confirms,
5. package generated locally,
6. user manually shares if desired.

No automatic upload.

---

## 10. Export package

```json
{
  "packageVersion": "1.0.0",
  "createdAt": 0,
  "containsSensitiveData": true,
  "redactionStatus": "redacted",
  "corrections": [],
  "docGraphSnippet": {},
  "artifacts": []
}
```

---

## 11. Redaction

Redact:

- names
- IDs
- dates of birth
- addresses
- phone/email
- financial values
- MRZ payloads
- barcode payloads
- portrait photos
- signatures
- account numbers

Keep when possible:

- boxes
- masks
- field types
- status
- validator outcomes
- synthetic replacements
- generalized error category

---

## 12. Privacy levels

```text
private_local
redacted_local
exportable_redacted
synthetic
not_exportable
```

Default:

```text
private_local
```

---

## 13. Template learning from corrections

When saving template, use corrections to define:

- corrected labels
- field types
- value ROIs
- asset ROIs
- table schemas
- validators
- aliases
- anchor exclusions
- version decisions

Do not save variable corrected values as future template values.

---

## 14. Correction QA

Before using corrections for training:

- verify correction was intentional,
- remove sensitive values or mark private,
- validate annotations,
- ensure source license/user permission,
- deduplicate,
- assign split safely.

---

## 15. Metrics from corrections

Track locally:

- correction rate by field type
- correction rate by status
- correction rate by template
- repeated correction fields
- asset crop correction rate
- table correction rate
- false confirmed corrections
- conflict resolution patterns

These metrics guide improvement without cloud telemetry.

---

## 16. User deletion

User must be able to delete:

- correction history for document,
- learned template,
- stored document artifacts,
- exported packages,
- all local data.

Deletion should remove correction artifacts where feasible.

---

## 17. Invariants

1. Corrections are local by default.
2. Every correction has before/after.
3. Original evidence is preserved.
4. Template updates are explicit.
5. Training export is opt-in.
6. Sensitive values are redacted unless explicitly allowed.
7. User can delete correction data.
8. Correction metrics do not require cloud telemetry.

---

## 18. Final rule

User corrections are powerful because they are precise, contextual, and privacy-sensitive. Treat them as local evidence first, template memory second, and training data only with explicit user-controlled export.
