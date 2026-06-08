"""
Explicit category mappings from public datasets -> docdet-v0 class ids.

docdet-v0 stable ids (NEVER renumber — mirrors synthgen/config.py):
    0 document_page  1 photo        2 signature   3 stamp
    4 seal           5 logo         6 qr_code     7 barcode
    8 mrz_zone       9 table        10 checkbox   11 text_block

A mapping value of ``None`` means "no docdet equivalent — DROP this annotation".
Each table carries a per-entry rationale so reviewers can audit the decision
instead of trusting an opaque integer.

HONESTY NOTE (read this before trusting coverage):
    The real public datasets wired up here only give us *real labels* for a
    SUBSET of our 12 classes:
        - document_page (0)  <- MIDV doc quad
        - photo (1)          <- DocLayNet Picture (IMPERFECT, see caveat) + MIDV portrait field
        - mrz_zone (8)       <- MIDV MRZ field (when present)
        - table (9)          <- DocLayNet Table (+ optional PubTables-1M)
        - text_block (11)    <- DocLayNet text-like classes (+ optional FUNSD/XFUND)

    These docdet classes have NO real-label source in this benchmark set and
    therefore remain SYNTHETIC-ONLY validated (a known measurement gap):
        2 signature, 3 stamp, 4 seal, 5 logo, 6 qr_code, 7 barcode, 10 checkbox
    Do not claim real-world recall on those classes from this harness.
"""
from __future__ import annotations

from typing import Dict, Optional

# docdet-v0 ids (kept local so this module has ZERO heavy imports and always
# compiles even when synthgen / torch are not installed).
DOCDET_NAMES = [
    "document_page",  # 0
    "photo",          # 1
    "signature",      # 2
    "stamp",          # 3
    "seal",           # 4
    "logo",           # 5
    "qr_code",        # 6
    "barcode",        # 7
    "mrz_zone",       # 8
    "table",          # 9
    "checkbox",       # 10
    "text_block",     # 11
]
DOCDET_ID = {name: i for i, name in enumerate(DOCDET_NAMES)}

# Classes for which NO real-label source exists in this benchmark set.
# Surfaced in README + metrics so we never silently overclaim coverage.
SYNTHETIC_ONLY_CLASSES = [
    "signature", "stamp", "seal", "logo", "qr_code", "barcode", "checkbox",
]


# ---------------------------------------------------------------------------
# DocLayNet  (https://github.com/DS4SD/DocLayNet, CDLA-Permissive-1.0)
# 11 layout categories. COCO category *names* are the keys (robust to id drift
# between releases — DocLayNet category ids are 1-based and have shifted).
# ---------------------------------------------------------------------------
# Rationale per entry:
#   Table       -> table(9):     direct, high-quality real table boxes.
#   Picture     -> photo(1):     CAVEAT — DocLayNet "Picture" is any figure/
#                                 chart/diagram, NOT a portrait photo. Our
#                                 photo(1) is portrait-biased (IDs, headshots),
#                                 so this is an IMPERFECT proxy. Use it for
#                                 "is there a raster image region" recall, not
#                                 as proof of portrait detection. Documented in
#                                 README; can be disabled via DOCLAYNET_PICTURE_AS_PHOTO.
#   Text-like   -> text_block(11): Text, List-item, Caption, Section-header,
#                                 Title, Page-header, Page-footer all collapse
#                                 to our single text_block primitive.
#   Formula     -> text_block(11) by default (it is a text-ish region). Some
#                                 reviewers prefer to DROP it; flip via
#                                 DOCLAYNET_FORMULA below.
#   Footnote    -> text_block(11) — small text region, same primitive.
DOCLAYNET_PICTURE_AS_PHOTO = True   # set False to DROP Picture instead of photo(1)
DOCLAYNET_FORMULA_AS_TEXT = True    # set False to DROP Formula
DOCLAYNET_FOOTNOTE_AS_TEXT = True   # set False to DROP Footnote

DOCLAYNET_MAP: Dict[str, Optional[int]] = {
    "Caption":        DOCDET_ID["text_block"],   # caption text -> text_block
    "Footnote":       DOCDET_ID["text_block"] if DOCLAYNET_FOOTNOTE_AS_TEXT else None,
    "Formula":        DOCDET_ID["text_block"] if DOCLAYNET_FORMULA_AS_TEXT else None,
    "List-item":      DOCDET_ID["text_block"],   # list line group -> text_block
    "Page-header":    DOCDET_ID["text_block"],   # running header -> text_block
    "Page-footer":    DOCDET_ID["text_block"],   # running footer -> text_block
    "Picture":        DOCDET_ID["photo"] if DOCLAYNET_PICTURE_AS_PHOTO else None,
    "Section-header": DOCDET_ID["text_block"],   # heading -> text_block
    "Table":          DOCDET_ID["table"],        # direct, strong signal
    "Text":           DOCDET_ID["text_block"],   # body text -> text_block
    "Title":          DOCDET_ID["text_block"],   # doc title -> text_block
}


# ---------------------------------------------------------------------------
# MIDV-500 / MIDV-2020  (ID/passport documents in the wild)
#   MIDV-500: ftp://smartengines.com/midv-500  (research use)
#   MIDV-2020: http://l3i-share.univ-lr.fr / Smart Engines (research use)
# Annotations are document QUADs (+ per-field regions in MIDV-2020).
# We don't map COCO categories here; instead we map *field-name substrings*
# from MIDV's field annotations to docdet ids. The document quad itself always
# becomes document_page(0) (its axis-aligned bounding box).
# ---------------------------------------------------------------------------
# Rationale:
#   doc quad        -> document_page(0): the card/passport boundary == our page.
#   photo field     -> photo(1):         portrait region — this is the GOOD real
#                                          source for portrait photo recall.
#   mrz field       -> mrz_zone(8):       the machine-readable zone lines.
#   everything else (names, dates, numbers) -> None for now. They are real text
#                                          but MIDV field boxes are tight
#                                          single-field rects, not our
#                                          "meaningful text block" grouping, so
#                                          mapping them to text_block(11) would
#                                          fight the DocLayNet definition. DROP.
MIDV_DOC_QUAD_CLASS = DOCDET_ID["document_page"]

# Matched case-insensitively as substrings against MIDV field/zone names.
MIDV_FIELD_SUBSTR_MAP = {
    "photo":     DOCDET_ID["photo"],     # portrait region
    "face":      DOCDET_ID["photo"],     # some sets name it 'face'
    "portrait":  DOCDET_ID["photo"],
    "mrz":       DOCDET_ID["mrz_zone"],  # machine-readable zone
    "machine_readable": DOCDET_ID["mrz_zone"],
}


def map_midv_field(field_name: str) -> Optional[int]:
    """Return a docdet id for a MIDV field name, or None to drop.

    Substring + case-insensitive so it tolerates names like
    'photo', 'Photo', 'mrz', 'mrz_line1', 'face_photo', etc.
    """
    if not field_name:
        return None
    low = field_name.lower()
    for key, cid in MIDV_FIELD_SUBSTR_MAP.items():
        if key in low:
            return cid
    return None


# ---------------------------------------------------------------------------
# OPTIONAL / STUBBED sources (wire up later if needed).
# ---------------------------------------------------------------------------
# PubTables-1M (https://github.com/microsoft/table-transformer, CDLA-Permissive)
# A massive table-structure dataset. For docdet we only care about the table
# region itself, so every table-ish category collapses to table(9). Structure
# categories (rows/columns/cells) are DROPPED — docdet does not model them.
PUBTABLES_MAP: Dict[str, Optional[int]] = {
    "table":                 DOCDET_ID["table"],   # the region we want
    "table column":          None,                 # structure — not a docdet class
    "table row":             None,                 # structure — not a docdet class
    "table column header":   None,                 # structure — not a docdet class
    "table projected row header": None,            # structure — not a docdet class
    "table spanning cell":   None,                 # structure — not a docdet class
}

# FUNSD / XFUND (form understanding). Their entities (question/answer/header/
# other) are all text regions -> text_block(11). Linking/KV structure is dropped.
FUNSD_XFUND_MAP: Dict[str, Optional[int]] = {
    "question": DOCDET_ID["text_block"],
    "answer":   DOCDET_ID["text_block"],
    "header":   DOCDET_ID["text_block"],
    "other":    DOCDET_ID["text_block"],
}


def doclaynet_id_for(category_name: str) -> Optional[int]:
    """Look up a DocLayNet category name -> docdet id (None = drop)."""
    return DOCLAYNET_MAP.get(category_name, None)


def summary() -> dict:
    """Machine-readable summary of coverage (used by README + metrics.json)."""
    return {
        "docdetNames": DOCDET_NAMES,
        "syntheticOnlyClasses": SYNTHETIC_ONLY_CLASSES,
        "realLabelSources": {
            "document_page": ["MIDV doc quad"],
            "photo": ["DocLayNet Picture (imperfect)", "MIDV photo field"],
            "mrz_zone": ["MIDV mrz field"],
            "table": ["DocLayNet Table", "PubTables-1M (optional)"],
            "text_block": ["DocLayNet text-like", "FUNSD/XFUND (optional)"],
        },
        "sources": {
            "DocLayNet": DOCLAYNET_MAP,
            "MIDV_fields": MIDV_FIELD_SUBSTR_MAP,
            "PubTables1M": PUBTABLES_MAP,
            "FUNSD_XFUND": FUNSD_XFUND_MAP,
        },
    }


if __name__ == "__main__":
    import json
    print(json.dumps(summary(), indent=2))
