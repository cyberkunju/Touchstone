# Model 1 — Page Locator (docdet-v1)

Detects each `document_page` as a region **+ 4-corner quad** (for crop/dewarp).
Robust to small / tilted / cluttered / partially-clipped captures — this is the
model that must move the real MIDV recall off 0.38.

- **Classes:** `document_page` (1).
- **Gated by:** polygon-IoU, corner error, page coverage (Model-1 metrics in
  `benchmarks/metrics_v2.py`), recall on the cluster-bootstrap CI lower bound.
- **Artifacts (when trained):** `model.onnx`, `best.pt`, `classes.json`,
  `metadata.json`, `metrics_v2.json`. Empty until Phase 2 produces it.
