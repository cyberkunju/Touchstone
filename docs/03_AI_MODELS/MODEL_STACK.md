# Model Stack — Edge DocGraph Engine

**Purpose:** Define the final recommended model/library stack for the edge-only document intelligence system.  
**Principle:** Models are evidence producers. The DocGraph and verifier decide trust.

---

## 1. Final model stack summary

| Layer | Recommended choice | Role | Status |
|---|---|---|---|
| Runtime | ONNX Runtime Web | Runs ONNX models locally in browser/Tauri webview | Core |
| Acceleration | WebGPU primary, WASM compatibility mode | Local inference acceleration and compatibility | Core |
| OCR | PP-OCRv5 mobile ONNX | Text detection/recognition with coordinates | Core |
| OCR integration | Custom ONNX Runtime Web wrapper | ROI OCR, batching, model/session control | Core direction |
| Detector | YOLOv11n custom-trained | Detects document objects and regions | Core |
| Segmentation | YOLOv11n-seg | First segmentation candidate for known asset classes | Core candidate |
| Segmentation trials | EfficientSAM, SlimSAM-77 | Conditional refinement and mask comparison | Experiment bucket |
| Barcode / QR | zxing-wasm / ZXing-C++ WASM | Decodes QR, barcode, PDF417, Data Matrix, etc. | Core |
| Face / portrait | MediaPipe Face Detector | Verifies portrait crop contains a face | Core |
| MRZ | Custom TypeScript parser | Parses TD1/TD2/TD3 and validates check digits | Core |
| Tables | Custom geometric table engine | Deterministic table reconstruction | Core |
| Table model trial | SLANet_plus | Complex/wireless table recognition trial | Experiment bucket |
| Orientation | PP-LCNet orientation classifier | Page orientation correction trial | Experiment bucket |
| Heavy doc AI | LayoutLM/LayoutXLM/Donut/doc foundation models | Teacher/research only | Research bucket |

---

## 2. Core idea

The model stack is not a single monolithic AI model. It is a local specialist cascade.

```text
page image
  → YOLOv11n detects regions and objects
  → PP-OCRv5 reads text in page/regions/ROIs
  → zxing-wasm decodes codes
  → MRZ parser validates machine-readable zones
  → table engine reconstructs tables
  → segmentation refines visual asset crops when needed
  → MediaPipe verifies portrait crops
  → DocGraph stores all evidence
  → verifier decides status
```

Each module must output evidence records. None of them may directly create final trusted form values.

---

## 3. Why this stack is edge-first

The product must work locally and avoid cloud processing. Therefore:

- no cloud APIs
- no server-side OCR
- no giant always-on VLM
- no full-page SAM by default
- no heavy document foundation model as runtime core
- no hidden network dependency

The stack uses smaller, specialized components that can run in browser workers or a Tauri local shell.

---

## 4. Core model responsibilities

### 4.1 PP-OCRv5 mobile ONNX

Primary role:

- text detection
- text recognition
- ROI OCR
- MRZ OCR
- table-cell OCR
- high-resolution crop OCR

Must output:

- text
- coordinates
- confidence
- mode
- model version

Must not:

- decide final fields alone
- discard geometry
- rewrite values silently

---

### 4.2 YOLOv11n custom-trained detector

Primary role:

- detect document objects and layout regions

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

Must output:

- class
- box
- confidence
- model version

Must not:

- confirm final fields
- claim authenticity
- bypass verifier

---

### 4.3 YOLOv11n-seg

Primary role:

- produce masks for known visual asset classes if quality is strong enough

Target masks:

- photo
- signature
- stamp
- seal
- logo
- emblem
- symbol

Must be benchmarked against:

- EfficientSAM
- SlimSAM-77
- manual crop correction quality

---

### 4.4 zxing-wasm

Primary role:

- decode machine-readable visual codes locally

Target formats:

- QR
- PDF417
- Data Matrix
- Code 128
- EAN
- Aztec where supported

Must output:

- payload
- code type
- source region
- confidence or success state

---

### 4.5 MediaPipe Face Detector

Primary role:

- verify that a portrait crop contains a face

Must not:

- identify a person
- compare faces
- store biometric embeddings
- authenticate identity

---

### 4.6 Custom MRZ parser

Primary role:

- parse MRZ OCR output
- validate check digits
- normalize OCR confusions
- detect TD1/TD2/TD3
- cross-check visual fields

Must output:

- raw MRZ lines
- parsed fields
- checksum results
- status

---

### 4.7 Custom geometric table engine

Primary role:

- reconstruct tables using geometry and OCR boxes

Handles:

- bordered tables
- line-based grids
- OCR clustered rows/columns
- headers
- amount/date columns
- simple arithmetic validation

---

### 4.8 SLANet_plus trial

Primary role:

- help with difficult/wireless tables where geometry fails

Status:

- experiment bucket
- not required for first basic table engine
- promote only if benchmarks justify cost

---

## 5. Model integration principle

All model wrappers should expose a consistent interface.

```ts
interface LocalModel<TInput, TOutput> {
  initialize(config: ModelConfig): Promise<void>;
  run(input: TInput): Promise<TOutput>;
  dispose(): Promise<void>;
  getInfo(): ModelInfo;
}
```

All outputs must convert to evidence records.

```ts
type EvidenceRecord = {
  id: string;
  source: string;
  pageId: string;
  boxNorm?: NormalizedBox;
  confidence?: number;
  modelName?: string;
  modelVersion?: string;
  createdAt: number;
};
```

---

## 6. Runtime model loading

Rules:

1. Lazy-load models.
2. Cache model files locally.
3. Keep model cache separate from user data.
4. Load only required models for current task.
5. Avoid multiple large sessions at once.
6. Dispose tensors and sessions.
7. Record model version in evidence.
8. Do not block main UI thread.

---

## 7. Processing strategy by mode

### Unknown-document mode

Likely modules:

- page normalization
- detector
- OCR full-page/context
- OCR detected text blocks
- code parser
- MRZ parser if MRZ detected
- table engine
- asset crops
- segmentation only when useful
- verifier

### Known-template mode

Likely modules:

- page normalization
- template matcher
- ROI projection
- ROI OCR
- expected code parser
- expected MRZ parser
- expected asset crop/refinement
- verifier

Known-template flow should avoid broad full-page work unless template match fails.

---

## 8. Model acceptance gates

A model can become core only if:

1. it runs locally,
2. it works in ONNX Runtime Web or accepted local runtime,
3. it has acceptable latency,
4. memory use is acceptable,
5. output can be represented as evidence,
6. it improves metrics,
7. it does not increase silent critical errors,
8. licensing is compatible with open-source project goals,
9. it can be versioned and benchmarked,
10. it does not require cloud processing.

---

## 9. Experiment buckets

### OCR integration bucket

- official PaddleOCR.js
- ppu-paddle-ocr
- custom PP-OCRv5 ORT wrapper

### Detector bucket

- public YOLO DocLayNet models for bootstrapping
- PicoDet / PP-DocLayout style detector
- RF-DETR / RF-DETR-Seg comparison

### Segmentation bucket

- YOLOv11n-seg
- EfficientSAM
- SlimSAM-77
- MobileSAM benchmark only

### Table bucket

- geometric engine
- SLANet_plus
- PP-Structure-style references
- Table Transformer research only

### Heavy document AI bucket

- LayoutLM
- LayoutXLM
- Donut
- document foundation models
- local VLM experiments

These are research/benchmark candidates, not production core unless they pass acceptance gates.

---

## 10. Rejected model/runtime paths

Rejected as core:

- Tesseract.js
- giant VLM runtime
- GLM-OCR / DeepSeek-OCR as browser runtime core
- cloud OCR/document AI
- native BarcodeDetector as primary code parser
- old ZXing JS wrapper as main parser
- full-page SAM by default
- Table Transformer as default browser table model
- Docling as runtime core

Reasons are documented in `REJECTED_MODELS.md`.

---

## 11. Final model stack statement

The final model stack is a local specialist system. PP-OCRv5 reads text, YOLOv11n finds document objects, segmentation refines visual assets, zxing-wasm parses codes, custom parsers validate MRZ and tables, and MediaPipe checks portraits. The DocGraph integrates all evidence, and the verifier decides trust. This design is edge-feasible, explainable, correctable, and template-learned.
