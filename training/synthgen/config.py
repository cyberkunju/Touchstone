"""
Detector class set (docdet-v0) and shared generation config.

MIGRATION NOTICE (docdet-v0 -> docdet-v1):
The authoritative class scheme is now `training/ontology/classes.py` (docdet-v1,
the STAGED topology: Model 1 page locator, Model 2 = 10 in-page primitives,
Model 3 = text). The 12-class list below is the LEGACY docdet-v0 scheme that the
current procedural generator still emits. It is retained ONLY so existing code
keeps running; it is NOT the target. Generation migrates to the v1 split in
Phase 2 (Engine A). The v0->v1 mapping is asserted by
`tests/test_class_consistency.py` so drift between the two is caught.

Under v1: `document_page` moves to Model 1, `text_block` moves to Model 3 (a
dedicated DBNet-style text detector) and is REMOVED from the primitive detector.
Do NOT add new v0 dependencies.

Class IDs are STABLE -- never renumber without a class-version bump and dataset
migration.
"""
from __future__ import annotations

# docdet-v0: stable id -> name. Order defines YOLO class_id.
CLASS_NAMES: list[str] = [
    "document_page",  # 0  full document/card/page boundary
    "photo",          # 1  portrait/photo region
    "signature",      # 2  handwritten/printed signature
    "stamp",          # 3  ink/rubber stamp
    "seal",           # 4  official/embossed seal
    "logo",           # 5  org/vendor logo
    "qr_code",        # 6  QR code
    "barcode",        # 7  1D barcode
    "mrz_zone",       # 8  machine-readable zone (all lines together)
    "table",          # 9  table region (headers + rows)
    "checkbox",       # 10 checkbox/radio control
    "text_block",     # 11 meaningful text block (label/value/line groups)
]

CLASS_ID = {name: i for i, name in enumerate(CLASS_NAMES)}
CLASS_VERSION = "docdet-v0"

# Canonical render canvas sizes per category (portrait docs vary widely;
# randomization in the generators adds further variety).
DEFAULT_BG_RGB = (245, 245, 242)

# Minimum normalized box side to keep a label (tiny boxes hurt training).
# Raised from 0.004 (~4px) — sub-12px boxes are noise for the detector and the
# old floor admitted slivers, especially once documents become sub-regions of a
# cluttered background (see backgrounds.py / categories.finalize_document).
MIN_BOX_SIDE_NORM = 0.012
