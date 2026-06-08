# Build From Zero Guide — Edge DocGraph Engine

**Goal:** A new engineer should be able to build the project from an empty repository by following this guide.  
**Rule:** Do not start by integrating random models. Start with schemas, state flow, evidence flow, and testable modules.

---

## 0. Repository bootstrap

Create the repository:

```bash
mkdir edge-docgraph-engine
cd edge-docgraph-engine
git init
```

Recommended top-level structure:

```text
edge-docgraph-engine/
  README.md
  docs/
    00_MASTER/
  apps/
    web/
  packages/
    core/
    docgraph/
    template-engine/
    verifier/
    schemas/
    workers/
    runtime/
    models/
    parsers/
    ui/
  models/
    README.md
  datasets/
    README.md
  scripts/
  tests/
  examples/
```

The first implementation can be monorepo-style with TypeScript packages.

---

## 1. Development stack

Use:

- Node.js LTS
- TypeScript strict mode
- React
- Vite
- pnpm or npm workspaces
- Vitest for unit tests
- Playwright for browser tests
- Zod or JSON Schema for runtime validation
- Web Workers
- Comlink
- ONNX Runtime Web
- OpenCV.js
- PDF.js
- zxing-wasm
- MediaPipe Face Detector
- future model wrappers for PP-OCRv5 and YOLOv11n

Initialize web app:

```bash
pnpm create vite apps/web --template react-ts
cd apps/web
pnpm install
```

Set TypeScript to strict:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

Strict typing is not optional. This project manipulates sensitive evidence and coordinates. Ambiguous types cause silent failures.

---

## 2. Build order overview

Build in this exact conceptual order:

```text
1. Schemas and core types
2. Document upload and page model
3. Document viewer
4. DocGraph data structure
5. Evidence record model
6. Manual mock extraction
7. Form generation from mocked DocGraph
8. Correction capture
9. TemplateGraph storage
10. Template matching skeleton
11. Page normalization
12. OCR integration
13. Detector integration
14. Barcode/MRZ parsers
15. Table engine
16. Visual asset extraction
17. Verifier
18. Known-template ROI extraction
19. Benchmarking
20. Model training and optimization
```

Do not integrate all AI models before DocGraph and forms exist. The AI modules should plug into a working evidence architecture.

---

## 3. Phase 1 — Core schemas

Create:

```text
packages/schemas/src/
  geometry.ts
  evidence.ts
  docgraph.ts
  templategraph.ts
  form.ts
  validation.ts
  worker-messages.ts
```

### 3.1 Geometry types

Define:

```ts
export type Box = [number, number, number, number];

export type NormalizedBox = [number, number, number, number];

export type Point = [number, number];

export type Polygon = Point[];

export type PageTransform = {
  id: string;
  type: "none" | "rotation" | "perspective" | "deskew" | "scale" | "local_offset";
  matrix?: number[];
  description?: string;
};
```

Rules:

- `Box` is always `[x1, y1, x2, y2]`.
- Normalized coordinates are always page-relative, 0 to 1.
- Never mix pixel and normalized coordinates without explicit type.
- Every page must know its original and canonical dimensions.

### 3.2 Evidence model

Define base evidence:

```ts
export type EvidenceBase = {
  id: string;
  documentId: string;
  pageId: string;
  source:
    | "detector"
    | "ocr"
    | "segmentation"
    | "barcode_parser"
    | "mrz_parser"
    | "table_engine"
    | "face_detector"
    | "template_projection"
    | "user_correction"
    | "validator";
  createdAt: number;
  modelName?: string;
  modelVersion?: string;
  confidence?: number;
  boxNorm?: NormalizedBox;
  provenance: ProvenanceRecord[];
};
```

### 3.3 DocGraph model

Create graph types before writing extraction logic. The DocGraph is the target.

Required structures:

```ts
export type DocGraph = {
  id: string;
  documentId: string;
  version: string;
  pages: PageNode[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  hypotheses: FieldHypothesis[];
  validations: ValidationResult[];
  provenance: ProvenanceRecord[];
};
```

### 3.4 TemplateGraph model

TemplateGraph must store learned structure:

```ts
export type TemplateGraph = {
  id: string;
  familyId: string;
  version: number;
  name: string;
  documentType?: string;
  pageCount: number;
  canonicalPages: CanonicalPageSpec[];
  anchors: TemplateAnchor[];
  fields: TemplateField[];
  assets: TemplateAsset[];
  tables: TemplateTable[];
  aliases: Record<string, string[]>;
  validators: Record<string, ValidatorSpec>;
  relationships: TemplateRelationship[];
  fingerprint: TemplateFingerprint;
  createdAt: number;
  updatedAt: number;
};
```

---

## 4. Phase 2 — Document upload and viewer

Build the UI before real models.

### 4.1 Upload flow

Implement:

- drag-and-drop
- file picker
- file type detection
- multi-page document placeholder
- error handling for unsupported files
- local object URL preview

### 4.2 Page model

Create:

```ts
type DocumentRecord = {
  id: string;
  name: string;
  fileType: "image" | "pdf";
  pages: PageRecord[];
  status: "new" | "processing" | "review" | "template_saved" | "error";
};
```

### 4.3 Viewer

Build a viewer with:

- zoom
- pan
- page selector
- overlay boxes
- selectable nodes
- evidence highlight
- crop preview
- status colors

Do not wait for OCR. Use mock boxes first.

---

## 5. Phase 3 — Mock DocGraph and form generator

Before integrating models, manually create mock DocGraphs for:

1. passport/ID
2. invoice/receipt
3. generic form

Each mock should include:

- text nodes
- field hypotheses
- visual asset nodes
- table nodes
- validation statuses

Build the form renderer from these mocks.

Form controls:

- text input
- date input
- amount input
- ID input
- checkbox
- image crop preview
- table grid
- code payload field
- evidence button
- confidence/status badge

If the form cannot be generated from mock DocGraph, the architecture is wrong.

---

## 6. Phase 4 — Correction capture

Implement correction UI early.

Actions:

- rename field
- edit value
- change field type
- mark status
- redraw region
- assign crop
- change asset type
- add missing field
- delete false field
- merge fields
- split field
- correct table cell
- correct checkbox state

Every correction must emit:

```ts
type UserCorrectionEvidence = {
  type: "user_correction";
  targetNodeId: string;
  oldValue: unknown;
  newValue: unknown;
  correctionKind: string;
  timestamp: number;
};
```

Rules:

- Do not mutate graph silently.
- Store correction provenance.
- User correction has high trust but can still be invalid if it breaks schema.

---

## 7. Phase 5 — TemplateGraph save/load

Build template learning before model perfection.

### 7.1 Save template

From corrected DocGraph, generate TemplateGraph:

- derive field regions
- derive asset regions
- derive text anchors
- derive visual anchors
- derive validators
- derive aliases
- derive table schemas
- record source page transform
- assign family/version

### 7.2 Load template

Implement local storage:

- IndexedDB for structured metadata
- OPFS for crops, masks, thumbnails, model cache
- WebCrypto AES-GCM for sensitive data

### 7.3 Template preview

The UI should show saved templates and versions.

Fields:

- template name
- family
- version
- document type
- last updated
- sample thumbnail
- required fields
- extraction confidence history

---

## 8. Phase 6 — Template matching skeleton

Before real OCR/detector, implement template matching with mock anchors.

Signals:

- page aspect ratio
- text anchor list
- visual anchor locations
- table region locations
- special zones
- geometry histogram

Later add:

- ORB/RANSAC
- OCR anchors
- visual hashes
- layout fingerprints
- validator pass rate

Output:

```ts
type TemplateMatchResult = {
  templateId: string;
  version: number;
  score: number;
  decision: "same_template" | "same_family_new_version" | "unknown_template";
  reasons: string[];
  transform?: PageTransform;
};
```

---

## 9. Phase 7 — Page normalization

Integrate preprocessing.

### 9.1 PDF

Start with PDF.js:

- render page
- extract text content when available
- store page dimensions

Keep PDFium WASM in trial/quality mode.

### 9.2 Images

Use OpenCV.js for:

- resize
- grayscale
- denoise
- edge detection
- contour detection
- perspective transform
- deskew
- contrast enhancement
- blur detection

Output a normalized page and quality report.

### 9.3 Orientation

Add PP-LCNet orientation trial after the basic pipeline works.

---

## 10. Phase 8 — OCR integration

Core target:

- PP-OCRv5 mobile ONNX
- ONNX Runtime Web wrapper

Start with OCR wrapper interface:

```ts
interface OcrEngine {
  initialize(config: OcrConfig): Promise<void>;
  recognizePage(page: PageImage): Promise<OcrEvidence[]>;
  recognizeRoi(page: PageImage, roi: NormalizedBox, mode: OcrMode): Promise<OcrEvidence[]>;
  dispose(): Promise<void>;
}
```

Implement first with placeholder/mock, then official PaddleOCR.js or ppu-paddle-ocr for benchmarking, then own ORT wrapper.

OCR requirements:

- coordinates
- confidence
- batch recognition
- ROI OCR
- special MRZ mode
- table cell mode
- alternatives where available

---

## 11. Phase 9 — Detector integration

Core target:

- YOLOv11n custom-trained

Build detector interface:

```ts
interface DocumentDetector {
  initialize(config: DetectorConfig): Promise<void>;
  detect(page: PageImage): Promise<DetectionEvidence[]>;
  dispose(): Promise<void>;
}
```

Initial classes:

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

Training comes later. For now, use public/model trial or mocked results.

Post-processing:

- JS/WASM NMS
- confidence threshold per class
- normalized boxes
- graph evidence nodes
- provenance with model version

---

## 12. Phase 10 — Parser modules

### 12.1 Barcode parser

Use zxing-wasm.

Interface:

```ts
interface CodeParser {
  parse(page: PageImage, roi?: NormalizedBox): Promise<CodeEvidence[]>;
}
```

### 12.2 MRZ parser

Implement from scratch in TypeScript.

Functions:

- normalizeMRZText
- detectMRZFormat
- parseTD1
- parseTD2
- parseTD3
- computeCheckDigit
- validateMRZ
- compareMRZToVisualFields

### 12.3 Table engine

Start with geometric engine:

- line detection
- row/column projections
- OCR box clustering
- cell construction
- header detection
- total detection

Add SLANet_plus trial after baseline.

---

## 13. Phase 11 — Verifier

Do not postpone verifier too long. It is core.

Implement validator registry:

```ts
type Validator = {
  id: string;
  appliesTo: FieldValueType | "table" | "mrz" | "barcode" | "asset";
  run(input: ValidatorInput): ValidationResult;
};
```

Validators:

- required field
- OCR confidence
- date format
- date range
- amount format
- ID pattern
- email
- phone
- MRZ checksum
- barcode payload match
- table total math
- checkbox exclusivity
- template region match
- asset presence
- face presence for portrait

Output status:

- confirmed
- needs_review
- missing
- conflict
- invalid

---

## 14. Phase 12 — Known-template extraction

Implement fast path:

1. normalize page
2. retrieve candidate templates
3. score template
4. align globally
5. local correction with nearby anchors
6. project field ROIs
7. OCR projected fields
8. parse projected special zones
9. crop projected assets
10. verify all fields
11. mark uncertain or create version if drift

Known-template extraction must not run the full unknown pipeline unless matching fails.

---

## 15. Phase 13 — Training data

Create annotation guidelines and dataset.

Initial labels:

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

Later labels:

- field_label
- field_value
- line_separator
- form_box
- table_cell
- emblem
- flag
- symbol

Data sources:

- synthetic fake documents
- public sample invoices/forms
- generated fake passports/IDs
- manually annotated examples
- user-exported correction packages only with consent

Augmentations:

- blur
- motion blur
- JPEG compression
- shadows
- glare
- perspective warp
- rotation
- crop
- low DPI
- scanner noise
- stains
- folds
- photocopy effect

---

## 16. Phase 14 — Benchmarking

Build benchmark harness before optimizing.

Metrics:

- OCR CER/WER
- field exact match
- normalized field exact match
- asset crop IoU
- mask IoU
- table cell F1
- barcode decode rate
- MRZ parse/checksum accuracy
- template hit rate
- template false-match rate
- silent critical error rate
- processing latency
- memory peak

Most important:

> Silent critical error rate.

A confirmed wrong field is worse than a field marked for review.

---

## 17. Phase 15 — Packaging

### 17.1 Browser PWA

Good for prototype:

- easy distribution
- offline after model cache
- local-only
- no install

Limits:

- browser compatibility
- WebGPU variation
- memory limits
- file access
- model load constraints

### 17.2 Tauri app

Serious local app path:

- same web UI
- local packaging
- better filesystem access
- more predictable runtime
- potential native acceleration later
- still no cloud

Recommended path:

```text
Prototype: browser PWA
Serious v1: Tauri + same web UI
PWA mode: simpler documents and demos
```

---

## 18. Build milestones

### Milestone 1 — Mock graph prototype

- upload UI
- document viewer
- mock DocGraph
- generated form
- correction UI

### Milestone 2 — Local document scanner

- PDF/image load
- page normalization
- OpenCV preprocessing
- overlay coordinates

### Milestone 3 — OCR graph

- OCR integration
- text nodes
- evidence viewer

### Milestone 4 — Detector assets

- YOLO integration
- asset boxes
- object nodes
- crops

### Milestone 5 — Parsers

- zxing-wasm
- MRZ parser
- table geometry

### Milestone 6 — Verifier

- validator registry
- statuses
- evidence reasons

### Milestone 7 — Template learning

- save TemplateGraph
- match template
- ROI extraction
- versioning

### Milestone 8 — Benchmark pack

- sample docs
- metrics
- regression tests

### Milestone 9 — Model training

- custom YOLOv11n dataset
- ONNX export
- edge benchmark

### Milestone 10 — Serious v1

- Tauri packaging
- encrypted storage
- stable UX
- release checklist

---

## 19. Engineering rules

1. Do not wire UI directly to OCR output.
2. Do not create form fields without hypotheses.
3. Do not confirm fields without verification.
4. Do not save templates without user confirmation.
5. Do not overwrite templates when layout drift is detected.
6. Do not run heavy models on main thread.
7. Do not run full-page segmentation by default.
8. Do not process sensitive documents in cloud.
9. Do not log raw OCR text in normal debug logs.
10. Do not benchmark only on clean scans.
11. Do not optimize for speed before silent-error reduction.
12. Do not treat model confidence as final truth.
13. Do not store only final values.
14. Always store evidence, coordinates, provenance, and status.

---

## 20. First implementation task list

Start with:

1. create repo
2. create schemas
3. create mock DocGraph
4. create viewer
5. create form renderer
6. create correction model
7. save/load TemplateGraph
8. add PDF/image upload
9. add OpenCV normalization
10. add OCR interface
11. add detector interface
12. add parser interfaces
13. add verifier
14. integrate models incrementally

If these are done in order, the project remains clean and buildable.
