# Roadmap

**Purpose:** Public roadmap for the Edge DocGraph Engine.

---

## Phase 0 — Documentation and architecture

Status:

```text
in progress / foundation
```

Goals:

- master PRD,
- architecture docs,
- model stack docs,
- pipeline docs,
- DocGraph/TemplateGraph specs,
- verification policy,
- UI/UX specs,
- edge runtime docs,
- security/privacy docs,
- testing/benchmark docs,
- API schemas.

---

## Phase 1 — Core local document viewer and OCR graph

Goals:

- upload image/PDF,
- render/normalize page,
- run local OCR,
- create basic DocGraph,
- show text overlays,
- evidence viewer,
- local storage.

Success:

- synthetic docs process locally,
- UI responsive,
- no-cloud test passes.

---

## Phase 2 — Detector and visual assets

Goals:

- YOLOv11n document detector,
- detect photo/signature/stamp/logo/QR/MRZ/table/checkbox/text block,
- crop visual assets,
- create evidence records,
- show overlays.

Success:

- detector benchmark passes,
- assets visible/correctable,
- hard cases become review states.

---

## Phase 3 — Form generation and correction UI

Goals:

- generate editable fields,
- show statuses,
- correction events,
- update DocGraph,
- rerun validators,
- export with statuses.

Success:

- user can correct labels/values/regions/assets,
- every correction creates evidence.

---

## Phase 4 — Template memory and known-template fast path

Goals:

- save TemplateGraph,
- template matching,
- alignment,
- ROI-first extraction,
- template versioning,
- corruption prevention.

Success:

- second similar document extracts faster,
- false match benchmark passes,
- no old values copied.

---

## Phase 5 — Verifier and silent-error benchmark

Goals:

- validator registry,
- MRZ validation,
- barcode validation,
- table validation,
- cross-field validation,
- silent error benchmark.

Success:

- zero critical silent errors on benchmark,
- conflicts visible.

---

## Phase 6 — Edge runtime hardening

Goals:

- model caching,
- Web Workers,
- OffscreenCanvas,
- ONNX Runtime Web,
- memory management,
- PWA offline shell,
- performance budgets.

Success:

- low/medium/high device matrix tested.

---

## Phase 7 — Tauri desktop app

Goals:

- package same frontend,
- bundle models,
- local storage backend,
- native optional services,
- installers.

Success:

- offline desktop app processes synthetic documents locally.

---

## Phase 8 — Open-source release readiness

Goals:

- synthetic examples,
- docs complete,
- license review,
- model license metadata,
- security policy,
- contribution guide,
- release checklist.

Success:

- public repo has no private data,
- build/test docs allow new contributors.

---

## Non-roadmap / non-goals

Not planned by default:

- cloud OCR,
- cloud LLM extraction,
- identity authenticity/fraud verification,
- face recognition,
- automatic upload of training data,
- hidden telemetry,
- proprietary-only model dependency.

---

## Final roadmap rule

The roadmap prioritizes trustworthy local extraction over flashy AI demos. Accuracy, evidence, uncertainty, privacy, and correction-driven learning come first.
