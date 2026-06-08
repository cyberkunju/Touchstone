# Verifier Architecture — Edge DocGraph Engine

**Purpose:** Define how verification works across OCR, detection, parsers, TemplateGraph, DocGraph, validators, field hypotheses, user corrections, and UI status.

---

## 1. Core verifier principle

The verifier is the system’s trust engine.

It decides whether a field, asset, table, code, MRZ, or checkbox is:

- confirmed
- needs_review
- missing
- conflict
- invalid
- unsupported
- rejected

The verifier does not extract evidence. It evaluates evidence.

```text
Evidence producers observe.
DocGraph stores.
Hypothesis generator proposes.
Verifier decides trust.
UI exposes status.
User corrects.
TemplateGraph learns safely.
```

---

## 2. Why the verifier exists

Without a verifier, the system becomes dangerous:

```text
OCR saw text → final field
Detector saw object → final asset
Parser decoded value → overwrite visual value
Template projected ROI → assume correct
```

This creates silent wrong answers.

The verifier prevents this by requiring:

- evidence
- confidence
- spatial plausibility
- validators
- cross-field consistency
- quality awareness
- template alignment trust
- conflict handling
- user-visible uncertainty

---

## 3. High-level architecture

```text
DocGraph
  ├── EvidenceRecords
  ├── Nodes
  ├── Edges
  ├── FieldHypotheses
  ├── TemplateContext
  └── QualityReports
          │
          ▼
Validator Registry
  ├── field validators
  ├── parser validators
  ├── cross-field validators
  ├── quality validators
  └── template validators
          │
          ▼
Verifier Engine
  ├── collect evidence
  ├── run validators
  ├── detect conflicts
  ├── calculate explainable confidence
  ├── assign status
  └── produce reasons
          │
          ▼
Form UI / Export / Template Learning
```

---

## 4. Verifier inputs

```ts
type VerifierInput = {
  docGraph: DocGraph;
  hypotheses: FieldHypothesis[];
  templateContext?: TemplateContext;
  quality: DocumentQualitySummary;
  validatorRegistry: ValidatorRegistry;
  options: VerifierOptions;
};
```

Inputs include:

- OCR evidence
- detector evidence
- parser evidence
- table evidence
- code evidence
- MRZ evidence
- user correction evidence
- template projection evidence
- page quality warnings
- TemplateGraph expectations
- required field definitions
- field hypotheses

---

## 5. Verifier outputs

```ts
type VerifierOutput = {
  updatedHypotheses: FieldHypothesis[];
  validations: ValidationResult[];
  conflicts: ConflictRecord[];
  missingFields: MissingFieldRecord[];
  warnings: VerifierWarning[];
  summary: VerifierSummary;
};
```

The verifier writes back through DocGraph APIs.

---

## 6. Verification stages

### Stage 1 — Evidence completeness

Checks whether hypothesis has enough supporting evidence.

Examples:

- field has OCR value node
- asset has crop evidence
- table has cells
- code has decoded payload or visible undecoded region
- template-required field has projected ROI

### Stage 2 — Source confidence

Reads source confidence from:

- OCR
- detector
- segmentation
- parser
- template projection
- table structure
- quality analyzer

### Stage 3 — Validator execution

Runs validators based on:

- field type
- document type
- template rules
- parser outputs
- cross-field relationships
- required status

### Stage 4 — Conflict detection

Compares evidence sources.

Examples:

- MRZ DOB vs visual DOB
- QR invoice number vs printed invoice number
- table total vs printed total
- OCR alternatives disagree
- template expected label mismatches observed label

### Stage 5 — Quality impact

Downgrades or blocks confirmation when:

- blur overlaps field
- glare overlaps field
- crop incomplete
- resolution too low
- orientation uncertain
- perspective correction unreliable

### Stage 6 — Status assignment

Assigns final status using strict rules.

### Stage 7 — Explanation generation

Produces user/developer-readable reasons.

---

## 7. Validator execution model

Validator interface:

```ts
interface Validator<TConfig = unknown> {
  id: string;
  type: ValidatorType;
  severity: ValidationSeverity;

  appliesTo(input: ValidatorContext): boolean;

  run(input: ValidatorContext, config?: TConfig): Promise<ValidationResult>;
}
```

Validator result:

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

## 8. Status assignment precedence

The verifier should apply precedence.

```text
rejected
  > missing
  > conflict
  > invalid
  > needs_review
  > confirmed
```

Suggested logic:

```ts
if (hypothesis.rejected) return "rejected";
if (required && noEvidence) return "missing";
if (criticalConflictExists) return "conflict";
if (criticalValidatorFails) return "invalid";
if (qualityUnsafe || confidenceLow || warningValidatorExists) return "needs_review";
if (allCriticalValidatorsPass && evidenceStrong) return "confirmed";
return "needs_review";
```

Conflict and invalid ordering can be context-dependent. For example, an MRZ checksum failure is invalid; a mismatch between valid MRZ and visual field is conflict.

---

## 9. Explainable confidence

The verifier produces a confidence breakdown.

```ts
type ExplainableConfidence = {
  overall: number;
  components: {
    ocr?: number;
    detector?: number;
    segmentation?: number;
    parser?: number;
    template?: number;
    geometry?: number;
    validator?: number;
    quality?: number;
    userCorrection?: number;
  };
  penalties: Array<{
    reason: string;
    amount: number;
    severity: "low" | "medium" | "high" | "critical";
  }>;
  reasons: string[];
};
```

Confidence is not the same as status. Status controls trust.

---

## 10. Evidence strength categories

### Strong evidence

Examples:

- high-confidence ROI OCR inside expected template field
- MRZ parsed with valid check digits
- QR payload decoded and matches printed field
- table arithmetic matches printed total
- user-corrected field after explicit confirmation

### Medium evidence

Examples:

- OCR text with plausible geometry but no validator
- detector asset with moderate confidence
- field inferred from unknown layout
- table structure mostly reconstructed

### Weak evidence

Examples:

- low OCR confidence
- uncertain crop
- missing label
- ambiguous date
- poor scan quality
- template projection with drift

Weak evidence should generally result in `needs_review`.

---

## 11. Verifier relationship to TemplateGraph

In known-template flow, TemplateGraph provides:

- expected fields
- required flags
- validators
- ROIs
- field types
- cross-check relationships

But TemplateGraph does not guarantee truth.

The verifier still checks:

- current document evidence
- ROI extraction success
- template match confidence
- alignment confidence
- drift
- validators
- conflicts

---

## 12. Verifier relationship to user corrections

User correction is high-trust evidence.

However:

- invalid corrected value should be marked user_overridden or invalid with override
- user crop correction should update asset confidence
- user field deletion should mark hypothesis rejected
- user-created field should be marked manual/user_created
- template learning should only use corrections after explicit save/update/version decision

---

## 13. Verifier relationship to export

Exports must include:

- value
- status
- confidence
- evidence references
- validation references
- reasons

A field with `needs_review`, `missing`, `conflict`, or `invalid` must not be silently exported as plain confirmed truth.

---

## 14. Verifier relationship to UI

UI must show:

- field status
- short reason
- evidence link
- conflict details
- validation failure message
- source crop when available
- correction controls

The verifier should produce both user-facing and developer-facing explanations.

---

## 15. Verifier summary

```ts
type VerifierSummary = {
  totalFields: number;
  confirmed: number;
  needsReview: number;
  missing: number;
  conflicts: number;
  invalid: number;
  unsupported: number;
  silentErrorRisk: "low" | "medium" | "high";
  exportReady: boolean;
};
```

Export readiness can be false when critical unresolved fields exist.

---

## 16. Performance rules

Verifier should be fast compared to extraction.

Optimization:

- run only applicable validators
- re-run validators selectively after correction
- cache normalized parsed values
- avoid full graph scan when target field known
- run heavy cross-field validation only when dependencies change

---

## 17. Tests

Test verifier with:

- correct high-confidence field
- low OCR confidence field
- missing required template field
- MRZ checksum failure
- MRZ vs visual conflict
- QR vs printed conflict
- table total mismatch
- bad scan quality
- user correction override
- template drift

Assertions:

- correct status
- reasons present
- evidence IDs preserved
- no critical false confirmed field

---

## 18. Verifier invariants

1. Verifier owns final status.
2. Verifier never invents evidence.
3. Confirmed fields require evidence.
4. Critical validator failure blocks confirmation.
5. Conflicts must be visible.
6. Missing required fields must be represented.
7. Poor quality can downgrade status.
8. Template projection alone cannot confirm a value.
9. User corrections must be auditable.
10. Silent wrong confirmation is a release blocker.

---

## 19. Final statement

The verifier is the trust boundary of the product. It turns raw extraction into reliable, explainable, user-reviewable document intelligence. The system becomes exceptional not by always being certain, but by knowing when not to pretend.
