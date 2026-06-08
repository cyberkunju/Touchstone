# ROI-First Extraction — Edge DocGraph Engine

**Purpose:** Define the known-template fast extraction method: project saved regions, extract current evidence from them, validate aggressively, and avoid broad rediscovery.

---

## 1. What is ROI-first extraction?

ROI-first extraction means:

```text
Use the saved template structure to extract from known regions first.
```

It does not mean copying old values.

Known template:

```text
field: Passport Number
ROI: [0.61, 0.22, 0.82, 0.26]
type: id_number
validator: passport_number
```

New document:

```text
project ROI
  → OCR current crop
  → parse ID number
  → validate
  → fill field
```

---

## 2. Why ROI-first matters

ROI-first extraction is:

- faster
- more accurate for small fields
- less noisy than full-page OCR
- better for repeated documents
- easier to validate
- edge-friendly

It is the payoff for user correction and TemplateGraph memory.

---

## 3. High-level flow

```text
matched TemplateGraph
  → alignment
  → ROI projection
  → ROI expansion
  → type-specific extraction
  → validation
  → DocGraph evidence
  → form fill
```

---

## 4. Projected ROI schema

```ts
type ProjectedRoi = {
  id: string;
  templateElementId: string;
  elementType: "field" | "asset" | "table" | "code" | "mrz" | "checkbox";
  pageId: string;

  originalBoxNorm: NormalizedBox;
  projectedBoxNorm: NormalizedBox;
  expandedBoxNorm: NormalizedBox;

  projectionConfidence: number;
  alignmentResultId: string;

  localCorrectionApplied: boolean;
};
```

---

## 5. ROI expansion

Every projected ROI should be expanded slightly to tolerate alignment error.

Expansion depends on:

- field type
- OCR sensitivity
- alignment confidence
- page quality
- template drift
- local anchor support

Examples:

| Type | Expansion |
|---|---:|
| small ID number | 10–15% |
| date | 5–10% |
| amount | 5–10% |
| name/address | 10–15% |
| MRZ | 2–5% |
| QR/barcode | 5–10% |
| photo | 1–3% |
| signature/stamp | 5–10% |
| table | 2–5% |

---

## 6. Field extraction by type

### 6.1 Text

```text
crop ROI
  → OCR
  → trim/normalize
  → confidence score
  → validators
```

### 6.2 Date

```text
crop ROI
  → OCR
  → date parser
  → ambiguity check
  → date validator
  → cross-field date rules
```

### 6.3 Amount

```text
crop ROI
  → OCR
  → amount parser
  → currency inference
  → table arithmetic validation if linked
```

### 6.4 ID number

```text
crop ROI
  → OCR
  → context-specific normalization
  → ID pattern validator
  → MRZ/code cross-check if available
```

### 6.5 Asset

```text
crop ROI
  → optional segmentation
  → crop artifact
  → asset validator
```

### 6.6 Table

```text
crop table ROI
  → schema-guided table engine
  → cell OCR
  → validators
```

### 6.7 QR/barcode

```text
crop ROI
  → zxing-wasm
  → payload parser
  → cross-field validators
```

### 6.8 MRZ

```text
crop ROI
  → MRZ OCR
  → normalization
  → parser
  → checksum validation
```

### 6.9 Checkbox

```text
crop checkbox ROI
  → visual state detection
  → label/group validation
```

---

## 7. Search-nearby repair

If ROI extraction fails, do local repair.

Flow:

```text
ROI extraction failed
  → check nearby anchors
  → shift ROI locally
  → expand ROI
  → retry extraction
  → if still fail, mark missing/needs_review
```

This is not redundant fallback. It is alignment repair inside the same known-template strategy.

---

## 8. Evidence creation

ROI extraction creates evidence.

Example:

```json
{
  "source": "template_projection",
  "kind": "template_roi",
  "payload": {
    "templateFieldId": "field_passport_number",
    "projectionConfidence": 0.93
  }
}
```

Then OCR/parser evidence:

```json
{
  "source": "ocr",
  "kind": "text",
  "payload": {
    "text": "A1234567",
    "mode": "roi"
  }
}
```

Both are linked to the FieldHypothesis.

---

## 9. Verification

ROI-first does not bypass verifier.

Verifier checks:

- projection confidence
- OCR/parser confidence
- validators
- quality warnings
- required field presence
- cross-field consistency
- template drift

Possible statuses:

- confirmed
- needs_review
- missing
- conflict
- invalid

---

## 10. Missing required fields

If a required TemplateField ROI contains no value:

```text
status = missing
```

Show expected region to user.

Do not invent value from nearby unrelated text unless repair succeeds and evidence supports it.

---

## 11. Conflicts

If ROI value conflicts with parser/code/MRZ/table evidence:

```text
status = conflict
```

Example:

- visual DOB from ROI differs from MRZ DOB
- invoice total from ROI differs from table total
- printed tax ID differs from QR payload

---

## 12. Performance rules

ROI-first should avoid broad work.

Do:

- batch OCR ROIs
- parse only expected code regions
- run table engine only on expected tables
- run segmentation only on expected assets
- use Web Workers
- cache model sessions

Avoid:

- full-page segmentation
- unnecessary full-page OCR
- broad table detection when table ROI known
- detector rerun unless alignment/match weak

---

## 13. ROI-first output

```ts
type RoiFirstExtractionResult = {
  templateId: string;
  documentId: string;
  projectedRois: ProjectedRoi[];
  extractedEvidenceIds: string[];
  fieldHypothesisIds: string[];
  validationIds: string[];
  statuses: Record<string, FieldStatus>;
  warnings: string[];
};
```

---

## 14. UI behavior

Show:

- matched template
- projected ROI overlay
- extracted crop
- field status
- validation reason
- missing/conflict warnings

Example:

```text
Passport Number
Confirmed
Extracted from saved template region. MRZ check digit passed.
```

Example:

```text
Expiry Date
Needs review
Extracted from saved region, but glare overlaps the value.
```

---

## 15. Tests

Test:

- clean repeated document
- small shifts
- perspective warp
- missing field
- low OCR confidence
- MRZ conflict
- table change
- asset moved
- wrong template prevention

Assertions:

- current values extracted
- no old values copied
- validators run
- missing fields visible
- ROI repair works when safe
- false match does not silently fill

---

## 16. Invariants

1. ROI-first extracts current document evidence.
2. Old template values are never reused.
3. Every ROI extraction creates evidence.
4. Validators always run.
5. Missing/conflict/invalid statuses are visible.
6. ROI repair is bounded and auditable.
7. Known-template flow must be faster than unknown flow.

---

## 17. Final statement

ROI-first extraction is the fast, precise path for repeated documents. It is powerful only because it remains evidence-backed, verifier-controlled, and safe against template drift.
