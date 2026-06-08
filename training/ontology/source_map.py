"""
Source-dataset ontology -> docdet-v1 class mapping (per CLASS_SPEC.md), with
license/data-class provenance and a lineage audit.

Every imported dataset speaks its own ontology. This module is the single,
reviewed translation layer into our staged class spaces. Each mapping carries:
  - target_model:      "model1" | "model2" | "model3" | None (drop/ignore)
  - target_class:      docdet-v1 class name (or None)
  - class_confidence:  how clean the CLASS mapping is (1.0 exact)
  - geometry:          "quad_native" | "aabb_derived" | "full_frame" | "box"
                       (geometry cleanliness is INDEPENDENT of class cleanliness;
                        an AABB->quad page is class-exact but geometry-fabricated)
  - needs_validator:   the label is NOT trustworthy until a content validator
                       passes (e.g. figure-vs-photo) — prevents label poisoning
  - note:              the rule / caveat

DROP vs UNKNOWN (fixing the prior silent-drop defect):
  - OUT_OF_SCOPE: a KNOWN source's label that is intentionally not a docdet class
    (confidence 1.0 — a deliberate decision).
  - UNKNOWN: an unrecognized source or label. ``map_label(..., strict=True)``
    RAISES on UNKNOWN so an unmapped dataset can never be silently discarded.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Mapping:
    target_model: str | None          # "model1" | "model2" | "model3" | None
    target_class: str | None
    class_confidence: float = 1.0
    geometry: str = "box"
    needs_validator: bool = False
    note: str = ""
    kind: str = "mapped"              # "mapped" | "out_of_scope" | "unknown"

    @property
    def confidence(self) -> float:    # back-compat alias
        return self.class_confidence


OUT_OF_SCOPE = Mapping(None, None, 1.0, note="known source, not a docdet class",
                       kind="out_of_scope")
UNKNOWN = Mapping(None, None, 0.0, note="unrecognized source/label", kind="unknown")

# ---- Source provenance buckets -------------------------------------------- #
# Research-only: benchmark / R&D only, never in a shippable training lineage.
RESEARCH_ONLY_SOURCES = {
    "midv500", "midv2019", "midv2020", "smartdoc", "sidtd",
    "tobacco800", "cedar", "gpds", "openlogo", "rest",
}
# Permissive / commercial-usable.
PERMISSIVE_SOURCES = {
    "doclaynet", "commonforms", "ddi100", "pubtables1m", "publaynet", "docbank",
    "barber",
}
# License not verified from a primary source — must be reviewed before shipping.
UNKNOWN_LICENSE_SOURCES = {"staver"}

# DATA-CLASS (governance §0.3). "red" = real personal identity/biometric/payment/
# medical capture: NEVER allowed in a training lineage. Public specimen/sample ID
# datasets (MIDV etc.) are NOT first-party real-person capture, so they are
# classed "identity_specimen" (research-only), distinct from RED first-party
# capture. The RED mechanism exists so first-party ID capture is hard-blocked.
RED_SOURCES: set = set()  # no current public source is RED; first-party ID capture would be
IDENTITY_SPECIMEN_SOURCES = {"midv500", "midv2019", "midv2020", "sidtd"}


def _norm(s: str) -> str:
    """Lowercase, strip, and unify separators so 'Choice Button',
    'choice_button', 'choice-button' all match."""
    return "".join(c if c.isalnum() else "_" for c in s.strip().lower()).strip("_")


def _n(s: str) -> str:
    return "_".join(p for p in _norm(s).split("_") if p)


DROP = OUT_OF_SCOPE  # back-compat


# source_dataset -> { normalized source_label -> Mapping }
SOURCE_MAPS: dict[str, dict[str, Mapping]] = {
    "doclaynet": {
        "page": Mapping("model1", "document_page", 0.9, geometry="full_frame",
                        note="DocLayNet has no Page label; full-frame quad -> use as NEG/eval only, not Model-1 corner training"),
        "picture": Mapping("model2", "photo", 0.4, needs_validator=True,
                           note="Picture is often a chart/figure; MUST pass figure-vs-photo validator (NEEDS_CONTENT_VALIDATOR)"),
        "table": Mapping("model2", "table", 1.0),
        "title": Mapping("model3", "text_region", 1.0),
        "text": Mapping("model3", "text_region", 1.0),
        "section_header": Mapping("model3", "text_region", 1.0),
        "list_item": Mapping("model3", "text_region", 1.0),
        "caption": Mapping("model3", "text_region", 1.0),
        "footnote": Mapping("model3", "text_region", 1.0),
        "page_header": Mapping("model3", "text_region", 1.0),
        "page_footer": Mapping("model3", "text_region", 1.0),
        "formula": OUT_OF_SCOPE,
    },
    "commonforms": {
        "choice_button": Mapping("model2", "checkbox", 1.0, note="checkbox+radio"),
        "signature": Mapping("model2", "signature", 0.95, note="form signature field"),
        "text_input": Mapping("model3", "text_region", 1.0),
    },
    "ddi100": {
        "stamp": Mapping("model2", "stamp", 0.7, needs_validator=True,
                         note="DDI stamp masks; seal/stamp disambiguation pass required"),
        "text": Mapping("model3", "text_region", 1.0),
    },
    "staver": {
        "stamp": Mapping("model2", "stamp", 0.7, needs_validator=True,
                         note="scanned invoice stamps; manual seal-vs-stamp review; license UNVERIFIED"),
    },
    "pubtables1m": {
        "table": Mapping("model2", "table", 1.0),
        "table_rotated": Mapping("model2", "table", 0.9, geometry="aabb_derived",
                                 note="rotated table; AABB on crop frame"),
    },
    "publaynet": {
        "text": Mapping("model3", "text_region", 1.0),
        "title": Mapping("model3", "text_region", 1.0),
        "list": Mapping("model3", "text_region", 1.0),
        "table": Mapping("model2", "table", 1.0),
        "figure": Mapping("model2", "photo", 0.2, needs_validator=True,
                          note="PubLayNet 'figure' is mostly charts/plots; MUST pass figure-vs-photo validator or it POISONS photo"),
    },
    "docbank": {
        "table": Mapping("model2", "table", 1.0),
        "figure": Mapping("model2", "photo", 0.2, needs_validator=True,
                          note="figure-vs-photo validator required"),
        "paragraph": Mapping("model3", "text_region", 1.0),
        "title": Mapping("model3", "text_region", 1.0),
        "list": Mapping("model3", "text_region", 1.0),
        "abstract": Mapping("model3", "text_region", 1.0),
    },
    "midv500": {
        "document": Mapping("model1", "document_page", 0.95, geometry="quad_native",
                            note="real doc quad (research-only / identity specimen)"),
        "photo": Mapping("model2", "photo", 0.9, note="ID face photo (research-only)"),
        "mrz": Mapping("model2", "mrz_zone", 0.9, note="MRZ band (research-only)"),
    },
    "midv2019": {
        "document": Mapping("model1", "document_page", 0.95, geometry="quad_native",
                            note="research-only; strong projective distortion + low light"),
        "photo": Mapping("model2", "photo", 0.9, note="research-only"),
        "mrz": Mapping("model2", "mrz_zone", 0.9, note="research-only"),
    },
    "midv2020": {
        "document": Mapping("model1", "document_page", 0.95, geometry="quad_native",
                            note="research-only"),
        "photo": Mapping("model2", "photo", 0.9, note="research-only"),
        "mrz": Mapping("model2", "mrz_zone", 0.9, note="research-only"),
    },
    "sidtd": {
        "document": Mapping("model1", "document_page", 0.9, geometry="quad_native",
                            note="MIDV2020 extension; research-only"),
    },
    "smartdoc": {
        "document": Mapping("model1", "document_page", 0.9, geometry="quad_native",
                            note="smartphone doc capture; research-only (CC-BY-SA for 2017 test)"),
    },
    "tobacco800": {
        "signature": Mapping("model2", "signature", 0.9, note="research-only"),
        "logo": Mapping("model2", "logo", 0.85, note="research-only; one of few real logo sources"),
    },
    "cedar": {
        "signature": Mapping("model2", "signature", 0.85,
                             note="signature appearance prior (research-only); not detector-native"),
    },
    "gpds": {
        "signature": Mapping("model2", "signature", 0.85,
                             note="signature appearance prior (research-only)"),
    },
    "openlogo": {
        "logo": Mapping("model2", "logo", 0.8, note="logo appearance prior (academic research only)"),
    },
    "barber": {
        "barcode": Mapping("model2", "barcode", 0.95, needs_validator=True,
                           note="BarBeR real barcodes; decode-validate (AGPL — eval/validator only)"),
        "qr": Mapping("model2", "qr_code", 0.95, needs_validator=True,
                      note="2D codes; decode-validate"),
        "qr_code": Mapping("model2", "qr_code", 0.95, needs_validator=True),
    },
}


def map_label(source_dataset: str, source_label: str, strict: bool = False) -> Mapping:
    """Translate a (dataset, label) pair to docdet-v1.

    Returns a Mapping. Distinguishes:
      * a real mapping (kind="mapped"),
      * an intentional OUT_OF_SCOPE for a KNOWN source's known label,
      * UNKNOWN for an unrecognized source OR an unrecognized label of a known
        source. With ``strict=True`` an UNKNOWN raises, so an unmapped dataset
        can never be silently discarded (the prior silent-drop defect).
    """
    ds = _n(source_dataset)
    lbl = _n(source_label)
    if ds not in SOURCE_MAPS:
        if strict:
            raise KeyError(f"unknown source dataset {source_dataset!r}; add it to SOURCE_MAPS")
        return UNKNOWN
    m = SOURCE_MAPS[ds].get(lbl)
    if m is None:
        if strict:
            raise KeyError(f"unknown label {source_label!r} for source {source_dataset!r}")
        return UNKNOWN
    return m


def is_research_only(source_dataset: str) -> bool:
    return _n(source_dataset) in RESEARCH_ONLY_SOURCES


def license_bucket_for(source_dataset: str) -> str:
    ds = _n(source_dataset)
    if ds in RESEARCH_ONLY_SOURCES:
        return "research_only"
    if ds in PERMISSIVE_SOURCES:
        return "permissive_commercial"
    if ds in UNKNOWN_LICENSE_SOURCES:
        return "unknown"
    return "unknown"


def data_class(source_dataset: str) -> str:
    """Governance data-class: 'red' | 'identity_specimen' | 'general'."""
    ds = _n(source_dataset)
    if ds in RED_SOURCES:
        return "red"
    if ds in IDENTITY_SPECIMEN_SOURCES:
        return "identity_specimen"
    return "general"


def audit_lineage(records, shippable: bool = False) -> dict:
    """Audit a list of provenance records (or dicts with image.source_dataset /
    image.license_bucket) for governance violations.

    Hard violations:
      * any RED-classed source present (never allowed, shippable or not),
      * for a SHIPPABLE lineage: any research_only / noncommercial license, or
        any identity_specimen source.

    Returns {"ok": bool, "violations": [ {source, reason} ... ]}.
    """
    violations = []
    for rec in records:
        img = rec.get("image", rec) if isinstance(rec, dict) else rec
        src = img.get("source_dataset", "") if isinstance(img, dict) else getattr(img, "source_dataset", "")
        lic = img.get("license_bucket", "") if isinstance(img, dict) else getattr(img, "license_bucket", "")
        dc = data_class(src)
        if dc == "red":
            violations.append({"source": src, "reason": "RED data class (real identity/biometric/payment/medical) is never permitted"})
            continue
        if shippable:
            if lic in {"research_only", "noncommercial"}:
                violations.append({"source": src, "reason": f"license_bucket={lic} not allowed in a shippable lineage"})
            elif dc == "identity_specimen":
                violations.append({"source": src, "reason": "identity_specimen source not allowed in a shippable lineage (use synthetic IDs)"})
    return {"ok": len(violations) == 0, "violations": violations}
