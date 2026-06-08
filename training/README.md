# `training/` — docdet: universal document-primitive detector (data + training)

This workspace builds **docdet**, the "find" layer of the engine: it locates
universal visual primitives (page, photo, signature, stamp, seal, logo, QR,
barcode, MRZ, table, checkbox) on **any** document, in any condition, so the
DocGraph / Verifier / template stages have real evidence to work with. It is not
passport-specific and it never *confirms* fields — it emits evidence.

> **Read these first (authoritative):**
> - `DATA_PIPELINE_V2_MASTER_PLAN.md` — the decisive end-to-end plan (topology,
>   phases, gates, governance). **Start here.**
> - `STATUS.md` — **the live task-by-task progress tracker** (every task, phase
>   by phase, marked done / in-progress / not-started). Check this for "where are we".
> - `ontology/CLASS_SPEC.md` — the labeling contract (what every class means).
> - `DATA_PIPELINE_RESEARCH_PROMPT.md` — the research brief that informed it.
> - `/Research/*` (repo root) — the two deep-research reports behind the plan.

---

## Current status

- **Phase 0 (ontology + evaluation contract): COMPLETE, wired, and tested.**
  161 unit tests pass (`python -m pytest tests/ -q`).
- **Model topology = docdet-v1 STAGED** (supersedes the single 12-class v0):
  - **Model 1 — Page Locator:** `document_page` region + 4-corner quad.
  - **Model 2 — Primitive Detector** (runs on the rectified page crop): 10
    in-page primitives `photo, signature, stamp, seal, logo, qr_code, barcode,
    mrz_zone, table, checkbox`.
  - **Model 3 — Text Detector** (DBNet-style, on demand): `text_line/region`.
- **Gate of record:** `benchmarks/eval_v2.py` (metrics_v2 + leakage_split +
  cluster-bootstrap CI + precision/FP-per-page **verdict**). The old
  `eval_real.py` is a demoted smoke check. Synthetic mAP never gates.
- **Honest baseline (v0 on real MIDV-500):** document_page recall **0.38**,
  cluster-CI **[0.30, 0.48]** (5.1× wider than naive Wilson) → **gate FAILS** the
  0.90 floor. This is the number **Engine A (Phase 2)** must move.

---

## Directory map

```
training/
├── DATA_PIPELINE_V2_MASTER_PLAN.md   ★ authoritative plan
├── DATA_PIPELINE_RESEARCH_PROMPT.md  research brief
├── README.md                         this file
├── requirements.txt                  deps (incl. shapely + imagehash, hard deps)
│
├── ontology/                         PHASE 0 contract (the single source of truth)
│   ├── CLASS_SPEC.md                 ★ labeling contract + capture-invariant rules
│   ├── classes.py                    staged class sets, min-sizes, data-reality flags
│   ├── source_map.py                 dataset→class mapping + license/RED audit
│   └── provenance.py                 per-annotation provenance + leakage key + pHash
│
├── benchmarks/                       evaluation + the real gate
│   ├── metrics_v2.py                 ★ IoU/polygon/corner, ignore-masking, AP,
│   │                                   cluster-bootstrap CI, gate() verdict
│   ├── eval_v2.py                    ★ THE gate of record (wired, renders pass/fail)
│   ├── leakage_split.py              leakage-free splitter + pHash LSH clustering
│   │                                   (CLI: split a manifest into train/val/test)
│   ├── normalize_midv.py             MIDV-500/2020 → YOLO + provenance + leakage key
│   ├── eval_real.py                  DEMOTED ultralytics smoke check (not the gate)
│   ├── class_map.py, analyze_midv_by_condition.py, modal_bench.py
│   ├── real/midv500/                 the REAL benchmark (images/labels/manifest/
│   │                                   provenance.jsonl/splits.json/eval_v2 results)
│   └── datasets/                     dataset research notes (.md)
│
├── synthgen/                         synthetic generator (Engine C today; v0-class)
│   ├── config.py (v0 legacy, see migration note), core, mrz, primitives,
│   │   augment, backgrounds, labels, fonts, i18n, generate, viz, categories/
│
├── tests/                            161 tests: ontology, leakage_split, metrics_v2,
│                                       eval_v2, class_consistency, synthgen, compose
│
├── datasets/                         generated synthetic data + datasets/real/
├── models/                           ★ versioned model homes (see models/README.md)
│   └── docdet-v1/{model1-page-locator, model2-primitives, model3-text}/
├── winner_model/                     docdet-v0 snapshot (SUPERSEDED; gate baseline)
├── training_runs/, runs/, exports_summary/   training run outputs
├── logs/                             past Modal run logs (history)
├── _archive/                         parked clutter (safe to delete)
│
├── train_detector.py    YOLOv11n training (smoke/baseline/small)   — GPU box
├── export_detector.py   ONNX export + engine artifact packaging
├── eval_detector.py     synthetic mAP + per-class gates (diagnostic)
├── modal_train.py       cloud training on Modal (regenerates data in-Volume)
├── fetch_datasets.py    real-dataset downloader registry
└── yolo11n.pt           vendored base weights (do NOT move; train default)
```

---

## Workflows

### Setup (local, CPU)
```powershell
python -m pip install -r requirements.txt
python -m pytest tests/ -q          # expect 161 passed
```
> **Windows:** always `\$env:PYTHONUTF8=1; \$env:PYTHONIOENCODING="utf-8"` before
> any Modal command, or the CLI hangs on a charmap encode error.

### The REAL gate (gate of record)
```powershell
# runs the model on real MIDV-500, renders a PASS/FAIL verdict with an honest
# cluster-bootstrap CI; exit code 1 if it fails the floors.
python benchmarks/eval_v2.py --model winner_model/best.pt --data benchmarks/real/midv500 `
    --split test --imgsz 640 --recall-floor 0.90 --precision-floor 0.50
# -> benchmarks/real/midv500/eval_v2/metrics_v2.json
```

### Build the real benchmark + a leakage-free split
```powershell
python benchmarks/normalize_midv.py --midv-root datasets/real/midv500 `
    --out benchmarks/real/midv500 --layout midv500 --split test --frame-stride 5
# leakage-free train/val/test grouped by document (never by frame):
python benchmarks/leakage_split.py --manifest benchmarks/real/midv500/manifest_test.json
```

### Generate synthetic data (v0 generator, being replaced by Engine A in Phase 2)
```powershell
python -m synthgen.generate --out datasets/docdet_v0 --count 15000 --seed 1000
python -m synthgen.viz --dataset datasets/docdet_v0 --split train --n 16
```

### Train on Modal (laptop stays cool)
```powershell
$env:PYTHONUTF8=1; $env:PYTHONIOENCODING="utf-8"
modal run --detach modal_train.py::full        # detached so client death is safe
modal app stop <id> --yes                       # stop after work (no idle charge)
```
Trained artifacts land in `models/docdet-v1/<model>/` (v1) — never overwriting.

---

## Phase status (from the master plan)

| phase | what | status |
|---|---|---|
| 0 | ontology + provenance + leakage + eval gate | **DONE** (wired, 161 tests) |
| 1 | real benchmark + tiered gates | MIDV-500 done; more datasets pending |
| 2 | Engine A: real-background compositor + degradation graph | **IN PROGRESS** — compositor built + tested (`synthgen/compose/`); pilot next |
| 3 | Engine C: symbolic generators + validators | pending |
| 4 | small-object rescue (P2 head, crop training) | pending |
| 5 | Engine B: BlenderProc (targeted) | pending |
| 6 | privacy-safe real ingestion + auto-label + QA | pending |
| 7 | calibration + ONNX export + browser latency gate | pending |

## Governance (non-negotiable, see plan §0.3)
- **No real personal data in training.** Real passports/IDs/payment cards/medical
  = RED, never used. Synthetic IDs + research-only public sets (MIDV etc.) are for
  eval/R&D only, tagged `research_only` and never shipped.
- Every annotation carries provenance (license/domain/engine/label-origin) and a
  **leakage key**; eval splits are grouped by document, never by frame.

## References
- App runtime that loads the model: `../src/ai-runtime/` (`yolo.ts`,
  `model-registry.ts`), worker `../src/workers/inference.worker.ts`.
- MRZ source of truth: `../src/parsers/mrz.ts`.
