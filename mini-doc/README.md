# Edge DocGraph Engine — Build Documentation (mini-doc)

This is the complete, non-redundant specification needed to build **Edge DocGraph Engine** from zero to an exceptional standard. It is distilled from a larger 189-file documentation set into a lean, authoritative build guide. If you read these in order and follow them, you can implement the full system correctly.

---

## What you are building

A **local-only** (no cloud) web/desktop app that converts uploaded documents (passports/IDs, invoices/receipts, generic forms, and more) into **editable, evidence-backed forms**, learns corrected layouts as reusable local **templates**, and extracts future similar documents fast via region-of-interest (ROI) projection.

It is **not** an OCR app, **not** a cloud document API, and **not** a vision-LLM wrapper. It is an **evidence graph engine**:

```
input → page normalization → local evidence producers → DocGraph
      → field hypotheses → Verifier → editable form
      → user correction → TemplateGraph → fast ROI-first re-extraction
```

## The five laws (memorize these)

1. **No silent errors.** A wrong value shown as `confirmed` is the worst failure. Prefer `needs_review`.
2. **Every field has evidence.** No hallucinated fields. The form is a *view* over the DocGraph, never the source of truth.
3. **Local-only by default.** No document content leaves the device. No telemetry with document data.
4. **Models are evidence producers, not authorities.** The Verifier decides trust.
5. **Templates store structure, never variable values.** Layout drift creates a new version; it never corrupts the old one.

These laws override every other consideration, including speed and demo polish.

---

## Reading order

| # | Doc | Purpose |
|---|---|---|
| 00 | [README.md](README.md) | This file: orientation and laws |
| 01 | [PRODUCT_SPEC.md](01_PRODUCT_SPEC.md) | What to build, scope, non-goals, requirements, success metrics |
| 02 | [ARCHITECTURE.md](02_ARCHITECTURE.md) | Modules, data flow, the two extraction flows, invariants |
| 03 | [DATA_MODEL.md](03_DATA_MODEL.md) | DocGraph, TemplateGraph, Evidence, Hypothesis, Validation schemas |
| 04 | [PIPELINES.md](04_PIPELINES.md) | Every processing pipeline, end to end |
| 05 | [AI_MODELS.md](05_AI_MODELS.md) | Model stack, ONNX export, training, runtime selection |
| 06 | [VERIFICATION.md](06_VERIFICATION.md) | Verifier, validators, field statuses, silent-error policy |
| 07 | [TEMPLATE_ENGINE.md](07_TEMPLATE_ENGINE.md) | Matching, alignment, ROI projection, versioning, anti-corruption |
| 08 | [EDGE_RUNTIME.md](08_EDGE_RUNTIME.md) | Workers, ONNX Runtime Web, memory, caching, performance, Tauri |
| 09 | [UI_UX.md](09_UI_UX.md) | Workspace, viewer, form, evidence, correction, accessibility |
| 10 | [SECURITY_PRIVACY.md](10_SECURITY_PRIVACY.md) | No-cloud, PII, classification, encryption, threat model |
| 11 | [IMPLEMENTATION.md](11_IMPLEMENTATION.md) | Repo structure, interfaces, coding standards, config, errors |
| 12 | [TESTING.md](12_TESTING.md) | Test strategy, silent-error benchmark, metrics, acceptance gates |
| 13 | [BUILD_PLAN.md](13_BUILD_PLAN.md) | Phased build plan from empty repo to release |
| 14 | [GLOSSARY.md](14_GLOSSARY.md) | Canonical terminology |
| 15 | [UNIVERSAL_MODEL_PLAN.md](15_UNIVERSAL_MODEL_PLAN.md) | Master plan for the universal, edge-deployable model program: data, model stack, advanced techniques, training, phases, and gates |

## Recommended stack (decided)

| Layer | Choice |
|---|---|
| Frontend | React + Vite + TypeScript (strict) |
| Workers | Web Workers + Comlink |
| Canvas | OffscreenCanvas |
| Inference | ONNX Runtime Web (WebGPU primary, WASM compatibility) |
| OCR | PP-OCRv5 mobile (ONNX) |
| Detector | YOLOv11n, custom-trained on document classes |
| Barcode/QR | zxing-wasm |
| MRZ | custom TypeScript parser (checksum-validating) |
| Tables | custom geometric engine (SLANet_plus as trial) |
| Face check | MediaPipe Face Detector (presence only) |
| PDF | PDF.js (PDFium WASM as quality trial) |
| Image ops | OpenCV.js |
| Storage | IndexedDB (metadata) + OPFS (blobs/models) |
| Encryption | WebCrypto AES-GCM |
| Serious packaging | Tauri (same frontend) |

Model and library choices change only through the benchmark gates in [TESTING.md](12_TESTING.md), and any change is recorded in a decision log.

## How to use this set

- Build in the order of [BUILD_PLAN.md](13_BUILD_PLAN.md), not by wiring models together first.
- When a rule here conflicts with convenience, the rule wins.
- Every term is defined in [GLOSSARY.md](14_GLOSSARY.md); use it consistently.
