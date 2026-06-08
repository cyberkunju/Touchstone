"""
docdet-v1 class sets for the STAGED topology (see DATA_PIPELINE_V2_MASTER_PLAN.md
and ontology/CLASS_SPEC.md). This SUPERSEDES synthgen/config.py's single
12-class docdet-v0 list.

Three models, three class spaces:
  - Model 1 (page locator): document_page only, region + 4-corner quad.
  - Model 2 (primitive detector, runs on the rectified page crop): 10 in-page
    primitives. document_page and text_block are deliberately NOT here.
  - Model 3 (text detector, DBNet-style): text_line / text_region (own spec).

Class IDs within each model are STABLE — never renumber without a version bump
and dataset migration.
"""
from __future__ import annotations

CLASS_VERSION = "docdet-v1"

# --- Model 1: page locator -------------------------------------------------
PAGE_CLASS_NAMES: list[str] = [
    "document_page",  # 0  region + quad (boundary gated by polygon-IoU)
]
PAGE_CLASS_ID = {n: i for i, n in enumerate(PAGE_CLASS_NAMES)}

# --- Model 2: in-page primitive detector (on the rectified crop) -----------
# ORDER IS STABLE. (document_page -> Model 1; text_block -> Model 3: removed.)
PRIMITIVE_CLASS_NAMES: list[str] = [
    "photo",      # 0  portrait/photo region
    "signature",  # 1  handwritten signing mark
    "stamp",      # 2  inked impression
    "seal",       # 3  discrete applied non-ink seal device (classified by role,
                  #     NOT by relief — see CLASS_SPEC capture-invariant tree)
    "logo",       # 4  brand/org mark
    "qr_code",    # 5  2D matrix code (QR/DataMatrix/Aztec)
    "barcode",    # 6  1D / stacked-linear barcode
    "mrz_zone",   # 7  full MRZ band (all lines as one box)
    "table",      # 8  row x column structure (bordered or borderless)
    "checkbox",   # 9  selection control (checkbox/radio)
]
PRIMITIVE_CLASS_ID = {n: i for i, n in enumerate(PRIMITIVE_CLASS_NAMES)}

# --- Model 3: text detector (separate; ids owned by Model 3's spec) ---------
TEXT_CLASS_NAMES: list[str] = ["text_line", "text_region"]
TEXT_CLASS_ID = {n: i for i, n in enumerate(TEXT_CLASS_NAMES)}

# Per-class minimum shorter-side (pixels, in the model's working frame) below
# which an instance is marked ignore (excluded from loss AND recall denominator).
# Mirrors CLASS_SPEC.md. NOTE: absolute px is ambiguous because Model 2 runs on a
# variable-resolution rectified crop; prefer PRIMITIVE_MIN_SIDE_FRAC below.
PRIMITIVE_MIN_SIDE_PX = {
    "photo": 12, "signature": 12, "stamp": 12, "seal": 12, "logo": 12,
    "qr_code": 12, "barcode": 12, "mrz_zone": 8, "table": 16, "checkbox": 8,
}

# Resolution-INVARIANT min shorter-side, as a fraction of the working frame's
# short side. This is the authoritative ignore threshold (the absolute-px table
# is kept only for reference) because the rectified crop has no fixed resolution.
PRIMITIVE_MIN_SIDE_FRAC = {
    "photo": 0.015, "signature": 0.012, "stamp": 0.012, "seal": 0.012,
    "logo": 0.012, "qr_code": 0.012, "barcode": 0.012, "mrz_zone": 0.010,
    "table": 0.02, "checkbox": 0.010,
}

# Classes whose synthetic/auto labels MUST pass a semantic validator.
VALIDATED_CLASSES = {"qr_code", "barcode", "mrz_zone", "table"}

# DATA-REALITY FLAGS (from brutal review). These classes currently have NO
# license-clean real-data source mapped (see source_map.py), so they CANNOT be
# held to a real recall gate yet. They are trained synthetically and validated on
# real data only where it exists; they are EXCLUDED from the hard real-recall
# gate until a real source is added. Do not silently gate an unlabelable class.
SYNTHETIC_OR_EVAL_ONLY_CLASSES = {"seal", "logo"}

# Classes that need a dedicated content validator before any imported "real"
# label is trusted (e.g. photo: DocLayNet 'Picture' / PubLayNet 'figure' are
# largely charts/diagrams, NOT photos — they must pass a figure-vs-photo
# classifier first or they poison the class).
NEEDS_CONTENT_VALIDATOR = {"photo"}

# Classes eligible for the hard REAL recall gate (have real, in-distribution,
# license-usable data): everything except the synthetic/eval-only set.
REAL_GATED_CLASSES = [c for c in PRIMITIVE_CLASS_NAMES
                      if c not in SYNTHETIC_OR_EVAL_ONLY_CLASSES]

# The hardest confusion group (drives targeted QA + a confusion matrix gate).
CONFUSION_GROUP = ("stamp", "seal", "logo", "signature")

# Default per-class deploy thresholds + NMS IoU are NOT hardcoded here; they are
# CALIBRATED ON REAL VALIDATION in Phase 7 and written to metadata at export.

# docdet-v0 -> docdet-v1 migration notes (for dataset/runtime migration):
#   - v0 id 0  document_page -> Model 1 (own model)
#   - v0 id 11 text_block    -> Model 3 (deleted from primitive set)
#   - remaining v0 ids 1..10 -> Model 2, renumbered 0..9 per PRIMITIVE_CLASS_ID
V0_TO_V1_PRIMITIVE = {
    # v0 name -> (model, v1 id) ; document_page/text_block handled separately
    "photo": ("model2", 0), "signature": ("model2", 1), "stamp": ("model2", 2),
    "seal": ("model2", 3), "logo": ("model2", 4), "qr_code": ("model2", 5),
    "barcode": ("model2", 6), "mrz_zone": ("model2", 7), "table": ("model2", 8),
    "checkbox": ("model2", 9),
    "document_page": ("model1", 0),
    "text_block": ("model3", None),  # remapped to text detector; no v1 primitive id
}
