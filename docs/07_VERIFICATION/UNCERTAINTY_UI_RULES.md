# Uncertainty UI Rules — Edge DocGraph Engine

**Purpose:** Define how verifier statuses, warnings, conflicts, missing fields, invalid values, evidence, and correction controls are shown to the user.

---

## 1. Core UI principle

The UI must make uncertainty visible and actionable.

Bad UI:

```text
Field: DOB = 01/02/1999
```

Good UI:

```text
Date of Birth: 01/02/1999
Status: Needs review
Reason: Date format is ambiguous.
Evidence: source crop available
```

---

## 2. Status labels

Display explicit text labels:

- Confirmed
- Needs review
- Missing
- Conflict
- Invalid
- Unsupported
- Rejected

Do not rely on color alone.

---

## 3. Status visual treatment

Suggested UI behavior:

| Status | UI treatment |
|---|---|
| confirmed | normal/positive badge |
| needs_review | warning badge, review queue |
| missing | strong warning, expected region |
| conflict | strong warning, compare sources |
| invalid | strong warning, validation reason |
| unsupported | neutral warning, manual action |
| rejected | hidden from default form, recoverable in audit/debug |

---

## 4. Field card requirements

Each field card should show:

- label
- value/control
- status badge
- short reason
- evidence button
- confidence/details button
- correction controls

For critical fields, show unresolved status more prominently.

---

## 5. Evidence viewer

Every field should support “show evidence”.

Evidence viewer should show:

- source crop
- OCR text
- parser output
- detector/asset box
- template ROI
- validation results
- conflict sources
- correction history

For assets:

- raw crop
- refined crop/mask if available
- crop redraw controls

For tables:

- source crop
- grid overlay
- cell confidence
- arithmetic details

---

## 6. Needs-review UI

Needs-review fields should show:

- why review is needed
- source crop
- suggested value
- edit controls
- confirm button

Examples:

```text
Needs review: OCR confidence is low.
Needs review: Date format is ambiguous.
Needs review: Glare overlaps this field.
```

---

## 7. Missing UI

Missing field UI should show:

- field label
- required/optional status
- expected region if template-derived
- add value control
- draw/select region control
- skip/mark unavailable control if allowed

Example:

```text
Missing: Passport Number
Reason: Required template ROI contained no readable value.
```

---

## 8. Conflict UI

Conflict UI must compare both sides.

Example:

```text
Conflict: Date of Birth

Visual field:
  1999-03-01
  Source: page OCR crop

MRZ:
  1999-02-01
  Source: MRZ parser, checksum passed
```

Actions:

- choose visual value
- choose MRZ value
- enter corrected value
- mark unresolved

Resolution creates UserCorrectionEvidence.

---

## 9. Invalid UI

Invalid fields should show:

- value
- validator that failed
- reason
- source evidence
- correction input
- override option only if policy allows

Example:

```text
Invalid: MRZ check digit failed.
```

Critical invalid fields should not be silently exportable as confirmed.

---

## 10. Unsupported UI

Unsupported regions should show:

- region preview
- reason
- manual type selection
- manual extraction option
- option to ignore

Example:

```text
Unsupported: This symbol/region is not recognized by current parsers.
```

---

## 11. Confidence display

Do not show raw confidence as the main message.

Primary:

```text
Needs review: OCR confidence is low.
```

Secondary/details:

```text
OCR: 0.62
Template: 0.91
Validator: pass
Quality penalty: glare
```

---

## 12. Review queue

Provide a review queue sorted by priority:

1. conflicts
2. invalid critical fields
3. missing required fields
4. needs_review critical fields
5. unsupported meaningful regions
6. optional needs_review fields

This lets users fix important issues first.

---

## 13. Template match UI

When template matches:

```text
Matched template: Vendor Invoice v2
Mode: ROI-first extraction
```

Show warnings:

```text
Layout drift detected. Create new version?
```

When ambiguous:

```text
This document matches multiple templates. Choose one or process as new.
```

---

## 14. Quality warning UI

Show page-level warnings:

- blurry scan
- glare
- low resolution
- crop incomplete
- perspective severe

Field-level warnings should show only when relevant region overlaps warning.

Example:

```text
Expiry Date needs review because glare overlaps this region.
```

---

## 15. Export warnings

Before export, show summary:

```text
18 confirmed
2 need review
1 conflict
1 missing required
```

If unresolved critical fields exist:

```text
This export contains unresolved critical fields.
```

Offer export modes:

- export all with statuses
- export confirmed only
- cancel and review

---

## 16. Template save UI

Before saving template, show:

- fields to learn
- assets to learn
- tables to learn
- anchors selected
- required fields
- unresolved warnings
- active vs draft template choice

Warn:

```text
Unresolved conflicts will not be learned into active template.
```

---

## 17. Accessibility rules

- status conveyed by text, not color only
- keyboard accessible correction controls
- screen-reader labels for warnings
- high contrast states
- evidence overlays should have textual alternatives

---

## 18. Copywriting rules

Use clear messages.

Bad:

```text
Low confidence.
```

Good:

```text
Needs review because OCR confidence is low in this region.
```

Bad:

```text
Invalid.
```

Good:

```text
Invalid because the MRZ check digit failed.
```

---

## 19. Tests

UI tests should verify:

- each status label appears
- evidence button works
- conflict comparison shows both values
- missing field shows expected region
- export warning appears
- status not conveyed by color only
- correction creates evidence
- template save blocks unresolved critical issues

---

## 20. Final UI rule

The UI is part of the verification system. If the verifier knows uncertainty but the UI hides it, the product still silently lies. Status, reasons, evidence, and correction must be visible and actionable.
