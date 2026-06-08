# Decision Log — Edge DocGraph Engine

**Purpose:** Track why each architecture, model, library, and rule was selected, rejected, or kept in an experiment bucket.  
**Rule:** Decisions must be revisited only through benchmarks, not vibes.

---

## 1. Core architectural decisions

### Decision 1 — Build a local evidence graph engine, not an OCR form filler

**Decision:** Accepted as the central architecture.

**Reason:** OCR alone extracts text but cannot represent photos, signatures, stamps, seals, symbols, checkboxes, MRZ zones, QR payloads, table relationships, or evidence provenance. A form field must be a graph-backed hypothesis, not an ungrounded string.

**Implication:** All modules produce evidence. The DocGraph is the source of truth.

---

### Decision 2 — Use DocGraph as the system brain

**Decision:** Accepted as non-negotiable.

**Reason:** The system must preserve coordinates, evidence, relationships, parser outputs, validation results, and user corrections. DocGraph enables explainability, correction, template learning, debugging, export, and verification.

**Implication:** No UI or export module should read raw OCR directly.

---

### Decision 3 — Use TemplateGraph for one-shot learning

**Decision:** Accepted as non-negotiable.

**Reason:** “Learn after one correction” cannot mean retraining neural models on weak devices. It should mean saving corrected structure: anchors, field regions, asset regions, aliases, validators, relationships, and version metadata.

**Implication:** TemplateGraph learning is instant, local, explainable, and safe.

---

### Decision 4 — Use verifier-driven field statuses

**Decision:** Accepted as non-negotiable.

**Reason:** The system must never silently lie. Fields must be confirmed only when evidence and validation support them. Otherwise they are needs_review, missing, conflict, or invalid.

**Implication:** The verifier drives UI status and trust.

---

### Decision 5 — Use ROI-first extraction for known templates

**Decision:** Accepted.

**Reason:** Once a template is learned, repeated documents should not require full unknown-document extraction. Align the template, project ROIs, run OCR/parsers/assets only where needed, validate, and fill fast.

**Implication:** Known-template flow is separate from unknown-document flow.

---

## 2. Runtime and application decisions

### React + Vite + TypeScript

**Status:** Recommended core.

**Why:** Fast, common, strongly typed, good for interactive UIs, compatible with PWA and Tauri.

**Risks:** Complex state if not modular. Mitigate with clean graph/form/template stores.

---

### Web Workers + Comlink

**Status:** Recommended core.

**Why:** OCR, detection, OpenCV, parsing, and graph operations must not block the UI. Comlink simplifies worker RPC.

**Risks:** Worker debugging complexity. Mitigate with typed worker protocols and structured logs.

---

### OffscreenCanvas

**Status:** Recommended core where supported.

**Why:** Enables worker-side rendering and image processing.

**Risks:** Support differences. Must design graceful routing.

---

### ONNX Runtime Web

**Status:** Recommended core.

**Why:** Unified local inference runtime for browser ONNX models. Supports WebGPU and WASM paths.

**Decision rule:** ONNX export is not enough. Every model must be tested against ONNX Runtime Web operator support and memory behavior.

---

### WebGPU primary + WASM compatibility mode

**Status:** Recommended core.

**Why:** WebGPU gives performance. WASM mode is necessary for devices/browsers without reliable WebGPU.

**Note:** This is not a redundant model fallback. It is a runtime compatibility requirement.

---

### Tauri

**Status:** Serious-app path / later packaging.

**Why:** Pure browser is good for prototype but can suffer from memory, WebGPU, filesystem, and corporate-browser limits. Tauri allows the same web UI with a local desktop shell.

**Decision:** Build browser-first, but keep architecture Tauri-compatible.

---

## 3. PDF and image processing decisions

### PDF.js

**Status:** Recommended baseline.

**Why:** Browser-friendly PDF parsing/rendering and embedded text extraction.

**Limitation:** May not produce the highest-fidelity raster output for complex PDFs.

---

### PDFium WASM

**Status:** Quality bucket.

**Why:** Potentially better raster rendering for PDF pages that degrade under PDF.js.

**Why not core immediately:** Adds complexity. Promote only if real benchmarks show meaningful OCR/detection improvement.

---

### OpenCV.js

**Status:** Recommended core.

**Why:** Essential for boundary detection, perspective correction, deskew, image quality, contrast normalization, table line extraction, and template alignment.

**Rule:** Treat OpenCV.js as browser-friendly image geometry, not as full native OpenCV replacement.

---

### PP-LCNet orientation classifier

**Status:** Trial bucket, likely important.

**Why:** Learned orientation correction can prevent downstream OCR/detection failure. Should be tested for size, accuracy, and runtime.

---

## 4. OCR decisions

### PP-OCRv5 mobile ONNX

**Status:** Recommended core OCR model.

**Why:** Strong OCR model family, local, coordinate-compatible, suitable for ROI-first extraction. OCR remains a key evidence producer.

**Usage:** Use for full-page relationship OCR, detected text blocks, ROIs, MRZ, table cells, and small fields.

---

### Custom ONNX Runtime Web OCR wrapper

**Status:** Recommended long-term integration.

**Why:** Gives control over batching, ROI extraction, session management, model versions, and evidence formatting.

---

### Official PaddleOCR.js

**Status:** Trial / baseline.

**Why:** Useful reference and quick integration path.

**Why not locked core:** We may need deeper control for PP-OCRv5 ONNX, batching, ROI scheduling, and evidence structure.

---

### ppu-paddle-ocr

**Status:** Experiment bucket.

**Why:** Promising direct PP-OCRv5 ONNX/ORT integration with browser-oriented optimizations.

**Why not core yet:** Too new to lock before benchmarks and source/model audit.

---

### Tesseract.js

**Status:** Rejected.

**Why:** Redundant and weaker for our target. Adds extra OCR output complexity without advancing the core architecture.

---

### GLM-OCR / DeepSeek-OCR / heavy OCR VLMs

**Status:** Rejected as runtime core; research-only.

**Why:** Too heavy for weak edge/browser use, less deterministic, weaker coordinate guarantees, not needed for ROI-first exact OCR.

---

## 5. Detection decisions

### YOLOv11n custom-trained

**Status:** Recommended primary detector.

**Why:** Edge-friendly, small, fast, supports our open-source licensing direction, and can be trained on document-specific classes.

**Critical condition:** Must be custom-trained. Generic COCO YOLO will not understand document objects.

**Initial classes:**

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

**Expanded classes:**

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

---

### Public YOLO DocLayNet models

**Status:** Experiment bucket.

**Why:** Useful for bootstrapping document layout tests.

**Why not final:** Generic layout classes are not enough for our required document assets and field semantics.

---

### RF-DETR / RF-DETR-Seg

**Status:** Experiment bucket.

**Why:** Useful comparison for detection and segmentation quality.

**Why not current primary:** YOLOv11n is preferred for speed/edge simplicity now that licensing is acceptable.

---

### PicoDet / PP-DocLayout-style detectors

**Status:** Experiment bucket.

**Why:** Potentially very small and edge-friendly. Worth testing on weak devices.

---

## 6. Segmentation decisions

### YOLOv11n-seg

**Status:** Primary segmentation candidate.

**Why:** If a single custom YOLO family can provide both detection and masks for known classes, the system becomes simpler and faster.

**Condition:** Must benchmark mask quality for signatures, stamps, seals, logos, photos, and symbols.

---

### EfficientSAM

**Status:** Experiment bucket.

**Why:** Strong candidate for on-demand crop refinement and user correction workflows.

**Usage:** Conditional refinement, not full-page always-on.

---

### SlimSAM-77

**Status:** Experiment bucket.

**Why:** Lightweight segmentation candidate for edge masks.

**Usage:** Compare against EfficientSAM and YOLOv11n-seg.

---

### MobileSAM

**Status:** Benchmark only.

**Why:** Useful reference, but not always-on. Prior research suggests runtime/version stability and cost concerns.

---

### Full-page SAM-style segmentation

**Status:** Rejected.

**Why:** Too expensive for default edge workflow. Segment only detected assets or user-selected regions.

---

### EdgeSAM

**Status:** Rejected.

**Why:** License/use restrictions make it unnecessary when EfficientSAM/SlimSAM/YOLO-seg are available.

---

## 7. Parser decisions

### zxing-wasm / ZXing-C++ WASM

**Status:** Recommended core.

**Why:** Reliable local barcode/QR/PDF417 parsing in browser-compatible WASM.

---

### Native BarcodeDetector

**Status:** Rejected as main engine.

**Why:** Browser support is inconsistent. We need deterministic local behavior.

---

### Old ZXing JS wrapper

**Status:** Rejected.

**Why:** Prefer zxing-wasm / ZXing-C++ WASM path.

---

### Custom MRZ parser

**Status:** Recommended core.

**Why:** MRZ parsing is deterministic. It should not depend on a model or LLM. Needs TD1/TD2/TD3 parsing, OCR correction, and check-digit validation.

---

## 8. Table decisions

### Custom geometric table engine

**Status:** Recommended core.

**Why:** Lightweight, deterministic, explainable, and works well for many bordered and semi-structured tables.

---

### SLANet_plus

**Status:** Experiment bucket, likely important.

**Why:** Needed for difficult, wireless, borderless, or complex tables where geometry fails.

---

### Table Transformer / TATR

**Status:** Rejected as default browser model.

**Why:** Too heavy for v1 edge-browser use. Good research reference, not default runtime.

---

## 9. Heavy document AI decisions

### LayoutLM / LayoutXLM / Donut / doc foundation models

**Status:** Research-only bucket.

**Why:** Useful as teachers, baselines, or research references. Not production runtime because the product needs edge execution, exact coordinates, crops, parsers, and low silent-error risk.

---

### Docling as runtime core

**Status:** Rejected.

**Why:** Useful reference and tooling, but not our browser-edge core. We need our own DocGraph/form/template engine.

---

### Cloud document APIs

**Status:** Rejected.

**Why:** Violates local-only requirement.

---

## 10. Storage and security decisions

### IndexedDB + OPFS

**Status:** Recommended core.

**Why:** IndexedDB handles structured metadata; OPFS handles large binary assets, masks, templates, rendered pages, and model files.

---

### WebCrypto AES-GCM

**Status:** Recommended core.

**Why:** Sensitive document content, templates, crops, OCR text, and extracted fields must be encrypted locally where feasible.

---

### SQLite WASM

**Status:** Maybe later.

**Why:** Useful if template queries become complex. Not mandatory for v1.

---

## 11. UI/UX decisions

### Evidence-first form UI

**Status:** Recommended core.

**Why:** Users need to trust and correct outputs. Every field should show source crop, OCR tokens, validator result, and status.

---

### Correction-first workflow

**Status:** Recommended core.

**Why:** Corrections are not just edits. They are high-trust evidence that powers TemplateGraph learning.

---

### Status colors

**Status:** Recommended core.

Suggested statuses:

- confirmed: green
- needs_review: amber
- conflict: red/orange
- missing: red
- invalid: red
- unsupported: gray

---

## 12. Rejected ideas summary

| Idea | Reason |
|---|---|
| Single giant VLM runtime | Heavy, less deterministic, weak coordinate guarantees |
| Cloud APIs | Violates local-only |
| Tesseract.js | Redundant and weaker for target |
| Native BarcodeDetector | Browser support inconsistency |
| Old ZXing JS wrapper | Prefer zxing-wasm |
| Full-page SAM by default | Too expensive |
| SVD-only template matching | Too brittle |
| Fixed global confidence threshold | Not calibrated enough |
| Neural retraining after one correction | Wrong mechanism for edge |
| Docling as runtime core | Not our browser-edge core |
| Table Transformer default | Too heavy |
| EdgeSAM | License/use concerns |

---

## 13. Experiment bucket summary

| Bucket | Candidates | Graduation requirement |
|---|---|---|
| OCR wrapper | PaddleOCR.js, ppu-paddle-ocr | Lower latency, correct coordinates, reliable PP-OCRv5, stable browser inference |
| Detector | Public YOLO DocLayNet, PicoDet, RF-DETR | Better accuracy/latency than YOLOv11n on our document classes |
| Segmentation | YOLOv11n-seg, EfficientSAM, SlimSAM-77 | Best mask quality + acceptable runtime |
| Tables | SLANet_plus | Improves difficult table extraction without unacceptable cost |
| PDF | PDFium WASM | Better OCR/detection raster quality than PDF.js on real samples |
| Heavy doc AI | LayoutLM/LayoutXLM/Donut | Teacher/benchmark value only unless edge constraints are solved |
| Packaging | Tauri | Needed if browser limitations block serious local use |

---

## 14. Decision change process

A decision may change only if:

1. a benchmark shows measurable improvement,
2. licensing and open-source compatibility are acceptable,
3. edge runtime compatibility is proven,
4. memory and latency budgets are met,
5. output can be represented as DocGraph evidence,
6. silent-error risk does not increase,
7. integration does not break local-only privacy.

All changes must update:

- this decision log
- model stack documentation
- affected schemas
- affected pipeline docs
- benchmark records
