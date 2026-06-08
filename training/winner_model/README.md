# `winner_model/` — docdet-v0 snapshot (SUPERSEDED)

The original single 12-class detector that won the v0 Modal run (baseline @640).
Kept here (rather than under `models/docdet-v0/`) because existing commands and
docs reference `winner_model/best.pt` directly — moving it would break them.

**Status: superseded by the docdet-v1 staged topology** (see
`../DATA_PIPELINE_V2_MASTER_PLAN.md`). Its honest REAL result on MIDV-500 is
document_page recall ≈0.38 (cluster-CI ≈[0.30, 0.48]) — the number Engine A
(Phase 2) must move. It remains the baseline the new gate (`benchmarks/eval_v2.py`)
is validated against.

Contents: `best.pt`, `model.onnx`, `classes.json` (v0 12-class), `metadata.json`,
`metrics.json`, `pre/postprocessing.json`.
