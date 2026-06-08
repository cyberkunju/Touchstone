# Unknown Document Flow — Edge DocGraph Engine

**Purpose:** Define the full extraction path for new documents that do not confidently match a saved TemplateGraph.

---

## 1. What is an unknown document?

A document is unknown when:

- no saved template exists,
- template match score is low,
- template match is ambiguous,
- layout differs significantly from known templates,
- document type is new,
- required anchors are missing,
- verifier rejects template projection,
- user chooses to process as new.

Unknown-document flow is discovery-first and review-first.

---

## 2. High-level flow

```text
upload
  → input processing
  → page normalization
  → quality analysis
  → broad evidence extraction
  → DocGraph construction
  → hypothesis generation
  → verification
  → editable form
  → correction
  → optional TemplateGraph save
```

---

## 3. Flow diagram

```text
┌──────────────────────┐
│ Uploaded file        │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Input processing     │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Page normalization   │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Quality analysis     │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Evidence extraction  │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ DocGraph build       │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Hypotheses           │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Verification         │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Editable form        │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Correction + learn   │
└──────────────────────┘
```

---

## 4. Stage 1 — Input processing

Input types:

- image
- PDF
- multi-page PDF
- scanned PDF
- digital PDF

Outputs:

- DocumentRecord
- PageRecord[]
- raw artifact references
- preliminary metadata

Rules:

- no cloud upload
- do not block main thread
- handle errors gracefully
- process multi-page documents incrementally

---

## 5. Stage 2 — Page normalization

For each page:

1. decode/render page
2. detect orientation
3. detect boundary
4. correct perspective
5. deskew
6. normalize contrast
7. create canonical coordinate system
8. store transforms
9. produce quality report

If page quality is unsafe:

- warn user
- allow review-first extraction if possible
- avoid confirmed critical fields

---

## 6. Stage 3 — Template pre-check

Even in unknown flow, check whether a template exists.

If strong match:

- switch to known-template flow

If medium match:

- process as possible new version

If low match:

- continue unknown flow

This prevents unnecessary broad extraction for repeated documents.

---

## 7. Stage 4 — Broad evidence extraction

Unknown documents require broad discovery.

### 7.1 Detector pass

Run YOLOv11n custom detector to find:

- document page
- text blocks
- photo
- signature
- stamp
- seal
- logo
- QR/barcode
- MRZ zone
- table
- checkbox
- expanded classes later

Detector evidence creates candidate nodes.

### 7.2 OCR pass

Run OCR in controlled modes:

- full-page OCR for global context
- detected text-block OCR
- high-resolution OCR on small detected regions
- special OCR for MRZ
- special OCR for table cells after table detection

Do not overuse full-page high-resolution OCR if it hurts edge performance. Use it strategically.

### 7.3 Visual asset extraction

For detected visual assets:

- create crop
- store coordinates
- run segmentation only if needed
- classify asset type
- allow later user correction

### 7.4 Code parsing

Run zxing-wasm on:

- detected code regions
- high-probability code areas
- optionally whole page at reduced scale if detector misses codes

### 7.5 MRZ parsing

If MRZ zone exists:

- OCR MRZ region
- normalize characters
- parse format
- validate check digits
- store parsed fields
- create conflict evidence if checks fail

### 7.6 Table extraction

For detected tables:

- geometry reconstruction
- OCR cell assignment
- header detection
- row/column inference
- arithmetic checks if applicable
- SLANet_plus trial if geometry fails

### 7.7 Face check

For photo candidates:

- run MediaPipe Face Detector
- mark photo crop as portrait if face detected
- mark uncertain if no face found

---

## 8. Stage 5 — DocGraph construction

Convert evidence into graph.

Nodes:

- PageNode
- TextNode
- VisualAssetNode
- CodeNode
- MRZNode
- TableNode
- TableCellNode
- CheckboxNode
- ValidationNode

Edges:

- contains
- near
- label_of
- value_of
- same_row
- same_column
- inside_table
- validated_by
- conflicts_with

DocGraph must preserve all evidence, including wrong or uncertain evidence.

---

## 9. Stage 6 — Hypothesis generation

Generate:

- field hypotheses
- visual asset hypotheses
- table hypotheses
- checkbox hypotheses
- parser-backed hypotheses

### 9.1 Label-value discovery

Signals:

- colon patterns
- same row
- label left of value
- label above value
- nearby blank boxes
- label aliases
- type parsers
- document type clues

### 9.2 Asset discovery

Signals:

- detector class
- crop shape
- face check
- template-like position
- nearby label
- user asset type history

### 9.3 Table discovery

Signals:

- detected table box
- line geometry
- OCR grid
- column headers
- amount/date patterns

### 9.4 Special fields

MRZ and barcode parser outputs may create or validate fields.

Examples:

- document number from MRZ
- DOB from MRZ
- QR payload tax ID
- PDF417 license data

---

## 10. Stage 7 — Verification

Verifier assigns statuses.

Unknown documents are naturally less certain. The verifier should be stricter for confirmed status.

### 10.1 Confirmed

Use only if:

- evidence is strong
- validators pass
- geometry is plausible
- no conflict exists
- scan quality is acceptable

### 10.2 Needs review

Use when:

- plausible value exists
- evidence is incomplete
- confidence is low
- date format ambiguous
- visual region partially degraded
- parser uncertain

### 10.3 Missing

Use when:

- expected field inferred but no value found
- template/version candidate expects field
- user-marked required field absent

### 10.4 Conflict

Use when evidence disagrees.

### 10.5 Invalid

Use when required validation fails.

---

## 11. Stage 8 — Form generation

Generate an editable form from verified/reviewable hypotheses.

Sections may be inferred from:

- document title
- layout regions
- table blocks
- template family
- field groups

Controls:

- text
- date
- amount
- ID
- image asset
- table
- checkbox
- code payload
- unknown field

All fields show:

- status
- confidence
- evidence button
- correction controls

---

## 12. Stage 9 — User correction

Unknown document flow expects correction.

User can:

- rename labels
- edit values
- change field types
- redraw regions
- assign visual assets
- fix tables
- fix checkboxes
- add missing fields
- delete false fields
- save as template

Corrections update DocGraph.

---

## 13. Stage 10 — TemplateGraph creation

If user saves template:

1. build template from corrected DocGraph
2. identify stable anchors
3. store variable field regions
4. store asset regions
5. store validators
6. store aliases
7. store relationships
8. store table schemas
9. create family/version
10. persist locally

Important:

Do not learn variable values as anchors unless explicitly marked static.

---

## 14. Unknown flow output

Output package:

```ts
type UnknownDocumentResult = {
  documentId: string;
  pages: PageResult[];
  docGraphId: string;
  formSchemaId: string;
  formValuesId: string;
  qualityWarnings: string[];
  reviewRequired: boolean;
  suggestedTemplateSave: boolean;
};
```

---

## 15. Failure modes

### 15.1 Bad scan

Action:

- quality warning
- rescan prompt
- low-confidence statuses

### 15.2 Low OCR quality

Action:

- high-res ROI retry
- mark needs_review
- preserve OCR alternatives

### 15.3 Detector misses assets

Action:

- user can add asset manually
- correction updates template

### 15.4 Table reconstruction fails

Action:

- show table crop
- create review-first table
- allow manual correction
- optionally try SLANet_plus

### 15.5 Too many false fields

Action:

- lower field hypothesis confidence
- require stronger verification
- improve label/value rules
- user deletes false fields

---

## 16. Performance rules

Unknown flow can be slower than known flow, but must remain responsive.

Rules:

- all heavy work in workers
- progress events
- cancellation
- lazy model loading
- avoid full-page segmentation
- batch OCR crops
- page-by-page processing
- cache model files

---

## 17. UI behavior

Unknown document UI should communicate:

```text
This is a new layout. Review is required before saving a template.
```

Show:

- uncertain fields first
- missing required-like fields
- conflicts
- extracted visual assets
- table warnings
- quality warnings

Encourage:

- correction
- save template if this layout will repeat

---

## 18. Unknown flow invariants

1. Unknown documents are review-first.
2. Do not over-confirm fields.
3. Every field must have evidence.
4. Every correction must be captured.
5. Template save must be explicit.
6. Bad scans must not produce confirmed critical fields.
7. User can always inspect evidence.
8. Output must be useful even when imperfect.

---

## 19. Final summary

Unknown-document flow is the discovery engine. Its job is not to be magically perfect on first upload. Its job is to extract evidence, propose useful fields, show uncertainty, let the user correct, and create a reliable TemplateGraph for future speed and accuracy.
