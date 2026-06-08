# Silent Error Rate — Edge DocGraph Engine

**Purpose:** Define the most important product metric: silent wrong answers, especially wrong critical fields marked as confirmed.

---

## 1. Definition

A silent error occurs when:

```text
the system outputs a wrong value
AND marks/presents it as confirmed/trusted
AND the user/export is not clearly warned
```

This is the most important metric.

---

## 2. Critical silent error

A critical silent error is a silent error on a critical field.

Critical fields include:

- passport/ID number
- name
- date of birth
- expiry date
- issue date
- nationality
- MRZ values
- QR/barcode identity values
- invoice total
- tax ID
- bank account number
- closing balance
- payment amount
- required signature/photo presence
- required legal/consent checkbox

Critical silent errors are release blockers.

---

## 3. Formula

```text
silent_error_rate = wrong_confirmed_fields / total_evaluated_fields
```

Critical:

```text
critical_silent_error_rate = wrong_confirmed_critical_fields / total_evaluated_critical_fields
```

Also track per document:

```text
documents_with_any_silent_error / total_documents
```

---

## 4. What counts as wrong confirmed

Counts as silent error:

- wrong value marked confirmed
- wrong label/value pairing marked confirmed
- wrong source evidence but value marked confirmed
- old template value reused as current value
- invalid MRZ accepted as confirmed
- table total mismatch but printed total confirmed
- QR conflict ignored and field confirmed
- missing required field omitted from form/export
- wrong checkbox state confirmed
- wrong asset crop confirmed as required asset

---

## 5. What does not count as silent error

Not silent error:

- wrong value marked needs_review
- uncertain value marked needs_review
- missing required field shown as missing
- conflict shown as conflict
- invalid shown as invalid
- unsupported shown as unsupported
- user overrides with audit trail and export status

These may still be usability/accuracy issues, but they are not silent errors.

---

## 6. Severity levels

### S0 — Critical silent error

Wrong critical field confirmed.

Release blocker.

### S1 — Non-critical silent error

Wrong non-critical field confirmed.

Must fix or accept only with documented risk.

### S2 — Over-review

Correct field marked needs_review.

Not ideal, but safer.

### S3 — Missed extraction

Field missing but not required or correctly marked missing.

Accuracy issue.

---

## 7. Benchmark dataset requirements

Silent error benchmark must include:

- clean correct docs
- OCR confusions
- low-confidence text
- blur/glare over critical fields
- invalid MRZ
- MRZ visual mismatch
- QR payload mismatch
- table total mismatch
- wrong template candidate
- missing required fields
- ambiguous dates
- false checkboxes
- old template repeated layouts

---

## 8. Measurement process

For each benchmark document:

1. run full pipeline,
2. collect form output,
3. compare each field to ground truth,
4. check field status,
5. classify wrong confirmed fields,
6. classify severity,
7. produce failure report.

---

## 9. Report schema

```json
{
  "silentErrorReport": {
    "totalFields": 1000,
    "totalCriticalFields": 300,
    "wrongConfirmedFields": 2,
    "wrongConfirmedCriticalFields": 0,
    "silentErrorRate": 0.002,
    "criticalSilentErrorRate": 0.0,
    "documentsWithAnySilentError": 2
  },
  "failures": []
}
```

---

## 10. Failure record

```ts
type SilentErrorFailure = {
  documentId: string;
  fieldId: string;
  fieldLabel: string;
  fieldType: string;
  predictedValue: unknown;
  groundTruthValue: unknown;
  predictedStatus: "confirmed";
  severity: "S0" | "S1";
  sourceEvidenceIds: string[];
  likelyCause:
    | "ocr"
    | "parser"
    | "validator"
    | "template_match"
    | "alignment"
    | "table"
    | "barcode"
    | "mrz"
    | "ui_export"
    | "unknown";
};
```

---

## 11. Acceptance threshold

Initial release gates:

```text
S0 critical silent errors: 0 allowed
```

For S1:

```text
must be extremely low and reviewed
```

Thresholds must tighten over time.

---

## 12. Over-review tradeoff

The system may increase needs_review to reduce silent errors.

Track:

```text
over_review_rate = correct_needs_review_fields / total_correct_fields
```

Goal:

- zero critical silent errors,
- then reduce unnecessary review.

Do not reduce review by confirming weak evidence.

---

## 13. Silent error root cause analysis

Every silent error must be assigned root cause:

- OCR wrong high confidence
- parser over-normalized
- validator missing
- conflict validator failed
- template false match
- ROI projection wrong
- UI/export stripped status
- table arithmetic not run
- missing quality downgrade
- old value copied

Fix must target root cause.

---

## 14. Regression requirement

Every discovered silent error gets a regression test.

```text
bug → fixture → test → release gate
```

Do not rely on memory.

---

## 15. Final rule

The project can tolerate review. It cannot tolerate silent lies. Critical silent error rate is the release-defining metric.
