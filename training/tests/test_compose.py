"""Tests for the Engine A compositor (synthgen/compose)."""
import os
import random
import sys

import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from synthgen.compose import bank as bank_mod  # noqa: E402
from synthgen.compose import blend as blend_mod  # noqa: E402
from synthgen.compose import place as place_mod  # noqa: E402
from synthgen.compose.compositor import compose_sample  # noqa: E402
from synthgen.core import Annotation, Sample, rect_polygon  # noqa: E402


def _make_bank(tmp_path, n=3):
    for i in range(n):
        arr = (np.random.default_rng(i).integers(0, 255, (120, 160, 3))).astype(np.uint8)
        Image.fromarray(arr, "RGB").save(tmp_path / f"bg{i}.jpg")
    return bank_mod.BackgroundBank(str(tmp_path))


# --- bank ------------------------------------------------------------------
def test_bank_scans_and_samples(tmp_path):
    b = _make_bank(tmp_path, 4)
    assert len(b) == 4 and b.available
    img = b.sample_canvas(random.Random(0), long_side=640)
    assert img.mode == "RGB"
    assert max(img.size) == 640  # long side scaled exactly


def test_bank_empty_fallback(tmp_path):
    b = bank_mod.BackgroundBank(str(tmp_path / "does_not_exist"))
    assert not b.available
    img = b.sample_canvas(random.Random(0), long_side=512)
    assert img.size == (512, 512)  # neutral gray fallback


def test_bank_deterministic(tmp_path):
    b = _make_bank(tmp_path, 5)
    a = b.sample_canvas(random.Random(7), 320)
    c = b.sample_canvas(random.Random(7), 320)
    assert np.array_equal(np.asarray(a), np.asarray(c))


# --- placement -------------------------------------------------------------
def test_placement_homography_maps_src_to_quad():
    rng = random.Random(0)
    dw, dh = 400, 600
    H, quad = place_mod.sample_placement(rng, (dw, dh), (1280, 960))
    assert H.shape == (3, 3) and quad.shape == (4, 2)
    src = np.array([[0, 0], [dw, 0], [dw, dh], [0, dh]], dtype=np.float64).reshape(-1, 1, 2)
    import cv2
    mapped = cv2.perspectiveTransform(src, H).reshape(-1, 2)
    assert np.allclose(mapped, quad, atol=1e-3)


def test_placement_scale_in_range_over_many_seeds():
    # the doc's longer side should mostly be 8%-95% of the canvas short side
    W, H = 1280, 960
    short = min(W, H)
    fracs = []
    for s in range(200):
        _, quad = place_mod.sample_placement(random.Random(s), (400, 600), (W, H))
        span = max(quad[:, 0].max() - quad[:, 0].min(),
                   quad[:, 1].max() - quad[:, 1].min())
        fracs.append(span / short)
    fracs = np.array(fracs)
    # generous bounds (perspective jitter widens spans); just ensure sane scale
    assert fracs.min() > 0.03 and fracs.max() < 1.8
    assert 0.15 < np.median(fracs) < 1.1


# --- blend -----------------------------------------------------------------
@pytest.mark.parametrize("mode", ["alpha", "hard", "poisson"])
def test_blend_modes_shape_preserved(mode):
    rng = random.Random(0)
    bg = np.full((200, 300, 3), 100, np.uint8)
    fg = np.full((200, 300, 3), 200, np.uint8)
    mask = np.zeros((200, 300), np.uint8)
    mask[50:150, 80:220] = 255
    out, used = blend_mod.blend(bg, fg, mask, rng, mode=mode)
    assert out.shape == bg.shape and out.dtype == np.uint8
    assert used in ("alpha", "hard", "poisson")


# --- compositor ------------------------------------------------------------
def _doc_sample():
    img = Image.new("RGB", (400, 600), (250, 250, 250))
    s = Sample(image=img, category="passport")
    # a full-frame document_page (should be DROPPED + replaced by placed quad)
    s.add(Annotation("document_page", rect_polygon(0, 0, 400, 600)))
    # a primitive that must be transformed
    s.add(Annotation("photo", rect_polygon(40, 40, 200, 240)))
    s.add(Annotation("mrz_zone", rect_polygon(20, 540, 380, 590)))
    return s


def test_compose_sample_produces_scene_with_placed_page(tmp_path):
    bank = _make_bank(tmp_path, 3)
    rng = random.Random(123)
    doc = _doc_sample()
    out = compose_sample(doc, bank, rng)
    # image is the composite canvas (not the 400x600 doc)
    assert out.image.size != (400, 600)
    # exactly one document_page, and it's the placed quad (first annotation)
    pages = [a for a in out.annotations if a.class_name == "document_page"]
    assert len(pages) == 1
    # primitives preserved (photo + mrz), transformed (polygon changed)
    names = sorted(a.class_name for a in out.annotations)
    assert names == ["document_page", "mrz_zone", "photo"]
    photo = next(a for a in out.annotations if a.class_name == "photo")
    assert not np.allclose(photo.polygon, rect_polygon(40, 40, 200, 240))
    assert "composited" in out.quality_tags
    assert "composited" in out.ground_truth


def test_compose_sample_labels_round_trip(tmp_path):
    # the composited sample must yield valid YOLO boxes via the existing labeler
    from synthgen import labels as lbl
    bank = _make_bank(tmp_path, 3)
    out = compose_sample(_doc_sample(), bank, random.Random(5))
    boxes = lbl.sample_to_yolo(out)
    # at least the document_page should survive as a normalized box in-frame
    assert any(b.class_id == 0 for b in boxes)  # document_page is class 0 (v0)
    for b in boxes:
        assert 0.0 <= b.xc <= 1.0 and 0.0 <= b.yc <= 1.0
        assert 0.0 < b.w <= 1.0 and 0.0 < b.h <= 1.0


def test_compose_deterministic(tmp_path):
    bank = _make_bank(tmp_path, 3)
    a = compose_sample(_doc_sample(), bank, random.Random(99))
    b = compose_sample(_doc_sample(), bank, random.Random(99))
    assert np.array_equal(np.asarray(a.image), np.asarray(b.image))
