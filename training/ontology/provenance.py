"""
Per-annotation provenance schema + leakage-key utilities (master plan §9).

Provenance is tracked at THREE levels (image / annotation / render_variant)
because one composite frame can mix origins: a human-labeled DocLayNet crop, a
synthetic-exact MRZ, and an auto-labeled background negative. Per-image tagging
would erase that and is therefore insufficient.

The leakage key is the mechanism that makes eval splits leakage-free: splits are
made on `split_group_key` (canonical document / capture session / perceptual-hash
cluster / source video), NEVER on individual frames — MIDV-style video frames
otherwise leak across train/test and silently inflate the gate.
"""
from __future__ import annotations

import hashlib
from dataclasses import asdict, dataclass, field

# ---- Controlled vocabularies (master plan §9) -----------------------------
LICENSE_BUCKETS = {
    "permissive_commercial", "attribution_required", "noncommercial",
    "research_only", "unknown", "internal_first_party",
}
DOMAIN_BUCKETS = {
    "flatbed_scan", "clean_pdf", "phone_table", "phone_handheld",
    "phone_clutter", "low_light", "glossy_laminated_id", "receipt_crumpled",
    "form_handwritten", "screenshot", "book_magazine_confuser",
}
GENERATION_ENGINES = {
    "real", "compositor", "blenderproc", "symbolic_pdf", "diffusion_assisted",
    "autolabeled_real",
}
LABEL_ORIGINS = {
    "human", "teacher_consensus", "teacher_single", "validator_generated",
    "synthetic_exact", "weak_box",
}
VALIDATOR_STATUSES = {"passed", "failed", "not_applicable", "pending"}
QA_STATUSES = {"unreviewed", "audited_ok", "audited_fixed", "rejected", "targeted_pending"}


def _enum(value: str, allowed: set, field_name: str) -> str:
    if value not in allowed:
        raise ValueError(f"{field_name}={value!r} not in {sorted(allowed)}")
    return value


@dataclass
class ImageProvenance:
    image_id: str
    capture_session_id: str        # groups frames from one capture/video/session
    perceptual_hash: str           # pHash for near-duplicate clustering
    source_dataset: str
    domain_bucket: str
    license_bucket: str
    split_group_key: str = ""      # filled by compute_split_group_key()

    def validate(self) -> "ImageProvenance":
        _enum(self.domain_bucket, DOMAIN_BUCKETS, "domain_bucket")
        _enum(self.license_bucket, LICENSE_BUCKETS, "license_bucket")
        return self


@dataclass
class AnnotationProvenance:
    ann_id: str
    image_id: str
    label_origin: str
    generation_engine: str
    license_bucket: str
    domain_bucket: str
    source_asset_id: str = ""
    validator_status: str = "not_applicable"
    teacher_votes: dict = field(default_factory=dict)   # {teacher_name: class/score}
    qa_status: str = "unreviewed"

    def validate(self) -> "AnnotationProvenance":
        _enum(self.label_origin, LABEL_ORIGINS, "label_origin")
        _enum(self.generation_engine, GENERATION_ENGINES, "generation_engine")
        _enum(self.license_bucket, LICENSE_BUCKETS, "license_bucket")
        _enum(self.domain_bucket, DOMAIN_BUCKETS, "domain_bucket")
        _enum(self.validator_status, VALIDATOR_STATUSES, "validator_status")
        _enum(self.qa_status, QA_STATUSES, "qa_status")
        return self


@dataclass
class RenderVariantProvenance:
    """Links the artifact-invariance forks (same geometry/labels, different
    corruption stacks) so they never split across train/test."""
    variant_id: str
    parent_document_id: str
    corruption_stack_id: str
    artifact_invariance_group_id: str


def perceptual_hash(image) -> str:
    """Tagged, version-pinned perceptual hash for near-duplicate clustering.

    Returns ``"phash64:<16-hex>"`` — a 64-bit DCT pHash from imagehash. The tag
    pins the algorithm+width so the clusterer only ever compares commensurable
    hashes (it refuses to compare across tags/widths). imagehash is a HARD
    dependency on purpose: a silent average-hash fallback produced
    environment-dependent values (an image hashed before vs after installing
    imagehash got different strings), which silently broke dedup and let
    near-duplicates leak across splits. `image` is a PIL.Image or a path.
    """
    from PIL import Image
    try:
        import imagehash  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise ImportError(
            "perceptual_hash requires the 'imagehash' package (pinned for "
            "reproducible leakage-dedup). Install with: pip install imagehash"
        ) from exc
    img = image if hasattr(image, "convert") else Image.open(image)
    return f"phash64:{imagehash.phash(img.convert('RGB'))}"


def compute_split_group_key(
    *, canonical_document_id: str = "", capture_session_id: str = "",
    perceptual_hash_cluster_id: str = "", source_video_id: str = "",
    strict: bool = True,
) -> str:
    """Stable group key for leakage-free splitting.

    Precedence (most authoritative grouping first): canonical document id >
    capture session > perceptual-hash cluster > source video. The FIRST non-empty
    field defines the group, so all frames/variants of one logical document land
    in the same split. Never pass a per-frame id here.

    To prevent the silent footgun where a caller passes several fields and the
    lower-precedence ones are dropped without notice, ``strict=True`` (default)
    raises if more than one field is supplied. Pass ``strict=False`` only when
    you deliberately want the precedence behavior.
    """
    provided = [(name, v) for name, v in (
        ("canonical_document_id", canonical_document_id),
        ("capture_session_id", capture_session_id),
        ("perceptual_hash_cluster_id", perceptual_hash_cluster_id),
        ("source_video_id", source_video_id),
    ) if v]
    if not provided:
        raise ValueError("compute_split_group_key needs at least one grouping field")
    if strict and len(provided) > 1:
        raise ValueError(
            "compute_split_group_key received multiple grouping fields "
            f"({[n for n, _ in provided]}); only the highest-precedence would be "
            "used. Pass exactly one, or strict=False to accept precedence."
        )
    return hashlib.sha1(provided[0][1].encode("utf-8")).hexdigest()[:16]


def to_record(img: ImageProvenance, anns: list[AnnotationProvenance],
              variant: RenderVariantProvenance | None = None) -> dict:
    """Assemble a validated, JSON-serializable provenance record.

    Refuses to emit a record whose ``split_group_key`` is empty or equal to the
    ``image_id`` (a per-frame key disables leakage control silently). This is the
    enforcement point: every manifest writer must route through here.
    """
    img.validate()
    if not img.split_group_key:
        raise ValueError(
            f"image {img.image_id!r} has an empty split_group_key; populate it via "
            "compute_split_group_key(...) before writing a record (leakage control)"
        )
    if img.split_group_key == img.image_id:
        raise ValueError(
            f"image {img.image_id!r} split_group_key equals image_id; that is a "
            "per-frame key and defeats leakage-free splitting. Group by document/"
            "session/pHash-cluster instead."
        )
    rec = {"image": asdict(img),
           "annotations": [asdict(a.validate()) for a in anns]}
    if variant is not None:
        rec["render_variant"] = asdict(variant)
    return rec
