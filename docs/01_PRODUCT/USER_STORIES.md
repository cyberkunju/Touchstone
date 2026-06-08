# User Stories — Edge DocGraph Engine

**Purpose:** Define product behavior from user and system perspectives.  
**Format:** User story, acceptance criteria, edge cases, and notes.  
**Principle:** Every story should reinforce local processing, evidence, correction, and template learning.

---

## 1. Actors

### Primary actors

- **Document operator:** Uploads documents, reviews forms, corrects outputs, exports data.
- **Template creator:** Corrects first-time documents and saves reusable templates.
- **Privacy-conscious user:** Requires all extraction to run locally.
- **Open-source developer:** Extends models, validators, parsers, or UI.
- **Power user:** Processes repeated document formats and wants fast extraction.

### System actors

- **Input Manager**
- **Page Normalizer**
- **Evidence Extractor**
- **DocGraph Builder**
- **Hypothesis Generator**
- **Verifier**
- **Form Renderer**
- **Correction Capture Engine**
- **TemplateGraph Engine**
- **Storage and Encryption Layer**

---

## 2. Upload and ingestion stories

### Story 2.1 — Upload an image document

As a document operator, I want to upload a document image so that the app can extract fields and generate a form locally.

Acceptance criteria:

- User can upload PNG, JPEG, or WebP.
- The document appears in the viewer.
- The file is processed locally.
- The app creates a document record and page record.
- If the image cannot be decoded, the user receives a clear error.
- No upload to a server occurs.

Edge cases:

- very large image
- tiny image
- corrupted image
- unsupported file type
- rotated image
- document photographed on a cluttered background

---

### Story 2.2 — Upload a PDF

As a document operator, I want to upload a PDF so that the app can extract form data from digital or scanned pages.

Acceptance criteria:

- User can upload a PDF.
- The app detects page count.
- The app renders page previews.
- For digital PDFs, embedded text extraction is attempted.
- For scanned PDFs, pages are treated as images.
- Multi-page documents are displayed page-by-page.
- All processing remains local.

Edge cases:

- password-protected PDF
- damaged PDF
- image-only PDF
- vector-heavy PDF
- huge multi-page PDF
- PDF with embedded images and text layers

---

### Story 2.3 — Detect bad scan quality

As a user, I want the app to warn me when a scan is too poor so that I do not trust wrong extraction.

Acceptance criteria:

- App detects blur, glare, low resolution, missing corners, and severe skew.
- App shows a clear warning.
- App either requests rescan or marks affected fields as low confidence.
- The warning is stored as page quality evidence.

Edge cases:

- only part of page is blurry
- glare covers one field
- document boundary is incomplete
- dark image with readable text
- high-resolution image with motion blur

---

## 3. Unknown document extraction stories

### Story 3.1 — Generate a tentative form from an unknown document

As a user, I want the app to create an editable form from a document it has never seen before.

Acceptance criteria:

- The app detects page structure.
- The app extracts OCR text with coordinates.
- The app detects visual assets.
- The app detects tables and codes where present.
- The app creates field hypotheses.
- The app generates a form from hypotheses.
- Every field has a status.
- Every field has evidence.

Edge cases:

- document has no clear labels
- document is mostly table
- document contains multiple languages
- document has handwriting
- document has decorative graphics
- document has repeated labels
- document has multiple similar values

---

### Story 3.2 — Show evidence for a generated field

As a user, I want to click a form field and see where it came from.

Acceptance criteria:

- Clicking a field highlights the source region on the document.
- Evidence panel shows OCR tokens, crop, parser output, validator results, and template source if any.
- If a field is uncertain, the evidence panel explains why.
- Evidence can include multiple sources.

Example:

```text
Field: Date of Birth
Value: 01/02/1999
Status: needs_review
Reasons:
- OCR confidence high
- nearby label "DOB" matched alias
- date validator passed
- date format ambiguous
```

---

### Story 3.3 — Extract visual assets

As a user, I want photos, signatures, stamps, seals, logos, and symbols to appear as form fields when relevant.

Acceptance criteria:

- Visual assets are detected and shown as crop previews.
- Asset type is shown.
- User can change asset type.
- User can redraw or adjust crop.
- Asset nodes store coordinates and crop IDs.
- Asset fields have evidence and confidence.

Edge cases:

- stamp overlaps signature
- logo appears in background
- portrait photo is partly cropped
- seal is faint
- multiple signatures exist
- visual asset contains text

---

### Story 3.4 — Extract codes

As a user, I want QR codes, barcodes, and PDF417 codes to be decoded locally.

Acceptance criteria:

- Code regions are detected or scanned.
- zxing-wasm decodes payloads.
- Payload is stored as evidence.
- Payload can be shown in form.
- Payload can cross-check printed fields where possible.
- Undecodable codes are marked needs_review.

Edge cases:

- partial QR
- low contrast barcode
- multiple codes
- code payload contains JSON
- PDF417 on ID card
- code rotated

---

### Story 3.5 — Extract and validate MRZ

As a user processing an identity document, I want MRZ data to be parsed and validated.

Acceptance criteria:

- MRZ zone is detected.
- MRZ OCR runs on the region.
- Parser detects TD1, TD2, or TD3.
- Check digits are validated.
- Parsed fields are linked to form fields.
- MRZ conflicts are shown clearly.

Edge cases:

- OCR reads O as 0
- MRZ is blurred
- MRZ is partially cut off
- MRZ is missing
- visual field disagrees with MRZ
- checksum fails

---

## 4. Correction stories

### Story 4.1 — Correct a field label

As a user, I want to rename a generated field label so the form matches my meaning.

Acceptance criteria:

- User can edit the label.
- The original detected label remains in provenance.
- The correction updates the FieldNode.
- If saved as template, the corrected label becomes part of TemplateGraph.
- Aliases can be stored.

Edge cases:

- user renames label to duplicate existing field
- label belongs to a table column
- label is not visible in document but user adds it manually

---

### Story 4.2 — Correct a field value

As a user, I want to edit a wrong extracted value.

Acceptance criteria:

- User can edit value.
- Original OCR evidence remains stored.
- User correction evidence is added.
- Field status updates.
- Verifier re-runs affected validators.
- Template memory does not learn the literal value as static unless user marks it as an anchor.

Important rule:

> Do not accidentally learn variable values as template anchors.

---

### Story 4.3 — Change field type

As a user, I want to change a field from text to date, amount, ID number, checkbox, image, table, or another type.

Acceptance criteria:

- Field type can be changed.
- Validators update based on type.
- UI control updates based on type.
- Template field type updates if saved.

Edge cases:

- type change makes current value invalid
- type change requires a different parser
- type change affects table or asset relationship

---

### Story 4.4 — Redraw a crop or region

As a user, I want to adjust a field or asset region.

Acceptance criteria:

- User can draw or resize a box on the document viewer.
- Region updates in DocGraph.
- Source crop updates.
- If saved, TemplateGraph stores normalized region.
- Verifier re-runs extraction/validation if needed.

Edge cases:

- crop spans multiple pages
- crop overlaps another field
- crop contains no OCR text
- crop is for image asset

---

### Story 4.5 — Add a missing field

As a user, I want to add a field the system missed.

Acceptance criteria:

- User can create a new field.
- User can select source region.
- User can define label, type, value, and required status.
- Field becomes a DocGraph node.
- If saved as template, it becomes a TemplateField.

---

### Story 4.6 — Delete a false field

As a user, I want to delete a field the system created incorrectly.

Acceptance criteria:

- User can remove field from form.
- Underlying evidence is not destroyed.
- DocGraph marks hypothesis as rejected.
- TemplateGraph does not save rejected field.

---

### Story 4.7 — Correct a table

As a user, I want to fix rows, columns, headers, or cells in an extracted table.

Acceptance criteria:

- User can edit cell values.
- User can merge/split cells.
- User can mark header rows.
- User can add/remove rows or columns.
- Table correction updates DocGraph.
- TemplateGraph stores corrected table schema if saved.

---

## 5. Template learning stories

### Story 5.1 — Save corrected document as a template

As a user, I want to save a corrected document so similar documents can be extracted faster later.

Acceptance criteria:

- User can choose “Save as template.”
- App asks for template name and document type.
- TemplateGraph stores anchors, fields, assets, tables, validators, aliases, and relationships.
- Template is stored locally.
- User can see the template in template list.

---

### Story 5.2 — Update an existing template

As a user, I want to update a template when I intentionally improve it.

Acceptance criteria:

- User can choose “Update existing template.”
- App warns if changes are major.
- Template version metadata updates.
- Previous version can be preserved or migrated depending on policy.
- Update records correction provenance.

---

### Story 5.3 — Create a new template version

As a user, I want the app to create a new version when a similar document layout changes.

Acceptance criteria:

- App detects medium match but structural drift.
- App suggests new version.
- User can accept or reject.
- New version shares family ID.
- Old version remains usable.

---

### Story 5.4 — Do not learn from this document

As a user, I want to process a document without saving its structure.

Acceptance criteria:

- User can choose not to save template.
- Document can still be exported.
- No TemplateGraph is created.
- Temporary graph can be deleted.

---

## 6. Known-template extraction stories

### Story 6.1 — Automatically match a saved template

As a user, I want the app to recognize a document layout I corrected before.

Acceptance criteria:

- App retrieves candidate templates.
- App scores candidates using multiple signals.
- App shows matched template and confidence.
- If match is weak, app asks for review or treats as unknown.

Signals:

- text anchors
- visual anchors
- page geometry
- layout fingerprint
- keypoint anchors
- special zones
- required-field presence

---

### Story 6.2 — Fast ROI-first extraction

As a user, I want repeated documents to process faster than unknown documents.

Acceptance criteria:

- Known-template flow projects saved ROIs.
- OCR runs on projected field regions first.
- Asset crops are taken from projected asset regions.
- Parsers run only where expected.
- Full unknown pipeline runs only if template match fails.
- Extraction is faster than first-time extraction.

---

### Story 6.3 — Verify known-template extraction

As a user, I want the app to verify repeated extraction instead of blindly trusting the template.

Acceptance criteria:

- Required fields are checked.
- Validators run.
- Template anchor drift is checked.
- Field values are marked confirmed/needs_review/missing/conflict/invalid.
- Fields that fail validation are highlighted.

---

## 7. Export stories

### Story 7.1 — Export form values

As a user, I want to export extracted data.

Acceptance criteria:

- Export JSON includes field labels, values, types, confidence, status, and evidence references.
- User can optionally export CSV for flat fields.
- Tables can export to CSV/JSON.
- Assets can be exported separately.

---

### Story 7.2 — Export evidence package

As a developer or power user, I want to export a debug package.

Acceptance criteria:

- Package includes DocGraph, TemplateGraph if relevant, evidence metadata, and redacted crops if user chooses.
- Export must be explicit.
- Sensitive data warning is shown.

---

### Story 7.3 — Import/export templates

As a user, I want to move templates between devices.

Acceptance criteria:

- User can export a TemplateGraph.
- User can import a TemplateGraph.
- App validates schema version.
- App warns about sensitive anchors/crops.
- Imported templates are stored locally.

---

## 8. Privacy stories

### Story 8.1 — Process without cloud

As a privacy-conscious user, I want the app to process documents without sending them to a server.

Acceptance criteria:

- App works offline after required models are cached.
- No extraction request is sent to a server.
- No document telemetry is sent by default.
- Privacy policy is clear.

---

### Story 8.2 — Delete local data

As a user, I want to delete documents, templates, and extracted data.

Acceptance criteria:

- User can delete a document.
- User can delete a template.
- User can clear model cache separately.
- Deleted sensitive data is no longer accessible from app storage.

---

## 9. Developer stories

### Story 9.1 — Add a new validator

As a developer, I want to add a validator without changing core graph logic.

Acceptance criteria:

- Validator implements standard interface.
- Validator output creates ValidationResult.
- UI can display validator result.
- Tests can cover validator behavior.

---

### Story 9.2 — Add a new document object class

As a developer, I want to add a detector class such as `seal` or `emblem`.

Acceptance criteria:

- Class is added to schema.
- Detector can output the class.
- DocGraph can store it.
- UI can display it.
- TemplateGraph can save it.
- Tests are updated.

---

### Story 9.3 — Add a new parser

As a developer, I want to add a parser for a new code or structured region.

Acceptance criteria:

- Parser returns evidence records.
- Parser results are graph nodes or validation nodes.
- Parser does not bypass DocGraph.
- Parser is testable independently.

---

## 10. Negative user stories

The product must avoid these outcomes:

### Story 10.1 — Confident wrong value

As a user, I do not want a wrong value shown as confirmed.

Acceptance criteria:

- Wrong values should be needs_review, conflict, missing, or invalid when evidence is weak.
- Silent critical error rate is measured.

### Story 10.2 — Template corruption

As a user, I do not want a new layout to break an old template.

Acceptance criteria:

- Layout drift triggers versioning.
- Old templates remain available.
- Major corrections require explicit save/update decision.

### Story 10.3 — Hidden data flow

As a user, I do not want sensitive documents silently uploaded.

Acceptance criteria:

- No cloud processing.
- No telemetry by default.
- Export/import is explicit.

---

## 11. Story priority

### Must-have for v1

- upload image/PDF
- page normalization
- OCR with coordinates
- document object detection
- basic visual asset extraction
- barcode/QR parsing
- MRZ parsing
- table region extraction
- DocGraph creation
- form generation
- evidence viewer
- correction capture
- TemplateGraph save
- known-template matching
- ROI-first extraction
- verifier statuses
- local storage

### Should-have for v1

- SLANet_plus table trial
- PP-LCNet orientation trial
- segmentation refinement trial
- template version suggestions
- template import/export
- Tauri packaging path

### Later

- template marketplace
- advanced redaction
- mobile camera capture mode
- domain-specific plugins
- full desktop quality pack
- multi-document batch processing
- collaborative template editing

---

## 12. Story acceptance philosophy

A story is not complete when it works on one clean sample. It is complete when:

1. it stores evidence,
2. it preserves coordinates,
3. it handles uncertainty,
4. it updates DocGraph,
5. it can be corrected,
6. it does not corrupt templates,
7. it is tested on bad inputs,
8. it respects local-only privacy.
