# 01 — Product Specification

**Purpose:** Define exactly what the product must do, its scope, its non-goals, and how success is measured. Requirements use priorities: **P0** non-negotiable, **P1** required for a strong v1, **P2** after v1.

---

## 1. Product definition

A local-only document-to-form engine. The user uploads an image or PDF; the system extracts text, fields, visual assets, tables, codes, and machine-readable zones locally; builds an evidence graph; generates an editable, status-annotated form; captures corrections; learns a reusable local template; and processes future similar documents quickly and accurately.

The honest product promise:

> First upload produces a reviewable, evidence-backed form with visible uncertainty. The second similar upload becomes fast and highly accurate because the system learned the corrected template locally.

## 2. Target users

Privacy-conscious individuals and small businesses who repeatedly process similar documents (invoices, IDs, forms, receipts, certificates, statements) and cannot or will not upload sensitive documents to the cloud; plus open-source developers extending the engine.

## 3. Core use cases

1. **First unknown document** — cautious extraction, evidence shown, user corrects, optional template save.
2. **Repeated known template** — match, align, ROI-first extract, verify, fill fast.
3. **Similar but changed layout** — detect drift, create a new template version, never overwrite the old one.
4. **Visual asset extraction** — photos, signatures, stamps, seals, logos, symbols become evidence-backed fields with crops.
5. **Table-heavy documents** — reconstruct rows/columns/cells, validate totals.
6. **Identity documents** — extract fields + photo + MRZ + barcode, validate MRZ checksums and cross-check against visible fields.

## 4. Supported document types

- **Deep (MVP):** passport/ID, invoice/receipt, generic form (labels, values, checkboxes, signatures, tables). These three cover all reusable primitives.
- **Structured (post-MVP):** certificates, bank statements, licenses, shipping/product labels, transcripts, lab reports.
- **Review-first (generic):** contracts, letters, handwritten/degraded docs — extract evidence, mark uncertainty heavily, depend on correction.

"Supported" means the engine can produce an evidence-backed editable form and improve via template learning — **not** perfect automatic extraction without review.

## 5. Functional requirements

### Input (P0 unless noted)
- IN-1: Accept PNG, JPEG, WebP, and PDF. (Image P0; PDF P0.)
- IN-2: Multi-page documents (P1).
- IN-3: Detect unsupported/corrupt files with clear errors.
- IN-4: Process locally; never upload.
- IN-5: Drag-drop and file picker (P1).

### Page normalization (P0)
- PN-1: Detect document/page boundary.
- PN-2: Correct perspective; deskew; normalize orientation.
- PN-3: Detect blur, glare, low resolution, incomplete crop (P1 for glare/crop).
- PN-4: Establish a canonical coordinate system (normalized 0–1, canonical width 1000).
- PN-5: Store original→normalized transforms.

### Evidence extraction (P0)
- EX-1: Every module emits **EvidenceRecords** with page id, coordinates, source, model/parser version, confidence.
- EX-2: No module writes the final form directly; everything flows through the DocGraph.
- Producers: detector, OCR, segmentation (conditional), barcode parser, MRZ parser, table engine, face check, quality analyzer, user correction.

### OCR (P0)
- Text + coordinates + confidence; modes: full-page, text-block, ROI, MRZ, table-cell, rotated. ROI-first for known templates. Raw text preserved; normalization stored separately.

### Visual assets (P0/P1)
- Detect/crop photo, signature, logo (P0); stamp, seal (P1); emblem/flag/symbol (P2). Store crop id + coordinates; mask id when segmented. Segmentation is conditional, never full-page by default.

### Codes & MRZ (P0/P1)
- Decode QR (P0), barcode/PDF417 (P1) via zxing-wasm; store payload as evidence; cross-check printed fields. MRZ: detect zone, OCR, normalize OCR-B confusions, parse TD1/TD2/TD3, validate check digits, cross-check visible fields. TD3 P0; TD1/TD2 P1.

### Tables (P0/P1)
- Detect region, reconstruct bordered tables geometrically (P0), borderless via OCR clustering (P1); represent as graph nodes/cells; validate totals (P1).

### DocGraph (P0)
- Single source of truth: pages, nodes, edges, evidence, hypotheses, validations, provenance, quality, template context. See [03_DATA_MODEL.md](03_DATA_MODEL.md).

### Form generation (P0)
- Render from hypotheses only (never raw OCR). Show status, confidence reasons, evidence link, correction controls.

### Correction capture (P0)
- Rename label, edit value, change type, redraw region, adjust crop, change asset type, merge/split, add missing, delete false, fix table/checkbox, resolve conflict, save/update/version template. Every correction creates evidence; original evidence is preserved.

### TemplateGraph learning (P0)
- Save anchors, field/asset/table/code/MRZ/checkbox regions, aliases, validators, relationships, fingerprint, version metadata. Never store variable values as anchors.

### Known-template extraction (P0)
- Retrieve candidates → score (multi-signal) → align → project ROIs → ROI-first extract → verify → fill → version on drift. Fall back to unknown flow if match fails.

### Verification (P0)
- Statuses: `confirmed | needs_review | missing | conflict | invalid | unsupported | rejected`. Uses OCR/detector/parser/template confidence, validators, cross-field consistency, quality, correction history. See [06_VERIFICATION.md](06_VERIFICATION.md).

### Export (P1)
- Form JSON (with statuses + evidence refs), confirmed-only JSON, CSV, table CSV, assets ZIP, DocGraph JSON, TemplateGraph package, redacted debug package. Exports preserve status; warn on sensitive content.

## 6. Non-functional requirements

- **Privacy (P0):** local-only; no telemetry with document data; sensitive records encrypted at rest where feasible.
- **Reliability (P0):** minimize silent critical errors above all else.
- **Performance (P0):** heavy work off the main thread; known-template flow must be faster than unknown; lazy model loading; ROI-first; careful disposal. Budgets in [08_EDGE_RUNTIME.md](08_EDGE_RUNTIME.md).
- **Explainability (P0):** every output inspectable; click a field → see why.
- **Extensibility (P1):** new validators, document types, detector classes, exporters addable without rewriting the core.
- **Accessibility (P1):** keyboard, screen-reader, contrast, non-color status. See [09_UI_UX.md](09_UI_UX.md).

## 7. Non-goals (do not build)

- Cloud OCR / cloud VLM / server-side document processing.
- Authenticity/fraud verification; face recognition or identity matching (face = presence check only).
- Legal/medical/financial advice.
- Robust arbitrary-handwriting OCR (detect + review-first only).
- Universal no-review extraction ("upload anything, get perfect data").
- On-device neural fine-tuning after a correction (one-shot learning = TemplateGraph, not retraining).
- Templates as bare rectangle coordinates.
- Raw-text-only export that drops structure/status.
- Silent template auto-update; black-box confidence; unsafe logging of values.

## 8. Success metrics

Quality hierarchy (optimize top-down; never trade safety for speed):
1. **Silent Critical Error Rate** — wrong critical fields marked confirmed. Target **zero** as a release gate.
2. Verification correctness (status accuracy, conflict/invalid/missing catch rate).
3. Template learning gain — correction reduction after first template save (target ≥50% on supported samples).
4. Field accuracy — normalized exact match, field F1.
5. Asset crop / mask quality, table cell F1.
6. Latency & memory within device budgets.
7. UI correction efficiency.

Critical fields: passport/ID number, name, DOB, expiry/issue dates, nationality, MRZ values, QR/barcode-mapped identity values, invoice total, tax id, account number, balances, required signature/photo presence, required legal/consent checkboxes.

## 9. Definition of done (v1)

A user can: upload image/PDF → see extracted text/fields/assets/tables/codes → inspect evidence per field → correct labels/values/types/regions/tables → save a template → upload a similar document → see it matched and ROI-extracted quickly → trust statuses → export structured data — all locally, with zero silent critical errors on the benchmark set.
