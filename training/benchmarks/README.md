# `benchmarks/` — real evaluation gate + dataset normalizers

This package implements the **gate of record** for docdet: every model that
ships is certified here against real data, never against synthetic mAP alone.

---

## The gate of record

`eval_v2.py` is THE gate. It:
1. Runs `YOLO.predict` over a real test set.
2. Scores via `metrics_v2.evaluate_detections` (single matching pass, so
   confusion matrix and precision/recall are consistent by construction).
3. Computes a **cluster-bootstrap recall CI** grouped by `split_group_key`
   (one physical document = one cluster; resamples whole documents so the CI
   reflects the true effective N, not the per-frame iid fiction).
4. **Renders a PASS/FAIL verdict** (`gate()`) thresholded on the CI lower
   bound + precision floor + FP/page ceiling. Exit code 1 on fail.
5. Computes threshold-independent **AP** (sweeps all confidences; single-conf
   recall can miss a miscalibrated model).

```powershell
# The gate of record — run this before accepting any model:
python benchmarks/eval_v2.py --model winner_model/best.pt `
    --data benchmarks/real/midv500 --split test --imgsz 640 `
    --recall-floor 0.90 --precision-floor 0.50 --fp-ceiling 0.50
```

`eval_real.py` is **DEMOTED** — it is a single-conf recall-only ultralytics smoke
check. Do not use it to accept/reject a model.

---

## Key files

| file | what | note |
|---|---|---|
| `metrics_v2.py` | IoU (AABB + polygon), corner error, page coverage, COCO-size buckets (absolute + relative/object-scale), match_detections, evaluate_detections (ignore-region masking, AP, unified matching), cluster-bootstrap CI, `gate()` verdict | **★ the core instrument** |
| `eval_v2.py` | The wired real gate (YOLO→metrics_v2→verdict→JSON) | **★ gate of record** |
| `leakage_split.py` | pHash LSH clustering + leakage-free `assign_splits` (normalized-deficit greedy, no empty splits) + `audit_split` + `split_manifest()` CLI | **★ run before any training split** |
| `normalize_midv.py` | MIDV-500/2020 → YOLO labels + provenance.jsonl + split_group_key per manifest sample + leakage-safe yaml banner | must re-run after adding new MIDV data |
| `class_map.py` | docdet-v0 stable ids + source→class maps (DocLayNet/MIDV/PubTables) | v0 legacy; see `ontology/source_map.py` for v1 |
| `eval_real.py` | **DEMOTED** ultralytics smoke check | still useful for quick sanity; not the gate |
| `analyze_midv_by_condition.py` | per-condition (TA/TS/HA/HS/KA/KS/CA/CS/PA/PS) recall breakdown | diagnosis tool |
| `modal_bench.py` | benchmark on a Modal cloud GPU | for non-local large-scale eval |
| `normalize_doclaynet.py` | DocLayNet → YOLO labels | Phase 1 |

### `real/`
- `midv500/` — the REAL benchmark (2 939 frames, stride-5, all 50 docs × 10
  conditions). Contains `images/`, `labels/`, `manifest_test.json` (with
  `split_group_key`, `canonicalDocument`, `captureCondition` per sample),
  `provenance.jsonl` (per-frame provenance records), `splits.json`
  (leakage-free 2349/295/295 by document), `dataset.yaml`, and
  `eval_v2/metrics_v2.json` (the committed gate result).

### `datasets/`
Research notes on every dataset evaluated for use (see individual `.md` files).

---

## Build a leakage-free split (required before any training use)

```powershell
# 1. Re-normalize MIDV-500 (writes provenance.jsonl + split_group_key):
python benchmarks/normalize_midv.py --midv-root datasets/real/midv500 `
    --out benchmarks/real/midv500 --layout midv500 --split test --frame-stride 5

# 2. Produce a leakage-free train/val/test split (grouped by canonical document):
python benchmarks/leakage_split.py --manifest benchmarks/real/midv500/manifest_test.json
# -> benchmarks/real/midv500/splits.json  (2349/295/295, audit ok)
```

**Never train on the yaml alone (train=val=test).** The yaml carries a loud
warning banner when no split has been produced. Always run `leakage_split.py`
first.

---

## Tests

`../tests/test_metrics_v2.py` (54 tests), `../tests/test_leakage_split.py` (12),
`../tests/test_eval_v2.py` (40).

```powershell
python -m pytest tests/test_metrics_v2.py tests/test_leakage_split.py tests/test_eval_v2.py -q
```
