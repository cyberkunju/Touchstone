# Model 2 — Primitive Detector (docdet-v1)

Runs on the **rectified page crop** from Model 1, so primitives occupy real
pixels (this is what dissolves the tiny-object problem). The heart of docdet.

- **Classes (10):** `photo, signature, stamp, seal, logo, qr_code, barcode,
  mrz_zone, table, checkbox` (ids per `ontology/classes.py::PRIMITIVE_CLASS_ID`).
  `document_page` → Model 1, `text_block` → Model 3 (both removed here).
- **Gated by:** per-class recall (cluster-CI lower bound) AND precision/FP-per-page,
  relative/object-scale size buckets, capture-condition slices. `seal`/`logo` are
  SYNTHETIC + EVAL-ONLY (no clean real source yet) — excluded from the hard gate.
- **Artifacts (when trained):** as in model1. Empty until Phase 3/4 produce it.
