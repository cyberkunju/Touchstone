# Master PRD — Edge DocGraph Engine

**Version:** 1.0  
**Status:** Build-ready master product specification  
**Product type:** Local-only intelligent document-to-form engine  
**Primary principle:** No hallucinated fields. Every field needs evidence.

---

## 1. Product definition

Edge DocGraph Engine is a local-only document perception and form-generation system. It accepts document images and PDFs, extracts visible and semantic evidence, generates an editable form, captures manual corrections, saves corrected structures as local reusable templates, and uses those templates to process future similar documents quickly and safely.

The system is not a plain OCR pipeline. It is not a generic vision-language-model wrapper. It is a coordinate-grounded evidence graph engine. Text, photos, signatures, stamps, seals, logos, symbols, tables, checkboxes, barcodes, QR codes, MRZ zones, field labels, field values, validation results, and user corrections all become evidence inside a single DocGraph.

---

## 2. Product vision

The app should behave like a careful human document examiner running locally on the user's device.

On first upload, it examines the page, extracts evidence, generates a tentative form, and clearly shows what it believes and why. It must never pretend uncertainty is certainty. If a value is ambiguous, missing, conflicting, invalid, blurry, or not sufficiently supported, it must mark the field for review.

After the user corrects the form, the app saves a TemplateGraph. A TemplateGraph is not just a list of rectangles. It stores anchors, field regions, visual asset regions, aliases, validators, relationships, table schemas, evidence links, and version metadata. When a similar document is uploaded later, the app aligns the new page to the saved template, extracts known regions first, validates values, and fills the form quickly.

The long-term vision is to remove repetitive data entry while preserving trust, transparency, privacy, and user control.

---

## 3. Target users

### 3.1 Primary users

- People who repeatedly process similar documents.
- Small businesses handling invoices, receipts, forms, IDs, certificates, or bank statements.
- Local-first/privacy-conscious users who cannot upload sensitive documents to cloud OCR services.
- Developers who want an open-source edge document understanding engine.
- Organizations that need document data extraction but require user review and auditability.

### 3.2 Secondary users

- Researchers comparing edge document extraction strategies.
- Open-source contributors building plugins for new document types.
- Power users building local templates for their own document workflows.
- Teams building kiosk, offline, or field-device document workflows.

---

## 4. Core use cases

### 4.1 First-time unknown document

The user uploads a document the system has not seen before. The system normalizes the page, extracts evidence, creates field/asset/table hypotheses, verifies them, and generates a reviewable form. The user corrects wrong fields and saves a new template.

Success means the generated form is useful even if not perfect, and every uncertainty is visible.

### 4.2 Repeated known template

The user uploads a document similar to one previously corrected. The system matches a TemplateGraph, aligns the page, extracts fields from known ROIs, validates values, and fills the form quickly.

Success means high speed, high accuracy, minimal user correction, and no silent field drift.

### 4.3 Similar template with changed layout

The user uploads a document from the same family but with a changed layout. The system detects partial similarity, creates a new version, and asks for correction rather than damaging the old template.

Success means template families evolve safely.

### 4.4 Visual asset extraction

The document contains photos, signatures, stamps, seals, logos, emblems, flags, symbols, QR codes, barcodes, or other image-like assets. The system extracts these as form fields or evidence nodes with bounding boxes, masks when available, and source crops.

Success means assets are not ignored just because they are not text.

### 4.5 Table-heavy documents

The document contains invoices, receipts, bank statements, item lists, fees, taxes, totals, transaction tables, or multi-column data. The system detects table regions, reconstructs rows/columns/cells, links cell values, and validates totals where possible.

Success means tables become structured form data, not plain text blobs.

### 4.6 Identity documents

The document contains a passport, ID card, visa page, license, or similar identity document. The system extracts text fields, photo, signature, MRZ if present, barcode if present, country/issuer clues, and validates MRZ/checksum consistency where possible.

Success means identity data is exact, evidence-backed, and flagged if ambiguous.

---

## 5. Product promise

The product promise must be carefully worded:

> Convert any uploaded document into an evidence-backed editable form, with uncertainty and correction when needed.

The product must not promise:

> Perfect automatic extraction of every possible document without review.

The strongest truthful promise is:

> The first upload creates a reviewable evidence-backed form. The second similar upload becomes fast and highly accurate because the system learns the corrected TemplateGraph locally.

---

## 6. Non-negotiable constraints

1. **Local-only processing:** No cloud OCR, no cloud VLM, no server-side document processing.
2. **Evidence-first:** Every extracted field, asset, table, code, checkbox, or parser result must point to evidence.
3. **Coordinate preservation:** Every evidence item must preserve page, coordinates, and transform information.
4. **No silent lying:** Uncertain values must be marked uncertain, not confirmed.
5. **Template learning, not neural retraining:** One-shot learning means saving a TemplateGraph, not fine-tuning models.
6. **Edge-friendly:** Avoid giant always-on models. Use ROI-first and conditional heavy processing.
7. **User correction is first-class data:** Corrections update the DocGraph and TemplateGraph.
8. **Verifier-driven UX:** UI status must come from validation and evidence quality.
9. **Versioned templates:** Layout changes create versions instead of corrupting previous templates.
10. **Privacy by design:** Sensitive data, crops, and templates are encrypted locally.

---

## 7. Definitions of done

The product is not done when OCR works. The product is done when the user can:

1. Upload a document.
2. See extracted text, fields, assets, tables, and codes.
3. Inspect evidence for every extracted item.
4. Correct labels, values, field types, regions, assets, and tables.
5. Save a corrected template.
6. Upload a similar document.
7. See the form filled quickly from aligned ROIs.
8. Trust field statuses: confirmed, needs review, missing, conflict, invalid.
9. Export structured data and assets.
10. Keep all document processing local.

---

## 8. Functional requirements

### 8.1 Input support

The system must support:

- PNG images
- JPEG images
- WebP images
- scanned PDFs
- digital PDFs
- multi-page documents
- rotated pages
- skewed camera captures
- low-contrast images
- documents with embedded images
- documents with tables
- documents with visible machine-readable codes

### 8.2 Page normalization

The system must:

- detect document/page boundary when possible
- correct perspective for photographed documents
- deskew pages
- normalize orientation
- detect blur, glare, underexposure, overexposure, low resolution, missing corners, and partial crop
- create a canonical coordinate system for all pages
- preserve original image and transform references

### 8.3 Evidence extraction

The system must extract or detect:

- text lines and words
- text blocks
- field labels
- field values
- tables
- table rows, columns, and cells where possible
- photos
- signatures
- stamps
- seals
- logos
- emblems
- flags
- symbols
- barcodes
- QR codes
- PDF417 codes
- MRZ zones
- checkboxes
- document boundary
- line separators and form boxes where useful

### 8.4 OCR

The OCR system must:

- preserve coordinates for text
- return confidence scores
- support global page OCR when needed
- support ROI-first OCR for known templates
- support high-resolution OCR on small regions
- support special-zone OCR for MRZ and table cells
- preserve reading order estimates
- store OCR alternatives when available

### 8.5 Visual asset extraction

The system must:

- crop detected visual assets
- store visual asset type
- store source coordinates
- generate masks where segmentation is available
- allow user to adjust asset crops
- map assets into form fields
- support photo, signature, stamp, seal, logo, emblem, flag, symbol, and code assets

### 8.6 Barcode and MRZ parsing

The system must:

- parse barcode/QR/PDF417 regions locally
- store decoded payloads
- link payloads to visible code nodes
- cross-check payloads with printed fields when possible
- detect MRZ zones
- OCR MRZ zones
- normalize common OCR errors
- parse TD1, TD2, and TD3 formats
- validate check digits
- mark MRZ conflicts clearly

### 8.7 Table extraction

The system must:

- detect table regions
- reconstruct bordered tables using geometry where possible
- reconstruct borderless tables using OCR box clustering where possible
- support learned table recognition experiments for complex tables
- store cells as graph nodes
- link headers to columns
- validate arithmetic when applicable

### 8.8 DocGraph

The system must build a DocGraph containing:

- document metadata
- page nodes
- evidence nodes
- text nodes
- field hypotheses
- visual asset nodes
- parser result nodes
- table nodes and cell nodes
- validation results
- provenance records
- graph edges between related nodes

### 8.9 Form generation

The form generator must:

- read from field hypotheses, not raw OCR only
- create sections when detected
- create field controls
- create asset controls
- create table controls
- show confidence and status
- show evidence links
- allow correction of labels, values, field types, tables, and crops

### 8.10 Correction capture

The correction system must allow users to:

- rename a field
- change field type
- edit field value
- redraw a field region
- assign/unassign a crop
- mark an asset type
- merge/split fields
- add a missing field
- delete a false field
- correct table structure
- correct checkbox state
- save as template
- update existing template
- create a new template version
- choose not to learn from a document

### 8.11 TemplateGraph learning

After correction, the system must save:

- normalized field regions
- normalized asset regions
- aliases
- validators
- field types
- text anchors
- visual anchors
- geometry anchors
- keypoint anchors
- special-zone anchors
- table schemas
- relationships
- template family and version metadata

### 8.12 Known-template extraction

For known templates, the system must:

1. retrieve candidate templates
2. score template match
3. align the page
4. perform local alignment correction
5. project known ROIs
6. OCR and parse only relevant regions first
7. extract assets from projected regions
8. validate all fields
9. search nearby if validation fails
10. mark for review if still uncertain

### 8.13 Verification

The verifier must produce field statuses:

- confirmed
- needs_review
- missing
- conflict
- invalid

The verifier must use:

- OCR confidence
- detector confidence
- template confidence
- parser confidence
- validator results
- cross-field consistency
- scan quality
- user correction history

### 8.14 Export

The system should support exporting:

- form values JSON
- DocGraph JSON
- TemplateGraph JSON
- extracted assets
- tables as JSON/CSV
- evidence package for debugging
- redacted/safe examples for testing when user chooses

---

## 9. Non-functional requirements

### 9.1 Performance

The system should be responsive on ordinary devices. Heavy operations must run in workers. Known-template extraction must be substantially faster than first-time unknown extraction.

Performance priorities:

1. prevent UI blocking
2. reduce repeated full-page inference
3. use lazy model loading
4. cache model files locally
5. prefer ROI-first extraction
6. dispose model sessions/tensors carefully
7. avoid unnecessary segmentation

### 9.2 Privacy

All document processing must be local. No telemetry by default. No document upload. No server OCR. No remote logging of extracted values.

Sensitive local data must be encrypted where feasible.

### 9.3 Reliability

The system must prioritize silent-error reduction. A wrong confirmed field is more dangerous than a field marked for review.

### 9.4 Explainability

Every output must be inspectable. A user should be able to click a field and see why the system believes it.

### 9.5 Extensibility

New document types, model variants, validators, field types, and template exporters should be addable without rewriting the core architecture.

---

## 10. MVP scope

### 10.1 MVP document types

The first deep document types:

1. Passport / ID style document
2. Invoice / receipt style document
3. Generic form with labels, values, signatures, checkboxes, and tables

### 10.2 MVP capabilities

MVP must support:

- upload image/PDF
- page normalization
- OCR with boxes
- document object detection
- basic visual asset crops
- QR/barcode parsing
- MRZ parsing for passport/ID when present
- table region detection and basic reconstruction
- DocGraph creation
- editable form generation
- manual correction
- TemplateGraph save
- known-template ROI extraction
- verifier statuses
- local storage

### 10.3 MVP exclusions

MVP should not include:

- cloud processing
- full arbitrary legal-contract understanding
- full bank-statement reconciliation across many pages
- perfect handwriting recognition
- model fine-tuning in-browser
- full VLM runtime dependency
- automatic fraud detection claims
- face recognition or identity matching

---

## 11. Success metrics

### 11.1 Primary metrics

- silent critical error rate
- field exact-match accuracy
- field normalized-match accuracy
- visual asset recall
- crop IoU / mask IoU
- template match accuracy
- template false-match rate
- validator catch rate
- user correction reduction after template learning

### 11.2 Performance metrics

- first unknown document processing time
- known-template extraction time
- model load time
- memory peak
- UI frame responsiveness
- worker queue latency
- OCR ROI throughput
- table reconstruction time

### 11.3 Trust metrics

- percentage of uncertain fields correctly flagged
- percentage of conflicts caught
- number of confirmed fields later corrected by user
- rate of template corruption incidents
- user review time per document

---

## 12. Product risks

| Risk | Severity | Mitigation |
|---|---:|---|
| Silent wrong extraction | Critical | verifier statuses, evidence UI, no silent confirmed values |
| Template corruption | Critical | versioning, validator gates, correction review |
| Edge performance too slow | High | ROI-first, lazy loading, workers, model benchmarks |
| Model browser incompatibility | High | ONNX compatibility tests, static shapes, WASM compatibility mode |
| Poor scans | High | quality gates and rescan prompts |
| Table complexity | High | geometry first, SLANet_plus trial |
| Overbroad scope | High | start with three deep document families |
| User distrust | High | evidence viewer and transparent statuses |
| Privacy failure | Critical | no cloud, encryption, local-only policy |

---

## 13. Final PRD statement

Build a local-only document evidence graph engine that converts document images and PDFs into editable, evidence-backed forms. The system must support first-time cautious extraction, manual correction, local TemplateGraph learning, fast ROI-first repeated extraction, strict verification, and no silent wrong answers. The product succeeds when it becomes dramatically better after correction while keeping all sensitive document data private and inspectable.
