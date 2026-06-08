# Field Hypothesis Specification — Edge DocGraph Engine

**Purpose:** Define how possible fields are represented before confirmation, how they are generated, scored, verified, corrected, and converted to form controls.

---

## 1. What is a FieldHypothesis?

A FieldHypothesis is a proposed form field created from evidence.

It may represent:

- text value field
- date field
- amount field
- ID number
- address block
- photo asset
- signature asset
- stamp/seal/logo asset
- checkbox state
- QR/barcode payload
- MRZ field
- table field

A hypothesis is not automatically true. It must be verified.

---

## 2. Why hypotheses are needed

The system must not immediately convert OCR text into final fields.

Example OCR:

```text
DOB: 01/02/1999
```

Possible hypotheses:

1. Label = DOB, value = 01/02/1999, type = date
2. Date format unknown, status = needs_review
3. If MRZ confirms date, maybe confirmed
4. If MRZ conflicts, status = conflict

Hypotheses allow uncertainty and evidence fusion.

---

## 3. FieldHypothesis schema

```ts
type FieldHypothesis = {
  id: string;
  documentId: string;
  pageId?: string;

  label: string;
  canonicalLabel?: string;
  aliases?: string[];

  value: unknown;
  displayValue?: string;
  normalizedValue?: unknown;
  valueType: FieldValueType;

  labelNodeIds: string[];
  valueNodeIds: string[];
  assetNodeIds: string[];
  tableNodeIds: string[];
  codeNodeIds?: string[];
  mrzNodeIds?: string[];

  boxNorm?: NormalizedBox;

  confidence: ExplainableConfidence;
  status: FieldStatus;

  evidenceIds: string[];
  validationIds: string[];

  source:
    | "ocr_geometry"
    | "template_projection"
    | "parser"
    | "visual_asset"
    | "table"
    | "checkbox"
    | "user_created"
    | "hybrid";

  required?: boolean;
  templateFieldId?: string;
  userEdited?: boolean;
  rejected?: boolean;

  reasons: string[];

  createdAt: number;
  updatedAt?: number;
};
```

---

## 4. FieldValueType

```ts
type FieldValueType =
  | "text"
  | "name"
  | "date"
  | "amount"
  | "number"
  | "id_number"
  | "address"
  | "phone"
  | "email"
  | "country"
  | "image"
  | "photo"
  | "signature"
  | "stamp"
  | "seal"
  | "logo"
  | "table"
  | "checkbox"
  | "qr"
  | "barcode"
  | "mrz"
  | "unknown";
```

---

## 5. Hypothesis sources

### 5.1 OCR geometry

Generated from labels and nearby values.

Signals:

- colon patterns
- same row
- label left of value
- label above value
- blank box nearby
- value parser compatibility
- label alias

### 5.2 Template projection

Generated from saved TemplateGraph fields.

Signals:

- template field definition
- projected ROI
- expected value type
- expected validator
- extraction result

### 5.3 Parser

Generated from structured parser output.

Examples:

- MRZ document number
- QR payload invoice ID
- barcode product code

### 5.4 Visual asset

Generated from VisualAssetNode.

Examples:

- portrait photo field
- signature field
- stamp field

### 5.5 Table

Generated from TableNode.

Examples:

- line items
- transaction table
- fee table

### 5.6 User-created

Generated when user manually adds field.

---

## 6. Label handling

A hypothesis label may come from:

- OCR text
- template field label
- parser field name
- user correction
- nearby section label
- table header

Store both:

- raw label
- canonical label

Example:

```json
{
  "label": "DOB",
  "canonicalLabel": "Date of Birth",
  "aliases": ["DOB", "D.O.B", "Birth Date"]
}
```

---

## 7. Value handling

Values should preserve:

- raw value
- display value
- normalized value

Example:

```json
{
  "value": "01/02/1999",
  "displayValue": "01/02/1999",
  "normalizedValue": {
    "isoCandidate": "1999-02-01",
    "ambiguous": true
  }
}
```

Do not destroy raw value.

---

## 8. Evidence links

A hypothesis must link to supporting evidence.

Examples:

```text
labelNodeIds → OCR label nodes
valueNodeIds → OCR value nodes
assetNodeIds → photo/signature/stamp nodes
tableNodeIds → table node
mrzNodeIds → MRZ node
validationIds → validator results
```

If user-created without document evidence, source must be `user_created`.

---

## 9. Hypothesis status lifecycle

```text
candidate
  → unverified
  → confirmed / needs_review / missing / conflict / invalid
  → user corrected
  → reverified
  → template saved or rejected
```

In schema, visible statuses are:

- confirmed
- needs_review
- missing
- conflict
- invalid
- unsupported
- rejected

---

## 10. Hypothesis generation rules

### 10.1 Label-value rule

Create candidate when:

- label-like text exists,
- value-like text is nearby,
- geometry is plausible,
- parser supports value type or type is unknown.

### 10.2 Colon rule

Pattern:

```text
Label: Value
```

Create label/value split if reliable.

### 10.3 Stacked field rule

Pattern:

```text
Label
Value
```

Common in forms and IDs.

### 10.4 Table header rule

If table header describes column, cells may become structured values.

### 10.5 Template rule

If template expects field, create hypothesis even when missing.

### 10.6 Parser rule

If parser output has structured fields, create hypotheses with parser evidence.

### 10.7 Asset rule

If visual asset has meaningful type, create asset hypothesis.

---

## 11. Required fields

A hypothesis may be required because:

- template says required
- document type says expected
- user marks required
- validator requires it
- parser structure requires it

Missing required fields become `missing`.

---

## 12. Hypothesis confidence

Confidence should consider:

- OCR confidence
- detector confidence
- geometry score
- parser confidence
- template score
- validator result
- page quality
- user correction

Example:

```json
{
  "overall": 0.84,
  "components": {
    "ocr": 0.91,
    "geometry": 0.87,
    "validator": 0.95,
    "qualityPenalty": -0.08
  },
  "reasons": [
    "nearby label matched alias",
    "OCR confidence high",
    "date validator passed",
    "glare overlaps region"
  ]
}
```

---

## 13. Verification relationship

Verifier may update:

- status
- confidence
- reasons
- validationIds

Verifier must not erase original hypothesis evidence.

---

## 14. User correction behavior

When user corrects a hypothesis:

- set userEdited true
- add UserCorrectionEvidence
- update label/value/type/region
- re-run validators
- preserve original hypothesis evidence
- mark rejected if deleted

---

## 15. Form generation

Form fields are created from hypotheses.

Rules:

- confirmed fields show normal state
- needs_review fields appear in review queue
- missing fields show expected region if known
- conflict fields show both evidence sources
- invalid fields show validator failure

---

## 16. TemplateGraph learning

TemplateGraph stores corrected hypotheses as fields.

Store:

- corrected label
- canonical label
- field type
- normalized label/value regions
- required flag
- validators
- aliases
- source anchors

Do not store variable value as template truth.

---

## 17. Examples

### 17.1 Text/date field

```json
{
  "id": "hyp_dob",
  "label": "DOB",
  "canonicalLabel": "Date of Birth",
  "value": "01/02/1999",
  "valueType": "date",
  "labelNodeIds": ["text_dob_label"],
  "valueNodeIds": ["text_dob_value"],
  "status": "needs_review",
  "reasons": ["date format ambiguous"]
}
```

### 17.2 Photo asset

```json
{
  "id": "hyp_photo",
  "label": "Portrait Photo",
  "value": "asset_photo_1",
  "valueType": "photo",
  "assetNodeIds": ["asset_photo_1"],
  "status": "confirmed",
  "reasons": ["photo detected", "face present"]
}
```

### 17.3 Missing required template field

```json
{
  "id": "hyp_passport_number",
  "label": "Passport Number",
  "value": null,
  "valueType": "id_number",
  "status": "missing",
  "templateFieldId": "tpl_field_passport_no",
  "required": true,
  "reasons": ["required template ROI contained no readable value"]
}
```

---

## 18. Invariants

1. A hypothesis is not final truth.
2. Every hypothesis must have evidence or be user-created.
3. Every hypothesis must have status.
4. Raw and normalized values must be separate.
5. User correction preserves original evidence.
6. Template learning uses corrected hypotheses.
7. Missing required fields are represented as hypotheses.

---

## 19. Final statement

FieldHypothesis is the bridge between raw evidence and editable form fields. It allows the system to propose, review, verify, correct, and learn without pretending every extraction is immediately true.
