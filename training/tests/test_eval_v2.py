"""Unit tests for benchmarks/eval_v2.py (the WIRED real gate).

Tests ONLY the pure logic — label reading, prediction->record adaptation,
slice/condition mapping, and split_group_key plumbing — with tiny synthetic
fixtures. The model is NEVER loaded here (no torch / ultralytics / best.pt).

Run with (cwd = training/):
    $env:PYTHONUTF8=1; $env:PYTHONIOENCODING="utf-8"; \
        python -m pytest tests/test_eval_v2.py -q
"""
import json
import os
import sys

import pytest

# Make benchmarks/ importable (mirrors test_metrics_v2.py convention).
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "benchmarks")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import eval_v2 as ev  # noqa: E402
import normalize_midv as nm  # noqa: E402
from ontology.provenance import compute_split_group_key  # noqa: E402


# ---------------------------------------------------------------------------
# YOLO label IO
# ---------------------------------------------------------------------------
def test_parse_yolo_label_text_skips_blank_and_malformed():
    text = "0 0.5 0.5 0.4 0.4\n\n  \nbogus line\n0 0.1 0.1 0.2 0.2 extra"
    rows = ev.parse_yolo_label_text(text)
    assert len(rows) == 2
    assert rows[0] == (0, 0.5, 0.5, 0.4, 0.4)
    assert rows[1][0] == 0


def test_yolo_to_xyxy_center_box():
    # full-frame centered box: xc=yc=0.5, w=h=1.0 on a 100x200 image.
    x1, y1, x2, y2 = ev.yolo_to_xyxy(0.5, 0.5, 1.0, 1.0, 100, 200)
    assert (x1, y1, x2, y2) == (0.0, 0.0, 100.0, 200.0)


def test_yolo_to_xyxy_quarter_box():
    x1, y1, x2, y2 = ev.yolo_to_xyxy(0.5, 0.5, 0.5, 0.5, 100, 100)
    assert (x1, y1, x2, y2) == (25.0, 25.0, 75.0, 75.0)


def test_read_gt_record_filters_to_document_page():
    text = "0 0.5 0.5 0.5 0.5\n9 0.5 0.5 0.1 0.1\n"
    rec = ev.read_gt_record(text, 100, 100, keep_class=0)
    assert rec["classes"] == [0]
    assert rec["boxes"] == [[25.0, 25.0, 75.0, 75.0]]


def test_read_gt_record_keep_all_classes():
    text = "0 0.5 0.5 0.5 0.5\n9 0.5 0.5 0.1 0.1\n"
    rec = ev.read_gt_record(text, 100, 100, keep_class=None)
    assert sorted(rec["classes"]) == [0, 9]


# ---------------------------------------------------------------------------
# prediction -> record adaptation
# ---------------------------------------------------------------------------
class _FakeTensor:
    """Minimal stand-in for a torch tensor: exposes .cpu() and .numpy()/.tolist()."""
    def __init__(self, data):
        self._data = data

    def cpu(self):
        return self

    def tolist(self):
        return self._data


def test_predictions_to_record_filters_class_and_conf():
    xyxy = [[0, 0, 10, 10], [1, 1, 2, 2], [5, 5, 6, 6]]
    classes = [0, 1, 0]
    scores = [0.9, 0.99, 0.10]
    rec = ev.predictions_to_record(xyxy, classes, scores, keep_class=0, conf=0.25)
    # class-1 dropped (wrong class), class-0 @0.10 dropped (below conf)
    assert rec["classes"] == [0]
    assert rec["scores"] == [0.9]
    assert rec["boxes"] == [[0.0, 0.0, 10.0, 10.0]]


def test_predictions_to_record_accepts_tensor_like():
    rec = ev.predictions_to_record(
        _FakeTensor([[0, 0, 4, 4]]), _FakeTensor([0]), _FakeTensor([0.8]),
        keep_class=0, conf=0.25,
    )
    assert rec["classes"] == [0]
    assert rec["boxes"] == [[0.0, 0.0, 4.0, 4.0]]


def test_predictions_to_record_empty():
    rec = ev.predictions_to_record([], [], [], keep_class=0, conf=0.25)
    assert rec == {"boxes": [], "classes": [], "scores": []}


# ---------------------------------------------------------------------------
# condition / canonical-doc parsing
# ---------------------------------------------------------------------------
def test_parse_midv500_source_path():
    doc, cond = ev.parse_midv500_source_path("midv500\\01_alb_id\\images\\CA\\CA01_01.tif")
    assert doc == "01_alb_id"
    assert cond == "CA"


def test_parse_midv500_source_path_forward_slashes():
    doc, cond = ev.parse_midv500_source_path("midv500/23_esp_id/images/TS/TS05_12.tif")
    assert doc == "23_esp_id"
    assert cond == "TS"


def test_parse_midv500_source_path_unrecognized():
    assert ev.parse_midv500_source_path("") == (None, None)
    assert ev.parse_midv500_source_path("foo/bar.tif") == (None, None)


def test_condition_from_name():
    assert ev.condition_from_name("01_alb_id_CA_CA01_01.tif") == "CA"
    assert ev.condition_from_name("23_esp_id_TS_TS05_12.tif") == "TS"


def test_canonical_doc_from_name():
    assert ev.canonical_doc_from_name("01_alb_id_CA_CA01_01.tif") == "01_alb_id"
    assert ev.canonical_doc_from_name("23_esp_id_TS_TS05_12.tif") == "23_esp_id"


# ---------------------------------------------------------------------------
# MIDV-500 condition -> domain bucket / meaning (normalize_midv helpers)
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("cond,bucket", [
    ("TA", "phone_table"), ("TS", "phone_table"),
    ("KA", "phone_table"), ("KS", "phone_table"),
    ("HA", "phone_handheld"), ("HS", "phone_handheld"),
    ("CA", "phone_clutter"), ("CS", "phone_clutter"),
    ("PA", "phone_clutter"), ("PS", "phone_clutter"),
])
def test_domain_bucket_mapping(cond, bucket):
    assert nm.midv500_domain_bucket(cond) == bucket
    assert nm.midv500_domain_bucket(cond.lower()) == bucket


def test_domain_bucket_unknown_defaults_to_clutter():
    assert nm.midv500_domain_bucket("ZZ") == "phone_clutter"


def test_condition_meaning():
    assert nm.midv500_condition_meaning("TA") == "table"
    assert nm.midv500_condition_meaning("HA") == "hand"
    assert nm.midv500_condition_meaning("CA") == "clutter"


# ---------------------------------------------------------------------------
# provenance index + image index (split_group_key plumbing)
# ---------------------------------------------------------------------------
def test_build_image_index_derives_group_key_from_source_path():
    manifest = [{"image": "01_alb_id_CA_CA01_01.tif",
                 "sourceImage": "midv500/01_alb_id/images/CA/CA01_01.tif"}]
    idx = ev.build_image_index(manifest, provenance_index={})
    entry = idx["01_alb_id_CA_CA01_01"]
    # the derived key MUST equal compute_split_group_key on the doc folder
    assert entry["split_group_key"] == compute_split_group_key(canonical_document_id="01_alb_id")
    assert entry["condition"] == "CA"
    assert entry["canonical_doc"] == "01_alb_id"
    assert entry["domain_bucket"] == "phone_clutter"


def test_build_image_index_frames_of_same_doc_share_key():
    manifest = [
        {"image": "01_alb_id_CA_CA01_01.tif",
         "sourceImage": "midv500/01_alb_id/images/CA/CA01_01.tif"},
        {"image": "01_alb_id_TS_TS01_07.tif",
         "sourceImage": "midv500/01_alb_id/images/TS/TS01_07.tif"},
        {"image": "02_aze_passport_HA_HA01_01.tif",
         "sourceImage": "midv500/02_aze_passport/images/HA/HA01_01.tif"},
    ]
    idx = ev.build_image_index(manifest, provenance_index={})
    k1 = idx["01_alb_id_CA_CA01_01"]["split_group_key"]
    k2 = idx["01_alb_id_TS_TS01_07"]["split_group_key"]
    k3 = idx["02_aze_passport_HA_HA01_01"]["split_group_key"]
    # same document => same key (no leakage); different document => different key
    assert k1 == k2
    assert k1 != k3


def test_build_image_index_provenance_takes_priority():
    manifest = [{"image": "01_alb_id_CA_CA01_01.tif",
                 "sourceImage": "midv500/01_alb_id/images/CA/CA01_01.tif",
                 "split_group_key": "manifest_key"}]
    prov = {"01_alb_id_CA_CA01_01": {"split_group_key": "prov_key",
                                     "condition": "CA", "domain_bucket": "phone_clutter"}}
    idx = ev.build_image_index(manifest, provenance_index=prov)
    assert idx["01_alb_id_CA_CA01_01"]["split_group_key"] == "prov_key"


def test_build_image_index_manifest_key_over_derived():
    manifest = [{"image": "01_alb_id_CA_CA01_01.tif",
                 "sourceImage": "midv500/01_alb_id/images/CA/CA01_01.tif",
                 "split_group_key": "manifest_key"}]
    idx = ev.build_image_index(manifest, provenance_index={})
    assert idx["01_alb_id_CA_CA01_01"]["split_group_key"] == "manifest_key"


def test_load_provenance_index_roundtrip(tmp_path):
    rec = {"image": {"image_id": "01_alb_id_CA_CA01_01",
                     "split_group_key": "abc123",
                     "capture_session_id": "01_alb_id/CA",
                     "domain_bucket": "phone_clutter"}}
    path = tmp_path / "provenance.jsonl"
    path.write_text(json.dumps(rec) + "\n", encoding="utf-8")
    idx = ev.load_provenance_index(str(path))
    assert idx["01_alb_id_CA_CA01_01"]["split_group_key"] == "abc123"
    assert idx["01_alb_id_CA_CA01_01"]["condition"] == "CA"
    assert idx["01_alb_id_CA_CA01_01"]["domain_bucket"] == "phone_clutter"


def test_load_provenance_index_missing_file_returns_empty():
    assert ev.load_provenance_index("does_not_exist.jsonl") == {}


# ---------------------------------------------------------------------------
# per-image document_page scoring
# ---------------------------------------------------------------------------
def test_score_image_document_page_hit():
    pred = {"boxes": [[0, 0, 100, 100]], "scores": [0.9]}
    gt = {"boxes": [[0, 0, 100, 100]], "classes": [0]}
    tp, total = ev.score_image_document_page(pred, gt, iou_thr=0.5, conf=0.25)
    assert (tp, total) == (1, 1)


def test_score_image_document_page_miss_low_iou():
    pred = {"boxes": [[0, 0, 10, 10]], "scores": [0.9]}
    gt = {"boxes": [[50, 50, 150, 150]], "classes": [0]}
    tp, total = ev.score_image_document_page(pred, gt, iou_thr=0.5, conf=0.25)
    assert (tp, total) == (0, 1)


def test_score_image_document_page_below_conf_is_miss():
    pred = {"boxes": [[0, 0, 100, 100]], "scores": [0.10]}
    gt = {"boxes": [[0, 0, 100, 100]], "classes": [0]}
    tp, total = ev.score_image_document_page(pred, gt, iou_thr=0.5, conf=0.25)
    assert (tp, total) == (0, 1)


def test_score_image_document_page_no_gt():
    pred = {"boxes": [[0, 0, 100, 100]], "scores": [0.9]}
    gt = {"boxes": [], "classes": []}
    assert ev.score_image_document_page(pred, gt) == (0, 0)


# ---------------------------------------------------------------------------
# cluster aggregation + slice recall
# ---------------------------------------------------------------------------
def test_cluster_counts_by_group():
    per_image = [
        ("docA", 1, 1), ("docA", 0, 1), ("docA", 1, 1),  # docA: 2/3
        ("docB", 1, 1),                                   # docB: 1/1
    ]
    counts = ev.cluster_counts_by_group(per_image)
    assert sorted(counts) == [(1, 1), (2, 3)]


def test_cluster_counts_handles_none_key():
    per_image = [(None, 1, 1), (None, 0, 1)]
    counts = ev.cluster_counts_by_group(per_image)
    assert counts == [(1, 2)]


def test_recall_by_tag():
    per_image = [("CA", 1, 1), ("CA", 0, 1), ("TS", 1, 1)]
    out = ev.recall_by_tag(per_image)
    assert out["CA"]["recall"] == pytest.approx(0.5)
    assert out["CA"]["images"] == 2
    assert out["TS"]["recall"] == pytest.approx(1.0)


def test_recall_by_tag_none_becomes_unknown():
    out = ev.recall_by_tag([(None, 1, 1)])
    assert "unknown" in out


# ---------------------------------------------------------------------------
# integration of pure pieces: cluster CI is WIDER than naive Wilson
# ---------------------------------------------------------------------------
def test_cluster_ci_wider_than_wilson_on_correlated_data():
    """With strong within-cluster correlation the cluster bootstrap CI must be
    wider than the naive per-frame Wilson interval (the whole point of the gate)."""
    import metrics_v2 as m
    # 10 documents, 20 frames each; each document is all-hit or all-miss
    # (maximally correlated). 5 hit docs, 5 miss docs => recall 0.5.
    per_image = []
    for d in range(10):
        hit = 1 if d < 5 else 0
        for _ in range(20):
            per_image.append((f"doc{d}", hit, 1))
    counts = ev.cluster_counts_by_group(per_image)
    cci = m.cluster_bootstrap_recall_ci(counts, n_boot=500, seed=0)
    total_tp = sum(tp for _, tp, _ in per_image)
    total = sum(n for _, _, n in per_image)
    wlo, whi = m.wilson_interval(total_tp, total)
    cluster_width = cci["high"] - cci["low"]
    wilson_width = whi - wlo
    assert cluster_width > wilson_width
