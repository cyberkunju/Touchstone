# docdet — STATUS TRACKER

Living, task-level progress board for the build defined in
`DATA_PIPELINE_V2_MASTER_PLAN.md`. Every task (even small) is tracked. Update
this file whenever a task changes state — it is the single source of truth for
"where are we".

**Legend:** ✅ done · 🔶 in progress / partial · ⬜ not started · ⛔ blocked
(dependency missing) · 🧪 has tests

**Last updated:** Phase 2 — Engine A compositor built & tested; **pilot LAUNCHED**
(detached Modal app `ap-JH2FYXHugdUon67O5e1S5g`, cost-efficient L4×2 parallel).

---

## Snapshot

| phase | name | state |
|---|---|---|
| 0 | Ontology & evaluation contract | ✅ **DONE** (100%) |
| 1 | Real benchmark + tiered gates | 🔶 ~40% (gate + MIDV-500 only) |
| 2 | Engine A: real-bg compositor + degradation | 🔶 ~60% (compositor done; pilot pending) |
| 3 | Engine C: symbolic generators + validators | ⬜ |
| 4 | Small-object rescue ladder | ⬜ |
| 5 | Engine B: BlenderProc (targeted) | ⬜ |
| 6 | Privacy-safe real ingestion + auto-label + QA | ⬜ |
| 7 | Calibration, export, deploy | ⬜ |

**Tests:** 161 passing (`python -m pytest tests/ -q`).
**Gate of record:** `benchmarks/eval_v2.py`. Current baseline (v0): document_page
recall **0.38**, cluster-CI [0.30, 0.48], verdict **FAIL** (floor 0.90).

---

## §11 Execution order (the spine)

- [x] 1. Phase 0 — ontology, source_map, provenance, leakage keys, eval harness ✅
- [~] 2. Phase 1 — real benchmark + tiered gates; reproduce docdet-v0 baseline 🔶
- [~] 3. Engine A compositor **pilot** (+ degradation graph) — small batch 🔶
- [ ] 4. Train/eval Models 1+2 on the pilot against the real gates ⬜
- [ ] 5. Scale Engine A only after the real gates show movement ⬜
- [ ] 6. Engine C symbolic generators + label validators ⬜
- [ ] 7. Small-object ladder (Phase 4) ⬜
- [ ] 8. BlenderProc only for failed physics slices (Phase 5) ⬜
- [ ] 9. Auto-label 5k pilot ⬜
- [ ] 10. Scale real ingestion + dual-path QA ⬜

---

## PHASE 0 — Ontology & Evaluation Contract ✅ (plan §1)

### 0.1 Class specification (`ontology/CLASS_SPEC.md`)
- [x] 12→staged class definitions (Model 1 / 2 / 3) with positive/negative/boundary rules
- [x] capture-invariant stamp/seal/logo decision tree + 3 tie-break rulings
- [x] `ignore_region` first-class mechanism defined
- [x] resolution-invariant (fraction-of-frame) min-size rule
- [x] coverage rulings (handwriting, redaction bars, chips, ghost photos, nested tables, multi-column)
- [x] figure/chart out-of-scope rule; photo content-validator gate
- [x] MRZ TD1=3 / TD2=2 / TD3=2 line counts (ICAO 9303)

### 0.2 Class config (`ontology/classes.py`) 🧪
- [x] PAGE/PRIMITIVE/TEXT class sets + stable ids
- [x] PRIMITIVE_MIN_SIDE_FRAC (+ px reference)
- [x] data-reality flags: SYNTHETIC_OR_EVAL_ONLY (seal,logo), NEEDS_CONTENT_VALIDATOR (photo), REAL_GATED_CLASSES
- [x] V0→V1 migration map + drift-guard test (`test_class_consistency.py`)

### 0.3 Source→class mapping (`ontology/source_map.py`) 🧪
- [x] reviewed mappings for 14 datasets, class_confidence + geometry tag + needs_validator
- [x] OUT_OF_SCOPE vs UNKNOWN (loud, strict raises) — no silent drops
- [x] license/data-class buckets + `audit_lineage()` (RED / research-only blocker)

### 0.4 Provenance + leakage (`ontology/provenance.py`) 🧪
- [x] per-annotation provenance schema (image/annotation/render_variant)
- [x] pinned tagged perceptual hash (`phash64:`, imagehash hard dep)
- [x] `compute_split_group_key()` (multi-field guard) + `to_record()` (rejects empty/per-frame key)

### 0.5 Eval harness (`benchmarks/metrics_v2.py`, `leakage_split.py`) 🧪
- [x] AABB + polygon IoU, corner error (optimal), page coverage
- [x] size buckets (absolute + relative/object-scale)
- [x] unified matching → consistent confusion matrix + precision/recall + FP/page
- [x] ignore-region + per-instance ignore masking
- [x] average precision (AP) — threshold-independent
- [x] cluster-bootstrap recall CI (degenerate-guarded) + Wilson
- [x] `gate()` verdict (recall CI-low + precision floor + FP ceiling)
- [x] leakage-free splitter (normalized-deficit, no empty splits) + audit + LSH clustering + `split_manifest` CLI

**Phase 0 gate:** ✅ CLASS_SPEC reviewed; source_map complete; provenance+leakage
wired into the MIDV writer; harness emits all metrics. 161 tests green.

---

## PHASE 1 — Real benchmark + tiered gates 🔶 (plan §2)

### 1.1 document_page benchmarks
- [x] MIDV-500 normalized → YOLO + provenance.jsonl + split_group_key 🧪
- [x] MIDV-500 leakage-free split (2349/295/295, audit ok)
- [x] baseline reproduced through eval_v2 (recall 0.38, FAIL verdict)
- [ ] MIDV-2019 normalized
- [ ] MIDV-2020 normalized (normalizer wired; not run on data)
- [ ] SmartDoc normalized
- [ ] SIDTD normalized
- [ ] DocLayNet pages normalized

### 1.2 primitive benchmarks
- [ ] CommonForms → checkbox + signature
- [ ] DDI-100 / StaVer → stamp
- [ ] PubTables-1M + DocLayNet → table
- [ ] MIDV → mrz / photo (per-frame field boxes)
- [ ] barcode/QR real sets → barcode/qr_code
- [ ] Tobacco-800 / CEDAR / GPDS → signature appearance

### 1.3 hard-negative / confuser set
- [x] real background bank downloaded (COCO val2017, 5000 imgs) 🔶 (doubles as Engine A bg)
- [ ] confuser set normalized (screenshots, books, posters, playing/credit/business cards)
- [ ] separate confuser val split tracking FP/image

### 1.4 tiered gate harness
- [x] hard/soft/warning gate tiers in `eval_v2` + `metrics_v2.gate()`
- [x] per-class + per-slice (capture condition) + size-bucket reporting
- [x] cluster-bootstrap CI on recall
- [ ] nasty-500 curated real slice frozen
- [ ] gate wired into the training runner (modal_train) — currently CLI-only

---

## PHASE 2 — Engine A: real-bg compositor + degradation 🔶 (plan §3)

### 2.1 Compositor (`synthgen/compose/`) 🧪
- [x] `bank.py` — BackgroundBank (seeded sampling, gray fallback)
- [x] `place.py` — placement homography (20–70% scale + tails, ±60° rot, perspective, partial-crop)
- [x] `blend.py` — alpha / hard / guarded-Poisson blend modes
- [x] `compositor.py` — warp + polygon transform + placed `document_page` quad
- [x] wired into `generate.py` (`--compose --bg-dir --compose-prob`, bank per worker)
- [x] validated end-to-end: real scenes, sub-region pages (0.23–0.60 frac), labels round-trip

### 2.2 Shared degradation graph
- [x] geometry→paper/ink→light→ISP→codec exists (`augment.py`, runs post-compose)
- [ ] (deviation) named `synthgen/degrade/` package — currently reuses `augment.py`
- [ ] geometry-aware glare on glossy lamination (basic glare exists; not geometry-aware)
- [ ] artifact-invariance forks (same placement, K corruption stacks, shared group id)

### 2.3 Engine A foreground sources
- [x] rendered docs from existing categories (passport/invoice/form/cert/statement/license/decoy)
- [ ] real doc crops via SAM masks (Phase 6 dependency)

### 2.4 The PILOT (the go/no-go) — CONTROLLED ABLATION
> NOTE: the pilot trains the **v0 single 12-class detector** (incl. `document_page`
> and the to-be-deleted `text_block`) as a **DATA-LEVER ISOLATION TEST** — NOT the
> v1 staged Models 1/2. Architecture is held constant; only the data changes
> (composited vs not), to decide if Engine A data alone moves real recall before
> paying for the staged refactor.
- [x] backgrounds onto Modal Volume (`fetch_backgrounds`, raises on <4000)
- [x] `--compose` threaded through `modal_train.py` in-Volume generation
- [x] **matched no-compose CONTROL arm** (same count/seed/augment) — isolates Engine A
- [x] mosaic disabled for both arms (`train(mosaic=0)`) — mosaic fights the objective
- [x] cost-efficient GPU sweet-spot: `GPU="L4"` (not B200/A100 — a nano net can't
      saturate them), `cpu=8` dataloader cores, both arms parallel, 60-epoch budget
- [~] generate ~30k composited PILOT + ~30k CONTROL (Modal) — **RUNNING**
      (detached app `ap-JH2FYXHugdUon67O5e1S5g`, launched 2026-06-08)
- [ ] train both arms (baseline 640, 60ep) on Modal — queued behind generation
- [ ] eval BOTH arms locally via `eval_v2` on MIDV gate — NOT YET RUN
- [ ] **GO criterion = MOVEMENT:** pilot recall clears baseline cluster-CI upper
      bound (~0.48) AND pilot > control. (0.70/0.90 is the later PHASE gate, not
      this pilot's go/no-go — judged on the cluster-CI lower bound.)

---

## PHASE 3 — Engine C: symbolic generators + validators ⬜ (plan §4)
- [x] MRZ ICAO TD1/2/3 + check digits (exists in `synthgen/mrz.py`)
- [ ] barcode/QR spec-correct + **decode-validation** (reject undecodable)
- [ ] forms/checkboxes/tables layout engine (fill states)
- [ ] clean scan/PDF renders (uploaded-doc end of distribution)
- [ ] generated-label validators: decode QR/barcode, MRZ regex+check-digit, checkbox geometry, table row/col
- [ ] **GATE:** mrz/qr/barcode real recall ≥0.90; full-view ≥0.80

---

## PHASE 4 — Small-object rescue ladder ⬜ (plan §5)
- [ ] 1. relative size-bucket eval on Model 2 (instrument ready)
- [ ] 2. high-res crop training for small-primitive-dense pages
- [ ] 3. small-instance copy-paste + scale-aware sampling
- [ ] 4. P2 / stride-4 detection head on Model 2
- [ ] 5. deploy-resolution sweep (640/768/adaptive)
- [ ] 6. SAHI-style tiling (latency-budgeted)
- [ ] **GATE:** small-bucket recall within 5 pts of medium (checkbox/qr/barcode)

---

## PHASE 5 — Engine B: BlenderProc (targeted) ⬜ (plan §6)
- [ ] paper/card mesh + cloth-sim bend/fold/curl
- [ ] PBR matte vs glossy materials + HDRI lighting
- [ ] camera intrinsics/DoF/motion + desk/hand occluders
- [ ] 3D→2D box projection; Modal GPU job
- [ ] **only for physics slices Engine A still fails** (info-gain driven)
- [ ] **GATE:** glare/fold/curl/laminated slices ≥0.90; full-view ≥0.92

---

## PHASE 6 — Privacy-safe real ingestion + auto-label + QA ⬜ (plan §7)
- [ ] auto-label pipeline: GroundingDINO → SAM2 → Qwen2.5-VL → class validators → risk score
- [ ] 5k auto-label **pilot** first (measure yield/errors)
- [ ] scale ingestion (100–500k real unlabeled), distill to student
- [ ] targeted QA (disagreement/low-conf/validator-fail/new-family/confusion-pairs)
- [ ] random-stratified audit QA (CI-sized) + inter-annotator agreement
- [ ] first-party ugly-capture stream (GREEN only; never RED)
- [ ] **GATE:** full-view recall ≥0.95, partial ≥0.85, all real-gated classes ≥0.90

---

## PHASE 7 — Calibration, export, deploy ⬜ (plan §8)
- [ ] per-class confidence thresholds (tuned on REAL val vs business cost)
- [ ] per-class NMS IoU
- [ ] BatchNorm re-adaptation on real before export
- [ ] export ONNX (Models 1/2/3) + classes.json + thresholds + metadata → Modal Volume
- [ ] wire into `src/ai-runtime/model-registry.ts` (LAYOUT_MODEL) + staged inference worker
- [ ] **GATE:** end-to-end browser latency ≤ ~30 ms; full DoD (§14) holds
- [ ] open-set novelty mining (dev/test-lab only; no telemetry)

---

## Cross-cutting (plan §9–12)
- [x] provenance schema + leakage key (built; wired into MIDV writer) 🔶 (other writers pending)
- [x] LSH-banded pHash clustering for scale
- [ ] slice-driven bounded sampler (log-space, K-epoch cadence, mosaic-aware) — design only
- [ ] compute ledger + auto-stop on Modal — partially (modal_train detach/stop)
- [ ] curriculum (synthetic warm-start → mixed → real-heavy → self-train → BN-adapt) — design only

## Definition of Done (plan §14) — all on REAL data, leakage-free, cluster-CI
- [ ] Model 1: document_page full-view recall ≥0.95, partial ≥0.85, polygon-IoU@0.75 ≥0.80 (PENDING: Model 1 + quad producer)
- [ ] Model 2: real-gated per-class recall ≥0.90; small within 5pts of medium (PENDING: Model 2 + real primitive labels + validator)
- [ ] precision: FP/page under budget; confuser FP ≤1%
- [ ] per-class thresholds + NMS calibrated on real val; exported
- [ ] browser latency ≤ ~30 ms end-to-end
- [ ] no RED data in lineage (provenance audit passes)

---

## CURRENT FOCUS → NEXT ACTION
**Finish §11 step 3 → step 4: the Engine A Modal pilot.**
1. backgrounds → Modal Volume
2. `--compose` through `modal_train.py` in-Volume generation; generate ~30k
3. retrain on Modal; run `eval_v2` on MIDV gate
4. read the verdict: **0.38 → ≥0.70 ?** → scale Engine A (step 5) or diagnose.
