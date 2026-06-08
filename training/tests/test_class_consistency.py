"""
Guard against docdet-v0 (synthgen/config.py) <-> docdet-v1 (ontology) class drift.

The procedural generator still emits the legacy v0 12-class set; the target is
the v1 staged split. This test asserts the documented v0->v1 migration stays
internally consistent, so a change to either side is caught before it silently
poisons generation/labels.
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from ontology import classes  # noqa: E402
from synthgen import config  # noqa: E402


def test_v0_has_12_classes_including_text_block_and_page():
    assert len(config.CLASS_NAMES) == 12
    assert "text_block" in config.CLASS_NAMES
    assert "document_page" in config.CLASS_NAMES


def test_every_v0_class_has_a_v1_route():
    for name in config.CLASS_NAMES:
        assert name in classes.V0_TO_V1_PRIMITIVE, f"v0 class {name} has no v1 route"


def test_v1_primitive_route_matches_primitive_ids():
    # every v0 class routed to model2 must land at the right v1 primitive id
    for name, (model, vid) in classes.V0_TO_V1_PRIMITIVE.items():
        if model == "model2":
            assert classes.PRIMITIVE_CLASS_ID[name] == vid
        elif model == "model1":
            assert name == "document_page"
        elif model == "model3":
            assert name == "text_block" and vid is None


def test_primitive_set_is_v0_minus_page_and_text():
    expected = [c for c in config.CLASS_NAMES if c not in ("document_page", "text_block")]
    assert classes.PRIMITIVE_CLASS_NAMES == expected


def test_min_side_tables_cover_primitives_consistently():
    assert set(classes.PRIMITIVE_MIN_SIDE_PX) == set(classes.PRIMITIVE_CLASS_NAMES)
    assert set(classes.PRIMITIVE_MIN_SIDE_FRAC) == set(classes.PRIMITIVE_CLASS_NAMES)
