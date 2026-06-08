# Confidence Model — Edge DocGraph Engine

**Purpose:** Define how confidence is represented, calculated, explained, displayed, and used by the verifier.

---

## 1. Core principle

Confidence must be explainable.

Bad:

```json
{ "confidence": 0.82 }
```

Good:

```json
{
  "overall": 0.82,
  "components": {
    "ocr": 0.91,
    "geometry": 0.84,
    "validator": 0.95,
    "qualityPenalty": -0.08
  },
  "reasons": [
    "OCR confidence high",
    "nearby label matched alias",
    "date validator passed",
    "glare overlaps region"
  ]
}
```

Confidence is not final truth. Field status is final trust indicator.

---

## 2. Confidence vs status

Confidence is a score. Status is a decision.

A field with high confidence may still be `needs_review` or `conflict` if validation fails.

Example:

```text
OCR confidence: 0.96
MRZ conflict: true
Field status: conflict
```

Status wins over raw confidence.

---

## 3. ExplainableConfidence schema

```ts
type ExplainableConfidence = {
  overall: number;
  components: ConfidenceComponents;
  reasons: string[];
  penalties?: ConfidencePenalty[];
  calibration?: {
    calibrated: boolean;
    method?: string;
    version?: string;
  };
};

type ConfidenceComponents = {
  ocr?: number;
  detector?: number;
  segmentation?: number;
  parser?: number;
  geometry?: number;
  template?: number;
  validator?: number;
  quality?: number;
  userCorrection?: number;
};

type ConfidencePenalty = {
  reason: string;
  amount: number;
  severity: "low" | "medium" | "high" | "critical";
};
```

---

## 4. Component meanings

### 4.1 OCR confidence

How confident OCR is about text.

Does not guarantee semantic correctness.

### 4.2 Detector confidence

How confident detector is about object class and region.

Does not guarantee field meaning.

### 4.3 Parser confidence

How well parsed structure fits expected format.

Examples:

- date parser success
- amount parser success
- MRZ format success
- QR payload parse success

### 4.4 Geometry confidence

How plausible spatial relationships are.

Examples:

- label near value
- same row
- inside expected ROI
- table cell alignment

### 4.5 Template confidence

How well template match/projection supports field.

Includes:

- template match score
- ROI projection confidence
- anchor alignment quality
- drift level

### 4.6 Validator confidence

Validator result contribution.

Often pass/fail rather than continuous.

### 4.7 Quality confidence

Impact of page quality.

Blur/glare/low resolution reduce confidence.

### 4.8 User correction confidence

User correction is high-trust but must be auditable.

---

## 5. Confidence calculation model

Initial confidence can be rule-based.

Example:

```ts
overall =
  weightedAverage(components)
  - qualityPenalty
  - conflictPenalty
  - missingEvidencePenalty
```

But status logic must override.

Example:

```text
if criticalValidatorFails:
  status = invalid
else if conflictExists:
  status = conflict
else if requiredAndMissing:
  status = missing
else if overall >= threshold and validators pass:
  status = confirmed
else:
  status = needs_review
```

---

## 6. Field-type-specific confidence

Do not use one global threshold.

### 6.1 Date

Requires:

- OCR confidence
- date parser
- ambiguity check
- range validation
- template or label support

### 6.2 Amount

Requires:

- OCR confidence
- amount parser
- currency context
- arithmetic validation when available

### 6.3 ID number

Requires:

- OCR confidence
- pattern validation
- MRZ/code cross-check if available

### 6.4 Photo

Requires:

- detector confidence
- crop completeness
- face presence if portrait
- template region if known

### 6.5 Signature/stamp/seal

Requires:

- detector/segmentation confidence
- crop quality
- template expectation or nearby label

### 6.6 Table

Requires:

- structure confidence
- cell assignment confidence
- OCR cell confidence
- validation checks

---

## 7. Status decision policy

### confirmed

All must be true:

- evidence exists
- confidence sufficient for field type
- critical validators pass
- no critical conflict
- scan quality acceptable
- template projection reliable if template-derived

### needs_review

Use when:

- plausible evidence exists
- confidence insufficient
- ambiguity remains
- quality warning affects field
- non-critical validator warns

### missing

Use when:

- required field expected
- no sufficient evidence found

### conflict

Use when:

- evidence sources disagree meaningfully

### invalid

Use when:

- value exists
- critical validation fails

---

## 8. Penalties

Penalties reduce confidence or force status.

Examples:

| Penalty | Effect |
|---|---|
| blur overlaps region | reduce confidence |
| glare overlaps region | reduce confidence / review |
| MRZ checksum fail | invalid |
| QR payload mismatch | conflict |
| template drift high | review/version |
| OCR low confidence | review |
| detector low confidence | review |
| table arithmetic mismatch | conflict |

---

## 9. Confidence reasons

Every confidence output should include reasons.

Reason examples:

- OCR confidence high
- OCR confidence low
- nearby label matched alias
- value inside projected template ROI
- MRZ checksum passed
- MRZ checksum failed
- barcode payload matches printed field
- table total does not match line items
- glare overlaps source region
- user corrected this field
- template anchor drift detected

---

## 10. UI display

Do not show only numeric confidence.

Show:

- status
- short reason
- evidence button
- detailed confidence breakdown on demand

Example:

```text
Needs review
Reason: Date format is ambiguous and MRZ was not available.
```

---

## 11. Export behavior

Exports should include confidence and status.

```json
{
  "field": "Invoice Total",
  "value": "1200.00",
  "status": "confirmed",
  "confidence": {
    "overall": 0.94,
    "reasons": [
      "OCR confidence high",
      "amount parser passed",
      "table total matched"
    ]
  }
}
```

---

## 12. Calibration

Early v1 can use rule-based confidence.

Later improvements:

- per-field calibration
- per-template calibration
- validator outcome statistics
- correction-driven calibration
- benchmark-based thresholds

Do not overfit confidence from tiny samples.

---

## 13. Silent-error focus

Confidence model exists to reduce silent critical errors.

Wrong confirmed critical fields are failures.

Metrics:

- silent critical error rate
- over-review rate
- conflict catch rate
- invalid catch rate
- correction rate by status

---

## 14. Invariants

1. Confidence is explainable.
2. Status is more important than score.
3. Critical validator failure overrides high confidence.
4. Conflicts must not be hidden.
5. Poor quality reduces trust.
6. User correction must be recorded.
7. Thresholds must be field/template-aware.

---

## 15. Final statement

The confidence model is a trust explanation system, not a magic probability. Its job is to explain why the verifier confirmed, flagged, rejected, or invalidated a field.
