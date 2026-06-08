# Error and Uncertainty Flow — Edge DocGraph Engine

**Purpose:** Define how low confidence, missing values, conflicts, invalid data, bad scans, model failures, parser failures, and review states move through the system.

---

## 1. Why this matters

The biggest product failure is not “the system did not extract everything.” The biggest failure is “the system confidently returned something wrong.”

This document defines how the system handles uncertainty and errors without silently lying.

---

## 2. Two different categories

The system must separate:

### 2.1 Operational errors

Something in the software failed.

Examples:

- PDF failed to render
- model failed to load
- worker crashed
- OPFS write failed
- unsupported file type
- out-of-memory error

### 2.2 Evidence uncertainty

The software worked, but the evidence is weak or conflicting.

Examples:

- OCR confidence low
- MRZ checksum failed
- glare covers a field
- barcode not decodable
- table columns ambiguous
- template match medium
- photo crop has no face
- two values conflict

Operational errors require recovery.  
Evidence uncertainty requires review/status.

---

## 3. Field status model

All field hypotheses must end in one of these statuses.

### confirmed

The field has enough evidence and passes critical validation.

### needs_review

The field is plausible but not safe to confirm.

### missing

A required or expected field has no sufficient evidence.

### conflict

Two or more evidence sources disagree.

### invalid

A value exists but fails required validation.

### unsupported

The system found something but cannot interpret it yet.

---

## 4. Status decision table

| Situation | Status |
|---|---|
| Strong OCR + correct geometry + validators pass | confirmed |
| OCR low confidence but plausible | needs_review |
| Field expected by template but no value found | missing |
| MRZ and visual field disagree | conflict |
| Date impossible or checksum fails | invalid/conflict depending context |
| Barcode present but unreadable | needs_review |
| Table detected but structure ambiguous | needs_review |
| Scan blur overlaps field | needs_review |
| Required asset absent | missing |
| Detector finds asset but verifier rejects it | needs_review or invalid |
| Unknown semantic region | unsupported |

---

## 5. Operational error flow

```text
module throws error
  → Error Router
  → classify error
  → attach to job
  → determine recoverability
  → update UI
  → optionally create graph warning
```

### 5.1 Recoverable errors

Examples:

- barcode decode failed
- OCR ROI failed but full-page OCR available
- segmentation failed but box crop available
- table model failed but geometric fallback exists

Action:

- continue pipeline
- record warning
- mark affected evidence uncertain

### 5.2 Non-recoverable errors

Examples:

- file cannot decode
- PDF cannot open
- no page image available
- critical storage write failure during save

Action:

- stop affected job
- show clear error
- preserve recoverable state if possible

---

## 6. Evidence uncertainty flow

```text
weak evidence
  → EvidenceRecord with confidence/warning
  → DocGraph node
  → hypothesis with uncertainty
  → validator result
  → verifier status
  → UI badge and evidence reason
```

Weak evidence should not disappear. It should be represented.

---

## 7. Low confidence handling

### 7.1 OCR low confidence

Actions:

1. retry with high-resolution ROI if appropriate
2. check template region support
3. use parser constraints
4. if still weak, mark needs_review

Do not:

- silently accept low-confidence OCR for critical fields
- replace with guessed value
- learn low-confidence extraction as template truth

### 7.2 Detector low confidence

Actions:

1. keep as candidate evidence if useful
2. do not create confirmed asset field
3. request review or user correction
4. if corrected, save region in TemplateGraph

### 7.3 Template low confidence

Actions:

1. do not run blind known-template extraction
2. ask user or run unknown flow
3. suggest new version only if family clues are strong

---

## 8. Missing field handling

A field is missing when the system expects it but cannot find supporting evidence.

Sources of expectation:

- saved TemplateGraph required field
- document type rule
- user-defined required field
- table schema requirement
- validator relationship

Missing field output:

```json
{
  "fieldId": "passport_number",
  "status": "missing",
  "reason": "Required template field region contained no readable value",
  "evidence": ["template_field_passport_number"]
}
```

UI should:

- highlight expected region if known
- allow user to add value/crop
- prevent confirmed export unless user accepts missing status

---

## 9. Conflict handling

Conflict occurs when evidence disagrees.

Examples:

- MRZ DOB vs visual DOB
- QR payload tax ID vs printed tax ID
- invoice table sum vs printed total
- template projected field vs nearby label mismatch
- OCR alternatives disagree strongly
- two candidate values for same label

Conflict flow:

```text
conflicting evidence
  → conflicts_with edge
  → ValidationResult fail/warn
  → FieldStatus = conflict
  → UI highlights both sources
  → user resolves
```

User resolution should become correction evidence.

---

## 10. Invalid handling

Invalid means a value exists but fails required validation.

Examples:

- impossible date
- invalid MRZ check digit
- amount contains illegal characters
- ID number fails template pattern
- email format invalid
- checkbox group violates exclusivity rule

Invalid fields should be shown more strongly than needs_review.

Rule:

> Critical invalid values cannot be confirmed unless the user explicitly overrides, and override must be recorded.

---

## 11. Bad scan handling

Quality Analyzer produces warnings.

Warnings:

- blur
- glare
- shadow
- low resolution
- crop incomplete
- perspective too severe
- overexposure
- underexposure

Quality affects verification.

Example:

```text
OCR confidence high but glare overlaps region → needs_review, not confirmed
```

Quality can also trigger rescan prompt:

```text
The document is too blurry to safely extract critical fields. Please rescan.
```

---

## 12. Parser failure handling

### 12.1 Barcode parser fails

If code is visible but unreadable:

- create code region node
- mark payload missing/needs_review
- allow manual entry if relevant

### 12.2 MRZ parser fails

If MRZ zone exists but checksum fails:

- store raw OCR
- store parsed partial fields if safe
- mark MRZ invalid/conflict
- do not confirm MRZ-derived fields

### 12.3 Table parser fails

If table is detected but structure fails:

- show table crop
- create review-first table
- allow manual correction
- optionally try SLANet_plus

---

## 13. Model failure handling

### 13.1 Detector model failure

If detector fails to load/run:

- show operational error
- optionally continue with OCR-only review-first mode if available
- do not pretend visual assets were searched

### 13.2 OCR model failure

If OCR fails:

- stop text extraction
- show error
- asset/code detection may continue if useful
- form generation likely limited

### 13.3 Segmentation failure

If segmentation fails:

- use detector box crop
- mark mask unavailable
- allow user crop correction

---

## 14. Template uncertainty handling

Template match states:

- strong match
- medium match
- weak match
- ambiguous match
- no match

Actions:

| Match state | Action |
|---|---|
| strong | run known-template extraction |
| medium | run cautious extraction, suggest new version |
| weak | run unknown flow |
| ambiguous | ask user or run unknown flow |
| no match | run unknown flow |

Never force a weak template match.

---

## 15. User override handling

Users may override uncertain or invalid values.

Rules:

- store override as UserCorrectionEvidence
- preserve original evidence and validators
- mark field as user_confirmed or user_overridden
- do not automatically generalize override to template unless user saves/updates template
- for invalid critical fields, show warning before override

---

## 16. UI status behavior

### confirmed

Show green status and allow export.

### needs_review

Show amber status and move to review list.

### missing

Show red/missing status and expected region if available.

### conflict

Show red/orange conflict status and both evidence sources.

### invalid

Show red status and validation reason.

### unsupported

Show gray status and allow manual correction.

Important:

Do not rely on color alone. Use text labels.

---

## 17. Error message rules

Error messages must be:

- specific
- actionable
- non-technical when user-facing
- linked to evidence when possible

Bad:

```text
Inference failed.
```

Good:

```text
Text recognition failed for this page. You can retry after reducing page size or continue with visual assets only.
```

Bad:

```text
Low confidence.
```

Good:

```text
The expiry date region is partly covered by glare. Please review this field.
```

---

## 18. Export behavior with uncertainty

Exports must include field status.

A JSON export should not hide uncertainty.

Example:

```json
{
  "expiryDate": {
    "value": "2030-01-01",
    "status": "needs_review",
    "reasons": ["OCR confidence low", "glare overlaps field"]
  }
}
```

User should be warned when exporting unresolved critical fields.

---

## 19. Template learning safety

Do not save uncertain fields as stable template facts without user confirmation.

Template save should:

- exclude rejected hypotheses
- include corrected fields
- mark required fields intentionally
- avoid learning variable values as anchors
- store unresolved fields as review-required template fields if user chooses

---

## 20. Metrics

Track:

- silent critical error rate
- needs_review rate
- conflict catch rate
- missing field detection rate
- invalid field detection rate
- user override rate
- template false match rate
- model failure rate
- bad scan rejection rate

---

## 21. Invariants

1. Uncertainty must be visible.
2. Operational errors must not be confused with evidence uncertainty.
3. Low confidence is not failure; silent wrong confirmation is failure.
4. Critical invalid values cannot be confirmed automatically.
5. Template matches must be conservative.
6. User overrides must be auditable.
7. Exports must preserve status.

---

## 22. Final summary

The error and uncertainty architecture is what makes the product trustworthy. The system should not attempt to be omniscient. It should extract evidence, expose uncertainty, ask for correction when needed, learn safely, and avoid silent wrong answers at all costs.
