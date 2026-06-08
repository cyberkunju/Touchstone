# Component Map — Edge DocGraph Engine

**Purpose:** Define every major component, its responsibilities, inputs, outputs, boundaries, and interactions.

---

## 1. Component categories

The system is divided into nine major component categories:

1. User Interface
2. Orchestration and Workers
3. Input and Page Processing
4. Evidence Producers
5. DocGraph Core
6. Hypothesis and Verification
7. Form and Correction
8. TemplateGraph Engine
9. Storage, Security, and Export

---

## 2. Component map diagram

```text
UI Layer
  ├── Upload UI
  ├── Document Viewer
  ├── Evidence Overlay
  ├── Form Renderer
  ├── Correction UI
  ├── Template UI
  └── Export UI

Orchestration Layer
  ├── Job Scheduler
  ├── Worker Manager
  ├── Model Session Manager
  ├── Progress Manager
  └── Error Router

Input Layer
  ├── File Type Detector
  ├── PDF Processor
  ├── Image Decoder
  ├── Page Record Builder
  └── Metadata Extractor

Page Normalization Layer
  ├── Quality Analyzer
  ├── Boundary Detector
  ├── Orientation Corrector
  ├── Deskew/Perspective Corrector
  └── Coordinate Mapper

Evidence Producer Layer
  ├── YOLOv11n Document Detector
  ├── PP-OCRv5 OCR Engine
  ├── Segmentation Engine
  ├── zxing-wasm Code Parser
  ├── MRZ Parser
  ├── Table Engine
  ├── MediaPipe Face Verifier
  └── User Correction Evidence

Graph Layer
  ├── Evidence Store
  ├── DocGraph Builder
  ├── Node Manager
  ├── Edge Manager
  ├── Provenance Manager
  └── Graph Query Engine

Reasoning Layer
  ├── Field Hypothesis Generator
  ├── Asset Hypothesis Generator
  ├── Table Hypothesis Generator
  ├── Validator Registry
  └── Verification Engine

Learning Layer
  ├── TemplateGraph Builder
  ├── Template Matcher
  ├── Alignment Engine
  ├── ROI Projector
  ├── Versioning Engine
  └── Template Storage

Storage/Security Layer
  ├── IndexedDB Store
  ├── OPFS Blob Store
  ├── Encryption Service
  ├── Model Cache
  └── Export/Import Service
```

---

## 3. User Interface components

### 3.1 Upload UI

Responsibilities:

- accept image/PDF input
- show local-only notice
- validate file size/type
- show upload errors
- route file to Input Manager

Inputs:

- user file
- drag/drop event
- file picker event

Outputs:

- file object
- upload job request

Must not:

- upload file to server
- parse document itself
- mutate graph

---

### 3.2 Document Viewer

Responsibilities:

- render page image
- support zoom/pan
- show overlays
- highlight selected evidence
- support crop/region drawing
- show page quality warnings

Inputs:

- PageRecord
- normalized image
- overlay nodes
- selection state

Outputs:

- selected node
- crop correction region
- user interaction events

Must not:

- decide field truth
- run OCR/detection
- store templates

---

### 3.3 Evidence Overlay

Responsibilities:

- draw boxes, polygons, masks, and selected regions
- color by type/status
- show hover metadata
- route clicks to evidence viewer

Overlay types:

- OCR text
- detector object
- asset crop
- field hypothesis
- table cell
- QR/barcode
- MRZ
- template anchor
- validation conflict

---

### 3.4 Form Renderer

Responsibilities:

- render form fields from FormSchema and DocGraph hypotheses
- show status badges
- show editable controls
- connect fields to evidence viewer
- route corrections to Correction Capture Engine

Must not:

- create fields from raw OCR directly
- confirm fields
- mutate TemplateGraph directly

---

### 3.5 Correction UI

Responsibilities:

- edit label/value/type
- redraw regions
- assign assets
- fix tables
- add missing fields
- delete false fields
- merge/split fields
- choose template save/update/version

Outputs:

- UserCorrectionEvidence
- graph patch request
- template save/update request

---

### 3.6 Evidence Viewer

Responsibilities:

- show source crop
- show OCR tokens
- show parser outputs
- show detector evidence
- show validator results
- show provenance timeline
- explain field status

This component is key for trust.

---

## 4. Orchestration components

### 4.1 Job Scheduler

Responsibilities:

- create extraction jobs
- schedule worker tasks
- prioritize cheap tasks before heavy tasks
- cancel jobs
- retry safe failures
- stream progress

Job types:

- render_pdf_page
- normalize_page
- run_detector
- run_ocr
- run_segmentation
- parse_code
- parse_mrz
- reconstruct_table
- build_docgraph
- verify
- match_template
- extract_roi

---

### 4.2 Worker Manager

Responsibilities:

- initialize workers
- route jobs
- manage Comlink endpoints
- transfer buffers
- handle worker errors
- restart crashed workers safely

Workers:

- preprocessing worker
- inference worker
- parser worker
- graph worker

---

### 4.3 Model Session Manager

Responsibilities:

- lazy-load models
- cache model sessions
- dispose sessions
- enforce memory limits
- choose WebGPU/WASM execution provider
- record model versions

Rules:

- never load all heavy models at once on low-memory devices
- dispose tensors
- use static shapes where possible
- store model version in evidence

---

### 4.4 Progress Manager

Responsibilities:

- expose processing stages
- update UI
- show long-running tasks
- support cancellation

Stages:

- loading
- rendering
- normalizing
- detecting
- reading text
- parsing codes
- reconstructing tables
- building graph
- verifying
- generating form

---

## 5. Input and page components

### 5.1 File Type Detector

Determines:

- image
- PDF
- unsupported
- corrupt/unknown

### 5.2 PDF Processor

Responsibilities:

- render page preview
- extract embedded text
- create PageRecords
- support multi-page routing

Baseline:

- PDF.js

Quality bucket:

- PDFium WASM

### 5.3 Image Decoder

Responsibilities:

- decode image to bitmap/canvas
- record original dimensions
- detect initial EXIF orientation if available

### 5.4 Page Record Builder

Creates:

- page ID
- original image reference
- page dimensions
- canonical dimensions
- transform list
- quality report placeholder

---

## 6. Page normalization components

### 6.1 Quality Analyzer

Produces PageQualityReport.

Signals:

- blur
- glare
- contrast
- shadows
- resolution
- crop completeness
- perspective severity
- orientation confidence

### 6.2 Boundary Detector

Uses OpenCV geometry to detect page/document boundary.

Outputs:

- document boundary node
- corner points
- confidence
- quality warnings

### 6.3 Orientation Corrector

Corrects rotation.

Sources:

- image metadata
- OCR orientation cues
- PP-LCNet trial
- geometric layout cues

### 6.4 Perspective Corrector

Applies homography to create a normalized page.

### 6.5 Coordinate Mapper

Converts between:

- original pixel coordinates
- normalized page coordinates
- canonical coordinates
- template coordinates
- viewer coordinates

This is critical. Coordinate bugs destroy template learning.

---

## 7. Evidence producer components

### 7.1 YOLOv11n Document Detector

Input:

- normalized page image

Output:

- DetectionEvidence[]

Classes:

- document_page
- photo
- signature
- stamp
- seal
- logo
- QR/barcode
- MRZ
- table
- checkbox
- text_block
- expanded classes later

Boundary:

- produces object candidates only
- does not create final fields

---

### 7.2 PP-OCRv5 OCR Engine

Input:

- page image or ROI image

Output:

- OcrEvidence[]

Modes:

- full_page
- text_block
- roi
- mrz
- table_cell
- special

Boundary:

- produces text evidence only
- does not decide label/value relationships alone

---

### 7.3 Segmentation Engine

Input:

- asset candidate region
- optional user prompt

Output:

- mask
- refined crop
- VisualAssetEvidence

Boundary:

- does not run full-page by default
- does not decide semantic field meaning

---

### 7.4 zxing-wasm Code Parser

Input:

- page or code ROI

Output:

- CodeEvidence

Boundary:

- decodes payload
- does not decide whether payload should overwrite printed field without verifier

---

### 7.5 MRZ Parser

Input:

- OCR text from MRZ region

Output:

- MrzEvidence
- validation results

Boundary:

- parser can validate MRZ format
- verifier decides field-level status with visual cross-checks

---

### 7.6 Table Engine

Input:

- table region
- OCR boxes
- optional lines
- optional learned table model result

Output:

- TableNode candidates
- TableCellNode candidates
- table validation evidence

Boundary:

- produces table structure
- user correction can override

---

### 7.7 MediaPipe Face Verifier

Input:

- photo crop

Output:

- face presence validation evidence

Boundary:

- verifies face presence only
- no face recognition
- no identity matching

---

### 7.8 User Correction Evidence

Input:

- user action

Output:

- high-trust correction evidence

Boundary:

- still must pass schema and template safety rules
- must preserve original evidence

---

## 8. DocGraph components

### 8.1 Evidence Store

Stores raw evidence records before and during graph construction.

### 8.2 Node Manager

Creates and updates graph nodes.

Node types:

- PageNode
- TextLineNode
- TextWordNode
- TextBlockNode
- FieldNode
- VisualAssetNode
- TableNode
- TableCellNode
- MRZNode
- BarcodeNode
- CheckboxNode
- TemplateAnchorNode
- ValidationNode

### 8.3 Edge Manager

Creates relationships:

- contains
- near
- same_row
- same_column
- label_of
- value_of
- inside_table
- validated_by
- conflicts_with
- template_projected_from

### 8.4 Provenance Manager

Records:

- module source
- model version
- parser version
- correction action
- timestamp
- evidence chain

### 8.5 Graph Query Engine

Provides queries:

- find nodes near region
- find labels near value
- find conflicts
- find evidence for field
- find required missing fields
- find template anchors
- find table cells by row/column

---

## 9. Hypothesis and verification components

### 9.1 Field Hypothesis Generator

Uses:

- OCR text
- label/value geometry
- aliases
- templates
- parser outputs
- table headers
- validators
- document type hints

Outputs FieldHypothesis[].

### 9.2 Asset Hypothesis Generator

Maps visual assets to possible form fields.

Examples:

- portrait photo
- signature
- seal
- logo
- stamp

### 9.3 Table Hypothesis Generator

Maps table structures to form table fields.

### 9.4 Validator Registry

Holds validators:

- required
- date
- amount
- ID
- email
- phone
- MRZ checksum
- barcode payload
- invoice totals
- table math
- face presence
- template region
- OCR confidence

### 9.5 Verification Engine

Combines evidence and validators into statuses.

---

## 10. TemplateGraph components

### 10.1 TemplateGraph Builder

Creates learned template from corrected DocGraph.

### 10.2 Template Matcher

Scores candidate templates using:

- text anchors
- visual anchors
- layout geometry
- special zones
- keypoints
- validator expectations

### 10.3 Alignment Engine

Computes:

- page-level transform
- homography
- local anchor offsets
- region adjustments

### 10.4 ROI Projector

Projects saved TemplateField and TemplateAsset regions onto current page.

### 10.5 Versioning Engine

Decides:

- same_template
- same_family_new_version
- unknown_template

### 10.6 Template Storage

Persists TemplateGraphs locally.

---

## 11. Storage and security components

### 11.1 IndexedDB Store

Stores:

- document metadata
- graph metadata
- template metadata
- form schemas
- validation results

### 11.2 OPFS Blob Store

Stores:

- page images
- normalized pages
- crops
- masks
- thumbnails
- model files

### 11.3 Encryption Service

Uses:

- WebCrypto AES-GCM

Encrypts sensitive:

- documents
- OCR text
- form values
- crops
- templates
- MRZ/barcode payloads

### 11.4 Export/Import Service

Exports:

- form JSON
- DocGraph JSON
- TemplateGraph JSON
- assets
- tables
- debug evidence packages

---

## 12. Component interaction rules

1. UI sends user actions; it does not run extraction logic.
2. Workers run heavy tasks; main thread stays responsive.
3. Evidence producers never write final form truth.
4. DocGraph is the only integration layer for extraction results.
5. Verifier assigns statuses.
6. Form renderer displays hypotheses and statuses.
7. Correction engine records user changes as evidence.
8. TemplateGraph is built from corrected DocGraph, not raw UI fields.
9. Storage layer does not interpret document semantics.
10. Export uses graph/form schemas, not ad hoc objects.

---

## 13. Component readiness checklist

A component is implementation-ready only if it has:

- documented responsibility
- typed input
- typed output
- error behavior
- test strategy
- privacy impact
- performance budget
- integration path into DocGraph

If it bypasses DocGraph, it is not allowed into the main architecture.
