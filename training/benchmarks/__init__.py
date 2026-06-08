"""
docdet benchmarks package — real evaluation gate + dataset normalizers.

Public surface (import these, not the internal helpers):

    from benchmarks.metrics_v2 import (
        evaluate_detections, average_precision_per_class, gate,
        cluster_bootstrap_recall_ci, wilson_interval, polygon_iou, iou_xyxy,
        size_bucket, SIZE_BUCKETS,
    )
    from benchmarks.leakage_split import assign_splits, audit_split, split_manifest
    from benchmarks.eval_v2 import evaluate      # the wired real gate
    from benchmarks.normalize_midv import normalize_midv500, normalize_midv2020
    from benchmarks.class_map import DOCDET_NAMES  # v0 legacy; prefer ontology.classes

See benchmarks/README.md for the full module map and CLI examples.
"""
