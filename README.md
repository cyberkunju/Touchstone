# Edge DocGraph Engine

**A local-only intelligent document-to-form engine that converts uploaded documents into editable, evidence-backed forms, learns corrected templates locally, and extracts future similar documents through fast ROI-first verification.**

> This project is not an OCR app.  
> It is not a generic vision-language prompt.  
> It is a local evidence graph engine for documents.

---

## 1. What this project is

Edge DocGraph Engine is a privacy-first, edge-only web/local application for understanding documents. Users upload an image or PDF such as a passport page, ID card, invoice, receipt, certificate, bank statement, license, or generic form. The app detects and extracts text, fields, photos, signatures, stamps, seals, logos, symbols, QR codes, barcodes, MRZ zones, checkboxes, tables, and other visible document elements. It then generates an editable form with every field linked to visible evidence.

The key behavior is correction-driven template learning. On the first upload of an unknown document, the system extracts cautiously and shows evidence. The user corrects wrong labels, values, crops, tables, or missing fields. The corrected structure is saved locally as a reusable **TemplateGraph**. On the second similar upload, the app recognizes and aligns the template, extracts known regions quickly, verifies all values, and fills the form with far higher confidence.

Everything runs locally. No document image, field value, crop, template, OCR result, or identity/financial data should leave the device unless the user explicitly exports it.

---

## 2. Core promise

First upload:

> Extract cautiously, show evidence, and let the user correct uncertain fields.

Second similar upload:

> Align to the saved TemplateGraph, extract from known regions, verify aggressively, and fill the form fast.

Unknown or changed layout:

> Do not pretend. Create a new template or new template version.

Bad scan:

> Request rescan or mark low confidence instead of silently guessing.

Internal rule:

> **No hallucinated fields. Every field needs evidence.**

---

## 3. Why this project exists

Traditional OCR tools extract text. That is not enough for real document automation.

Documents contain:

- text
- layout
- field labels
- field values
- photos
- signatures
- stamps
- seals
- logos
- symbols
- tables
- checkboxes
- barcodes
- QR codes
- MRZ zones
- visual evidence
- relationships between all of the above

A passport photo is not text. A signature is not text. A stamp may contain text and visual meaning. A table total must relate to line items. A QR payload may confirm a printed value. An MRZ line may validate an identity field. A checkbox state is visual, not textual. A form field is often a relationship between a nearby label and value, not just a line of OCR.

This engine treats the document as a structured visual world. It builds a graph of visible evidence and uses that graph to generate forms, validate fields, save templates, and improve future extraction.

---

## 4. Current project status

This repository begins with the **Master Documentation Phase**.

The first documentation set defines:

- product requirements
- master architecture
- build-from-zero guide
- model and stack decisions
- rejected ideas
- experimental buckets
- glossary

Implementation should not begin by randomly wiring models together. Implementation begins by following the architecture and rules in `docs/00_MASTER`.

---

## 5. Final high-level architecture

```text
Input image/PDF
  → page normalization
  → multi-pass evidence extraction
  → DocGraph construction
  → field / asset / table hypothesis generation
  → verification
  → editable form
  → user correction
  → TemplateGraph learning
  → template versioning
  → fast known-template extraction
```

All ML and parsing modules are evidence producers:

- YOLOv11n detects document objects.
- PP-OCRv5 reads text.
- YOLOv11n-seg / EfficientSAM / SlimSAM extract visual masks when needed.
- zxing-wasm reads barcodes and QR codes.
- The MRZ parser validates machine-readable zones.
- The table engine reconstructs tables.
- MediaPipe checks portrait crops.
- User corrections provide high-trust evidence.

The **DocGraph** stores and relates this evidence.  
The **Verifier** decides what is confirmed, uncertain, missing, invalid, or conflicting.  
The **TemplateGraph** stores corrected layouts for fast future extraction.

---

## 6. Recommended core stack

| Layer | Recommended choice |
|---|---|
| Frontend | React + Vite + TypeScript |
| Worker orchestration | Web Workers + Comlink |
| Canvas processing | OffscreenCanvas |
| Runtime | ONNX Runtime Web |
| Acceleration | WebGPU primary, WASM compatibility mode |
| PDF baseline | PDF.js |
| PDF quality bucket | PDFium WASM |
| Image preprocessing | OpenCV.js |
| OCR | PP-OCRv5 mobile ONNX |
| OCR integration | Custom ONNX Runtime Web wrapper |
| Detector | YOLOv11n custom-trained |
| Segmentation candidate | YOLOv11n-seg |
| Segmentation trial bucket | EfficientSAM, SlimSAM-77 |
| Barcode/QR/PDF417 | zxing-wasm / ZXing-C++ WASM |
| Portrait verification | MediaPipe Face Detector |
| MRZ | Custom TypeScript parser |
| Tables | Custom geometric engine + SLANet_plus trial |
| Core data model | Custom DocGraph |
| Template learning | Custom TemplateGraph |
| Verification | Custom local verifier |
| Storage | IndexedDB + OPFS |
| Encryption | WebCrypto AES-GCM |
| Serious local app path | Tauri |

---

## 7. Repository documentation map

The full documentation set lives under `docs/` and is organized into 18 numbered sections. Start with the master index at [`docs/README.md`](docs/README.md).

```text
README.md
docs/
  README.md              ← master index (start here)
  00_MASTER/             PRD, architecture, build guide, decisions, glossary
  01_PRODUCT/            vision, requirements, MVP scope, non-goals, user stories
  02_ARCHITECTURE/       system overview, component map, data and uncertainty flows
  03_AI_MODELS/          model stack, selection rationale, ONNX export, research buckets
  04_PIPELINES/          upload, normalization, OCR, tables, MRZ, barcode, correction
  05_DOCGRAPH/           DocGraph spec, node/edge types, evidence, confidence model
  06_TEMPLATE_ENGINE/    TemplateGraph spec, matching, alignment, versioning, memory
  07_VERIFICATION/       verifier architecture, validators, field status, silent-error policy
  08_UI_UX/              workspace, viewers, correction UI, confidence colors, accessibility
  09_EDGE_RUNTIME/       ONNX Runtime Web, workers, memory, performance, packaging
  10_DATA_AND_TRAINING/  dataset strategy, annotation, training, evaluation, privacy-safe data
  11_SECURITY_PRIVACY/   threat model, encryption, PII handling, no-cloud policy, storage
  12_TESTING_BENCHMARKS/ test strategy, acceptance criteria, benchmarks, regression, metrics
  13_IMPLEMENTATION/     repo structure, build guide, coding standards, module interfaces
  14_API_SCHEMAS/        JSON schemas, internal types, worker messages, export formats, examples
  15_DEVOPS_PACKAGING/   CI/CD, local dev, PWA/Tauri builds, migrations, release checklist
  16_OPEN_SOURCE/        contributing, code of conduct, licenses, roadmap, security policy
  17_RESEARCH/           model/detector/segmentation comparisons, experiment buckets, rejected ideas
```

Each section folder contains a `MANIFEST.md` listing its files.

---

## 8. How to use these docs

Read in this order:

1. `README.md`
2. `docs/00_MASTER/MASTER_PRD.md`
3. `docs/00_MASTER/MASTER_ARCHITECTURE.md`
4. `docs/00_MASTER/BUILD_FROM_ZERO_GUIDE.md`
5. `docs/00_MASTER/DECISION_LOG.md`
6. `docs/00_MASTER/GLOSSARY.md`

The PRD explains what must be built.  
The architecture explains how the system works.  
The build guide explains how to construct it from zero.  
The decision log explains why the stack is what it is.  
The glossary ensures everyone uses the same language.

---

## 9. Non-negotiable engineering rules

1. No cloud document processing.
2. No silent wrong answers.
3. Every field must have evidence.
4. Every evidence item must have coordinates.
5. Every output must preserve provenance.
6. The DocGraph is the source of truth.
7. The verifier drives trust and UI status.
8. One-shot learning means TemplateGraph learning, not model fine-tuning.
9. Known-template extraction must be ROI-first.
10. Unknown-document extraction must be review-first.
11. Bad scans must be rejected or marked uncertain.
12. Templates must be versioned, not blindly overwritten.
13. User corrections must update evidence and templates safely.
14. Sensitive data must stay local and encrypted.
15. Model choices must be benchmarked before graduation from experiment to core.

---

## 10. Initial MVP focus

The first deep document types should be:

1. Passport / ID style documents
2. Invoice / receipt style documents
3. Generic forms with labels, values, signatures, checkboxes, and tables

These three cover the essential primitives:

- fixed layouts
- variable layouts
- photos
- MRZ
- IDs
- dates
- tables
- totals
- QR/barcodes
- signatures
- stamps
- checkboxes
- form labels and values

Do not attempt to support every document type shallowly before these are deeply reliable.

---

## 11. Build philosophy

The system should feel magical because it becomes better after correction, not because it pretends to know everything. The correct goal is not universal omniscience. The correct goal is local, private, evidence-backed document automation that becomes extremely fast and accurate on repeated templates.

The best version of this project is:

```text
local evidence graph engine
+ correction-driven TemplateGraph memory
+ ROI-first known-template extraction
+ strict verification
+ no silent wrong answers
```
