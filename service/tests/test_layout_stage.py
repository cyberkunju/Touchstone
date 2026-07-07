"""Layout decode goldens — synthetic tensors with hand-computed mappings
(the browser suite's twin: same math, same edge laws)."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from stages.layout_stage import (  # noqa: E402
    Letterbox,
    compute_letterbox,
    letterbox_image,
    post_process_layout,
)

CLASSES = ["text", "table", "seal"]


def _tensor(anchors: list[dict], num_classes: int = 3, n_anchors: int = 8) -> np.ndarray:
    t = np.zeros((4 + num_classes, n_anchors), dtype=np.float32)
    for a in anchors:
        col = a["col"]
        t[0, col], t[1, col], t[2, col], t[3, col] = a["cx"], a["cy"], a["w"], a["h"]
        t[4 + a["cls"], col] = a["score"]
    return t


def test_letterbox_math_twin():
    lb = compute_letterbox(2000, 1000, 640)
    assert lb.scale == 640 / 2000
    assert lb.pad_x == 0
    assert lb.pad_y == (640 - 1000 * lb.scale) / 2
    degenerate = compute_letterbox(0, 100, 640)
    assert degenerate.scale == 1.0 and degenerate.pad_x == 0


def test_box_maps_back_exactly_through_letterbox():
    src_w, src_h = 2000, 1000
    lb = compute_letterbox(src_w, src_h, 640)
    # A box that should land at exactly (0.25..0.75, 0.2..0.8) of the source:
    # source px (500,200)-(1500,800) -> model = src*scale + pad.
    x1m = 500 * lb.scale + lb.pad_x
    y1m = 200 * lb.scale + lb.pad_y
    x2m = 1500 * lb.scale + lb.pad_x
    y2m = 800 * lb.scale + lb.pad_y
    t = _tensor([{
        "col": 2, "cx": (x1m + x2m) / 2, "cy": (y1m + y2m) / 2,
        "w": x2m - x1m, "h": y2m - y1m, "cls": 1, "score": 0.9,
    }])
    dets = post_process_layout(t, CLASSES, lb, src_w, src_h)
    assert len(dets) == 1
    d = dets[0]
    assert d.class_name == "table"
    assert d.box == pytest.approx((0.25, 0.2, 0.75, 0.8), abs=1e-6)


def test_confidence_threshold_filters():
    lb = Letterbox(scale=1, pad_x=0, pad_y=0, model_size=640)
    t = _tensor([
        {"col": 0, "cx": 100, "cy": 100, "w": 50, "h": 50, "cls": 0, "score": 0.30},
        {"col": 1, "cx": 300, "cy": 300, "w": 50, "h": 50, "cls": 0, "score": 0.90},
    ])
    dets = post_process_layout(t, CLASSES, lb, 640, 640, confidence_threshold=0.35)
    assert len(dets) == 1 and dets[0].score == pytest.approx(0.90)


def test_nms_suppresses_same_class_keeps_other_class():
    lb = Letterbox(scale=1, pad_x=0, pad_y=0, model_size=640)
    t = _tensor([
        {"col": 0, "cx": 100, "cy": 100, "w": 80, "h": 80, "cls": 0, "score": 0.95},
        {"col": 1, "cx": 104, "cy": 104, "w": 80, "h": 80, "cls": 0, "score": 0.70},  # dup
        {"col": 2, "cx": 104, "cy": 104, "w": 80, "h": 80, "cls": 2, "score": 0.60},  # other class
    ])
    dets = post_process_layout(t, CLASSES, lb, 640, 640, confidence_threshold=0.3)
    assert len(dets) == 2
    assert {d.class_name for d in dets} == {"text", "seal"}
    assert max(d.score for d in dets if d.class_name == "text") == pytest.approx(0.95)


def test_class_count_mismatch_is_loud():
    lb = Letterbox(scale=1, pad_x=0, pad_y=0, model_size=640)
    t = np.zeros((4 + 3, 4), dtype=np.float32)
    with pytest.raises(ValueError, match="mismatch"):
        post_process_layout(t, ["only", "two"], lb, 640, 640)


def test_boxes_clamped_to_unit_square():
    lb = Letterbox(scale=1, pad_x=0, pad_y=0, model_size=640)
    t = _tensor([{"col": 0, "cx": 5, "cy": 5, "w": 200, "h": 200, "cls": 0, "score": 0.9}])
    d = post_process_layout(t, CLASSES, lb, 640, 640)[0]
    assert d.box[0] == 0.0 and d.box[1] == 0.0


def test_letterbox_image_shape_and_padding():
    rgb = np.full((100, 400, 3), 200, dtype=np.uint8)
    tensor, lb = letterbox_image(rgb, 640)
    assert tensor.shape == (1, 3, 640, 640)
    assert tensor.dtype == np.float32
    assert 0.0 <= tensor.min() and tensor.max() <= 1.0
    # Vertical padding rows carry the gray fill (114/255).
    assert tensor[0, 0, 0, 320] == pytest.approx(114 / 255, abs=1e-6)
    assert lb.pad_y > 0 and lb.pad_x == 0
