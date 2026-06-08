# 05 — AI Models

**Purpose:** Define the model stack, why each model is chosen, how models are exported/packaged/versioned, how the detector and segmentation are trained, and how a model is allowed to change.

Core principle: **models are evidence producers, not authorities.** A model graduates to core only by passing the benchmark gates in [12_TESTING.md](12_TESTING.md); changes are recorded in a decision log.

---

## 1. Final stack

| Role | Model | Status |
|---|---|---|
| OCR (det + rec) | PP-OCRv5 mobile (ONNX) | Core |
| Document detector | YOLOv11n, custom-trained on document classes | Core |
| Asset segmentation | YOLOv11n-seg | Candidate (conditional) |
| Barcode/QR/PDF417 | zxing-wasm | Core |
| Portrait check | MediaPipe Face Detector (presence only) | Core |
| MRZ | custom TypeScript parser (deterministic) | Core |
| Tables | custom geometric engine | Core |
| Complex tables | SLANet_plus | Experiment bucket |
| Orientation | PP-LCNet classifier | Experiment bucket |
| Heavy doc AI | LayoutLM/Donut/GLM-OCR/Docling | Research/teacher only |

The "intelligence" is the architecture (evidence graph + verifier + template memory), not any single model. Specialist local models beat one giant model for edge feasibility, exact coordinates, determinism, and low hallucination.

## 2. Why these (rationale, condensed)

- **PP-OCRv5:** precise text + boxes + confidence; supports ROI/MRZ/table-cell modes; edge-feasible. (Tesseract rejected: weaker; heavy OCR-VLMs rejected as core: size/latency/weak provenance.)
- **YOLOv11n custom:** small, fast, exportable, segmentation-family path. **Must be custom-trained** on document classes — generic COCO weights cannot detect MRZ/signature/stamp/checkbox/etc. (RF-DETR/PicoDet/DocLayout-YOLO are buckets.)
- **zxing-wasm:** deterministic local code decoding. (Native BarcodeDetector rejected: inconsistent support.)
- **MRZ custom parser:** deterministic, auditable, must validate check digits — never delegate to a model.
- **Geometric tables first:** explainable, light, arithmetic-validatable. (Table Transformer too heavy for v1.)
- **MediaPipe face = presence only:** crop sanity, never recognition/identity.

## 3. Detector classes

Start small (v0, 12 classes), expand only when benchmarks justify it. Names: lowercase snake_case, singular, stable IDs, no renaming without migration; version the class set (`docdet-v0`).

- **v0:** `document_page, photo, signature, stamp, seal, logo, qr_code, barcode, mrz_zone, table, checkbox, text_block`.
- **v1 add:** `emblem, flag, symbol, field_label, field_value, line_separator, form_box`.
- **v2 (only if needed):** `table_cell, table_header, watermark, ...`.

Ambiguity rules: seal = official/embossed/crest; stamp = ink/rubber. emblem = official/state; logo = company/brand. QR = QR only; barcode = all non-QR initially. signature = strokes, not blank lines.

## 4. ONNX export discipline

A model that runs in Python is not automatically usable in the browser.

- Target ONNX Runtime Web; test both WebGPU and WASM paths.
- Prefer **static input shapes**; avoid unsupported ops; keep pre/post-processing outside the graph when the in-graph version is fragile (e.g. run NMS in JS/WASM).
- Record opset, input shape, normalization, NMS config, class list version.
- Per-model package layout:
```
models/{modelId}/{version}/
  model.onnx  config.json  labels.json  preprocessing.json  postprocessing.json
  metrics.json  MODEL_CARD.md  LICENSE_REF
```
- Validate after every export: ORT loads; WebGPU + WASM run; outputs match the Python reference within tolerance; postprocessing maps boxes/masks back to normalized coordinates; memory/latency acceptable.

YOLO export: letterbox 640×640 baseline (benchmark 960/tiled for small objects); raw predictions + external class-aware NMS; map boxes back to normalized page coordinates. OCR export: separate detection + recognition submodels; recognition uses fixed height, capped/bucketed width; CTC decode with the documented charset. Quantize (FP16/INT8) only after accuracy benchmarking.

## 5. Model manifest, caching, versioning

- Every build ships a **manifest** listing each model: id, version, task, runtime, files (path, **sha256**, sizeBytes, required), license, class version.
- Cache in OPFS at `/models/{modelId}/{version}/`; **atomic writes** (download to `/.tmp/`, verify size + sha256, validate metadata, then promote). Never load an unverified remote model.
- Lazy-load by need (detector on upload; OCR when OCR task begins; segmentation only if asset refinement needed). Dispose idle optional sessions under memory pressure.
- Model version format: `{family}-{task}-{classVersion}-{semver}`, e.g. `yolov11n-docdet-docdet-v0-0.1.0`. Every EvidenceRecord records model id + version + runtime + execution provider + pre/post-processor versions.
- **Local-first model loading:** models are packaged (Tauri) or served same-origin / from a trusted, checksummed release — never fetched ad hoc from arbitrary third-party hosts at runtime. Model requests never include document data.

## 6. Detector training (YOLOv11n)

- Ultralytics YOLO detection dataset format; `dataset.yaml` with the v0 class names; YOLO normalized label lines.
- Splits by **document family** (not random) to prevent leakage; include a locked hard-test set (blur/glare/skew/low-res/compression/crop/shadows) and hard negatives (random photos, screenshots, blank pages, decorative icons, QR-like patterns).
- Smoke train (3 epochs) → baseline (≈100 epochs, imgsz 640, patience 20) → augment-tuned → small-object focus → class-balancing. Never accept on one run.
- Critical-class recall (mrz_zone, qr_code, barcode, photo, signature, table, checkbox) matters more than mAP. Priority: a false negative on a required object is bad; a false positive causing review is less bad; a false positive causing a **silent wrong field is unacceptable**.
- Export to ONNX, test in browser on a fixed runtime pack, then evaluate downstream field accuracy and silent-error impact.

## 7. Segmentation training (YOLOv11n-seg)

Only after the segmentation bucket passes gates. Smaller class set (photo/signature/stamp/seal/logo/emblem/flag/symbol). Conditional runtime: detector box → optional refinement. Accept only if masks reduce asset correction effort without breaking latency/memory budgets; otherwise stay detector-crop-only.

## 8. Runtime selection

- WebGPU primary where available and stable; **WASM compatibility mode** required (broadest support, all ONNX ops). Feature-detect; record runtime mode in evidence. Not a redundant fallback — it is runtime compatibility.
- WebNN is a future bucket, not a v1 dependency. Detail in [08_EDGE_RUNTIME.md](08_EDGE_RUNTIME.md).

## 9. Change policy

A model becomes/replaces core only with: representative benchmark, edge-runtime proof (WebGPU+WASM or documented Tauri-only), acceptable latency/memory, evidence-compatible output (coordinates/confidence/provenance), **no increase in silent-error rate**, license/distribution review, and a decision-log entry updating the model stack, schemas, pipeline docs, and benchmarks. New leaderboard score alone is never sufficient.
