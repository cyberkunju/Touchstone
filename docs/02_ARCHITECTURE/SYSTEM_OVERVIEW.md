# System Overview — Edge DocGraph Engine

**Purpose:** Explain the complete system at a big-picture level: what it is, how it works, why the architecture is structured this way, and how all major flows connect.

---

## 1. Architecture in one sentence

Edge DocGraph Engine is a local-only document perception system where local evidence producers extract page evidence, the DocGraph represents that evidence, the verifier decides trust, the form UI exposes corrections, and the TemplateGraph learns corrected layouts for fast future extraction.

---

## 2. The core system idea

The system must not be understood as:

```text
OCR → text → form
```

or:

```text
document image → VLM → JSON
```

The correct system model is:

```text
document
  → local evidence extraction
  → DocGraph
  → field / asset / table hypotheses
  → verification
  → editable form
  → user correction
  → TemplateGraph learning
  → fast repeated extraction
```

Every model, parser, validator, and user correction creates evidence. The DocGraph stores that evidence. The verifier assigns trust. The form renderer displays graph-backed hypotheses. The template engine stores corrected structure for future documents.

---

## 3. High-level system diagram

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                                User Interface                              │
│                                                                            │
│  Upload  |  Document Viewer  |  Evidence Overlay  |  Editable Form         │
│  Review  |  Correction UI    |  Template Save     |  Export                │
└────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                           Orchestration Layer                              │
│                                                                            │
│  job queue | worker routing | model loading | progress | cancellation      │
└────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                            Input + Page Layer                              │
│                                                                            │
│  PDF.js / PDFium bucket | image decode | page records | metadata            │
└────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                           Page Normalization                               │
│                                                                            │
│  boundary | orientation | deskew | perspective | quality | coordinates      │
└────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                         Evidence Producers                                 │
│                                                                            │
│  YOLOv11n detector       → object evidence                                  │
│  PP-OCRv5 OCR            → text evidence                                    │
│  Segmentation candidates → mask/crop evidence                               │
│  zxing-wasm              → code payload evidence                            │
│  MRZ parser              → identity-zone parser evidence                    │
│  Table engine            → table/cell evidence                              │
│  MediaPipe face check    → portrait validation evidence                     │
│  User corrections        → high-trust human evidence                        │
└────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                                  DocGraph                                  │
│                                                                            │
│  pages | nodes | edges | evidence | hypotheses | validations | provenance   │
└────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                       Hypothesis + Verification Layer                       │
│                                                                            │
│  field discovery | asset mapping | table mapping | conflict detection       │
│  confirmed | needs_review | missing | conflict | invalid                    │
└────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                              Form + Learning                               │
│                                                                            │
│  editable form | evidence viewer | correction capture | TemplateGraph save  │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Two major operating modes

The system has two distinct modes.

### 4.1 Unknown-document mode

Used when no saved template matches the document confidently.

```text
upload
  → normalize page
  → run broader evidence extraction
  → build DocGraph
  → generate field/asset/table hypotheses
  → verify
  → generate reviewable form
  → user corrects
  → save TemplateGraph
```

This mode is cautious and review-first.

### 4.2 Known-template mode

Used when a saved TemplateGraph matches strongly.

```text
upload
  → normalize page
  → match TemplateGraph
  → align page
  → project saved ROIs
  → run ROI-first OCR/parsing/cropping
  → verify expected fields
  → fill form fast
  → review uncertain fields only
```

This mode is fast and verification-first.

---

## 5. Why two modes are necessary

Unknown-document extraction and known-template extraction are different problems.

Unknown documents require discovery:

- find layout
- find labels
- infer values
- detect assets
- create tentative fields
- ask for review

Known templates require precise repeated extraction:

- align page
- crop known regions
- OCR expected fields
- parse expected codes
- verify expected validators
- flag only drift or uncertainty

If the same pipeline is used for both, the product will either be too slow on repeated documents or too brittle on new documents.

---

## 6. The role of each major system concept

### 6.1 Evidence

Evidence is any observation that supports or disputes a document interpretation.

Examples:

- OCR line: `"Invoice No."`
- detector box: `signature`
- parsed MRZ: `documentNumber`
- QR payload: `taxId`
- user correction: label renamed to `Passport Number`
- validator result: MRZ checksum passed

### 6.2 DocGraph

DocGraph is the central representation of the current document.

It stores:

- what was detected
- where it was found
- which module found it
- how confident it is
- how elements relate
- what the system hypothesizes
- what validators say
- what user corrected

### 6.3 Hypotheses

A hypothesis is a proposed interpretation.

Examples:

- this label belongs to that value
- this image is a signature
- this table is invoice line items
- this MRZ value confirms date of birth

Hypotheses can be confirmed, disputed, or marked for review.

### 6.4 Verifier

The verifier decides trust.

It converts raw confidence and validation into statuses:

- confirmed
- needs_review
- missing
- conflict
- invalid

### 6.5 TemplateGraph

TemplateGraph is learned document memory.

It stores:

- anchors
- ROIs
- validators
- field definitions
- asset definitions
- table schemas
- aliases
- version metadata

It is how the app learns after one correction.

---

## 7. Data-level overview

```text
Raw File
  → DocumentRecord
  → PageRecord
  → NormalizedPage
  → EvidenceRecord[]
  → DocGraph
  → FieldHypothesis[]
  → FormSchema + FormValues
  → UserCorrections
  → TemplateGraph
```

Every stage must preserve provenance. Nothing should be reduced to plain text too early.

---

## 8. Runtime-level overview

The runtime is split into:

### Main UI thread

- React rendering
- document viewer
- form UI
- evidence viewer
- user correction controls
- progress display

### Workers

- PDF/image processing
- OpenCV operations
- model inference
- OCR
- parsing
- graph construction
- verification
- template matching

### Local storage

- IndexedDB for structured data
- OPFS for large binary artifacts
- WebCrypto for encryption

---

## 9. Model-level overview

Core model and parser stack:

| Area | Selected direction |
|---|---|
| OCR | PP-OCRv5 mobile ONNX |
| Detector | YOLOv11n custom-trained |
| Segmentation | YOLOv11n-seg candidate, EfficientSAM/SlimSAM trial |
| Barcode/QR | zxing-wasm |
| Face check | MediaPipe Face Detector |
| MRZ | custom TypeScript parser |
| Tables | custom geometry engine, SLANet_plus trial |
| Orientation | PP-LCNet trial |

Models are replaceable evidence producers. The architecture must survive model changes.

---

## 10. Trust model

The system’s trust model is based on evidence and validation, not model confidence alone.

A field can be confirmed only when:

1. it has evidence,
2. evidence is spatially plausible,
3. OCR/parser confidence is sufficient,
4. validators pass,
5. no critical conflict exists,
6. scan quality is adequate,
7. template alignment is trustworthy if template-derived.

A field must be marked review/invalid/conflict when evidence is weak or contradictory.

---

## 11. User experience overview

The main workspace should have:

```text
Left side:
  document viewer
  overlays
  selected evidence
  crop controls

Right side:
  generated form
  field statuses
  correction controls
  evidence viewer
```

The user should never wonder where a value came from. Every field should have a “show evidence” path.

---

## 12. Storage overview

The system stores:

- documents, if user chooses
- normalized pages
- extracted crops
- masks
- DocGraphs
- TemplateGraphs
- form schemas
- form values
- validation results
- model cache

Sensitive records should be encrypted where feasible.

The model cache and user data should be separated.

---

## 13. System invariants

These must never be broken:

1. The DocGraph is the source of truth.
2. Form fields must be backed by evidence.
3. User corrections become evidence.
4. Known templates are ROI-first.
5. Unknown documents are review-first.
6. Templates are versioned.
7. Models never directly write final form truth.
8. Low-confidence fields are marked, not guessed.
9. Processing is local-only.
10. Sensitive data is protected.

---

## 14. What makes the system exceptional

The system becomes exceptional not because one model is perfect, but because the architecture is resilient.

If OCR is uncertain, validators and UI catch it.  
If the detector misses a region, the user can correct and TemplateGraph learns.  
If a layout changes, versioning protects existing templates.  
If a document is bad, quality checks prevent silent failure.  
If a field is ambiguous, evidence viewer exposes why.  
If a template is known, ROI-first extraction makes it fast.

The whole system is designed to improve with correction while remaining honest about uncertainty.

---

## 15. Final system summary

Edge DocGraph Engine is a local evidence graph architecture for document-to-form automation. It combines edge OCR, document object detection, visual asset extraction, parsing, validation, editable review, and TemplateGraph learning into one coherent system. Its quality comes from evidence, not guessing; from correction, not blind automation; and from templates, not cloud retraining.
