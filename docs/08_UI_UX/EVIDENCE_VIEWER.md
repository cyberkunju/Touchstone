# Evidence Viewer — Edge DocGraph Engine

**Purpose:** Define the UI for inspecting evidence: source crops, OCR tokens, detections, parser output, validator results, graph links, confidence breakdown, and correction history.

---

## 1. Evidence viewer role

The evidence viewer explains why the system produced a field or status.

It must answer:

- what was extracted?
- where did it come from?
- which model/parser found it?
- what validators checked it?
- why is it confirmed or uncertain?
- was it corrected?
- what conflicts exist?

---

## 2. Opening the evidence viewer

Entry points:

- field card “Show evidence”
- document overlay click
- conflict card
- table cell
- asset crop
- MRZ panel
- QR/barcode panel
- developer/audit mode

Evidence viewer can be:

- side drawer
- bottom drawer
- modal for deep audit
- pinned panel

---

## 3. Evidence viewer layout

Recommended:

```text
Header:
  Field/Node name, status, short reason

Source:
  crop preview / page region / overlay jump

Evidence list:
  OCR
  detection
  parser
  template projection
  validation
  user correction

Details:
  confidence breakdown
  provenance
  graph links
```

---

## 4. Header

Show:

- field label
- value
- status
- short reason
- page number
- source type

Example:

```text
Date of Birth
01/02/1999
Needs review — date format is ambiguous.
Page 1
```

---

## 5. Source crop panel

For text fields:

- show crop around value
- show label crop if available
- show OCR boxes/tokens
- show template ROI if used

For assets:

- raw crop
- refined/mask crop if available
- source page region

For tables:

- table crop
- highlighted cell/row/column
- grid overlay

For MRZ:

- MRZ crop
- raw OCR lines

For QR/barcode:

- code crop
- decoded payload

---

## 6. OCR evidence section

Show:

- raw OCR text
- normalized text
- confidence
- OCR mode
- model name/version
- source coordinates
- alternatives if available

Example:

```text
OCR text: 01/02/1999
Confidence: 0.86
Mode: ROI OCR
Model: PP-OCRv5 mobile 0.1.0
```

---

## 7. Detection evidence section

Show:

- detected class
- confidence
- box
- model/version
- NMS/threshold config if developer mode

Example:

```text
Detected object: signature
Confidence: 0.84
Model: YOLOv11n-doc 0.1.0
```

---

## 8. Parser evidence section

For MRZ:

- raw lines
- normalized lines
- format
- parsed fields
- check digit results

For barcode:

- code type
- raw payload
- parsed payload
- payload safety warning

For amount/date/ID parser:

- raw value
- normalized candidate
- ambiguity/parse details

---

## 9. Validator results section

Show all relevant validators:

- validator name
- pass/warn/fail
- severity
- message
- details
- evidence IDs

Example:

```text
MRZ DOB match: Failed
MRZ date of birth is 1999-02-01, visual value is 1999-03-01.
```

---

## 10. Confidence breakdown

Show:

```text
Overall: 0.82
OCR: 0.91
Geometry: 0.84
Template: 0.88
Validator: warning
Quality penalty: glare
```

Do not make numeric confidence primary; it is for explanation.

---

## 11. Graph links

Developer/audit mode should show:

- hypothesis ID
- node IDs
- evidence IDs
- edge IDs
- validation IDs
- template field ID
- correction IDs

Normal user mode should show plain-language relationships.

Example:

```text
This value was read from the saved Date of Birth region and checked against MRZ.
```

---

## 12. Conflict evidence

Conflict viewer must show both sides.

Example:

```text
Conflict: Date of Birth

Visual OCR:
  1999-03-01
  Crop: [image]
  Evidence: ev_ocr_dob

MRZ:
  1999-02-01
  Check digits: passed
  Evidence: ev_mrz
```

Actions:

- choose visual
- choose MRZ
- enter corrected value
- keep unresolved

---

## 13. Correction history

Show:

- original value
- corrected value
- correction type
- timestamp
- affected validators
- template update decision if any

Example:

```text
User corrected label from "DOB" to "Date of Birth".
```

---

## 14. Template evidence

If field came from template:

Show:

- template name/version
- match score
- projected ROI confidence
- alignment confidence
- drift warning if any
- template field ID in developer mode

Example:

```text
Extracted from Vendor Invoice v2 template.
Projection confidence: 0.93.
```

---

## 15. Quality evidence

Show field-relevant quality warnings.

Example:

```text
Glare overlaps this field region.
```

Do not overwhelm user with page-level quality warnings unrelated to selected field.

---

## 16. Evidence actions

Possible actions:

- edit value
- edit label
- redraw region
- change type
- reject field
- add as template anchor
- copy raw OCR
- copy parsed payload
- export evidence package, developer mode

---

## 17. Privacy

Evidence viewer may show sensitive data.

Rules:

- do not expose debug logs unnecessarily
- warn before exporting evidence/crops
- hide sensitive raw values in shared/demo mode if implemented
- no network actions from payloads

---

## 18. Accessibility

Evidence drawer must support:

- keyboard navigation
- screen-reader text for crops
- focus management
- escape to close
- status text labels
- non-color pass/fail indicators

---

## 19. Tests

Test evidence viewer for:

- text field
- date field
- asset
- table cell
- MRZ
- QR/barcode
- conflict
- template-projected field
- user-corrected field
- quality warning
- missing field

Assertions:

- evidence IDs present
- source crop displayed
- validators shown
- conflict shows both sides
- actions create corrections

---

## 20. Evidence viewer invariants

1. Every field evidence viewer shows source evidence.
2. Conflicts show both sides.
3. Validator failures are visible.
4. Template projection is shown when used.
5. User corrections are visible.
6. Sensitive data is not exported without explicit action.
7. Developer details do not clutter normal mode.

---

## 21. Final evidence viewer statement

The evidence viewer is the trust microscope. It lets users and developers inspect every field, understand every status, and correct the graph with confidence.
