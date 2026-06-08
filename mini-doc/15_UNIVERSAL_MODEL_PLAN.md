# 15 — Universal Model & Training Master Plan

**Status:** Authoritative plan for building the universal, edge‑deployable document‑understanding model program.
**Audience:** Engineers and ML owners implementing the models, datasets, training, and pipeline.
**Prime directive (unchanged):** Models are **evidence producers, not authorities**. The DocGraph + Verifier own trust. No silent errors. Local‑only by default. Templates store structure, never variable values.

> One‑line thesis: **Universality is the architecture, not any single model.** We train models that learn *universal primitives and relations*, then specialize *per layout at runtime* through template memory. A passport, an invoice, a medical report, and a shipping label are all just **compositions of the same visual primitives** (text blocks, tables, photos, signatures, codes, checkboxes…). Learn the primitives + the relations universally; learn the specific layout on the fly.

---

## Table of contents

1. Why this plan exists (the problem)
2. First principles & non‑negotiables
3. The three universal layers (find → read → relate)
4. Why a custom detector — and why it is NOT "passport‑only"
5. Data strategy (synthetic + real public) — the foundation
6. The model stack (universal specialist cascade)
7. Advanced techniques (the "exceptional" levers) and *why* each
8. Pipeline completion (the missing steps)
9. Phased execution plan (deliverables + gates)
10. Evaluation, metrics & release gates
11. Training infrastructure & recipes
12. The improvement flywheel (active learning + corrections)
13. Build responsibilities (code vs GPU)
14. Risks, constraints & honest limits
15. Glossary & references

---

## 1. Why this plan exists (the problem)

The engine must turn **any** uploaded document — "no matter how torn, dusty, blurry, or at what angle" — into accurate, evidence‑backed, editable form fields, **fully on‑device**.

Empirically (tested on real passport images via DevTools), the failure modes were:

- **Fragile heuristics** standing in for missing models: OCR‑geometry to "find" the MRZ, pixel‑variance to "find" the photo. These break on real photographs (textured backgrounds, angles).
- **No document rectification**: angled / curved / folded captures degrade OCR badly.
- **Visual‑OCR character errors** on stylized fonts (e.g. `AL‑AWADH → A‑AWADH`) with no second high‑resolution pass and no model‑level understanding to recover.
- **Over‑reliance on a single OCR pass** at downscaled resolution.

The root cause is **missing models and missing pipeline stages**, not bad glue. This plan builds the real models and stages, universally, to spec quality.

---

## 2. First principles & non‑negotiables

1. **No fallbacks that lower quality.** We do not ship a generic COCO detector, a fake MRZ, or "good‑enough" stand‑ins. We build the real thing.
2. **Universal, not document‑specific.** Every model must generalize across document categories. We measure generalization explicitly (held‑out template families).
3. **Edge‑deployable.** Deployed models run in ONNX Runtime Web (WebGPU primary, WASM compatibility) or the Tauri shell. Heavy models are **training‑time only** (teachers), never shipped.
4. **Evidence‑first.** Every model output is an `EvidenceRecord` with coordinates, confidence, model id + version. The Verifier decides status.
5. **No silent errors.** A wrong value shown as `confirmed` is the worst outcome. Prefer `needs_review`/`conflict`/`invalid`. This is a *gating metric*, not a nice‑to‑have.
6. **Privacy.** Training data contains **no real personal data** unless explicitly consented and redacted. Synthetic is the primary source. Inference never leaves the device.
7. **Reproducibility.** Every dataset version, model version, class‑set version, and runtime is recorded. Benchmarks are reproducible.

---

## 3. The three universal layers (find → read → relate)

Document understanding decomposes into three layout‑agnostic problems. Each is universal; together they cover any document.

| Layer | Question it answers | Component | Why universal |
|---|---|---|---|
| **Find** | *Where are the meaningful objects?* | YOLOv11n primitive detector | primitives (table, photo, signature, code, checkbox, text block…) appear in every document type |
| **Read** | *What characters are there?* | PP‑OCRv5 (multilingual) | text recognition is type‑agnostic; multilingual covers scripts |
| **Relate** | *How do labels, values, and structure connect?* | DocGraph geometry **+ learned key‑value linking** | label↔value pairing is a spatial/relational problem, not a per‑type rule |

Everything downstream — field hypotheses, validators, verifier, form, template memory — operates on the **DocGraph**, which is itself document‑type‑agnostic. **Type‑specific knowledge ("this passport field is Date of Birth") is learned at runtime** via user correction → template, never hard‑coded into a model.

---

## 4. Why a custom detector — and why it is NOT "passport‑only"

**The detector detects universal *primitives*, never document types.** Its 12 v0 classes are visual building blocks:

`document_page, photo, signature, stamp, seal, logo, qr_code, barcode, mrz_zone, table, checkbox, text_block`

(v1 adds `field_label, field_value, emblem, flag, symbol, line_separator, form_box`; v2 adds `table_cell, table_header, watermark, hologram_region` only if justified.)

A **table** is a table on an invoice, a bank statement, or a lab report. A **signature** is a signature on any form. A **photo region** is the portrait on a passport, an employee badge, or a club card. Because these are universal, **one detector trained on diverse categories serves all documents** — including document types it has never seen, because their tables/photos/text blocks still *look like* tables/photos/text blocks.

It would only become "passport‑only" if we trained it **only on passports**. We will not. The dataset is deliberately **multi‑category** (Section 5), with passports as roughly one quarter of it.

What the detector explicitly does **not** do: read text, name fields, confirm values, judge authenticity. Detector confidence never confirms a field — the Verifier does.

### 4.1 Model-size escalation ladder (nano is the start, not a ceiling)

The *deployed* detector must run on-device (ONNX Runtime Web), so it is small **by requirement** — a heavy model cannot ship to the edge. But we are **not dogmatically locked to nano**. We start at nano for fast iteration and escalate only when a gate fails, always re-checking the edge budget:

| Step | Model | ~Params | ~GFLOPs | Edge feasibility | Promote up when… |
|---|---|---|---|---|---|
| 0 | `yolo11n` | ~2.6M | ~6.5 | trivial (WebGPU+WASM) | starting point |
| 1 | `yolo11s` | ~9.4M | ~21 | comfortable on WebGPU | a critical-class recall gate fails after data fixes |
| 2 | `yolo11m` | ~20M | ~68 | borderline; benchmark latency/memory | s still misses a gate AND latency budget allows |
| — | imgsz 960 / tiling | — | — | higher cost | small-object recall (qr/checkbox/mrz) is the limiter |

**Escalation rule:** fix *data* first (`TRAIN_YOLOV11N §15`), then raise `imgsz`/enable tiling, then step model size — in that order. Never raise model size to paper over a data problem. Each step must still pass the edge latency/memory budget (`09_EDGE_RUNTIME/PERFORMANCE_BUDGETS.md`); if it cannot, the task is offloaded to the teacher/distillation path rather than shipped.

**Where the "exceptional accuracy" actually comes from** (not detector size): clean abundant data, document **dewarp** (the single biggest OCR lever), high-res ROI re-OCR, the **Verifier** refusing to confirm uncertain values (silent-error law), confidence **calibration**, **teacher distillation** injecting VLM-level understanding into small students, and the **template flywheel** learning each layout exactly. The detector only has to localize visually-distinctive primitives — an easy task it does at high recall even at nano size.

---

## 5. Data strategy (synthetic + real public) — the foundation

> "The dataset is the product's reality check. If the dataset is weak, the model looks impressive in demos and fails on real documents." — `DATASET_STRATEGY.md §14`

Two complementary streams.

### 5.1 Stream A — Synthetic, auto‑labeled (volume + perfect labels + zero PII)

**Why synthetic is primary, not a compromise:**

1. **Real IDs/passports are PII** — you cannot legally/ethically collect 20k of them.
2. **Synthetic is auto‑labeled.** Because the generator *places* every photo, MRZ, signature, table, checkbox, code, stamp, it knows their exact pixel boxes → **pixel‑perfect YOLO labels, OCR ground truth, table structure, and key‑value links for free.** Manual annotation of 20k pages would otherwise be the single biggest cost of the project.
3. **Controllable difficulty.** We can dial blur/glare/skew/fold/stain and rare classes precisely.

**What "good synthetic" requires (realism drives transfer):**

- **Multi‑category** generation: passport/ID, invoice/receipt, generic forms (mandatory — they cover all primitives), plus certificates, bank statements, licenses, shipping/product labels, tickets, utility bills, handwriting‑heavy forms.
- **Valid content**: ICAO‑correct MRZ *with real check digits* and OCR‑B font (this also fixes the fake‑MRZ problem seen in test images), real QR/barcodes rendered by a code library, realistic fonts, generated portraits, real table layouts, signatures, stamps/seals/logos.
- **Domain randomization**: large variation in templates, fonts, scripts (Latin / Arabic / Devanagari / CJK / Cyrillic), colors, backgrounds, element placement.
- **Capture‑degradation augmentation** (`YOLOV11N_DOCUMENT_DETECTOR.md §5.3`): perspective warp, rotation, motion/Gaussian blur, JPEG compression, shadows, glare, over/under‑exposure, partial crop, scanner & phone‑camera noise, folds, stains, photocopy effect, low DPI, thermal‑receipt fading.

### 5.2 Stream B — Real public datasets (bridge the sim→real gap; the universality multiplier)

Synthetic alone has a **domain gap**. Real, license‑tracked public datasets close it and broaden coverage.

| Need | Datasets | Role |
|---|---|---|
| Universal layout | **DocLayNet** (~80k pages, 11 classes, very diverse), PubLayNet (~360k) | text_block / table / figure / title localization on real docs |
| ID docs in the wild | **MIDV‑500 / MIDV‑2020 / MIDV‑Holo** (passports/IDs photographed under varied conditions) | ID primitives, dewarp, glare/fold realism |
| Tables | **PubTables‑1M**, FinTabNet, SciTSR | table detection + structure |
| Key‑value / entity linking | **FUNSD, XFUND** (multilingual), **SROIE, CORD**, WildReceipt, Kleister | train/eval the *relate* layer |
| Text robustness | TextOCR, ICDAR‑MLT, SynthText, Total‑Text | OCR detection/recognition stress |
| Diversity / classification | RVL‑CDIP (~400k, 16 classes), DocVQA | generalization + doc‑type breadth |

Every external sample records **source + license + redaction status** (`DATASET_STRATEGY.md §11`). Never mix unreviewed private data into training.

### 5.3 Size targets

- **Per‑class minimum instances** (starting targets, `YOLOV11N_DOCUMENT_DETECTOR.md §5.2`): document_page 2,000; photo 1,000; signature 1,000; stamp 800; seal 500; logo 1,000; qr_code 800; barcode 800; mrz_zone 800; table 1,000; checkbox 1,500; text_block 2,000.
- **Milestones** (`DATASET_STRATEGY.md §8`): D0 smoke 20–50 pages → D1 MVP 500–1,500 → **D2 serious 5,000–20,000 pages** → D3 production (locked, gated).
- **Recommended first strong run (heavy‑GPU available):** ~15,000 synthetic + DocLayNet/MIDV real → ~150k+ primitive instances; KV‑linking from FUNSD/XFUND/CORD; tables from PubTables‑1M; ~2,000 hard negatives; ~500–1,000 locked hard‑test; a template‑generalization holdout.

### 5.4 Splits, leakage, metadata, quality tags

- **Split by document family**, not random image (`DATASET_STRATEGY.md §6–7`): `train / val / test / hard_test / template_generalization / privacy_redacted`. Hold out whole template families/versions to measure true generalization.
- **No leakage**: same template/seed group/issuer must not span splits.
- **Hard negatives** (`§7`): random photos, screenshots, blank pages, decorative icons, QR‑like patterns, logos‑that‑aren't‑seals, borderless tables, UI checkboxes — these crush false positives.
- **Metadata per sample** (`§9`): id, sourceType, docCategory, templateFamilyId/versionId, language, sensitive flag, license, split, qualityTags, createdAt.
- **Quality tags** (`§10`) enable targeted evaluation: clean / blur / motion_blur / glare / shadow / low_resolution / jpeg / skew / perspective / partial_crop / fold / stain / watermark / handwriting / dense_table / borderless_table / multilingual / vertical_text / rotated_text.

---

## 6. The model stack (universal specialist cascade)

The intelligence is a **cascade of small specialists**, not one monolith. Each outputs evidence; none confirms fields.

| Stage | Model / library | Status | Why it is universal & why chosen |
|---|---|---|---|
| Rectify | learned document dewarp (DocTr++/GeoTr‑style) + page boundary/corner segmentation | new (core) | flattens any curved/folded/angled page so OCR works regardless of capture |
| Detect | **YOLOv11n custom** (primitives) | core | primitives appear in all document types; small, fast, ONNX‑exportable |
| OCR | **PP‑OCRv5** (multilingual det+rec) | core | type‑agnostic text + coordinates + confidence; ROI/MRZ/table‑cell/rotated modes |
| Relate | DocGraph geometry **+ distilled key‑value linker** | core (geometry now; learned next) | label↔value linking is spatial/relational, not per‑type |
| Segment | YOLOv11n‑seg | candidate (conditional) | refines asset crops (photo/signature/stamp…) when crops matter |
| Tables | custom geometric engine (+ SLANet trial) | core | geometry is explainable and arithmetic‑validatable on any table |
| Codes | zxing‑wasm | core | deterministic local decode of QR/PDF417/DataMatrix/etc. |
| MRZ | custom TypeScript parser | core | deterministic, check‑digit‑validated, auditable; never a model |
| Portrait | MediaPipe Face Detector (presence only) | core | crop sanity; never identity/recognition |

**Runtime selection:** WebGPU primary where stable; **WASM compatibility mode** required (broadest op support). With cross‑origin isolation (SharedArrayBuffer), WASM runs **multi‑threaded** (already enabled) — a large speed win. Record the runtime/EP in every evidence record.

**OCR variant note:** prefer **PP‑OCRv5 mobile** for edge feasibility (small, WebGPU‑friendly). Keep server as an optional "high‑accuracy" profile. (Today the build runs server‑on‑WASM; switching to mobile is a planned task.)

---

## 7. Advanced techniques (the "exceptional" levers) — and *why* each

These are the modern techniques that take the system from "works" to "exceptional," each justified.

### 7.1 Document dewarping + boundary rectification — *the biggest accuracy lever*
**Why:** OCR accuracy collapses on perspective/curl/fold. Real users photograph documents at angles on cluttered surfaces. **Detect the page quad, segment it from the background (fixes the "wooden desk" problem), and warp to a flat rectangle before OCR.** Everything downstream improves at once. Train a learned rectifier (sim→real with synthetic warps + MIDV real captures); the page‑boundary head can reuse the detector's `document_page`.

### 7.2 Knowledge distillation / pseudo‑labeling — *VLM‑level understanding in a tiny model*
**Why:** Heavy document VLMs/transformers (LayoutLMv3, Donut, Qwen2‑VL, GLM‑OCR) understand arbitrary forms far better than geometry heuristics, but are **too large for the edge**. Run them **offline as teachers** to (a) auto‑label large volumes of *real unlabeled* documents and (b) supervise small student models (detector, KV‑linker). The teacher never ships; the small student does. This is how we inherit big‑model accuracy under edge constraints, and it massively closes the synthetic→real gap.

### 7.3 Learned key‑value linking — *robust fields on any layout*
**Why:** Pure geometry pairing is fragile on multi‑column, rotated, dense, or label‑above‑value layouts (we hit exactly these bugs). Distill the teacher's entity‑linking into a **lightweight relation classifier / small GNN over DocGraph nodes**. Geometry remains the prior; the learned linker resolves ambiguity. Trained/evaluated on FUNSD/XFUND/CORD + synthetic links.

### 7.4 Active learning + failure mining — *highest accuracy per labeled sample*
**Why:** Random labeling is wasteful. The deployed model already emits confidence and conflicts; collect the **uncertain/conflicting** real samples (consented), label those, retrain. Each label fixes a real failure. `TRAIN_YOLOV11N.md §15`: *"Do not only tune training — fix data first."*

### 7.5 Domain randomization + multi‑scale/tiled inference
**Why:** Randomization drives sim→real transfer. **Tiling/multi‑scale** at inference recovers tiny objects (checkboxes, small QR, MRZ on a high‑res page) that a single 640² pass misses (`YOLOV11N_DOCUMENT_DETECTOR.md §10`).

### 7.6 Confidence calibration — *makes the verifier's trust statistically sound*
**Why:** The Verifier's thresholds (confirm vs needs_review) are only as good as model confidence calibration. Apply **temperature scaling** on a held‑out set so a "0.9" really means 90%. Directly lowers the **silent‑error rate** — the gating metric.

### 7.7 High‑resolution ROI re‑OCR — *recover stylized/small text*
**Why:** The full‑page pass downscales; small/stylized fields read poorly. Re‑OCR detected regions (MRZ band, ID numbers, dates) from the **original resolution**, upscaled, with restricted charset where applicable. (MRZ‑band re‑OCR is already implemented and multi‑threaded; extend to all small critical fields.)

### 7.8 The template flywheel
**Why:** One user correction should fix that layout **forever** (runtime template memory) **and** feed the next training round (offline, consented). The product compounds in accuracy with use.

---

## 8. Pipeline completion (the missing steps)

Per `04_PIPELINES.md`, the end‑to‑end pipeline is 13 stages. Current gaps to close:

1. Upload ✅ · Barcode/QR ✅ · Form generation ✅ · Error/uncertainty ✅
2. **PDF** — add PDF.js (digital text as evidence; scanned → image path).
3. **Image normalization** — add **orientation, boundary, perspective‑dewarp, deskew** (quality signals already exist).
4. **OCR modes** — add `roi / mrz / table_cell / rotated` + the **retry ladder** (expand ROI → upscale → contrast → rotate).
5. **Visual assets** — detector‑driven crops + conditional segmentation + face‑presence check (replace the variance heuristic).
6. **MRZ** — high‑res band crop+OCR ✅ (extend); check‑digit‑guided correction ✅.
7. **Table** — build the geometric engine (bordered + borderless) with arithmetic validators.
8. **Correction** — full kinds (region/asset‑crop/table‑cell/merge‑split), re‑verify affected validators.
9. **Known‑template** — wire the full correct→save→match→ROI‑project loop.

Cross‑cutting: model **manifest + sha256 + atomic OPFS promote**; **local encryption** of stored docs/templates; **PWA/Tauri** packaging.

---

## 9. Phased execution plan (deliverables + gates)

Each phase ships a verifiable improvement and must pass its gate before the next.

| Phase | Goal | Key deliverables | Exit gate |
|---|---|---|---|
| **P0 Foundations** | unblock training | multi‑category **synthetic generator** (auto‑labels), public‑dataset ingestion/normalizers, **eval harness** + locked test sets | datasets build reproducibly; metrics computed on a baseline |
| **P1 Universal detector** | real primitive boxes | YOLOv11n trained (synthetic+DocLayNet+MIDV), failure‑mined, ONNX‑exported, worker‑integrated | per‑class critical recall acceptable; ONNX runs WebGPU+WASM; no silent‑error increase |
| **P2 Geometry robustness** | any angle/curl | dewarp + orientation + boundary; ROI/retry OCR | OCR accuracy ↑ on hard_test (skew/fold/perspective) |
| **P3 Relational understanding** | fields on any layout | teacher distillation → KV‑linker; multilingual OCR | field exact‑match ↑ on FUNSD/XFUND/CORD; no silent‑error increase |
| **P4 Specialist completion** | full coverage | geometric table engine, segmentation, face check, PDF | table‑F1 / asset metrics meet targets |
| **P5 Flywheel** | compounding accuracy | template loop + active‑learning + consented correction pipeline | template false‑match ≈ 0; round‑over‑round gains |
| **P6 Calibration & release** | trustworthy + shippable | calibration, full benchmark, manifest/sha256, encryption, PWA/Tauri | all `12_TESTING` gates green |

---

## 10. Evaluation, metrics & release gates

A model/dataset version is acceptable only if it passes its benchmark on **locked** sets (`DATASET_STRATEGY §12`, `TRAIN_YOLOV11N §11`).

- **Detector:** mAP@0.5, mAP@0.5:0.95, **per‑class precision/recall**, false‑positives/page, small‑object recall, edge latency/memory, WebGPU+WASM parity. Critical‑recall classes: mrz_zone, qr_code, barcode, photo, signature, table, checkbox.
- **OCR:** CER, WER, field exact‑match, normalized field exact‑match, MRZ line accuracy, ROI latency.
- **Tables:** detection recall, structure F1, cell IoU, cell CER/WER, arithmetic correctness.
- **Template matching:** hit rate, **false‑match rate (top priority)**, false‑unknown rate, ROI projection IoU, downstream field accuracy.
- **Verifier (the master gate):** **silent‑critical‑error rate** (must trend to ~0), conflict/invalid/missing detection rates, over‑review rate.

Priority rule: a false negative on a required object is bad; a false positive causing review is less bad; **a false positive causing a silent wrong field is unacceptable.**

---

## 11. Training infrastructure & recipes

- **Env:** Python venv + Ultralytics; pinned `requirements.lock.txt`; record python/lib versions, dataset version, class version.
- **Detector** (`TRAIN_YOLOV11N.md`): smoke (3 epochs) → baseline (`yolo detect train model=yolo11n.pt data=… epochs=100 imgsz=640 batch=16 patience=20`) → augment‑tuned → small‑object (imgsz 960/tiled) → class‑balanced. Never accept on one run.
- **Export:** `yolo export format=onnx imgsz=640 opset=17 simplify=True`; validate ONNX ↔ PyTorch parity, external class‑aware NMS in JS/WASM, normalized‑coordinate mapping, WebGPU+WASM, memory after repeated runs.
- **Dewarp / teacher / KV‑linker:** separate training scripts (provided in P2/P3); teachers run on the heavy GPU offline.
- **Artifact packaging** (`MODEL_STACK`/`AI_MODELS §4`): `models/{modelId}/{version}/` with `model.onnx, config.json, labels.json, preprocessing.json, postprocessing.json, metrics.json, MODEL_CARD.md, LICENSE_REF`; manifest with **sha256**; atomic OPFS promote; version string `{family}-{task}-{classVersion}-{semver}`.

---

## 12. The improvement flywheel (active learning + corrections)

```
deploy → users correct fields → (consented) corrections become labeled data
      → failure mining selects uncertain/conflict samples
      → retrain detector / KV‑linker / dewarp
      → re‑benchmark on locked sets → promote only if no silent‑error increase
      → templates strengthen specific layouts at runtime
```

Each loop fixes real failures and compounds accuracy. Corrections stay **local** unless the user explicitly, knowingly exports redacted packages.

---

## 13. Build responsibilities (code vs GPU)

- **Engineering (pure code, no GPU):** synthetic generator (multi‑category, auto‑labeled, augmented, `dataset.yaml`), public‑dataset ingestion/normalizers, evaluation harness, training/distillation/export scripts, pipeline integration (worker stages, dewarp, ROI OCR, table engine, template loop).
- **Cloud GPU (owner‑run):** detector training, dewarp training, teacher distillation/pseudo‑labeling, large benchmark sweeps.

**Gating first deliverable: P0** — the multi‑category synthetic generator + eval harness. It unblocks the first real training run and needs no GPU.

---

## 14. Risks, constraints & honest limits

- **Synthetic→real domain gap.** Mitigated by real public datasets (DocLayNet/MIDV/…), heavy domain randomization, teacher pseudo‑labeling, and failure mining. Not eliminated in one round — it converges over loops.
- **Edge budget vs accuracy.** Heavy models stay training‑time only; deployed models are small and benchmarked for latency/memory. Mobile OCR over server.
- **Truly destroyed inputs.** If the MRZ band / text is physically unreadable, no software recovers it — the system must say `needs_review`, never fabricate.
- **Licensing.** Every external dataset/model has its license tracked; anything incompatible with the project's open‑source goals is excluded.
- **Multilingual breadth.** Universality across scripts requires multilingual OCR + multilingual KV data (XFUND); scoped per supported‑language list.
- **This is a multi‑phase program**, not a single training run. Every phase is independently shippable and gated.

---

## 15. Glossary & references

**Primitive** — a universal visual document object (text_block, table, photo, signature, code, checkbox, mrz_zone, stamp/seal/logo). **DocGraph** — the typed evidence graph that is the source of truth. **KV linking** — pairing field labels with their values. **Distillation** — training a small student model to mimic a large teacher. **Dewarp** — geometric rectification of a non‑flat page. **Domain randomization** — randomizing synthetic appearance to force generalization. **Silent error** — a wrong value shown as confirmed (the worst failure).

**Project docs:** `mini-doc/05_AI_MODELS.md`, `mini-doc/04_PIPELINES.md`, `mini-doc/06_VERIFICATION.md`, `mini-doc/07_TEMPLATE_ENGINE.md`, `mini-doc/13_BUILD_PLAN.md`; `docs/03_AI_MODELS/{MODEL_STACK,YOLOV11N_DOCUMENT_DETECTOR}.md`; `docs/10_DATA_AND_TRAINING/{DATASET_STRATEGY,TRAIN_YOLOV11N,DETECTOR_CLASSES,SYNTHETIC_DATA_GENERATION,ANNOTATION_GUIDE,AUGMENTATION_RULES}.md`; `docs/12_TESTING_BENCHMARKS/*`.

**External (license‑tracked):** Ultralytics YOLO11; DocLayNet; PubLayNet; MIDV‑500/2020/Holo; PubTables‑1M; FUNSD/XFUND; SROIE; CORD; RVL‑CDIP; TextOCR; ICDAR‑MLT. Teacher candidates: LayoutLMv3, Donut, Qwen2‑VL, GLM‑OCR (offline only).

---

*End of plan. This document is the authoritative reference for the universal model program. Update it (with a dated note) whenever the model stack, dataset strategy, or phase gates change.*

---

## Implementation status log

**2026‑06‑07 — P0 synthetic generator: BUILT & tested.** The multi‑category
synthetic data generator + eval/training/export scripts now live in `training/`
(see `training/README.md`). Delivered:

- `synthgen/` package — composes the 12 universal `docdet-v0` primitives into
  6 document categories (passport, invoice, form, certificate, statement,
  license) with **pixel‑perfect auto‑labels**.
- **Valid ICAO MRZ** (TD1/TD2/TD3) with correct check digits, ported from
  `src/parsers/mrz.ts`; plus deliberately‑invalid variants for verifier
  robustness (fixes the fake‑MRZ problem from the test specimens).
- **Real, decodable QR/Code128**; label‑preserving capture‑degradation
  augmentation (perspective/rotation/blur/glare/shadow/fold/stain/jpeg/low‑DPI),
  warping annotation polygons through the same homography.
- YOLO label + `dataset.yaml` + per‑sample manifest emission; seed‑deterministic
  generation; hash‑based splits with **no cross‑split leakage**.
- Output contract matches `src/ai-runtime/yolo.ts` (`[4+numClasses, anchors]`,
  class‑aware NMS in JS); `export_detector.py` packages ONNX accordingly.
- `train_detector.py` (smoke/baseline/small), `eval_detector.py` (mAP +
  per‑class recall + **critical‑class gates**), `synthgen/viz.py` (label overlay).
- Validation suite `tests/test_synthgen.py`: **8/8 pass** (MRZ check digits,
  corruption invalidates, valid clipped boxes for all categories, determinism,
  augmentation box‑preservation, QR decode, split‑leakage). Class coverage
  verified — at 15k samples every class exceeds its spec minimum instance count.

**Next (P1):** generate the first serious dataset (~15k synthetic) on the
provided GPU box, layer in real public datasets (DocLayNet/MIDV), run
baseline+small training, evaluate against gates, export ONNX, integrate detector
evidence into the worker/DocGraph.
