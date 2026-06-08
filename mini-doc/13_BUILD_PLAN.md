# 13 — Build Plan

**Purpose:** A phased path from empty repo to release. The order matters: build the evidence architecture, forms, correction, and templates **first**, then plug AI models into a working system. Do not start by wiring models together.

Rule of thumb: at every milestone the app must be honest (uncertainty visible), local-only, and evidence-backed — even when extraction is mocked.

---

## Phase 0 — Foundations

- Monorepo (pnpm workspaces) per [11_IMPLEMENTATION.md](11_IMPLEMENTATION.md); strict TypeScript; ESLint/Prettier; Vitest; Playwright; CI skeleton.
- `packages/core`: branded IDs, `Result`, `AppError`, geometry utils (IoU, normalize/scale box, homography apply, ROI expansion, clamp), event types.
- `packages/config`: typed config + safe defaults + threshold profile v0 + feature flags (segmentation off).
- Author/generate JSON schemas from [03_DATA_MODEL.md](03_DATA_MODEL.md); wire `schemas:validate` into CI.
- **Exit:** `pnpm install/dev/typecheck/lint/test` all work; schemas validate; empty app shell loads.

## Phase 1 — Data model, mock graph, viewer, form

- `packages/docgraph`: types, builders, selectors, patches; validate against schemas.
- Build 3 **mock DocGraphs** (passport, invoice, generic form) with evidence, hypotheses, statuses, a conflict, a missing field.
- Document viewer (zoom/pan/overlays/selection, normalized↔viewer coordinate mapping) and form renderer (status badges, reasons, evidence button) driven entirely by the mock graphs.
- **Exit:** forms render from mock graphs with visible statuses and bidirectional viewer↔field linking. If the form can't render from a mock graph, the architecture is wrong.

## Phase 2 — Correction + TemplateGraph save/load + matching skeleton

- Correction pipeline: every edit → CorrectionEvent → graph patch → re-verify (stub) → UI update; original evidence preserved.
- `packages/template-engine`: learn TemplateGraph from a corrected graph (structure only, no values); storage (`StorageService` over IndexedDB + OPFS); template list UI; template save panel ([09_UI_UX.md](09_UI_UX.md)).
- Matching skeleton with mock anchors (text + geometry + special-zone) and the multi-signal scorer + decision states.
- **Exit:** correct a mock document → save template → re-upload a similar mock → matched → ROI projection visualized. No old values copied.

## Phase 3 — Edge runtime + page normalization

- `packages/workers`: typed protocol, Comlink, task queue, cancellation, progress, transferables/refs ([08_EDGE_RUNTIME.md](08_EDGE_RUNTIME.md)).
- `preprocess` worker: image decode, OpenCV normalization (boundary/deskew/perspective), quality analyzer (blur/glare/contrast/resolution), canonical coordinates + transforms.
- PDF.js ingestion (digital text evidence + page render), page-by-page.
- **Exit:** real PDFs/images normalize with quality reports and coordinate transforms; UI stays responsive (work in workers).

## Phase 4 — OCR integration (real evidence begins)

- `ai-runtime`: ONNX Runtime Web adapter (WebGPU + WASM), model registry + manifest + OPFS cache with checksum.
- PP-OCRv5 wrapper: detection + recognition; modes full-page/block/ROI; raw text preserved; confidence + coordinates → `ocr_text` evidence → text nodes.
- Replace mock text with real OCR; generate label/value hypotheses from geometry. **No hardcoded values, ever.**
- **Exit:** real OCR drives the form; uncertain fields are `needs_review`, not fabricated.

## Phase 5 — Detector + visual assets

- Train + export custom YOLOv11n (v0 classes) per [05_AI_MODELS.md](05_AI_MODELS.md); JS/WASM NMS; map boxes to normalized coordinates → detection evidence.
- Asset crops (photo/signature/logo); conditional segmentation trial; MediaPipe face presence.
- **Exit:** document objects/assets detected and correctable; missed objects become review states, not silent omissions.

## Phase 6 — Parsers (barcode, MRZ, tables)

- zxing-wasm in `parser` worker (QR/PDF417/barcode) → code evidence; never auto-open URLs.
- Custom MRZ parser (TD1/TD2/TD3, OCR-B normalization, check digits) → MRZ evidence + validations.
- Geometric table engine (bordered + borderless clustering) → table nodes/cells.
- **Exit:** codes/MRZ/tables produce structured evidence; checksum/arithmetic failures surface as `invalid`/`conflict`.

## Phase 7 — Verifier + silent-error benchmark

- `packages/verifier`: validator registry + core validators; status precedence; explainable confidence (per-type thresholds); cross-field checks (MRZ↔visible, QR↔printed, table↔total, date order); ConflictRecords.
- Build the conflict/missing/silent-error benchmark sets; wire the silent-error report.
- **Exit:** zero critical silent errors on the benchmark; conflicts/missing/invalid surfaced correctly.

## Phase 8 — Known-template extraction (the payoff)

- Candidate retrieval + real multi-signal scoring; alignment (boundary/text-anchor/keypoint hybrid + validation + local correction); ROI projection + ROI-first extraction; drift detection + versioning + corruption prevention.
- **Exit:** second similar document is faster than first; required fields verified; false-match benchmark passes; old templates preserved.

## Phase 9 — Hardening: performance, memory, security, a11y, export

- Memory ownership + disposal + leak tests; performance budgets per device class; device matrix.
- Encryption (WebCrypto AES-GCM) for sensitive records; export/import safety + redaction; CSP/COOP/COEP; XSS/path-traversal tests; no-cloud network test.
- Full accessibility pass (keyboard, screen reader, contrast, non-color status). Export formats with status preservation.
- **Exit:** all [12_TESTING.md](12_TESTING.md) acceptance gates pass on the device matrix.

## Phase 10 — Tauri + release

- Tauri shell reusing the same frontend/domain packages; runtime adapters (storage/PDF/inference/filesystem); bundled+checksummed models; OS-keychain encryption; migrations preserve user data.
- Release checklist (versions, benchmarks, silent-error/template/performance reports, security/privacy checklist, known limitations, license/notices, SECURITY.md). Open-source hygiene clean.
- **Exit:** offline desktop app processes synthetic documents locally end-to-end; release report green.

---

## Milestone summary

| Milestone | Deliverable |
|---|---|
| M1 | Mock-graph prototype: viewer + form + correction |
| M2 | TemplateGraph save/match/ROI projection (mock) |
| M3 | Real normalization + PDF + worker runtime |
| M4 | Real OCR graph (no hardcoded values) |
| M5 | Detector + assets |
| M6 | Barcode/MRZ/table parsers |
| M7 | Verifier + zero critical silent errors |
| M8 | Known-template fast path |
| M9 | Hardened (perf/memory/security/a11y/export) |
| M10 | Tauri packaged release |

## Non-negotiable build rules

1. Never wire UI directly to OCR output; always go through evidence → graph → hypothesis → verifier → form.
2. Never fabricate/hardcode values to pass a test (this violates the prime directive and corrupts trust).
3. Build forms/correction/templates before perfecting models.
4. Heavy work in workers; lazy-load models; ROI-first for known templates.
5. Keep the browser and Tauri paths sharing one frontend/domain via service interfaces.
6. Optimize for silent-error reduction before speed; every serious failure becomes a regression test.
