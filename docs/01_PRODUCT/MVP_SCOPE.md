# MVP Scope — Edge DocGraph Engine

**Purpose:** Define what v1 must do deeply, what it may trial, and what is postponed.  
**MVP principle:** Build a narrow but exceptional engine, not a shallow universal demo.

---

## 1. MVP objective

The MVP must prove the core product loop:

```text
upload document
→ normalize page
→ extract evidence
→ build DocGraph
→ generate editable form
→ user corrects
→ save TemplateGraph
→ upload similar document
→ match template
→ ROI-first extraction
→ verify
→ fill form fast
```

If the MVP does not prove this loop, it is not the right MVP.

---

## 2. MVP success statement

The MVP is successful when a user can:

1. upload a passport/ID, invoice/receipt, or generic form,
2. see extracted text, objects, assets, tables, and codes,
3. inspect evidence for each field,
4. correct wrong labels/values/crops/tables,
5. save a template locally,
6. upload a similar document,
7. see the system match the template,
8. extract known ROIs quickly,
9. verify all fields,
10. export the result.

The MVP does not need to be perfect on every document. It must be architecturally correct and visibly improve after correction.

---

## 3. MVP document families

### 3.1 Passport / ID style documents

Must support:

- document boundary
- portrait photo crop
- OCR text fields
- MRZ detection/parsing where present
- date fields
- ID/document number
- signature/logo/emblem where detected
- field correction
- template save
- repeated extraction

Why included:

- tests fixed-layout extraction
- tests photo extraction
- tests MRZ validation
- tests privacy-sensitive data
- tests ROI-first template learning

### 3.2 Invoice / receipt style documents

Must support:

- vendor/seller name
- invoice/receipt number where present
- date
- total
- subtotal/tax where present
- QR/barcode where present
- line-item table region
- table extraction baseline
- template save
- repeated extraction

Why included:

- tests variable layouts
- tests tables
- tests totals
- tests QR/barcode
- tests vendor templates

### 3.3 Generic forms

Must support:

- label-value pairs
- checkboxes
- signature/stamp/logo crops where present
- field correction
- missing field add
- crop correction
- template save
- repeated extraction

Why included:

- tests the general form-generation engine
- tests correction-first UX
- tests template learning beyond specific document types

---

## 4. MVP user-facing capabilities

### 4.1 Upload

MVP must support:

- image upload
- PDF upload
- page preview
- local processing notice
- unsupported file errors

### 4.2 Document viewer

MVP must support:

- page display
- zoom/pan
- evidence overlays
- selected field highlighting
- crop preview

### 4.3 Extraction

MVP must support:

- page normalization
- OCR with coordinates
- document object detection
- basic visual asset crops
- QR/barcode parsing
- MRZ parsing
- table region detection
- basic table reconstruction

### 4.4 Form generation

MVP must support:

- generated editable fields
- generated asset fields
- generated table fields
- field statuses
- evidence viewer
- correction controls

### 4.5 Correction

MVP must support:

- edit label
- edit value
- change type
- add field
- delete false field
- adjust crop
- correct checkbox
- correct table baseline
- save as template

### 4.6 Template learning

MVP must support:

- TemplateGraph creation
- local template save
- template list
- template match
- ROI projection
- known-template extraction
- template version suggestion baseline

### 4.7 Verification

MVP must support:

- confirmed
- needs_review
- missing
- conflict
- invalid

MVP validators:

- OCR confidence thresholding
- required field presence
- date format
- amount format
- MRZ checksum
- barcode payload existence
- table total arithmetic baseline
- template ROI match
- face presence for portrait crop

---

## 5. MVP technical stack

### 5.1 Core

- React + Vite + TypeScript
- Web Workers + Comlink
- OffscreenCanvas where supported
- ONNX Runtime Web
- WebGPU primary, WASM compatibility mode
- PDF.js
- OpenCV.js
- IndexedDB + OPFS
- WebCrypto AES-GCM

### 5.2 Models/libraries

- PP-OCRv5 mobile ONNX
- YOLOv11n custom-trained or temporary trial detector
- YOLOv11n-seg / segmentation trial only where needed
- zxing-wasm
- MediaPipe Face Detector
- custom MRZ parser
- custom geometric table engine
- SLANet_plus trial after baseline

---

## 6. MVP architecture deliverables

The MVP must implement these internal packages or modules:

```text
schemas
docgraph
template-engine
verifier
form-generator
ocr-engine
detector-engine
asset-engine
parser-engine
table-engine
storage-engine
worker-protocols
ui
```

Each module must have a documented interface.

---

## 7. MVP data structures

The MVP must define and persist:

- DocumentRecord
- PageRecord
- PageTransform
- EvidenceRecord
- DocGraph
- GraphNode
- GraphEdge
- FieldHypothesis
- ValidationResult
- FormSchema
- FormValue
- TemplateGraph
- TemplateAnchor
- TemplateField
- TemplateAsset
- TemplateTable

Without these data structures, the MVP will become a fragile demo.

---

## 8. MVP pipeline requirements

### Unknown-document pipeline

```text
input
→ page normalization
→ evidence extraction
→ DocGraph construction
→ hypotheses
→ verification
→ form
→ correction
→ TemplateGraph save
```

### Known-template pipeline

```text
input
→ page normalization
→ candidate template retrieval
→ template match
→ alignment
→ ROI projection
→ ROI extraction
→ verification
→ form fill
→ review/version decision
```

Both paths must exist in MVP. The known-template path is the core product differentiator.

---

## 9. MVP UI screens

### 9.1 Upload screen

- file picker
- drag-and-drop
- local-only explanation
- recent templates list

### 9.2 Processing screen

- progress steps
- worker/model loading status
- quality warnings
- cancellation

### 9.3 Main workspace

Left:

- document viewer
- overlays
- selected evidence
- page selector

Right:

- generated form
- status badges
- correction controls
- evidence panel

### 9.4 Template save screen

- template name
- document type
- save as new
- update existing
- create version
- do not learn

### 9.5 Template list

- template families
- versions
- sample thumbnails
- field count
- last used
- delete/export/import

---

## 10. MVP must not include

The MVP should explicitly not include:

- cloud OCR
- cloud VLM
- login/account system
- remote template sync
- collaborative editing
- legal authenticity verification
- face identity matching
- fraud detection claims
- full handwriting support
- full contract understanding
- full bank-statement reconciliation across many pages
- template marketplace
- mobile camera capture optimization
- model fine-tuning in-browser
- heavy LayoutLM/Donut runtime dependency
- automatic extraction without review states

---

## 11. MVP quality bar

The MVP quality bar is not “extract everything perfectly.” It is:

1. evidence for every output,
2. clear uncertainty,
3. correction capture,
4. template learning,
5. repeated extraction improvement,
6. no silent critical wrong values,
7. local-only processing.

If a field is uncertain, the MVP must show that uncertainty. This is success, not failure.

---

## 12. MVP benchmark targets

Initial benchmark targets should be modest but meaningful.

### Unknown documents

- generate useful form for 70%+ of clean MVP documents
- mark uncertain fields visibly
- no confirmed critical field without evidence
- visual assets detected/correctable
- tables represented even if correction needed

### Known templates

- 85%+ template match accuracy on clean repeated samples
- 50%+ reduction in user corrections after first template save
- ROI-first extraction faster than unknown extraction
- required fields flagged if missing

### Safety

- silent critical error rate must be tracked from day one
- no raw document leaves device
- all saved templates versioned

---

## 13. MVP release gates

Do not release v1 unless:

- upload works for image and PDF
- DocGraph is persisted and inspectable
- form is generated from hypotheses
- correction updates graph
- TemplateGraph save/load works
- known-template ROI extraction works
- verifier statuses show in UI
- at least 3 document families are tested
- local-only privacy is enforced
- critical parsers have unit tests
- MRZ parser has check-digit tests
- template matching has false-match tests
- model errors do not crash UI
- sensitive debug logging is disabled by default

---

## 14. Post-MVP roadmap

### v1.1

- better custom YOLOv11n detector
- template version UI improvements
- SLANet_plus integration trial
- improved table correction UI
- template import/export

### v1.2

- Tauri packaging
- PDFium quality rendering
- encryption hardening
- model cache manager
- improved device benchmarks

### v1.3

- segmentation refinements
- redaction mode
- batch processing
- template family management

### v2

- plugin architecture
- custom validators
- template marketplace/import packs
- domain-specific document packs
- local desktop quality pack

---

## 15. MVP philosophy

Build the core loop deeply. Do not chase every document type. Do not chase every model. Do not chase perfect first-upload automation.

The MVP wins if it proves:

```text
evidence-backed extraction
+ correction-first UX
+ TemplateGraph learning
+ fast repeated extraction
+ no silent lying
```
