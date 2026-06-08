# docdet v2 — FINAL Master Plan (the decisive, no-options build)

Status: AUTHORITATIVE. This supersedes docdet-v0 (the single 12-class detector).
Goal: detect every document primitive on ANY document in ANY condition — clean
uploads/scans AND brutal in-the-wild phone photos (tilted, cluttered, glare,
shadow, motion blur, folded, partial, low light) — at production accuracy.
Hard target: **≥0.95 recall at high precision on real data**, measured on a
leakage-free real benchmark, never on synthetic.

This plan is decisive. Where earlier drafts offered options/fallbacks, the choice
is now made and written as the single path.

---

## 0. LOCKED DECISIONS (read first)

### 0.1 Model topology — STAGED is primary, not a fallback
Three specialized models replace the single 12-class detector. This is THE fix
for tiny objects, page-boundary geometry, and text_block dominance — all at once.

```
                 ┌──────────────────────────────────────────────────────────┐
 input image ───▶│ MODEL 1 — PAGE LOCATOR                                    │
 (any scene)     │   detects each document region + regresses 4-corner QUAD  │
                 │   classes: {document_page}                                │
                 │   robust to small/tilted/cluttered/partial captures       │
                 └───────────────┬──────────────────────────────────────────┘
                                 │ for each page: crop + perspective-rectify (dewarp)
                                 ▼
                 ┌──────────────────────────────────────────────────────────┐
 page crop ─────▶│ MODEL 2 — PRIMITIVE DETECTOR (the heart of docdet)        │
 (rectified)     │   runs on the CROP, so primitives occupy real pixels      │
                 │   10 classes: photo, signature, stamp, seal, logo,        │
                 │     qr_code, barcode, mrz_zone, table, checkbox           │
                 └───────────────┬──────────────────────────────────────────┘
                                 │ when text regions are needed (OCR handoff)
                                 ▼
                 ┌──────────────────────────────────────────────────────────┐
 page crop ─────▶│ MODEL 3 — TEXT DETECTOR (DBNet-style, on demand)          │
                 │   text_line / text_region only                            │
                 └──────────────────────────────────────────────────────────┘
```

Rationale (why this is correct, not over-engineering):
- **Tiny-object problem dissolves.** Model 2 sees a rectified page, so a checkbox
  that was 6 px in a full phone photo is now 30–60 px. 640 input is sufficient.
- **Page boundary is a quad/homography problem**, which the product needs anyway
  for dewarp. Model 1 owns it and is gated with polygon-IoU / corner error.
- **text_block is dense, ambiguous, high-frequency** and would dominate gradients
  and steal capacity. DBNet-style detectors solve text localization far better.
- Two nano passes (~15 ms + ~15 ms on WebGPU) fit the ~30 ms budget. For clean
  full-page uploads, Model 1 returns the full frame and the crop is the identity,
  so there is no waste.

**Defined operating mode (not a fallback):** if Model 1 returns no confident page
(rare; e.g., a borderless full-bleed scan), Model 2 runs once on the full frame.
This is a specified branch with its own training data and gate, not an escape
hatch.

### 0.2 Class sets — FINAL
- Model 1: `document_page` (region + quad).
- Model 2 (docdet primitive detector): `photo, signature, stamp, seal, logo,
  qr_code, barcode, mrz_zone, table, checkbox` (10).
- Model 3: `text_line` / `text_region`.
- **`text_block` is deleted from the primitive set.** Update `config.py`,
  `classes.json`, `src/ai-runtime/model-registry.ts`, synthgen categories.

### 0.3 Data governance — Green / Yellow / Red (non-negotiable)
- **GREEN (use freely):** synthetic-filled forms; fake invoices/receipts/
  contracts/statements; staged desks/hands/clutter/folders/notebooks; blank
  generic forms; synthetic IDs (DocXPand-style) + synthetic MRZ/photo/card.
- **YELLOW (allowed with consent + redaction + access control + retention
  limits):** real invoices/receipts/statements/contracts (regular personal/
  financial data — GDPR applies even though not Art. 9).
- **RED (never used as training data):** real passports, national IDs, driver
  licenses, real payment cards (PCI-DSS), real medical/insurance records,
  face-photo identity documents, anything with children's data. GDPR Art. 9
  treats biometric-for-identification as special category — treat real ID capture
  as toxic. Substitute with synthetic IDs + public research datasets (eval only).
- Research-only public datasets (MIDV, Tobacco-800, CEDAR/GPDS, SIDTD) are used
  for **benchmarking and R&D experiments**, tagged accordingly; not shipped.

### 0.4 Evaluation contract — the gate of record
- Real, leakage-free splits ONLY. Split key (Section 9) by canonical document /
  capture session / perceptual-hash cluster / source video — **never by frame.**
- Synthetic mAP is diagnostic only and NEVER gates a release or selects a model.
- Model 1 gated by polygon-IoU + corner error + page coverage.
- Model 2 gated by per-class recall AND per-class precision/FP-per-page, by
  size bucket (**relative / object-scale: fraction of frame, NOT absolute
  pixels** — Model 2 runs on variable-resolution rectified crops, so absolute
  COCO pixel thresholds are meaningless across crops; metrics now support
  `size_mode="relative"`), by capture-condition slice, and on a hard-negative
  confuser set.
- Per-class thresholds + per-class NMS calibrated on REAL validation only.
- **Gate of record (DECISION — one gate, not two):** the docdet-v1 gate of record
  is the new wired harness (`metrics_v2` + `leakage_split` + cluster-bootstrap CI),
  which reports per-class recall AND precision / FP-per-page. The old
  `eval_real.py` (ultralytics, single-conf, recall-only) is DEMOTED to a smoke
  check and is **no longer the gate of record**. A recall-only single-conf verdict
  is insufficient — a box-spraying model passes it — so the gate of record MUST
  include precision / FP-per-page.

### 0.5 Privacy
100% local product. The open-set novelty loop (Section 8.4) is **dev/test-lab
only** on our own collected data; there is no production telemetry. No image or
embedding ever leaves a user device.

---

## 1. PHASE 0 — Ontology & Evaluation Contract (FIRST deliverable, blocks all generation)

Nothing is generated at scale until this exists. Inconsistent labels across
sources are the #1 accuracy ceiling; more data without this makes the model
worse.

### 1.1 Class specification (`training/ontology/CLASS_SPEC.md`)
For each class in Models 1/2/3, write: positive examples, negative examples,
boundary rule, overlap rule, hierarchy rule, min-size / ignore rule,
partial-object rule, per-source-dataset mapping rule, and 5+ QA reference images.

Hard edge cases that MUST be decided in writing:
- document_page: visible region only; quad/polygon ground truth (Model 1); a
  two-page spread = two pages; a receipt roll = the visible segment; partial page
  off-frame = label the visible polygon, flag `truncated=true`.
- photo: ID face photo YES; decorative/scene image YES; chart/graph NO (that is a
  figure, out of scope); pictorial logo mark → logo, not photo.
- signature: handwritten mark YES; printed cursive name NO; initials YES;
  signature overlapping a stamp → both boxes.
- stamp vs seal vs logo: classify by **observable appearance + role, NOT by
  relief** (embossing/foil rarely survives a flat scan or phone photo — see the
  capture-invariant decision tree in CLASS_SPEC.md). Inked/over-printed
  impression = stamp; discrete applied non-ink device (wax/foil/sticker/deboss) =
  seal; foreground printed brand/issuer emblem = logo. A printed government crest
  is **logo** (foreground masthead) OR **ignore_region** (faint/background
  security artwork) — never an undefined "neither". seal/logo are SYNTHETIC +
  EVAL-ONLY (no clean real source yet).
- logo: company/organization mark YES; foreground government emblem YES; faint
  watermark/background crest → `ignore_region`.
- table: any row/column structure including borderless and key-value grids;
  receipt line-item blocks = table.
- checkbox: empty AND checked states; radio buttons = checkbox; tiny decorative
  square bullets NO (ignore-region with min-size rule).
- mrz_zone: the full MRZ band (TD1 3-line, TD2 2-line, TD3 2-line) as one box.

### 1.2 Source→class mapping (`training/ontology/source_map.py`)
Explicit, reviewed mapping from every imported dataset's ontology to ours
(DocLayNet, CommonForms→checkbox/signature, DDI-100→stamp/seal, PubTables-1M→
table, MIDV→document_page/mrz/photo, Tobacco-800→signature/logo, etc.), with a
per-mapping confidence and a license/domain tag.

### 1.3 Provenance schema (Section 9) and leakage keys — schema + splitter BUILT and unit-tested; enforcement being WIRED into the manifest writers.
The provenance schema, the leakage-aware splitter, and the eval metrics are built
and unit-tested. Enforcement is NOT yet live across the pipeline: it is being
wired into the manifest writers generator-by-generator (the MIDV normalizer is
the first integration). Do not assume a generator emits enforced provenance until
its writer is wired.

### 1.4 Eval harness upgrades (`training/benchmarks/`)
- Polygon/quad IoU + corner-distance + page-coverage metrics for Model 1.
- **Relative / object-scale** (fraction of frame) size-bucketed AP/AR for
  Model 2 — NOT absolute pixels, since Model 2 runs on variable-resolution
  rectified crops (`size_mode="relative"`); short-side-bucketed AP/AR also
  reported.
- Per-slice and per-class dashboards; FP/page + class-confusion matrix.
- The curated **nasty-500** real slice, frozen from day one.

**Phase 0 status:** components built + tested — schema, leakage-aware splitter,
and eval metrics (size buckets, cluster-bootstrap CI) are green (74+ tests).
Wiring/enforcement of provenance + leakage keys into the generators is IN
PROGRESS; the MIDV normalizer is the first manifest writer being integrated.

**Phase 0 gate:** CLASS_SPEC reviewed; source_map complete; provenance + leakage
keys enforced in the manifest writers as each generator is wired (not yet
pipeline-wide); eval harness emits all metrics on a smoke set.

---

## 2. PHASE 1 — Real benchmark + gate harness (before scaling generation)

Build the real, leakage-free benchmark and the tiered gates so every later phase
is measured.

Datasets normalized to the v2 ontology with leakage-safe splits:
- document_page (Model 1): MIDV-500/2019/2020, SmartDoc, SIDTD, DocLayNet pages.
- primitives (Model 2): CommonForms (checkbox/signature), DDI-100 + StaVer
  (stamp/seal), PubTables-1M + DocLayNet (table), MIDV (mrz/photo), barcode/QR
  real sets, Tobacco-800/CEDAR/GPDS (signature appearance).
- hard negatives / confusers: screenshots, book/magazine pages, posters,
  playing/credit/business cards, packaging.

### Tiered gates (every rung of every phase)
- **Hard blockers:** Model 1 deploy-conf recall + polygon-IoU; FP/page on the
  positive real set (precision); FP-rate on confusers; catastrophic per-class
  regression; privacy/RED-data violation; train/test leakage check.
- **Soft blockers:** per-class recall for rare primitives with a real source
  (mrz/qr/barcode/checkbox/signature/stamp); partial-crop recall; glare/low-light
  recall; small-object AP/AR. (seal/logo are synthetic + eval-only — diagnostic,
  not gated on real recall; see §14.)
- **Monitored warnings:** low-sample slices; new document families; source-
  specific degradation; teacher-disagreement drift.
- Every metric carries a minimum sample count + confidence interval. **Recall CIs
  MUST use a CLUSTER bootstrap grouped by the leakage key** — per-frame Wilson
  understates the interval because frames from one document/session are
  correlated (a model can slip past a too-narrow gate). The metrics module now
  provides this cluster bootstrap. Small slices warn, never hard-block (unless
  business-critical).

**Phase 1 gate:** harness reproduces the docdet-v0 number (Model-2-on-full-frame
baseline) and reports all tiers on real data.

---

## 3. PHASE 2 — Engine A: real-background compositor + shared degradation graph

The highest-ROI generator and the one that kills the 0.36. Feeds both Model 1
(full-scene composites) and Model 2 (page-crop composites).

### 3.1 Compositor (`training/synthgen/compose/`)
- `bank.py` — loaders for the real **background**, **confuser**, and **hands/
  occluder** banks (seeded, cached, provenance-tagged).
- `place.py` — sample **scale** (document occupies 20–70% of frame, long tail to
  8% and 95%), **rotation** ±60°, full **perspective** homography, **truncation**
  (enforce ≥25% visible; sometimes hard-clip an edge → `truncated=true`),
  **occlusion** (overlap docs/hands up to IoU 0.75), **multi-doc** scenes.
- `blend.py` — alpha-feather + Poisson (`cv2.seamlessClone`) + Laplacian-pyramid;
  blend mode randomized **per artifact fork**.
- `compositor.py` — bg + N foregrounds (rendered pages from Engine C and real
  doc crops via SAM masks) → labeled sample; all polygon labels transformed
  through the SAME homography (we already keep polygon-accurate labels).

### 3.2 Shared capture-degradation graph (`training/synthgen/degrade/`) — NAMED, not folded away
Physically ordered, causal pipeline applied after placement:
```
geometry (homography, 3D-ish bend/fold/curl)
  → paper/ink  (Augraphy: fiber, toner var, low ink, photocopy haze, stains, bleed)
  → capture light (geometry-aware glare on glossy lamination, cast shadow, WB ±1200K, exposure ±1.5EV)
  → sensor/ISP  (shot+read noise by device tier, demosaic softness, oversharpen halos, motion 3–25px, rolling shutter)
  → codec       (JPEG q25–98 heavy-tail + HEIC + occasional recompression)
```
**Artifact-invariance fork:** for each composite, emit K=2–3 copies with identical
geometry/labels but different corruption stacks (shared
`artifact_invariance_group_id`). Forces the model to learn the primitive, not the
corruption (Dwibedi: +8 AP from blend-invariance generalized to all corruptions).

**Phase 2 gate:** regenerate, retrain Models 1+2 on Modal, re-eval on the real
gate. Targets: Model 1 document_page full-view recall **0.36 → ≥0.70**; Model 2
on-crop primitives establish baseline. Glare/partial slices must move up.

---

## 4. PHASE 3 — Engine C: symbolic + layout generators with validators

Upgrade the existing procedural generator into the symbol-correct, label-exact
engine; demote full-frame procedural output to a small fraction (feeds Engine A
as foregrounds).
- MRZ: keep ICAO 9303 TD1/TD2/TD3 + OCR-B + check digits (already correct).
- Barcode/QR: spec-correct, **scannable** codes (Code128/PDF417/QR/DataMatrix/
  Aztec) with real payloads; **reject any sample that does not decode** after
  degradation (two-decoder agreement).
- Forms/checkboxes/tables: layout engine (HTML/CSS-to-PDF or programmatic) with
  randomized structure; checkbox fill states (empty/check/cross/mixed).
- Clean scan/PDF renders for the "uploaded" end of the distribution.
- **Generated-label validators** (the synthetic labels are exact by construction;
  validators confirm semantic correctness): decode QR/barcode; MRZ regex +
  check-digit; checkbox geometry + label proximity; table row/col evidence.

**Phase 3 gate:** mixed-train re-eval; Model 2 per-class recall for mrz/qr/barcode
≥0.90 on real; full-view document_page (Model 1) ≥0.80.

---

## 5. PHASE 4 — Small-object rescue (the ladder, executed in order)

Even with the page-crop topology, validate small-object capacity explicitly.
1. Relative / object-scale size-bucket eval (already in harness,
   `size_mode="relative"`) — measure the gap (NOT absolute pixels; Model 2 runs
   on variable-resolution rectified crops).
2. High-res crop training for small-primitive-dense pages (train Model 2 on
   high-res page crops, not downscaled full pages).
3. Small-instance copy-paste + scale-aware sampling.
4. Add a **P2 / stride-4 detection head** to Model 2 (the first architectural
   lever; less disruptive than more models).
5. Deploy-resolution sweep (640 vs 768 vs adaptive) under the latency budget.
6. SAHI-style tiling evaluated separately (latency-budgeted).
(There is no rung 7 "second detector" — the staged topology already provides the
crop stage, which is what a second detector would have done.)

**Phase 4 gate:** Model 2 small-bucket (relative-scale) recall within 5 pts of
medium-bucket recall for checkbox/qr/barcode/seal (seal on synthetic/eval data).

---

## 6. PHASE 5 — Engine B: BlenderProc, targeted only

Photorealistic 3D **only for the physics slices that Engine A + degradation graph
still fail**: geometry-aware glare on laminated IDs, page fold/curl, hand-held
geometry, cast shadows. Paper/card mesh + cloth-sim bend, PBR (matte vs glossy),
HDRI lighting, camera intrinsics/DoF/motion, desk/hand occluders, 3D→2D box
projection. Runs as a Modal GPU job; outputs to the Modal Volume. Driven by the
information-gain ledger — not generated blindly.

**Phase 5 gate:** glare/fold/curl/laminated slices ≥0.90; full-view ≥0.92.

---

## 7. PHASE 6 — Privacy-safe real ingestion + auto-label + dual-path QA

The last-mile lever to ≥0.95. GREEN/YELLOW data only; never RED.

### 7.1 Auto-label pipeline (`training/autolabel/`, on Modal)
```
GroundingDINO (per-class prompt ensemble, low thresh → max recall)
  → SAM2 (mask → tight box + retained polygon)
  → Qwen2.5-VL verifier (narrow per-region yes/no + type)
  → class validators (decode QR/barcode; MRZ regex+check-digit; checkbox geometry;
       table row/col; signature stroke-vs-print)
  → risk score (teacher agreement + decode + validator)
```
Run a **5k pilot first**, measure label yield + error modes, THEN scale. Never run
the teacher stack over 500k images blindly.

### 7.2 QA (dual-path)
- **Targeted (improvement, ~bulk of budget):** teacher disagreement, low-conf
  positives, high-conf hard negatives, validator failures, new source/domain
  families, rare classes, near-threshold boxes, and the confusion pairs
  stamp/seal/logo/signature.
- **Random-stratified audit (measurement, sized to a target CI on error rate):**
  stratified by source/class/domain/consensus-level/label-origin. Catches
  correlated teacher errors and gives an unbiased label-quality estimate.
- **Inter-annotator agreement** measured on the confusable classes — that
  disagreement rate is the model's accuracy ceiling.

### 7.3 First-party capture stream (GREEN only)
Continuously stage ugly captures: bad desks, hands, glare, low light, shadows,
crumpled receipts, folded contracts, generic cards in wallets — **using synthetic-
filled / staff-created documents, never real users' sensitive papers, never RED.**

**Phase 6 gate:** real-heavy fine-tune; full-view recall **≥0.95**, partial ≥0.85,
all soft-blocker class gates ≥0.90.

---

## 8. PHASE 7 — Calibration, export, deploy

- **Per-class confidence thresholds** tuned on REAL validation against business
  cost (`min E[cost] = FN_cost·FN + FP_cost·FP`, subject to a precision floor).
- **Per-class NMS IoU** (checkbox/table need different NMS than document_page).
- BatchNorm re-adaptation on held-out unlabeled real data before export.
- Export ONNX (Models 1, 2, optional 3) + `classes.json` + per-class thresholds +
  metadata; persist on the Modal Volume; wire into
  `src/ai-runtime/model-registry.ts` and the staged inference in
  `src/workers/inference.worker.ts`.
- **Browser latency gate:** end-to-end (Model 1 → crop → Model 2) ≤ ~30 ms at
  deploy resolution in onnxruntime-web on target hardware.

### 8.4 Open-set novelty mining (DEV/TEST-LAB ONLY — no production telemetry)
On our own collected/test data: embed each capture, compare to training-domain
clusters, flag outliers (embedding novelty + high-conf FPs + low-conf page
detections), route to QA/capture. This is the measurement mechanism for "ANY
document" coverage. It never runs as a phone-home loop in the local product.

---

## 9. Provenance schema (per-annotation) + leakage key — BUILT + TESTED; enforcement being WIRED into manifest writers

Defined for every manifest; the schema and the leakage-aware splitter are built
and unit-tested. Enforcement is being wired into the manifest writers
generator-by-generator (the MIDV normalizer is the first integration) — it is not
yet pipeline-wide. Provenance is per-annotation because one composite mixes
origins (human-labeled crop + synthetic MRZ + autolabeled negative).

```
image:
  image_id, capture_session_id, perceptual_hash, source_dataset,
  domain_bucket, license_bucket, split_group_key
annotation:
  ann_id, image_id, class, bbox_xyxy, polygon_or_quad,
  label_origin, generation_engine, source_asset_id,
  license_bucket, domain_bucket, validator_status, teacher_votes, qa_status
render_variant:
  variant_id, parent_document_id, corruption_stack_id, artifact_invariance_group_id
```
Enumerations:
- `license_bucket`: permissive_commercial | attribution_required | noncommercial |
  research_only | unknown | internal_first_party
- `domain_bucket`: flatbed_scan | clean_pdf | phone_table | phone_handheld |
  phone_clutter | low_light | glossy_laminated_id | receipt_crumpled |
  form_handwritten | screenshot | book_magazine_confuser
- `generation_engine`: real | compositor | blenderproc | symbolic_pdf |
  diffusion_assisted | autolabeled_real
- `label_origin`: human | teacher_consensus | teacher_single | validator_generated |
  synthetic_exact | weak_box

**Leakage key (mandatory):**
`split_group_key = hash(canonical_document_id OR capture_session_id OR
perceptual_hash_cluster_id OR source_video_id)`. Splits are made on this key —
never on individual frames. A perceptual-hash dedup pass runs before every split.
**Scale note:** perceptual-hash clustering uses **LSH banding** (pigeonhole,
`max_hamming + 1` bands) for near-linear scale; the naive O(n²) all-pairs
comparison is infeasible at the 0.5–4M-image targets.

---

## 10. Slice-driven sampler (bounded, damped, closed-loop)

Not fixed 60:40 / 70:30 — those are only the starting point. The sampler is
closed-loop but **damped and bounded**.

```
log_w = log(base_w)
      + a·log(deficit_factor)        # from real per-slice recall vs target (CI-aware)
      + b·log(scarcity_factor)       # effective-number-of-samples, not raw count
      + c·log(label_quality_factor)  # down-weight noisy slices
      + d·log(domain_priority_factor)
w = clamp( exp( EMA(log_w) ), floor, cap )     # cap 2–4× initially
```
Rules:
- Reweight only every **K epochs** (K ≥ model response time; default 5–10 during
  mixed training); **freeze** during final calibration/fine-tune. (Avoids
  control-loop dead-time oscillation.)
- A slice cannot move weight without a **minimum eval count + confidence interval**
  (no steering on noise).
- **Global floor** per core class/domain prevents catastrophic forgetting.
- With mosaic/mixup active, attribute slices at the **mosaic-component level**, or
  disable mosaic for controlled slices (partial_crop, tiny_checkbox,
  glare_laminated_id).
- Before oversampling, classify the failure: **starved** (add weight) | **noisy**
  (clean labels) | **impossible/tiny** (architecture/resolution/crop, not weight)
  | **ambiguous taxonomy** (fix CLASS_SPEC).

---

## 11. Compute ledger + information-gain sequencing (Modal)

Every Modal job logs a ledger row and auto-stops on completion (no idle charges):
```
job: name, engine, input_count, output_count, gpu_type, gpu_hours, cpu_hours,
     storage_gb, egress_gb, cost_estimate, cache_key, reproducible_seed, artifact_uri
```
Execution order (Phase 0 blocks all generation; nothing is rendered at scale
before the ontology + gates exist — consistent with §1):
1. **Phase 0** — taxonomy/CLASS_SPEC, source_map, provenance schema, leakage
   keys, eval harness.
2. **Phase 1** — real benchmark + tiered gates; reproduce the docdet-v0 baseline.
3. Engine A compositor **pilot** (+ degradation graph) — small batch, NOT scale.
4. Train/eval Models 1+2 on the pilot against the real gates.
5. **Scale Engine A only after the real gates show movement** (e.g., Model 1
   full-view recall climbing past the 0.36 baseline).
6. Engine C symbolic generators + label validators.
7. Small-object ladder (Phase 4).
8. BlenderProc ONLY for failed physics slices (Phase 5).
9. Auto-label **5k pilot** → measure yield/errors (VLM verification only on
   uncertain/risky samples — never blind over 500k).
10. Scale real ingestion + dual-path QA.
Artifacts persist on a Modal Volume with a completion sentinel; client death does
not lose work; jobs stop after completion so billing stops.

### 11.1 Compute-scaling strategy — GPU sweet-spot now, population sweep later

The model is `yolo11n` (~2.6M params). A nano net **cannot saturate** a large
datacenter GPU (A100/H100/B200): its kernels are tiny and a single training run
is a *sequential* optimization (step N needs step N-1's weights), so there is no
intra-run parallelism for a big card to absorb. Throwing a B200 at one nano model
leaves it ~95% idle while billing 5-8x. The real levers depend on the phase.

**Current default (pilot + per-arm training) — the cost-efficient operating point:**
- **GPU = L4** (~$0.80/hr, 24GB) — fits `yolo11n` at imgsz 960 / batch 32 with
  headroom; ~30% cheaper than A10G, far cheaper than any A100-class card.
- **`cpu=8` dataloader cores** so the cheap GPU stays the bottleneck, not data prep.
- **Independent arms in parallel** (pilot vs control on two GPUs at once): same
  GPU-hours, half the wallclock. This is the *only* parallelism that helps here.
- Shorter epoch budget for go/no-go reads (60 vs 100); full budget for scale runs.

**Scale / tuning phase ONLY — train MANY models at once (the real "RAID" analog).**
When we run large ablation matrices (augment intensity, compose-prob, mosaic, LR,
copy-paste, P2 head on/off), the high-value move is parallelizing *experiments*,
not one model:
- **MIG (Multi-Instance GPU):** partition one A100/H100/B200 into up to 7 isolated
  mini-GPUs, each running an independent variant. Clean, robust, hardware-isolated.
- **MPS (Multi-Process Service):** pack many small jobs onto one GPU without MIG's
  rigid partitions (weaker isolation) — good for dev sweeps.
- **`torch.func`/functorch vmap ensembles:** stack N model copies on an extra
  tensor dim and run all forward/backward as fused kernels — literally striping a
  population across the chip. *Caveat:* YOLO is BatchNorm-heavy and BN+vmap is
  fiddly, so this is non-trivial to bolt onto Ultralytics; prefer MIG-packed
  independent runs unless we invest in a vmap-clean training loop.
- **Pattern:** fan a big GPU (MIG) or many cheap containers into a 20-50 variant
  recipe sweep in one shot, then "soup"/select winners — collapsing weeks of
  serial ablations into one parallel pass. Speeds up *search*, not a single model.

**If single-run training ever becomes data-bound (large-scale re-augmentation):**
- **GPU-side data loading (NVIDIA DALI / FFCV):** move resize/augment/composite
  onto the GPU to kill the CPU preprocessing bottleneck (Ultralytics ships a DALI
  guide). *Currently moot:* we pre-generate datasets to the Volume **once** and
  reuse them, so training reads cached composited images and the CPU load per
  epoch is light. Revisit only if we switch to on-the-fly compositing at scale.
- **Large-batch + LARS/LAMB + linear LR scaling + `torch.compile`/AMP:** squeeze
  one run, but the *critical batch size* caps gains early for a small model/dataset
  and can hurt generalization — treat as a measured tweak, not a free win.

**Rule of thumb:** cheap GPU + enough CPU + parallel *independent* jobs. Reach for
MIG/vmap/DALI only when the bottleneck is "too many experiments" or "data-bound at
scale" — never to make one nano model train faster, which is not possible.

---

## 12. Training curriculum
Synthetic warm-start (Engines A+B+C, high hard-negative rate) → mixed
(start ~60:40 synthetic:real, then **let the bounded sampler take over**) →
real-heavy fine-tune (start ~70:30 real:synthetic) → self-training refreshes on
fresh auto-labeled real → BN re-adaptation on real before export. Hard negatives
held at 20–30% of the stream throughout; a separate confuser val split tracks FP.

## 13. Anti-patterns we will NOT repeat
full-frame/centered/clean docs · procedural backgrounds · single-blend compositing
· toy degradations (no glare/shadow/ISP) · synthetic-only training · no hard
negatives · no class validators · frame-level train/test leakage · trusting
synthetic mAP · one global confidence threshold · gating only document_page ·
random-only or targeted-only QA · text_block competing with rare primitives ·
collecting real IDs/payment cards for training.

## 14. Definition of Done (all must hold at deploy thresholds, on REAL data)
- Model 1: document_page full-view recall ≥0.95, partial ≥0.85, polygon-IoU@0.75
  ≥0.80, corner error within tolerance for dewarp — where the corner-error gate
  is **reprojection / short-side-normalized**, and its numeric tolerance is set
  from the downstream dewarp requirement (to be fixed during Phase 7 calibration
  on real data). This gate is currently **unmeasurable** until Model 1 and a quad
  producer exist; it is a placeholder threshold until then.
- Model 2: per-class recall ≥0.90 on the hard REAL-recall gate for
  `REAL_GATED_CLASSES` only — mrz/qr/barcode/photo/signature/stamp/table/checkbox;
  small-bucket (relative-scale) recall within 5 pts of medium. **PENDING /
  currently unmeasurable:** Model 2, the rectified-crop stage, real per-primitive
  labels, and the figure-vs-photo validator do not exist yet, and the MIDV
  benchmark carries only `document_page` — so this row cannot be evaluated until
  those exist (blocked, not achievable today). **seal and logo are EXCLUDED from
  the hard real-recall gate**: they currently have NO license-clean real-data
  source (`SYNTHETIC_OR_EVAL_ONLY_CLASSES = {seal, logo}` per the data-reality
  flags), so they are SYNTHETIC + EVAL-ONLY until a real source is added. They are
  measured diagnostically, never gated on real recall.
- Precision: FP/page on positive real set under budget; FP-rate on confusers ≤1%.
- Per-class thresholds + per-class NMS calibrated on real val; exported.
- End-to-end browser latency ≤ ~30 ms at deploy resolution.
- No RED data anywhere in the training lineage (provenance audit passes).
- Every number above produced on leakage-free real splits with CIs — recall CIs
  via the CLUSTER bootstrap grouped by the leakage key (never per-frame Wilson,
  which understates the interval on correlated frames).
