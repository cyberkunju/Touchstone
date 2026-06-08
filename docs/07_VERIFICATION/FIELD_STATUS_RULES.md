# Field Status Rules — Edge DocGraph Engine

**Purpose:** Define exact rules for `confirmed`, `needs_review`, `missing`, `conflict`, `invalid`, `unsupported`, and `rejected`.

---

## 1. Status model

Every FieldHypothesis must have one status:

```ts
type FieldStatus =
  | "confirmed"
  | "needs_review"
  | "missing"
  | "conflict"
  | "invalid"
  | "unsupported"
  | "rejected";
```

Status is the user-facing trust decision. It is more important than numeric confidence.

---

## 2. Status precedence

Recommended precedence:

```text
rejected
  > missing
  > conflict
  > invalid
  > needs_review
  > confirmed
```

Notes:

- `conflict` and `invalid` may swap depending on context.
- A value can be invalid because it fails a validator.
- A value can be conflict because two evidence sources disagree.
- Missing applies to expected/required fields with no usable evidence.

---

## 3. Confirmed

### Definition

A field is `confirmed` when the system has enough evidence and no unresolved critical issue exists.

### Requirements

All must be true:

- evidence exists,
- source confidence is sufficient for field type,
- geometry is plausible,
- required validators pass,
- no critical conflict exists,
- page quality is acceptable for the field region,
- template projection is trustworthy if template-derived,
- value is not merely guessed.

### Examples

- Passport number extracted from ROI and MRZ confirms it.
- Invoice total OCR is high confidence and table arithmetic matches.
- QR payload tax ID matches printed tax ID.
- Photo region detected and face presence validator passes.
- Email field passes email format validator with high OCR confidence.

### Confirmed output

```json
{
  "status": "confirmed",
  "reasons": [
    "OCR confidence high",
    "field extracted from projected template ROI",
    "ID pattern validator passed",
    "MRZ cross-check passed"
  ]
}
```

---

## 4. Needs review

### Definition

A field is `needs_review` when it is plausible but not safe to confirm automatically.

### Common causes

- OCR confidence medium/low
- date format ambiguous
- detector confidence moderate
- crop boundary uncertain
- glare or blur overlaps region
- parser warning
- template projection confidence medium
- table structure uncertain
- barcode visible but undecodable
- field inferred from unknown layout without strong validator
- segmentation mask questionable

### Examples

- DOB extracted as `01/02/1999` but date format ambiguous.
- Signature detected but crop may cut off strokes.
- Table extracted but one column is ambiguous.
- QR code visible but not decoded.
- Name field OCR confidence is medium due to blur.

### Needs-review output

```json
{
  "status": "needs_review",
  "reasons": [
    "OCR confidence is below confirmation threshold",
    "source crop is partially affected by glare"
  ]
}
```

---

## 5. Missing

### Definition

A field is `missing` when the system expected or required it but found no usable evidence.

### Sources of expectation

- TemplateGraph required field
- user-created required field
- document type rule
- table schema requirement
- MRZ/code relationship requirement
- validator requirement

### Examples

- Template expects passport number but ROI has no readable text.
- Invoice template requires total but no amount found.
- Required signature asset is absent.
- MRZ zone required but not detected/readable.
- Required table column missing.

### Missing output

```json
{
  "status": "missing",
  "reasons": [
    "Required template field was expected",
    "Projected ROI contained no readable value"
  ]
}
```

### Important rule

Missing is not the same as extraction failure. It is a valid status that must be shown to the user.

---

## 6. Conflict

### Definition

A field is `conflict` when two or more evidence sources disagree in a meaningful way.

### Common conflicts

- MRZ DOB differs from visual DOB
- QR payload invoice number differs from printed invoice number
- table sum differs from printed total
- barcode payload tax ID differs from printed tax ID
- PDF embedded text differs from OCR in critical field
- two strong OCR alternatives disagree
- template expected field label does not match observed label

### Conflict output

```json
{
  "status": "conflict",
  "reasons": [
    "MRZ parsed date of birth is 1999-02-01",
    "Visual OCR date of birth is 1999-03-01"
  ]
}
```

### Conflict UI

UI must show both evidence sources, not just the chosen value.

---

## 7. Invalid

### Definition

A field is `invalid` when a value exists but fails required validation.

### Examples

- MRZ check digit fails
- date is impossible
- expiry date before issue date
- email format invalid
- amount cannot be parsed
- phone number invalid
- ID number fails pattern
- checkbox group violates exclusivity
- required table total rule fails with no plausible alternative

### Invalid output

```json
{
  "status": "invalid",
  "reasons": [
    "MRZ document number check digit failed"
  ]
}
```

### Invalid vs conflict

- Invalid: one value fails a required rule.
- Conflict: two evidence sources disagree.

Example:

```text
MRZ checksum fails → invalid
Valid MRZ DOB differs from visual DOB → conflict
```

---

## 8. Unsupported

### Definition

A field or region is `unsupported` when the system detected something meaningful but cannot interpret it yet.

### Examples

- unknown symbol
- unsupported barcode format
- complex chart
- handwritten paragraph not handled
- unfamiliar document-specific code
- table structure beyond current capability

### Unsupported output

```json
{
  "status": "unsupported",
  "reasons": [
    "Region appears meaningful, but no supported parser exists for this content type"
  ]
}
```

Unsupported should allow manual correction.

---

## 9. Rejected

### Definition

A hypothesis is `rejected` when user or system determines it is false or should not be used.

### Examples

- OCR line wrongly became a field
- logo detected as stamp but user deletes it
- duplicate field merged into another
- false table detection removed
- user chooses not to include field

Rejected evidence is preserved, but hypothesis is excluded from form/export/template learning.

---

## 10. Status transition rules

### Unknown document

```text
candidate
  → needs_review by default unless strong evidence/validators
  → confirmed only when strong enough
```

### Known template

```text
expected field
  → confirmed if ROI extraction + validators pass
  → missing if required ROI empty
  → conflict/invalid if checks fail
  → needs_review if uncertain
```

### User correction

```text
needs_review → confirmed/user_confirmed if correction valid
invalid → user_overridden or invalid if still invalid
conflict → resolved if user chooses source
missing → confirmed if user adds value/evidence
```

---

## 11. Field-type-specific status examples

### Date

- confirmed: parsed unambiguous date + validators pass
- needs_review: ambiguous format
- invalid: impossible date
- conflict: MRZ date differs

### Amount

- confirmed: amount parsed + table math passes
- needs_review: OCR uncertain
- invalid: unparsable amount in required field
- conflict: printed total differs from computed total

### ID number

- confirmed: pattern + cross-check pass
- needs_review: O/0 ambiguity
- invalid: pattern/checksum fails
- conflict: MRZ/code mismatch

### Asset

- confirmed: crop present + validator passes
- needs_review: crop uncertain
- missing: required asset absent
- invalid: required portrait crop has no face, depending policy

---

## 12. Export rules by status

| Status | Export behavior |
|---|---|
| confirmed | export normally with evidence |
| needs_review | export with status warning |
| missing | export null/missing status |
| conflict | export conflict status and evidence sources |
| invalid | export invalid status; block critical clean export unless user overrides |
| unsupported | export as unsupported/manual if included |
| rejected | do not export by default |

---

## 13. Template learning rules by status

| Status | Template learning |
|---|---|
| confirmed | can be learned |
| needs_review | learn only after user confirms |
| missing | can learn expected required field if template has region |
| conflict | do not learn until resolved |
| invalid | do not learn as valid |
| unsupported | user-defined only |
| rejected | never learn |

---

## 14. Tests

Test each status with:

- evidence present/absent
- validator pass/fail
- conflict/no conflict
- good/bad quality
- template required/non-required
- user correction/override

Assertions:

- status correct
- reasons present
- evidence preserved
- UI can show next action

---

## 15. Final status rule

The system must never hide uncertainty behind a clean value. Status is the contract with the user. If a value is not safe, the status must say so.
