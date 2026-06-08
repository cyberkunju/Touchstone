# `tests/` — docdet test suite (150 tests, all must pass before any commit)

Run the full suite:
```powershell
$env:PYTHONUTF8=1; $env:PYTHONIOENCODING="utf-8"
python -m pytest tests/ -q          # expect 150 passed
```

| file | what it covers | count |
|---|---|---|
| `test_ontology.py` | classes.py, source_map.py, provenance.py — class sets, source mapping, provenance schema, leakage key, to_record enforcement, RED/shippable lineage audit, data-reality flags | 18 |
| `test_class_consistency.py` | v0 (config.py) ↔ v1 (ontology/classes.py) drift guard — ensures synthgen class list and the migration map stay in sync | 5 |
| `test_leakage_split.py` | pHash LSH clustering (tag/width isolation, near-duplicate merge, no false negatives), assign_splits (normalized-deficit, no empty splits, determinism, stratification, input validation), audit_split (leak detection) | 12 |
| `test_metrics_v2.py` | AABB IoU, polygon IoU, corner error (optimal, order-invariant), page coverage, size buckets (abs + relative), match_detections (greedy, duplicate FP, FN), evaluate_detections (unified matching, confusion diagonal==tp, FP/page, ignore masking, relative buckets), AP, cluster-bootstrap CI, gate() verdict | 54 |
| `test_eval_v2.py` | eval_v2 pure logic: YOLO label IO, prediction→record, condition/canonical-doc parsing, domain bucket mapping, group-key plumbing/priority, per-image scoring, cluster aggregation, slice recall, cluster CI wider than Wilson on correlated data | 40 |
| `test_synthgen.py` | synthgen pipeline: classes/boxes within frame, YOLO label validity, category workers, manifest integrity, augmentation chains | 21 |

**Hard rule:** the gate of record (`eval_v2.py`) returns exit code 1 when the
model fails its floors. The test suite confirms the instrument measures correctly.
If any test fails, do not continue to training.
