# Validator Registry — Edge DocGraph Engine

**Purpose:** Define all validators, when they run, inputs, outputs, severity, dependencies, and registration rules.

---

## 1. What is the Validator Registry?

The Validator Registry is the catalog of checks that the verifier can run.

Validators check:

- required presence
- OCR confidence
- geometry plausibility
- field type format
- date logic
- amount/currency logic
- ID format
- MRZ checksum
- barcode payload
- table math
- asset presence
- face presence
- checkbox groups
- template alignment
- cross-field consistency
- quality warnings

---

## 2. Validator interface

```ts
interface Validator<TConfig = unknown> {
  id: string;
  type: ValidatorType;
  severity: ValidationSeverity;

  appliesTo(context: ValidatorContext): boolean;

  run(context: ValidatorContext, config?: TConfig): Promise<ValidationResult>;
}
```

---

## 3. ValidatorContext

```ts
type ValidatorContext = {
  docGraph: DocGraph;
  hypothesis?: FieldHypothesis;
  node?: GraphNode;
  evidenceIds: string[];
  templateContext?: TemplateContext;
  quality?: DocumentQualitySummary;
  dependencies?: Record<string, unknown>;
};
```

---

## 4. ValidationResult

```ts
type ValidationResult = {
  id: string;
  documentId: string;
  targetId: string;
  validatorId: string;
  status: "pass" | "warn" | "fail" | "not_applicable";
  severity: "info" | "low" | "medium" | "high" | "critical";
  message: string;
  details?: Record<string, unknown>;
  evidenceIds: string[];
  createdAt: number;
};
```

---

## 5. Severity levels

### info

Useful context, no trust impact.

### low

Minor warning. Usually does not block confirmation alone.

### medium

May downgrade to needs_review.

### high

Likely blocks confirmation.

### critical

Must block confirmation or produce conflict/invalid/missing.

---

## 6. Validator categories

```ts
type ValidatorType =
  | "required"
  | "ocr_confidence"
  | "geometry"
  | "template_projection"
  | "quality"
  | "date"
  | "amount"
  | "currency"
  | "id_pattern"
  | "email"
  | "phone"
  | "country"
  | "mrz_checksum"
  | "mrz_visual_cross_check"
  | "barcode_decode"
  | "barcode_payload"
  | "table_structure"
  | "table_arithmetic"
  | "asset_present"
  | "face_present"
  | "checkbox_group"
  | "cross_field"
  | "custom";
```

---

## 7. Core validators

### 7.1 required_presence

Runs when:

- field/asset/table/code/MRZ is required

Fails when:

- value/evidence missing

Severity:

- high or critical depending field

---

### 7.2 ocr_confidence

Runs when:

- field value comes from OCR

Warns/fails when:

- OCR confidence below threshold

Config:

```ts
{
  minConfirmed: number;
  minReview: number;
}
```

---

### 7.3 geometry_plausibility

Runs when:

- field hypothesis created from label/value geometry

Checks:

- label-value distance
- same row/column
- direction
- overlap
- nearby unrelated text

---

### 7.4 template_projection_confidence

Runs when:

- field comes from TemplateGraph ROI

Checks:

- template match score
- alignment confidence
- projection confidence
- drift

---

### 7.5 quality_overlap

Runs when:

- page has blur/glare/low-resolution warning

Checks:

- whether quality warning overlaps source region

Can downgrade status to needs_review.

---

## 8. Format validators

### 8.1 date_format

Checks:

- parseable date
- ambiguity
- impossible dates
- locale/template hints

### 8.2 amount_format

Checks:

- numeric amount
- decimal separators
- currency symbol
- negative values if allowed

### 8.3 currency

Checks:

- known currency symbol/code
- consistency across invoice/table

### 8.4 id_pattern

Checks:

- field-specific ID regex/checksum where known

### 8.5 email_format

Checks email format.

### 8.6 phone_format

Checks phone format, country hints if known.

### 8.7 country_code

Checks country/nationality values against allowed dictionary where needed.

---

## 9. MRZ validators

### 9.1 mrz_format

Checks TD1/TD2/TD3 structure.

### 9.2 mrz_checksum

Checks check digits.

### 9.3 mrz_date

Checks DOB/expiry date parse and logic.

### 9.4 mrz_visual_cross_check

Compares MRZ parsed values with visible fields.

---

## 10. Barcode validators

### 10.1 code_decode

Checks whether visible code was decoded.

### 10.2 payload_type

Classifies payload.

### 10.3 payload_cross_check

Compares payload fields to printed fields.

---

## 11. Table validators

### 11.1 table_structure

Checks row/column/cell structure.

### 11.2 table_header

Checks expected headers.

### 11.3 table_arithmetic

Checks:

- subtotal
- tax
- discount
- total
- debit/credit/balance

### 11.4 table_cell_confidence

Checks OCR confidence inside cells.

---

## 12. Asset validators

### 12.1 asset_present

Checks asset exists.

### 12.2 asset_crop_quality

Checks crop completeness/size.

### 12.3 face_present

Checks portrait crop contains face.

Does not identify person.

---

## 13. Checkbox validators

### 13.1 checkbox_state

Checks checked/unchecked/uncertain.

### 13.2 checkbox_group_exclusivity

Checks radio-like groups where only one option should be selected.

### 13.3 required_checkbox

Checks required checkbox present/selected when policy says.

---

## 14. Cross-field validators

Examples:

- expiry date after issue date
- DOB reasonable age range
- MRZ name matches visual name
- QR tax ID matches printed tax ID
- invoice total matches table
- bank opening balance plus transactions equals closing balance
- country code matches nationality field

---

## 15. Validator registration

Registry example:

```ts
const registry = new ValidatorRegistry();

registry.register(requiredPresenceValidator);
registry.register(ocrConfidenceValidator);
registry.register(dateFormatValidator);
registry.register(mrzChecksumValidator);
registry.register(tableArithmeticValidator);
```

Registry API:

```ts
interface ValidatorRegistry {
  register(validator: Validator): void;
  get(id: string): Validator | undefined;
  list(): Validator[];
  findApplicable(context: ValidatorContext): Validator[];
}
```

---

## 16. Running validators

Verifier should run:

1. required validators
2. source confidence validators
3. field-type validators
4. parser validators
5. template validators
6. cross-field validators
7. quality validators

Some validators depend on earlier results.

---

## 17. Validator configuration

Config can come from:

- global defaults
- document type rules
- TemplateGraph
- user settings
- benchmark calibration

Example:

```json
{
  "validatorId": "date_format",
  "config": {
    "allowedFormats": ["YYYY-MM-DD", "DD/MM/YYYY"],
    "allowAmbiguous": false
  }
}
```

---

## 18. Validator result to status

Validators do not directly set final status alone. The verifier combines results.

Mapping examples:

- required fail → missing
- MRZ checksum fail → invalid
- MRZ vs visual mismatch → conflict
- low OCR confidence warn → needs_review
- table total fail → conflict
- date ambiguous warn → needs_review

---

## 19. Testing validators

Each validator needs:

- unit tests
- edge cases
- invalid inputs
- ambiguous inputs
- evidence ID propagation
- severity behavior

Cross-field validators need integration tests.

---

## 20. Registry invariants

1. Validators must be deterministic.
2. Validators must cite evidence.
3. Validators must not mutate DocGraph directly.
4. Validators must not hide failures.
5. Validators must return structured results.
6. Critical validators must be covered by tests.
7. Validator versions must be tracked.

---

## 21. Final statement

The Validator Registry is the rulebook of trust. Models find evidence; validators check whether evidence is acceptable; the verifier uses those results to protect the user from silent errors.
