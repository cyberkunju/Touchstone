# Form Generation Pipeline — Edge DocGraph Engine

**Purpose:** Define how DocGraph field, asset, table, code, MRZ, and checkbox hypotheses become editable form controls.

---

## 1. Pipeline goal

The form generation pipeline turns verified/reviewable DocGraph hypotheses into a user-editable form.

It must not generate form fields directly from raw OCR. It reads from:

- FieldHypothesis
- VisualAssetNode
- TableNode
- CodeNode
- MRZNode
- ValidationResult
- TemplateGraph expectations

---

## 2. High-level flow

```text
DocGraph
  → collect hypotheses
  → group fields
  → choose controls
  → attach evidence
  → attach status/reasons
  → create FormSchema
  → create FormValues
  → render UI
```

---

## 3. Input

Inputs:

- DocGraph
- FieldHypothesis[]
- ValidationResult[]
- TemplateGraph if matched
- document type hints
- user settings/preferences

---

## 4. Output

```ts
type FormSchema = {
  id: string;
  documentId: string;
  sections: FormSection[];
  fields: FormField[];
  createdFromDocGraphId: string;
  schemaVersion: string;
};

type FormValueSet = {
  id: string;
  formSchemaId: string;
  values: Record<string, FormValue>;
};
```

---

## 5. Field selection rules

A hypothesis can become a form field if:

- it has evidence,
- it is not rejected,
- it has a plausible label/type or asset/table role,
- it is useful to user review,
- verifier produced a status.

Do not create fields for every OCR line.

---

## 6. Field types

Supported field types:

- text
- date
- amount
- number
- id_number
- name
- address
- phone
- email
- country
- image_asset
- signature
- stamp
- seal
- logo
- table
- checkbox
- code_payload
- mrz_block
- unknown

---

## 7. Form field schema

```ts
type FormField = {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  hypothesisId: string;
  sourceNodeIds: string[];
  evidenceIds: string[];
  status: FieldStatus;
  confidence: number;
  reasons: string[];
  ui: {
    control: string;
    sectionId?: string;
    order: number;
    showEvidence: boolean;
  };
};
```

---

## 8. Form value schema

```ts
type FormValue = {
  fieldId: string;
  value: unknown;
  displayValue?: string;
  normalizedValue?: unknown;
  status: FieldStatus;
  confidence: number;
  evidenceIds: string[];
  validationIds: string[];
  userEdited: boolean;
};
```

---

## 9. Section generation

Sections can be generated from:

- document title/header
- spatial groups
- table regions
- template sections
- field type groups
- user correction

Examples:

- Identity Details
- Document Details
- Invoice Details
- Line Items
- Signatures and Stamps
- Codes and Machine-Readable Data

Unknown documents may use generic sections.

---

## 10. Control selection

| Field type | Control |
|---|---|
| text | text input |
| date | date/text hybrid with ambiguity warning |
| amount | amount input |
| id_number | text input with validator |
| image_asset | crop preview |
| signature | crop preview |
| stamp/seal/logo | crop preview |
| table | editable grid |
| checkbox | checkbox control |
| code_payload | read-only/details with copy |
| mrz_block | structured MRZ panel |
| unknown | text input + type selector |

---

## 11. Evidence attachment

Every form field must have an evidence link.

Evidence viewer should show:

- source crop
- OCR text
- detected region
- parser result
- validator result
- template projection
- correction history

If no evidence exists, the field must be user-created and marked accordingly.

---

## 12. Status display

Statuses:

- confirmed
- needs_review
- missing
- conflict
- invalid
- unsupported

Display both color and text.

Examples:

```text
Confirmed
Needs review: Date format ambiguous
Conflict: MRZ and visual field disagree
Missing: Required template field not found
Invalid: MRZ checksum failed
```

---

## 13. Form ordering

Ordering signals:

- template order
- page order
- spatial order
- section grouping
- field importance
- required fields first if review mode
- uncertain fields prioritized in review list

---

## 14. Unknown-document form generation

Unknown mode should be cautious.

Rules:

- avoid too many noisy fields
- group OCR-derived fields logically
- prioritize high-value fields
- mark uncertain fields
- include visual assets
- include tables
- include code/MRZ payloads

---

## 15. Known-template form generation

Known-template mode should follow TemplateGraph.

Rules:

- create expected fields even if missing
- preserve template field order
- show missing required fields
- show drift/conflict warnings
- use ROI evidence

---

## 16. User correction hooks

Every form control must support correction.

Actions:

- edit label
- edit value
- change type
- show evidence
- redraw region
- mark as correct
- mark as wrong
- delete field
- add missing field
- update template

Correction must not mutate form only. It must create graph correction evidence.

---

## 17. Export readiness

Form generation should prepare export metadata:

- labels
- values
- normalized values
- statuses
- evidence references
- validation results
- table structures
- asset references

Exports must not hide uncertainty.

---

## 18. Failure handling

If no strong fields found:

- show review-first OCR/text/assets
- invite user to add fields
- allow template creation from manual regions

If DocGraph invalid:

- show system error
- do not generate misleading form

---

## 19. Tests

Test:

- passport form
- invoice form
- generic form
- missing fields
- conflict fields
- asset fields
- table fields
- user-created fields
- known-template expected fields

Assertions:

- every field has evidence or user-created source
- status displayed
- correction events generated
- exports preserve status

---

## 20. Final form generation rule

The form is a user-facing view over the DocGraph. It is not the source of truth. Every form field must remain linked to evidence, verification, and correction history.
