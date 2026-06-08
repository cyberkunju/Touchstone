"""
Evaluation harness for the docdet detector.

Computes mAP + per-class precision/recall on a (locked) split and checks the
critical-class recall gates from YOLOV11N_DOCUMENT_DETECTOR.md §12 / the plan's
§10. Emits a metrics.json and a human-readable gate report.

    python eval_detector.py --weights .../best.pt --data datasets/docdet_v0/dataset.yaml \
        --split test --out training_runs/eval_v0

Gate priority (plan §10): a false negative on a required object is bad; a false
positive that causes review is less bad; a false positive that causes a silent
wrong field is unacceptable. This harness reports recall on the critical
classes; the silent-error gate lives in the JS verifier benchmark.
"""
from __future__ import annotations

import argparse
import json
import os

from synthgen.config import CLASS_NAMES

# Minimum recall we want on safety-critical primitives before promotion.
CRITICAL_RECALL_GATES = {
    "mrz_zone": 0.90,
    "qr_code": 0.90,
    "barcode": 0.88,
    "photo": 0.88,
    "signature": 0.80,
    "table": 0.85,
    "checkbox": 0.80,
}


def main() -> int:
    p = argparse.ArgumentParser(description="Evaluate docdet detector + gates")
    p.add_argument("--weights", required=True)
    p.add_argument("--data", required=True)
    p.add_argument("--split", default="test", choices=["train", "val", "test"])
    p.add_argument("--imgsz", type=int, default=640)
    # Evaluate at the DEPLOYED operating point so the critical-class recall gates
    # reflect what production actually catches (it ships conf=0.25 / iou=0.5),
    # not ultralytics' internal max-F1 confidence.
    p.add_argument("--conf", type=float, default=0.25, help="deployment conf threshold")
    p.add_argument("--iou", type=float, default=0.5, help="deployment NMS IoU threshold")
    p.add_argument("--out", default="training_runs/eval")
    args = p.parse_args()

    try:
        from ultralytics import YOLO
    except ImportError:
        print("ERROR: pip install ultralytics on the eval box.")
        return 2

    os.makedirs(args.out, exist_ok=True)
    model = YOLO(args.weights)
    metrics = model.val(data=args.data, split=args.split, imgsz=args.imgsz,
                        conf=args.conf, iou=args.iou,
                        project=args.out, name="val", plots=True)

    # Per-class precision/recall (index aligned to CLASS_NAMES via metrics.names).
    per_class = {}
    try:
        names = metrics.names  # {id: name}
        p_arr = metrics.box.p     # precision per class
        r_arr = metrics.box.r     # recall per class
        ap50 = metrics.box.ap50
        for i, cid in enumerate(metrics.box.ap_class_index):
            nm = names[int(cid)]
            per_class[nm] = {
                "precision": float(p_arr[i]),
                "recall": float(r_arr[i]),
                "ap50": float(ap50[i]),
            }
    except Exception as e:  # noqa: BLE001 - ultralytics API drift safety
        print(f"WARN: could not read per-class arrays: {e}")

    summary = {
        "map50": float(getattr(metrics.box, "map50", 0.0)),
        "map50_95": float(getattr(metrics.box, "map", 0.0)),
        "split": args.split,
        "conf": args.conf,
        "iou": args.iou,
        "perClass": per_class,
    }

    # Gate evaluation.
    gate_report = {}
    all_pass = True
    for cls, gate in CRITICAL_RECALL_GATES.items():
        recall = per_class.get(cls, {}).get("recall")
        if recall is None:
            gate_report[cls] = {"recall": None, "gate": gate, "pass": False, "note": "class absent"}
            all_pass = False
        else:
            ok = recall >= gate
            gate_report[cls] = {"recall": round(recall, 4), "gate": gate, "pass": ok}
            all_pass = all_pass and ok
    summary["criticalGates"] = gate_report
    summary["allCriticalGatesPass"] = all_pass

    with open(os.path.join(args.out, "metrics.json"), "w", encoding="utf-8") as fh:
        json.dump(summary, fh, indent=2)

    print(f"mAP50={summary['map50']:.4f}  mAP50-95={summary['map50_95']:.4f}")
    print("Critical-class recall gates:")
    for cls, rep in gate_report.items():
        mark = "PASS" if rep["pass"] else "FAIL"
        print(f"  [{mark}] {cls:12s} recall={rep['recall']} gate={rep['gate']}")
    print(f"\nAll critical gates pass: {all_pass}")
    return 0 if all_pass else 1


if __name__ == "__main__":
    raise SystemExit(main())
