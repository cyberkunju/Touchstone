# Provenance and Audit — Edge DocGraph Engine

**Purpose:** Define how every output knows where it came from, how corrections are tracked, and how the system remains debuggable, trustworthy, and auditable.

---

## 1. Core requirement

Every final output must answer:

1. What is the value?
2. Where did it come from?
3. Which evidence supports it?
4. Which model/parser/validator produced that evidence?
5. Which page and coordinates contain the source?
6. Was it corrected by the user?
7. Was it projected from a template?
8. Which validators passed or failed?
9. Why is the status confirmed/review/conflict/missing/invalid?

If the system cannot answer these, the output is not acceptable.

---

## 2. ProvenanceRecord

```ts
type ProvenanceRecord = {
  id: string;
  actor:
    | "system"
    | "model"
    | "parser"
    | "validator"
    | "template_engine"
    | "user";

  action: string;

  sourceId?: string;
  targetId?: string;

  modelName?: string;
  modelVersion?: string;

  parserName?: string;
  parserVersion?: string;

  timestamp: number;

  parameters?: Record<string, unknown>;
};
```

---

## 3. Provenance examples

### OCR

```json
{
  "actor": "model",
  "action": "ocr_recognized_text",
  "modelName": "pp-ocrv5-mobile",
  "modelVersion": "0.1.0",
  "targetId": "ev_ocr_1"
}
```

### Detector

```json
{
  "actor": "model",
  "action": "detected_document_object",
  "modelName": "yolov11n-doc",
  "modelVersion": "0.1.0",
  "targetId": "ev_det_1"
}
```

### MRZ parser

```json
{
  "actor": "parser",
  "action": "parsed_mrz_td3",
  "parserName": "mrz-parser",
  "parserVersion": "0.1.0",
  "targetId": "ev_mrz_1"
}
```

### User correction

```json
{
  "actor": "user",
  "action": "edited_field_value",
  "sourceId": "field_dob",
  "targetId": "ev_corr_1"
}
```

---

## 4. Audit chain

A final field should have an audit chain.

Example:

```text
Field: Passport Number
  ← FieldHypothesis hyp_passport_number
  ← OCR evidence ev_ocr_23
  ← Template ROI evidence ev_tpl_5
  ← MRZ evidence ev_mrz_1
  ← Validation val_mrz_doc_number_pass
  ← Verifier decision confirmed
```

If user corrected:

```text
Field: Passport Number
  ← original OCR evidence
  ← user correction evidence
  ← revalidation
  ← final status user_confirmed
```

---

## 5. Audit trail storage

Audit data lives in:

- EvidenceRecord.provenance
- DocGraph.provenance
- ValidationResult
- CorrectionNode
- GraphEdge evidenceIds
- FieldHypothesis evidenceIds/reasons

Do not create a separate hidden audit system disconnected from DocGraph.

---

## 6. User correction audit

User corrections must store:

- correction kind
- target field/node
- before value
- after value
- timestamp
- affected evidence
- validation after correction
- template save/update decision if any

Important:

Do not delete original model evidence after correction.

---

## 7. Template audit

When TemplateGraph is used:

Store:

- template ID
- family ID
- version
- match score
- match reasons
- alignment transforms
- projected ROIs
- fields extracted from template
- fields missing from template
- drift report

This makes known-template extraction debuggable.

---

## 8. Validator audit

For each validator:

Store:

- validator ID
- target field/node
- input evidence IDs
- result
- severity
- message
- details
- timestamp

Example:

```json
{
  "validatorId": "mrz_check_digit",
  "targetId": "field_passport_number",
  "status": "pass",
  "severity": "critical",
  "message": "MRZ document number check digit passed."
}
```

---

## 9. Conflict audit

When conflict occurs, store both sides.

Example:

```json
{
  "conflictType": "value_mismatch",
  "field": "dateOfBirth",
  "left": {
    "source": "visual_ocr",
    "value": "1999-02-01",
    "evidenceId": "ev_ocr_dob"
  },
  "right": {
    "source": "mrz_parser",
    "value": "1999-03-01",
    "evidenceId": "ev_mrz_dob"
  }
}
```

User should be able to inspect both.

---

## 10. Export audit

Exported data should include:

- value
- status
- evidence IDs
- validation IDs
- confidence reasons
- optional source coordinates
- optional audit trail

Minimal export:

```json
{
  "passportNumber": {
    "value": "A1234567",
    "status": "confirmed",
    "evidenceIds": ["ev_ocr_12", "ev_mrz_4"],
    "validationIds": ["val_mrz_doc_num"]
  }
}
```

---

## 11. Debug packages

A debug package may include:

- redacted DocGraph
- evidence records
- model versions
- pipeline timings
- failure messages
- selected crops
- validation results

Debug package export must be explicit because it may contain sensitive data.

---

## 12. Privacy considerations

Audit trails can contain sensitive content.

Sensitive provenance/evidence includes:

- OCR text
- MRZ data
- barcode payloads
- names
- dates of birth
- financial totals
- addresses
- image crops

Rules:

- no raw sensitive logs by default
- encrypt stored sensitive records where feasible
- warn before export
- allow deletion
- keep local-only

---

## 13. Audit UI

Evidence viewer should show:

- source crop
- model/parser source
- confidence
- validation status
- correction history
- template source
- conflict details
- raw and normalized values

For normal users, show simple reasons.  
For developers, show full audit data.

---

## 14. Event timeline

DocGraph may expose a timeline:

```text
10:00:01 page normalized
10:00:02 OCR recognized DOB field
10:00:03 MRZ parsed
10:00:03 validator found date conflict
10:00:05 user corrected DOB
10:00:05 verifier updated status
10:00:07 template saved
```

Useful for debugging and trust.

---

## 15. Audit invariants

1. Every confirmed field must have evidence.
2. Every user correction must preserve before/after.
3. Every template projection must store template metadata.
4. Every validator result must cite target/evidence.
5. Conflicts must show both evidence sources.
6. Exports must preserve status.
7. Sensitive audit data must not leak.

---

## 16. Final statement

Provenance and auditability are what make the engine trustworthy. The system should not merely output values; it should explain how it got them, why it trusts them, and what changed when the user corrected them.
