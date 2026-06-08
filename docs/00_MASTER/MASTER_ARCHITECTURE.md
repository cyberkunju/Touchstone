# Master Architecture — Edge DocGraph Engine

**Version:** 1.0  
**Architecture style:** Local-first, evidence-graph, worker-orchestrated, model-assisted deterministic pipeline  
**Primary abstraction:** DocGraph  
**Secondary abstraction:** TemplateGraph

---

## 1. Architecture thesis

The system must not be designed as “OCR output becomes form.” That architecture fails as soon as a document contains photos, signatures, stamps, seals, tables, checkboxes, barcodes, MRZ zones, or label/value ambiguity.

The correct architecture is:

> Multiple local modules extract evidence. The DocGraph stores and relates evidence. The hypothesis generator proposes fields/assets/tables. The verifier decides status. The form renderer displays only graph-backed hypotheses. User corrections update the graph. TemplateGraph learning makes future extraction fast.

Every model and parser is an evidence producer. None of them is the final authority by itself.

---

## 2. System overview

```text
┌────────────────────────────────────────────────────────────────────┐
│                          User Interface                            │
│  Upload | Document Viewer | Evidence Overlay | Form Editor | UX     │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│                      Worker Orchestration Layer                    │
│        Job queue | task routing | cancellation | progress events    │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│                         Input Processing                           │
│       PDF/Image ingestion | decoding | page creation | metadata     │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│                        Page Normalization                          │
│  boundary | orientation | deskew | perspective | quality | coords   │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│                    Multi-Pass Evidence Extraction                  │
│  YOLO detector | OCR | segmentation | parsers | tables | face check │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│                             DocGraph                               │
│      nodes | edges | evidence | hypotheses | validators | audit      │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│                    Hypothesis + Verification Engine                │
│      field proposals | asset proposals | conflicts | statuses        │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│                         Editable Form UI                           │
│      values | crops | tables | statuses | evidence | correction      │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│                         TemplateGraph Memory                       │
│      anchors | ROIs | validators | aliases | versions | storage      │
└────────────────────────────────────────────────────────────────────┘
```

---

## 3. Core modules

### 3.1 Input Manager

Responsibilities:

- receive files
- identify file type
- split PDFs into pages
- decode image files
- assign document ID and page IDs
- create initial processing jobs
- reject unsupported or corrupt files safely

Must not:

- upload documents anywhere
- permanently persist raw files without user permission
- assume PDF and image processing are identical

### 3.2 PDF Ingestion Layer

Digital PDFs and scanned PDFs must be handled differently.

For digital PDFs:

- extract embedded text when possible
- extract text coordinates when available
- extract embedded image references where possible
- extract page dimensions
- render page image only where needed

For scanned PDFs:

- render page image
- treat as image input
- run image normalization and OCR

Baseline:

- PDF.js for default PDF handling
- PDFium WASM in quality bucket for high-fidelity rasterization if PDF.js output harms OCR/detection

### 3.3 Image Normalization Engine

Responsibilities:

- decode raster image
- detect page/document boundary
- correct perspective
- deskew
- normalize orientation
- normalize contrast/illumination
- detect quality issues
- generate canonical page canvas
- store page transform metadata

Quality signals:

- blur
- glare
- shadow
- overexposure
- underexposure
- low resolution
- missing corners
- crop incompleteness
- perspective severity
- orientation uncertainty

Output:

```ts
type NormalizedPage = {
  pageId: string;
  originalImageId: string;
  normalizedImageId: string;
  widthPx: number;
  heightPx: number;
  canonicalWidth: 1000;
  canonicalHeight: number;
  transforms: PageTransform[];
  quality: PageQualityReport;
};
```

### 3.4 Evidence Extraction Scheduler

Responsibilities:

- determine which modules should run
- schedule jobs in workers
- avoid blocking UI
- run cheap modules before expensive modules
- run ROI-first extraction for known templates
- avoid full-page heavy inference unless necessary
- emit progress events
- support cancellation

Module ordering is not rigid. The scheduler should adapt based on document type, template match, quality, and user action.

### 3.5 Document Object Detector

Recommended core detector:

- YOLOv11n custom-trained

Detected classes should begin with a conservative set:

- document_page
- photo
- signature
- stamp
- seal
- logo
- qr_code
- barcode
- mrz_zone
- table
- checkbox
- text_block

Expanded classes:

- field_label
- field_value
- emblem
- flag
- symbol
- line_separator
- form_box
- table_cell
- handwriting
- watermark

Detector output:

```ts
type DetectionEvidence = {
  id: string;
  pageId: string;
  className: DocumentObjectClass;
  boxOriginalPx: Box;
  boxNorm: NormalizedBox;
  confidence: number;
  model: "yolov11n-doc";
  version: string;
};
```

Detector rule:

> Detection is candidate evidence, not truth.

### 3.6 OCR Engine

Core OCR model:

- PP-OCRv5 mobile ONNX
- custom ONNX Runtime Web wrapper preferred

OCR modes:

1. full-page relationship OCR
2. detected text-block OCR
3. ROI OCR
4. high-resolution small-field OCR
5. MRZ OCR
6. table-cell OCR
7. rotated-text OCR when needed

OCR output:

```ts
type OcrEvidence = {
  id: string;
  pageId: string;
  text: string;
  boxOriginalPx: Box | Polygon;
  boxNorm: NormalizedBox | NormalizedPolygon;
  confidence: number;
  readingOrder?: number;
  sourceMode: "full_page" | "roi" | "table_cell" | "mrz" | "special";
  alternatives?: Array<{ text: string; confidence: number }>;
};
```

OCR rule:

> OCR must preserve coordinates and confidence. Plain text without geometry is insufficient.

### 3.7 Visual Asset Segmentation Engine

Primary candidate:

- YOLOv11n-seg for known document asset masks if quality is good

Trial bucket:

- EfficientSAM
- SlimSAM-77
- MobileSAM benchmark only

Segmentation should be conditional:

- run on detector asset boxes
- run on user-requested refinement
- run on uncertain asset crops
- do not run full-page segmentation by default

Asset output:

```ts
type VisualAssetEvidence = {
  id: string;
  pageId: string;
  assetType: "photo" | "signature" | "stamp" | "seal" | "logo" | "emblem" | "flag" | "symbol" | "unknown";
  boxOriginalPx: Box;
  boxNorm: NormalizedBox;
  maskId?: string;
  cropId: string;
  confidence: number;
  source: "detector_box" | "segmentation_mask" | "template_roi" | "user_correction";
};
```

### 3.8 Barcode / QR / PDF417 Parser

Core library:

- zxing-wasm / ZXing-C++ WASM

Responsibilities:

- decode code regions
- support QR, barcode, PDF417, Data Matrix, Code 128, EAN, Aztec as applicable
- link decoded payload to visual code node
- cross-check payload fields with printed values where possible

Output:

```ts
type CodeEvidence = {
  id: string;
  pageId: string;
  codeType: "qr" | "barcode" | "pdf417" | "data_matrix" | "aztec" | "unknown";
  payload: string;
  boxNorm: NormalizedBox;
  confidence: number;
  decodedBy: "zxing-wasm";
};
```

### 3.9 MRZ Parser

Core:

- custom TypeScript parser

Flow:

1. detect MRZ zone
2. OCR MRZ crop
3. normalize OCR-B confusions
4. detect TD1 / TD2 / TD3
5. parse fields
6. validate check digits
7. compare against visual fields
8. create validation evidence

MRZ output:

```ts
type MrzEvidence = {
  id: string;
  pageId: string;
  rawLines: string[];
  format: "TD1" | "TD2" | "TD3" | "unknown";
  parsed: Record<string, string | null>;
  checkDigits: Record<string, boolean>;
  status: "valid" | "partial" | "invalid";
};
```

### 3.10 Face / Portrait Verifier

Core:

- MediaPipe Face Detector

Responsibilities:

- verify that a photo/portrait crop contains a human face
- detect face bounding box inside asset
- mark photo as uncertain if no face is present
- never perform identity matching or face recognition in v1

### 3.11 Table Reconstruction Engine

Two-level approach:

1. custom geometric table engine
2. SLANet_plus trial for difficult tables

Geometric engine handles:

- bordered table line detection
- row/column projection
- OCR box clustering
- cell assignment
- row/column span inference
- header detection
- total row detection

Table node:

```ts
type TableNode = {
  id: string;
  pageId: string;
  boxNorm: NormalizedBox;
  rows: TableRow[];
  columns: TableColumn[];
  cells: TableCellNode[];
  structureConfidence: number;
  source: "geometry" | "slanet_plus" | "user_correction";
};
```

### 3.12 DocGraph Builder

The DocGraph Builder merges evidence into graph nodes and edges.

It creates:

- PageNode
- TextLineNode
- TextWordNode
- TextBlockNode
- FieldNode
- VisualAssetNode
- TableNode
- TableCellNode
- BarcodeNode
- MRZNode
- CheckboxNode
- TemplateAnchorNode
- ValidationNode

It also creates edges:

- contains
- near
- above
- below
- left_of
- right_of
- same_row
- same_column
- label_of
- value_of
- inside_table
- validated_by
- conflicts_with
- template_projected_from

### 3.13 Hypothesis Generator

The Hypothesis Generator proposes form fields and assets from DocGraph evidence.

Signals:

- label-value geometry
- colon patterns
- same-line relationships
- stacked label/value pairs
- table headers
- known aliases
- template memory
- validators
- parser results
- document type hints
- user correction history

Output:

```ts
type FieldHypothesis = {
  id: string;
  label: string;
  value: string | null;
  valueType: FieldValueType;
  labelNodeIds: string[];
  valueNodeIds: string[];
  assetNodeIds: string[];
  boxNorm: NormalizedBox;
  confidence: number;
  evidenceBreakdown: EvidenceBreakdown;
  status: FieldStatus;
};
```

### 3.14 Local Verification Engine

The verifier decides whether hypotheses are confirmed or require review.

Validation types:

- syntactic validation
- parser validation
- cross-field validation
- template validation
- spatial validation
- quality validation
- arithmetic validation
- required-field validation

Statuses:

- confirmed
- needs_review
- missing
- conflict
- invalid

Rule:

> A field cannot be confirmed unless its value is supported by sufficient evidence and no critical validator fails.

### 3.15 Form Generator

The form generator reads only verified or reviewable hypotheses from the DocGraph.

It creates:

- text inputs
- date inputs
- number inputs
- currency inputs
- ID fields
- email/phone fields
- image asset fields
- signature/stamp/seal fields
- table widgets
- checkbox controls
- code payload controls
- review warnings

It does not read raw OCR directly.

### 3.16 Correction Capture Engine

User correction is high-trust evidence.

Corrections include:

- label rename
- value edit
- field type change
- crop region redraw
- asset type change
- field merge/split
- table correction
- checkbox correction
- missing field add
- false field delete
- template save/update/version decision

Every correction must update:

1. form state
2. DocGraph node
3. evidence/provenance record
4. TemplateGraph if saved

### 3.17 TemplateGraph Memory Engine

A TemplateGraph stores learned structure.

Contains:

- template ID
- family ID
- version
- page count
- canonical page sizes
- text anchors
- visual anchors
- geometry anchors
- keypoint anchors
- special-zone anchors
- fields
- assets
- tables
- aliases
- validators
- relationships
- fingerprints
- version history

### 3.18 Template Matcher and Aligner

Known-template flow:

```text
candidate retrieval
  → page fingerprint score
  → text anchor score
  → visual anchor score
  → geometry score
  → keypoint score
  → special-zone score
  → alignment
  → ROI projection
  → local correction
  → extraction
  → verification
```

Template score should use multiple signals, not ORB alone.

### 3.19 Storage and Encryption Layer

Storage:

- IndexedDB for structured metadata
- OPFS for large binary artifacts
- WebCrypto AES-GCM for sensitive records
- model cache separated from user data

Sensitive:

- document images
- extracted fields
- visual asset crops
- templates
- evidence packages
- debug logs containing OCR text

---

## 4. Execution flow: unknown document

```text
1. User uploads file.
2. Input Manager creates document record.
3. PDF/image ingestion creates pages.
4. Page Normalization creates canonical pages.
5. Quality report is generated.
6. Evidence Extraction Scheduler runs first pass.
7. YOLOv11n detects document objects.
8. PP-OCRv5 extracts text globally and in detected regions.
9. Asset extraction crops photos/signatures/stamps/logos/etc.
10. zxing-wasm decodes code regions.
11. MRZ parser runs if MRZ zone exists.
12. Table engine reconstructs tables.
13. DocGraph Builder creates nodes and edges.
14. Hypothesis Generator proposes fields/assets/tables.
15. Verifier assigns statuses.
16. Form Generator creates editable form.
17. User corrects.
18. Correction Capture updates DocGraph.
19. User saves TemplateGraph.
```

---

## 5. Execution flow: known template

```text
1. User uploads new document.
2. Page normalization runs.
3. Candidate templates are retrieved.
4. Multi-signal template scoring runs.
5. Best candidate is aligned.
6. Saved ROIs are projected to current page.
7. Local anchor correction adjusts regions.
8. ROI-first OCR extracts known fields.
9. Asset crops are extracted from projected regions.
10. Parsers run only where needed.
11. Verifier checks all expected fields.
12. Form fills quickly.
13. User reviews uncertain fields.
14. If layout drift is significant, create new template version.
```

---

## 6. Runtime architecture

### 6.1 Main thread

The main thread handles:

- React rendering
- form UI
- document viewer
- overlays
- user interactions
- high-level state
- progress display

The main thread must not perform:

- OCR inference
- YOLO inference
- PDF rendering of large pages
- OpenCV operations
- segmentation
- table reconstruction on large pages
- barcode scanning on large images

### 6.2 Workers

Worker categories:

1. **Preprocessing Worker**
   - PDF rendering
   - OpenCV normalization
   - image quality
   - page transforms

2. **Inference Worker**
   - ONNX Runtime Web sessions
   - YOLOv11n
   - PP-OCRv5
   - segmentation models
   - SLANet_plus trial

3. **Parser Worker**
   - zxing-wasm
   - MRZ
   - table geometry
   - validators

4. **Graph Worker**
   - DocGraph building
   - template matching
   - local alignment
   - verification

A single physical worker can host multiple roles early, but interfaces should keep responsibilities separate.

---

## 7. Model lifecycle

Rules:

- lazy load models only when needed
- cache model files locally
- unload or dispose sessions after heavy jobs if memory pressure is high
- prefer static input shapes for WebGPU stability
- avoid multiple large WebGPU sessions at once on low-end devices
- batch OCR recognition crops
- avoid full-page segmentation
- log model version in evidence records

---

## 8. Data model layers

### 8.1 Raw artifacts

- original file
- rendered page images
- normalized page images
- asset crops
- masks
- thumbnails

### 8.2 Evidence records

- detector results
- OCR results
- parser results
- face check results
- table reconstruction results
- user corrections

### 8.3 Graph layer

- DocGraph
- nodes
- edges
- hypotheses
- validation results

### 8.4 Presentation layer

- editable form schema
- form values
- UI status badges
- evidence viewer

### 8.5 Learning layer

- TemplateGraph
- template family
- version history
- anchors
- ROI regions
- validators
- aliases

---

## 9. Security architecture

Security principles:

1. no cloud processing
2. no document telemetry by default
3. encrypted local storage for sensitive content
4. no third-party scripts in production build
5. strict content security policy
6. model files integrity-checked
7. debug logs must avoid sensitive data by default
8. user controls export/import

Sensitive data must include:

- OCR text
- form values
- images
- crops
- templates
- MRZ data
- barcode payloads
- table content
- user corrections

---

## 10. Extension architecture

Future extension points:

- new validators
- new document type presets
- new detector classes
- new table models
- new OCR language packs
- new export formats
- template sharing/import
- redaction mode
- desktop-quality pack
- mobile-specific pack

Extensions must interact through DocGraph and TemplateGraph interfaces, not hidden side channels.

---

## 11. Architecture invariants

These must remain true forever:

1. The DocGraph is the source of truth.
2. The form is a view over hypotheses, not raw OCR.
3. Every field must have evidence.
4. Every evidence item must preserve coordinates.
5. User corrections become evidence.
6. Templates are versioned.
7. Unknown documents are review-first.
8. Known templates are ROI-first.
9. The verifier drives field status.
10. Models are replaceable evidence producers.
11. No cloud processing is required.
12. Sensitive data remains local.

---

## 12. Final architecture summary

The architecture is a local-first evidence engine. It uses edge-friendly models and deterministic parsers to extract document evidence, stores all evidence in a DocGraph, generates hypotheses from that graph, verifies all outputs, renders an editable form, captures corrections, saves a TemplateGraph, and uses that template for fast future extraction.

The innovation is not a single model. The innovation is the system design: evidence graph + verifier + correction-driven template memory + ROI-first repeated extraction.
