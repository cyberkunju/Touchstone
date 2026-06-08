"""Unit tests for benchmarks/metrics_v2.py.

Hand-constructed boxes / quads with known answers, run with:

    $env:PYTHONUTF8=1; $env:PYTHONIOENCODING="utf-8"; \
        python -m pytest tests/test_metrics_v2.py -q

(cwd = training/)
"""
import os
import sys

import numpy as np
import pytest

# Make benchmarks/ importable (mirrors test_ontology.py convention).
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "benchmarks")))

import metrics_v2 as m  # noqa: E402


# ---------------------------------------------------------------------------
# 1. AABB IoU
# ---------------------------------------------------------------------------
def test_iou_identical_boxes():
    box = [0, 0, 10, 10]
    assert m.iou_xyxy(box, box) == pytest.approx(1.0)


def test_iou_disjoint_boxes():
    assert m.iou_xyxy([0, 0, 10, 10], [20, 20, 30, 30]) == 0.0


def test_iou_half_overlap():
    # Two 10x10 boxes overlapping in a 5x10 region.
    # inter = 50, union = 100 + 100 - 50 = 150 -> 1/3.
    a = [0, 0, 10, 10]
    b = [5, 0, 15, 10]
    assert m.iou_xyxy(a, b) == pytest.approx(1.0 / 3.0)


def test_iou_matrix_shape_and_values():
    preds = [[0, 0, 10, 10], [20, 20, 30, 30]]
    gts = [[0, 0, 10, 10], [5, 0, 15, 10]]
    mat = m.iou_matrix(preds, gts)
    assert mat.shape == (2, 2)
    assert mat[0, 0] == pytest.approx(1.0)
    assert mat[0, 1] == pytest.approx(1.0 / 3.0)
    assert mat[1, 0] == 0.0


def test_iou_matrix_empty():
    assert m.iou_matrix([], [[0, 0, 1, 1]]).shape == (0, 1)
    assert m.iou_matrix([[0, 0, 1, 1]], []).shape == (1, 0)


# ---------------------------------------------------------------------------
# 2. Polygon IoU
# ---------------------------------------------------------------------------
def _square(x0, y0, side):
    return [(x0, y0), (x0 + side, y0), (x0 + side, y0 + side), (x0, y0 + side)]


def test_polygon_iou_identical():
    sq = _square(0, 0, 10)
    assert m.polygon_iou(sq, sq) == pytest.approx(1.0)


def test_polygon_iou_half_overlap():
    # Same as AABB half-overlap -> 1/3.
    a = _square(0, 0, 10)
    b = _square(5, 0, 10)
    assert m.polygon_iou(a, b) == pytest.approx(1.0 / 3.0)


def test_polygon_iou_disjoint():
    a = _square(0, 0, 10)
    b = _square(100, 100, 10)
    assert m.polygon_iou(a, b) == 0.0


def test_polygon_iou_tilted_quad():
    # A diamond (area 200 via shoelace: 2 * d^2 with d=10 -> 200) overlapping a
    # square. We just assert the value is a sane fraction in (0, 1) and matches a
    # direct shapely computation.
    from shapely.geometry import Polygon
    diamond = [(10, 0), (20, 10), (10, 20), (0, 10)]
    square = _square(0, 0, 10)
    got = m.polygon_iou(diamond, square)
    pa, pb = Polygon(diamond), Polygon(square)
    expected = pa.intersection(pb).area / (pa.area + pb.area - pa.intersection(pb).area)
    assert got == pytest.approx(expected)
    assert 0.0 < got < 1.0


def test_polygon_iou_self_intersecting_repaired():
    # A bowtie/self-intersecting quad should not raise; buffer(0) repairs it.
    bowtie = [(0, 0), (10, 10), (10, 0), (0, 10)]
    sq = _square(0, 0, 10)
    val = m.polygon_iou(bowtie, sq)
    assert 0.0 <= val <= 1.0


# ---------------------------------------------------------------------------
# 3. Corner error
# ---------------------------------------------------------------------------
def test_corner_error_zero_for_identical():
    q = _square(0, 0, 100)
    res = m.corner_error(q, q)
    assert res["mean"] == pytest.approx(0.0)
    assert res["max"] == pytest.approx(0.0)


def test_corner_error_shifted_raw_pixels():
    # Shift every corner by (3, 4) -> each corner off by 5 px. normalizer<=0
    # gives raw pixels.
    g = _square(0, 0, 100)
    p = [(x + 3, y + 4) for (x, y) in g]
    res = m.corner_error(p, g, normalizer=-1)
    assert res["mean"] == pytest.approx(5.0)
    assert res["max"] == pytest.approx(5.0)


def test_corner_error_order_invariant():
    # Same quad, but pred corners listed in a different (reversed) order.
    g = _square(0, 0, 100)
    p = list(reversed([(x + 3, y + 4) for (x, y) in g]))
    res = m.corner_error(p, g, normalizer=-1)
    assert res["mean"] == pytest.approx(5.0)


def test_corner_error_normalized_by_diagonal_default():
    # gt diagonal of a 100x100 square = sqrt(2)*100 ~= 141.42.
    g = _square(0, 0, 100)
    p = [(x + 3, y + 4) for (x, y) in g]
    res = m.corner_error(p, g)  # default normalizer = gt diagonal
    assert res["mean"] == pytest.approx(5.0 / (np.sqrt(2) * 100))


# ---------------------------------------------------------------------------
# 4. Page coverage
# ---------------------------------------------------------------------------
def test_page_coverage_full():
    gt = _square(0, 0, 10)
    pred = _square(-5, -5, 30)  # pred fully contains gt
    assert m.page_coverage(pred, gt) == pytest.approx(1.0)


def test_page_coverage_half():
    gt = _square(0, 0, 10)
    pred = _square(5, 0, 10)  # covers right half of gt
    assert m.page_coverage(pred, gt) == pytest.approx(0.5)


# ---------------------------------------------------------------------------
# 5. Size buckets
# ---------------------------------------------------------------------------
def test_size_bucket_boundaries():
    assert m.size_bucket(31 * 31) == "small"      # 961 < 1024
    assert m.size_bucket(50 * 50) == "medium"     # 2500 in [1024, 9216)
    assert m.size_bucket(200 * 200) == "large"    # 40000 >= 9216
    # exact boundaries
    assert m.size_bucket(32 * 32) == "medium"     # 1024 -> medium
    assert m.size_bucket(96 * 96) == "large"      # 9216 -> large


def test_bucketize_from_boxes():
    boxes = [
        [0, 0, 31, 31],     # small
        [0, 0, 50, 50],     # medium
        [0, 0, 200, 200],   # large
    ]
    buckets = m.bucketize(boxes)
    assert buckets["small"] == [0]
    assert buckets["medium"] == [1]
    assert buckets["large"] == [2]


def test_bucketize_from_areas():
    buckets = m.bucketize([31 * 31, 50 * 50, 200 * 200])
    assert buckets["small"] == [0]
    assert buckets["medium"] == [1]
    assert buckets["large"] == [2]


# ---------------------------------------------------------------------------
# 6. match_detections
# ---------------------------------------------------------------------------
def test_match_perfect():
    preds = [[0, 0, 10, 10], [20, 20, 30, 30]]
    gts = [[0, 0, 10, 10], [20, 20, 30, 30]]
    res = m.match_detections(preds, gts, iou_thr=0.5)
    assert len(res["tp"]) == 2
    assert res["fp"] == []
    assert res["fn"] == []


def test_match_duplicate_is_fp():
    # Two preds overlap a single gt; only one can match, the other is FP.
    preds = [[0, 0, 10, 10], [0, 0, 10, 10]]
    gts = [[0, 0, 10, 10]]
    res = m.match_detections(preds, gts, iou_thr=0.5)
    assert len(res["tp"]) == 1
    assert len(res["fp"]) == 1
    assert res["fn"] == []


def test_match_missed_gt_is_fn():
    preds = [[0, 0, 10, 10]]
    gts = [[0, 0, 10, 10], [50, 50, 60, 60]]
    res = m.match_detections(preds, gts, iou_thr=0.5)
    assert len(res["tp"]) == 1
    assert res["fp"] == []
    assert res["fn"] == [1]


def test_match_respects_class():
    # Overlapping boxes but different classes -> no match.
    preds = [[0, 0, 10, 10]]
    gts = [[0, 0, 10, 10]]
    res = m.match_detections(preds, gts, iou_thr=0.5,
                             pred_classes=[0], gt_classes=[1])
    assert res["tp"] == []
    assert res["fp"] == [0]
    assert res["fn"] == [0]


# ---------------------------------------------------------------------------
# 7. evaluate_detections
# ---------------------------------------------------------------------------
def test_evaluate_precision_recall_two_class():
    # Image 1: class 0 perfect hit, class 1 perfect hit.
    # Image 2: class 0 hit, class 1 missed (fn).
    img1_pred = {"boxes": [[0, 0, 10, 10], [20, 20, 30, 30]], "classes": [0, 1],
                 "scores": [0.9, 0.9]}
    img1_gt = {"boxes": [[0, 0, 10, 10], [20, 20, 30, 30]], "classes": [0, 1]}
    img2_pred = {"boxes": [[0, 0, 10, 10]], "classes": [0], "scores": [0.9]}
    img2_gt = {"boxes": [[0, 0, 10, 10], [40, 40, 50, 50]], "classes": [0, 1]}

    res = m.evaluate_detections([img1_pred, img2_pred], [img1_gt, img2_gt],
                                num_classes=2, iou_thr=0.5, conf=0.25)
    pc = res["per_class"]
    # class 0: 2 tp, 0 fp, 0 fn
    assert pc[0]["precision"] == pytest.approx(1.0)
    assert pc[0]["recall"] == pytest.approx(1.0)
    # class 1: 1 tp, 0 fp, 1 fn -> recall 0.5
    assert pc[1]["recall"] == pytest.approx(0.5)
    assert pc[1]["precision"] == pytest.approx(1.0)


def test_evaluate_fp_per_image():
    # One image, one gt, two preds for it -> 1 fp on 1 image -> FP/img = 1.0.
    img_pred = {"boxes": [[0, 0, 10, 10], [0, 0, 10, 10]], "classes": [0, 0],
                "scores": [0.9, 0.9]}
    img_gt = {"boxes": [[0, 0, 10, 10]], "classes": [0]}
    res = m.evaluate_detections([img_pred], [img_gt], num_classes=1)
    assert res["FP_per_image"] == pytest.approx(1.0)


def test_evaluate_confusion_matrix_class_confused():
    # gt is class 1, prediction (overlapping) is class 2 -> confusion[1, 2] == 1.
    img_pred = {"boxes": [[0, 0, 10, 10]], "classes": [2], "scores": [0.9]}
    img_gt = {"boxes": [[0, 0, 10, 10]], "classes": [1]}
    res = m.evaluate_detections([img_pred], [img_gt], num_classes=3)
    conf = res["confusion"]
    assert conf.shape == (4, 4)  # 3 classes + background
    assert conf[1, 2] == 1
    # No miss / false-alarm because they overlapped.
    bg = 3
    assert conf[1, bg] == 0
    assert conf[bg, 2] == 0


def test_evaluate_confusion_miss_and_false_alarm():
    # gt class 0 with no overlapping pred -> background col (miss).
    # pred class 1 with no overlapping gt -> background row (false alarm).
    img_pred = {"boxes": [[100, 100, 110, 110]], "classes": [1], "scores": [0.9]}
    img_gt = {"boxes": [[0, 0, 10, 10]], "classes": [0]}
    res = m.evaluate_detections([img_pred], [img_gt], num_classes=2)
    conf = res["confusion"]
    bg = 2
    assert conf[0, bg] == 1   # gt 0 missed
    assert conf[bg, 1] == 1   # pred 1 false alarm


def test_evaluate_conf_threshold_drops_low_score():
    # Low-confidence pred is dropped -> the gt becomes a miss (recall 0).
    img_pred = {"boxes": [[0, 0, 10, 10]], "classes": [0], "scores": [0.1]}
    img_gt = {"boxes": [[0, 0, 10, 10]], "classes": [0]}
    res = m.evaluate_detections([img_pred], [img_gt], num_classes=1, conf=0.25)
    assert res["per_class"][0]["recall"] == 0.0


# ---------------------------------------------------------------------------
# 8. Per-size-bucket recall
# ---------------------------------------------------------------------------
def test_recall_by_size_small_missed_large_hit():
    # gt small object (20x20 -> area 400 small) missed; large object (200x200) hit.
    img_pred = {"boxes": [[0, 0, 200, 200]], "classes": [0], "scores": [0.9]}
    img_gt = {"boxes": [[0, 0, 200, 200], [500, 500, 520, 520]], "classes": [0, 0]}
    res = m.evaluate_detections([img_pred], [img_gt], num_classes=1)
    rbs = res["recall_by_size"]
    assert rbs["large"]["recall"] == pytest.approx(1.0)
    assert rbs["small"]["recall"] == pytest.approx(0.0)
    assert rbs["small"]["total"] == 1
    assert rbs["large"]["total"] == 1


# ---------------------------------------------------------------------------
# 9. aggregate_by_slice
# ---------------------------------------------------------------------------
def test_aggregate_by_slice():
    per_image = [
        {"tp": 2, "fp": 0, "fn": 0},
        {"tp": 1, "fp": 1, "fn": 1},
        {"tp": 0, "fp": 0, "fn": 2},
    ]
    tags = ["clean", "clean", "blurred"]
    out = m.aggregate_by_slice(per_image, tags)
    # clean: tp=3, fp=1, fn=1 -> precision 0.75, recall 0.75
    assert out["clean"]["precision"] == pytest.approx(0.75)
    assert out["clean"]["recall"] == pytest.approx(0.75)
    assert out["clean"]["num_images"] == 2
    # blurred: tp=0, fn=2 -> recall 0
    assert out["blurred"]["recall"] == pytest.approx(0.0)


# ---------------------------------------------------------------------------
# 10. Wilson interval + recall_with_ci
# ---------------------------------------------------------------------------
def test_wilson_interval_mid_proportion():
    low, high = m.wilson_interval(5, 10)
    phat = 0.5
    assert 0.0 < low < phat < high < 1.0


def test_wilson_interval_zero_total():
    low, high = m.wilson_interval(0, 0)
    assert (low, high) == (0.0, 1.0)


def test_wilson_interval_all_success_clamped():
    low, high = m.wilson_interval(10, 10)
    assert high == pytest.approx(1.0)
    assert 0.0 < low < 1.0


def test_recall_with_ci():
    res = m.recall_with_ci(tp=8, fn=2)
    assert res["recall"] == pytest.approx(0.8)
    assert res["total"] == 10
    assert 0.0 < res["low"] < 0.8 < res["high"] < 1.0


def test_recall_with_ci_no_positives():
    res = m.recall_with_ci(tp=0, fn=0)
    assert res["recall"] == 0.0
    assert (res["low"], res["high"]) == (0.0, 1.0)


# ===========================================================================
# Regression tests for the brutal-review bug fixes
# ===========================================================================

def test_corner_error_optimal_not_greedy():
    # Adversarial quad where greedy nearest-corner inflated the error (~2.57x).
    gt = [[22.3, 9.1], [23.1, 29.1], [47.8, 32.1], [21.9, 30.6]]
    pred = [[21.8, 28.8], [11.9, 1.1], [2.3, 48.9], [44.3, 30.5]]
    res = m.corner_error(pred, gt, normalizer=0)
    # optimal mean is ~11.28; greedy gave ~28.93. Assert we are near optimal.
    assert res["mean"] == pytest.approx(11.2806, abs=0.05)


def test_wilson_rejects_successes_gt_total():
    with pytest.raises(ValueError):
        m.wilson_interval(5, 3)
    with pytest.raises(ValueError):
        m.wilson_interval(-2, 10)
    # still fine at the boundary
    assert m.wilson_interval(10, 10)[1] == pytest.approx(1.0)


def test_polygon_iou_nonfinite_returns_zero():
    bad = [[0, 0], [float("nan"), 0], [10, 10], [0, 10]]
    sq = _square(0, 0, 10)
    assert m.polygon_iou(bad, sq) == 0.0
    inf = [[0, 0], [float("inf"), 0], [10, 10], [0, 10]]
    assert m.polygon_iou(inf, sq) == 0.0


def test_evaluate_out_of_range_class_no_crash():
    # A stray class id (99) with num_classes=2 must not raise.
    res = m.evaluate_detections(
        [{"boxes": [[0, 0, 5, 5]], "classes": [99], "scores": [0.9]}],
        [{"boxes": [], "classes": []}], num_classes=2)
    assert res["per_class"][0]["fp"] == 0  # out-of-range pred ignored, not crash


def test_confusion_diagonal_equals_tp():
    # The unified matching guarantees confusion[c,c] == per_class[c]['tp'].
    img_pred = {"boxes": [[0, 0, 10, 10], [20, 20, 30, 30]], "classes": [0, 2],
                "scores": [0.9, 0.8]}
    img_gt = {"boxes": [[0, 0, 10, 10], [20, 20, 30, 30]], "classes": [0, 1]}
    res = m.evaluate_detections([img_pred], [img_gt], num_classes=3)
    conf = res["confusion"]
    for c in range(3):
        assert conf[c, c] == res["per_class"][c]["tp"]
    # gt class1 was predicted as class2 -> off-diagonal, and is fn for 1 + fp for 2
    assert conf[1, 2] == 1
    assert res["per_class"][1]["fn"] == 1
    assert res["per_class"][2]["fp"] == 1


def test_fp_per_image_equals_sum_per_class_fp():
    img_pred = {"boxes": [[0, 0, 10, 10], [0, 0, 10, 10], [99, 99, 105, 105]],
                "classes": [0, 0, 1], "scores": [0.9, 0.9, 0.9]}
    img_gt = {"boxes": [[0, 0, 10, 10]], "classes": [0]}
    res = m.evaluate_detections([img_pred], [img_gt], num_classes=2)
    total_fp = sum(res["per_class"][c]["fp"] for c in range(2))
    assert res["FP_per_image"] == pytest.approx(total_fp / res["num_images"])


def test_relative_size_buckets():
    # A 100x100 object in a 1000x1000 image = 1% area -> 'large' under relative
    # thresholds; tiny 10x10 = 0.01% -> 'small'.
    img_pred = {"boxes": [[0, 0, 100, 100]], "classes": [0], "scores": [0.9]}
    img_gt = {"boxes": [[0, 0, 100, 100], [0, 0, 10, 10]], "classes": [0, 0]}
    res = m.evaluate_detections([img_pred], [img_gt], num_classes=1,
                                size_mode="relative", size_ref=[1000 * 1000])
    assert res["recall_by_size"]["large"]["total"] == 1
    assert res["recall_by_size"]["small"]["total"] == 1
    assert res["recall_by_size"]["large"]["recall"] == pytest.approx(1.0)


def test_cluster_bootstrap_ci_wider_than_iid_when_correlated():
    # 20 clusters, each 10 frames, all-or-nothing per cluster (max correlation):
    # 14 clusters fully hit, 6 fully missed -> recall 0.7. Cluster bootstrap CI
    # must be much wider than the naive iid Wilson on 200 frames.
    clusters = [(10, 10)] * 14 + [(0, 10)] * 6
    cb = m.cluster_bootstrap_recall_ci(clusters, seed=1)
    assert cb["recall"] == pytest.approx(0.7, abs=1e-9)
    iid = m.wilson_interval(140, 200)
    cb_width = cb["high"] - cb["low"]
    iid_width = iid[1] - iid[0]
    assert cb_width > iid_width  # correlation widens the honest interval


def test_cluster_bootstrap_empty():
    cb = m.cluster_bootstrap_recall_ci([])
    assert cb["recall"] == 0.0 and (cb["low"], cb["high"]) == (0.0, 1.0)


# ===========================================================================
# Fix-list round 2: ignore masking, guards, AP, gate verdict
# ===========================================================================

def test_ignore_region_excludes_gt_and_pred():
    # gt0 at [0,0,10,10] is covered by an ignore_region; a pred there must NOT
    # count as TP/FP, and the gt must NOT count as FN. A separate real gt is hit.
    img_pred = {"boxes": [[0, 0, 10, 10], [50, 50, 60, 60]], "classes": [0, 0],
                "scores": [0.9, 0.9]}
    img_gt = {"boxes": [[0, 0, 10, 10], [50, 50, 60, 60]], "classes": [0, 0]}
    ignore = [[[0, 0], [10, 0], [10, 10], [0, 10]]]  # polygon over the first gt
    res = m.evaluate_detections([img_pred], [img_gt], num_classes=1,
                                images_ignore=[ignore])
    pc = res["per_class"][0]
    # only the second (real) gt counts: 1 tp, 0 fp, 0 fn
    assert pc["tp"] == 1 and pc["fp"] == 0 and pc["fn"] == 0
    assert res["FP_per_image"] == 0.0


def test_per_instance_ignore_flag():
    img_pred = {"boxes": [[0, 0, 10, 10]], "classes": [0], "scores": [0.9]}
    img_gt = {"boxes": [[0, 0, 10, 10]], "classes": [0], "ignore": [True]}
    res = m.evaluate_detections([img_pred], [img_gt], num_classes=1)
    pc = res["per_class"][0]
    # the only gt is ignored and the pred lands on it -> nothing counts
    assert pc["tp"] == 0 and pc["fp"] == 0 and pc["fn"] == 0


def test_cluster_bootstrap_nboot_zero_guarded():
    out = m.cluster_bootstrap_recall_ci([(3, 5), (2, 4)], n_boot=0)
    assert out["degenerate"] is True
    assert out["low"] == out["high"] == out["recall"]


def test_cluster_bootstrap_single_cluster_degenerate():
    out = m.cluster_bootstrap_recall_ci([(3, 5)], n_boot=1000)
    assert out["degenerate"] is True


def test_relative_size_ref_zero_raises():
    img_pred = {"boxes": [[0, 0, 100, 100]], "classes": [0], "scores": [0.9]}
    img_gt = {"boxes": [[0, 0, 100, 100]], "classes": [0]}
    with pytest.raises(ValueError):
        m.evaluate_detections([img_pred], [img_gt], num_classes=1,
                              size_mode="relative", size_ref=0)


def test_relative_size_ref_length_mismatch_raises():
    imgs = [{"boxes": [[0, 0, 10, 10]], "classes": [0], "scores": [0.9]}] * 2
    gts = [{"boxes": [[0, 0, 10, 10]], "classes": [0]}] * 2
    with pytest.raises(ValueError):
        m.evaluate_detections(imgs, gts, num_classes=1,
                              size_mode="relative", size_ref=[1000.0])  # len 1 != 2


def test_average_precision_perfect_and_partial():
    # class 0: one gt, one perfect high-score pred -> AP 1.0
    img_pred = {"boxes": [[0, 0, 10, 10]], "classes": [0], "scores": [0.9]}
    img_gt = {"boxes": [[0, 0, 10, 10]], "classes": [0]}
    ap = m.average_precision_per_class([img_pred], [img_gt], num_classes=1)
    assert ap[0]["ap"] == pytest.approx(1.0, abs=1e-6)
    assert ap["mAP"] == pytest.approx(1.0, abs=1e-6)


def test_average_precision_ignores_class_with_no_gt():
    # class 0: gt + matching pred -> AP 1.0; class 1: a pred but NO gt -> n_gt 0,
    # excluded from mAP (a class with no gt must not drag the mean).
    img_pred = {"boxes": [[0, 0, 10, 10], [50, 50, 60, 60]], "classes": [0, 1],
                "scores": [0.9, 0.9]}
    img_gt = {"boxes": [[0, 0, 10, 10]], "classes": [0]}
    ap = m.average_precision_per_class([img_pred], [img_gt], num_classes=2)
    assert ap[1]["n_gt"] == 0 and ap[1]["ap"] == 0.0
    assert ap[0]["ap"] == pytest.approx(1.0, abs=1e-6)
    assert ap["mAP"] == pytest.approx(1.0, abs=1e-6)  # only class 0 counts


def test_gate_passes_and_fails_on_precision():
    # high recall, low precision -> must FAIL when precision_floor is set
    res = {"per_class": {0: {"recall": 0.99, "precision": 0.40, "tp": 99, "fp": 148, "fn": 1}},
           "FP_per_image": 1.5}
    v_recall_only = m.gate(res, recall_floor=0.9, precision_floor=0.0, gated_class_ids=[0])
    assert v_recall_only["passed"] is True            # recall-only would pass it
    v_with_prec = m.gate(res, recall_floor=0.9, precision_floor=0.8, gated_class_ids=[0])
    assert v_with_prec["passed"] is False             # precision floor catches box-spraying


def test_gate_uses_cluster_ci_lower_and_blocks_degenerate():
    res = {"per_class": {0: {"recall": 0.92, "precision": 0.95, "tp": 92, "fp": 5, "fn": 8}},
           "FP_per_image": 0.05}
    good_ci = {"recall": 0.92, "low": 0.91, "high": 0.94, "degenerate": False}
    assert m.gate(res, recall_floor=0.9, gated_class_ids=[0], recall_ci=good_ci)["passed"]
    wide_ci = {"recall": 0.92, "low": 0.80, "high": 0.97, "degenerate": False}
    assert not m.gate(res, recall_floor=0.9, gated_class_ids=[0], recall_ci=wide_ci)["passed"]
    degen = {"recall": 0.92, "low": 0.92, "high": 0.92, "degenerate": True}
    assert not m.gate(res, recall_floor=0.9, gated_class_ids=[0], recall_ci=degen)["passed"]
