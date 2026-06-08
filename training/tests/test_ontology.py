"""Smoke + contract tests for the docdet-v1 ontology (Phase 0)."""
import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from ontology import classes, source_map, provenance  # noqa: E402


def test_primitive_set_excludes_page_and_text():
    assert "document_page" not in classes.PRIMITIVE_CLASS_NAMES
    assert "text_block" not in classes.PRIMITIVE_CLASS_NAMES
    assert len(classes.PRIMITIVE_CLASS_NAMES) == 10
    assert classes.PAGE_CLASS_NAMES == ["document_page"]


def test_primitive_ids_stable_and_contiguous():
    assert classes.PRIMITIVE_CLASS_ID["photo"] == 0
    assert classes.PRIMITIVE_CLASS_ID["checkbox"] == 9
    assert sorted(classes.PRIMITIVE_CLASS_ID.values()) == list(range(10))


def test_min_side_covers_all_primitives():
    assert set(classes.PRIMITIVE_MIN_SIDE_PX) == set(classes.PRIMITIVE_CLASS_NAMES)


def test_v0_to_v1_routes_page_and_text_out_of_primitives():
    assert classes.V0_TO_V1_PRIMITIVE["document_page"][0] == "model1"
    assert classes.V0_TO_V1_PRIMITIVE["text_block"][0] == "model3"
    assert classes.V0_TO_V1_PRIMITIVE["text_block"][1] is None


def test_source_map_text_goes_to_model3_not_primitive():
    m = source_map.map_label("doclaynet", "Text")
    assert m.target_model == "model3"
    assert m.target_class != "table"


def test_source_map_commonforms_checkbox_and_signature():
    assert source_map.map_label("commonforms", "choice_button").target_class == "checkbox"
    assert source_map.map_label("commonforms", "Signature").target_class == "signature"


def test_source_map_unknown_drops():
    m = source_map.map_label("doclaynet", "no_such_label")
    assert m.target_model is None and m.target_class is None


def test_research_only_flagging():
    assert source_map.is_research_only("midv500") is True
    assert source_map.is_research_only("doclaynet") is False
    assert source_map.license_bucket_for("midv2020") == "research_only"
    assert source_map.license_bucket_for("commonforms") == "permissive_commercial"


def test_provenance_enum_validation():
    with pytest.raises(ValueError):
        provenance.AnnotationProvenance(
            ann_id="a", image_id="i", label_origin="bogus",
            generation_engine="compositor", license_bucket="unknown",
            domain_bucket="phone_clutter",
        ).validate()


def test_split_group_key_precedence_and_stability():
    k1 = provenance.compute_split_group_key(canonical_document_id="doc-7")
    # passing >1 field now RAISES by default (silent-drop footgun fixed)...
    with pytest.raises(ValueError):
        provenance.compute_split_group_key(canonical_document_id="doc-7",
                                           capture_session_id="sess-Z")
    # ...unless precedence is explicitly accepted, where the top field wins.
    k2 = provenance.compute_split_group_key(canonical_document_id="doc-7",
                                            capture_session_id="sess-Z",
                                            strict=False)
    assert k1 == k2
    with pytest.raises(ValueError):
        provenance.compute_split_group_key()


def test_record_assembly_roundtrip():
    img = provenance.ImageProvenance(
        image_id="img1", capture_session_id="sess1", perceptual_hash="phash64:0",
        source_dataset="compositor", domain_bucket="phone_clutter",
        license_bucket="internal_first_party",
        split_group_key=provenance.compute_split_group_key(capture_session_id="sess1"),
    )
    ann = provenance.AnnotationProvenance(
        ann_id="ann1", image_id="img1", label_origin="synthetic_exact",
        generation_engine="compositor", license_bucket="internal_first_party",
        domain_bucket="phone_clutter", validator_status="passed",
    )
    rec = provenance.to_record(img, [ann])
    assert rec["annotations"][0]["label_origin"] == "synthetic_exact"
    assert "image" in rec


def test_to_record_rejects_empty_or_perframe_key():
    img_empty = provenance.ImageProvenance(
        image_id="i", capture_session_id="s", perceptual_hash="phash64:0",
        source_dataset="compositor", domain_bucket="phone_clutter",
        license_bucket="internal_first_party",  # split_group_key defaults ""
    )
    with pytest.raises(ValueError):
        provenance.to_record(img_empty, [])
    img_perframe = provenance.ImageProvenance(
        image_id="i", capture_session_id="s", perceptual_hash="phash64:0",
        source_dataset="compositor", domain_bucket="phone_clutter",
        license_bucket="internal_first_party", split_group_key="i",
    )
    with pytest.raises(ValueError):
        provenance.to_record(img_perframe, [])


def test_source_map_out_of_scope_vs_unknown():
    # known source + known non-class label -> intentional OUT_OF_SCOPE
    assert source_map.map_label("doclaynet", "formula").kind == "out_of_scope"
    # unknown label of a known source -> UNKNOWN (and strict raises)
    assert source_map.map_label("doclaynet", "no_such").kind == "unknown"
    with pytest.raises(KeyError):
        source_map.map_label("doclaynet", "no_such", strict=True)
    # entirely unknown source -> UNKNOWN (strict raises) — no silent drop
    assert source_map.map_label("mystery_ds", "page").kind == "unknown"
    with pytest.raises(KeyError):
        source_map.map_label("mystery_ds", "page", strict=True)


def test_source_map_photo_poisoning_flagged():
    # DocLayNet Picture / PubLayNet figure -> photo MUST be flagged needs_validator
    assert source_map.map_label("doclaynet", "picture").needs_validator is True
    assert source_map.map_label("publaynet", "figure").needs_validator is True


def test_source_map_geometry_tag_separates_class_from_geometry():
    midv = source_map.map_label("midv500", "document")
    dln = source_map.map_label("doclaynet", "page")
    assert midv.geometry == "quad_native"
    assert dln.geometry == "full_frame"  # honest: DocLayNet page is fabricated geometry


def test_previously_dropped_datasets_now_mapped():
    for ds in ("midv2019", "smartdoc", "sidtd", "cedar", "gpds", "docbank"):
        # each has at least one real mapping now (not a silent drop)
        assert any(m.kind == "mapped" for m in source_map.SOURCE_MAPS[ds].values())


def test_audit_lineage_blocks_research_only_when_shippable():
    recs = [{"image": {"source_dataset": "midv500", "license_bucket": "research_only"}},
            {"image": {"source_dataset": "doclaynet", "license_bucket": "permissive_commercial"}}]
    assert source_map.audit_lineage(recs, shippable=False)["ok"] is True
    audit = source_map.audit_lineage(recs, shippable=True)
    assert audit["ok"] is False
    assert any("midv500" == v["source"] for v in audit["violations"])


def test_data_reality_flags_present():
    assert "seal" in classes.SYNTHETIC_OR_EVAL_ONLY_CLASSES
    assert "logo" in classes.SYNTHETIC_OR_EVAL_ONLY_CLASSES
    assert "photo" in classes.NEEDS_CONTENT_VALIDATOR
    assert "seal" not in classes.REAL_GATED_CLASSES
    assert "checkbox" in classes.REAL_GATED_CLASSES
