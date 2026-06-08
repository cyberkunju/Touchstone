# Model Selection Rationale — Edge DocGraph Engine

**Purpose:** Explain why each model/library was selected, which alternatives were rejected or bucketed, and what would cause a future change.

---

## 1. Selection criteria

Every model or model-like library is judged by these criteria:

1. **Local-only feasibility**
2. **Edge/browser/Tauri compatibility**
3. **Latency**
4. **Memory footprint**
5. **Output geometry quality**
6. **Evidence compatibility**
7. **Low hallucination risk**
8. **Determinism and debuggability**
9. **Model size and loading behavior**
10. **Open-source compatibility**
11. **Benchmark improvement**
12. **Silent-error impact**

A model that scores high on leaderboard accuracy but fails edge runtime, coordinate output, or trust requirements is not acceptable as core.

---

## 2. Why YOLOv11n for document detection

### Decision

Use **YOLOv11n custom-trained** as the primary document object detector.

### Why

YOLOv11n is selected because the project is open-source and licensing is not a blocker. The nano variant is attractive for edge deployment because it is small, fast, and suitable for browser/Tauri-style inference after export. It also has a clear segmentation-family path through YOLOv11n-seg.

### What it will detect

The detector must be trained on document-specific classes, not generic objects.

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

### Why not generic YOLO weights

Generic object datasets do not represent document-specific visual entities well. A COCO-pretrained model may recognize people or objects but not MRZ zones, stamps, seals, signatures, checkboxes, passport photos, table regions, or document boundaries reliably.

### Why not public DocLayNet YOLO as final

Public DocLayNet-style models are useful for bootstrapping layout experiments, but they usually focus on generic layout classes such as text, title, table, figure, list, and so on. Our product needs visual assets and form primitives. Therefore, public layout models are experiment/bootstrap only.

### What would replace YOLOv11n

YOLOv11n can be replaced only if another detector proves:

- better per-class recall on our document classes,
- lower latency or similar latency,
- lower memory,
- clean ONNX Runtime Web behavior,
- no worse silent-error risk,
- compatible licensing.

Candidate buckets:

- PicoDet / PP-DocLayout style detector
- RF-DETR Nano/Small
- RF-DETR-Seg

---

## 3. Why PP-OCRv5 for OCR

### Decision

Use **PP-OCRv5 mobile ONNX** as the core OCR model family.

### Why

OCR is a precision task. The system needs exact text, coordinates, confidence, and ROI operation. PP-OCRv5 is selected because it is part of a strong OCR model family and can be integrated into a local ONNX Runtime Web pipeline.

### What OCR must do

- full-page context OCR
- detected text-block OCR
- ROI OCR
- small-field high-resolution OCR
- MRZ OCR
- table-cell OCR
- template-projected region OCR

### Why not OCR-only

OCR alone cannot extract:

- photos
- signatures
- stamps
- seals
- logos
- checkboxes
- tables as structure
- MRZ validation
- barcode payloads
- template relationships

PP-OCRv5 is the text evidence engine, not the full product.

### Integration decision

Long-term preferred path:

```text
PP-OCRv5 mobile ONNX
  → custom ONNX Runtime Web wrapper
  → evidence records
```

Trial integrations:

- official PaddleOCR.js
- ppu-paddle-ocr

The custom wrapper is preferred because we need control over ROI batching, worker sessions, tensor lifecycle, and evidence formatting.

### Why not Tesseract.js

Tesseract.js is rejected as core because it is redundant, less aligned with the target performance/accuracy needs, and adds unnecessary output inconsistency.

### Why not GLM-OCR / heavy OCR VLM as runtime core

Heavy OCR/document VLMs may be useful for research, but they are not ideal for edge/browser runtime because of model size, memory, latency, coordinate guarantees, and hallucination/format variability concerns.

---

## 4. Why zxing-wasm for barcode and QR

### Decision

Use **zxing-wasm / ZXing-C++ WASM** as the barcode and QR parser.

### Why

Codes are deterministic machine-readable regions. A dedicated local parser is better than OCR or VLM interpretation.

Target formats:

- QR
- PDF417
- Data Matrix
- Code 128
- EAN
- Aztec where available

### Why not native BarcodeDetector

Native BarcodeDetector is rejected as the primary engine because browser support is inconsistent. The product needs reliable local behavior across environments.

### Why not old ZXing JS wrapper

The preferred path is ZXing-C++ compiled to WASM through zxing-wasm because it is better aligned with modern local browser usage.

---

## 5. Why MediaPipe Face Detector for portrait verification

### Decision

Use **MediaPipe Face Detector** to verify portrait crops.

### Why

The system needs to know whether a detected photo-like asset contains a face. This helps validate passport/ID portrait extraction.

### Scope

Allowed:

- face presence
- face box/keypoints inside crop
- crop sanity check

Not allowed:

- face recognition
- identity matching
- biometric authentication
- liveness detection

### Why not face-api.js

face-api.js is not selected because MediaPipe is more directly aligned with modern lightweight edge/web face detection for this use case.

---

## 6. Why custom MRZ parser

### Decision

Build a **custom TypeScript MRZ parser**.

### Why

MRZ parsing is deterministic and should not be delegated to an LLM or generic model.

The parser must:

- support TD1
- support TD2
- support TD3
- normalize OCR confusions
- compute check digits
- validate dates and document number fields
- cross-check visual fields
- create validation results

### Why custom

The parser is small, auditable, testable, and critical for trust. A custom implementation ensures control over error handling and evidence mapping.

---

## 7. Why custom geometric table engine

### Decision

Build a custom table engine first.

### Why

Many document tables can be reconstructed with geometry and OCR boxes:

- lines
- row projections
- column projections
- text clustering
- header detection
- cell assignment

A deterministic engine is edge-friendly and explainable.

### Why SLANet_plus is bucketed

SLANet_plus is kept as a serious trial for complex or wireless tables where geometry fails. It should graduate only if it improves table metrics without unacceptable runtime cost.

### Why not Table Transformer as default

Table Transformer is rejected as the default browser model because it is too heavy for v1 edge runtime and still requires OCR integration.

---

## 8. Why YOLOv11n-seg / EfficientSAM / SlimSAM bucket

### Decision

Use YOLOv11n-seg as the first segmentation candidate, keep EfficientSAM and SlimSAM-77 in trial bucket.

### Why

Visual assets sometimes need precise masks:

- signatures
- stamps
- seals
- logos
- emblems
- photos

But segmentation is expensive. It should be conditional, not always-on full page.

### Candidate roles

| Candidate | Role |
|---|---|
| YOLOv11n-seg | fast class-specific masks if custom training works |
| EfficientSAM | on-demand promptable refinement |
| SlimSAM-77 | lightweight SAM-style edge trial |
| MobileSAM | benchmark only |

### Rejection

Full-page SAM segmentation by default is rejected.

---

## 9. Why ONNX Runtime Web

### Decision

Use **ONNX Runtime Web** as the main local inference runtime.

### Why

The project needs a common inference path for browser/Tauri environments. ONNX Runtime Web enables local model execution, with WebGPU for acceleration and WASM compatibility mode.

### Requirements

- static shape testing
- operator compatibility testing
- memory profiling
- worker execution
- model versioning
- tensor disposal

---

## 10. Why WebGPU primary and WASM compatibility mode

### Decision

Use WebGPU as primary acceleration and WASM as compatibility mode.

### Why

WebGPU is needed for performance. WASM mode is necessary because not every browser/device exposes WebGPU reliably.

This is not redundant model fallback. It is runtime compatibility.

---

## 11. Why not a giant VLM

### Decision

Reject giant VLM as runtime core.

### Why

A giant VLM may broadly understand documents but conflicts with core requirements:

- local weak-device execution
- exact text
- coordinate evidence
- deterministic behavior
- crop extraction
- low hallucination risk
- template ROI extraction
- model size constraints

A heavy VLM can remain a research/teacher candidate, not the product brain.

---

## 12. Why not Docling as runtime core

### Decision

Do not use Docling as the runtime core.

### Why

Docling is useful as a reference document conversion ecosystem, but the product requires a custom browser/edge DocGraph, TemplateGraph, correction UI, verifier, and ROI-first extraction architecture.

Docling may inspire structure, but it does not replace our core.

---

## 13. Why local TemplateGraph learning instead of model retraining

### Decision

One-shot learning means TemplateGraph learning.

### Why

User correction should immediately improve future extraction without retraining models. TemplateGraph learning is fast, local, explainable, and safe.

It stores:

- anchors
- ROIs
- validators
- aliases
- relationships
- versions

Model fine-tuning after one correction is rejected.

---

## 14. Model graduation rule

An experiment becomes core only if it proves:

1. better target metric,
2. stable edge runtime,
3. acceptable memory,
4. acceptable latency,
5. evidence-compatible output,
6. no increased silent error,
7. clean integration,
8. maintainable implementation.

---

## 15. Final rationale summary

The stack is selected to optimize for local execution, evidence quality, correction, template learning, and safety. YOLOv11n finds document objects, PP-OCRv5 reads exact text, zxing-wasm parses codes, MediaPipe verifies portrait crops, custom parsers validate deterministic structures, and the DocGraph/verifier owns truth. This is the right architecture for a trustworthy edge document-to-form engine.
