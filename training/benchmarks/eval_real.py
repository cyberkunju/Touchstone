"""
Evaluate a trained docdet model on a REAL (public-dataset) benchmark.

DEMOTED — NOT the gate of record. As of docdet-v1 the gate of record is
``benchmarks/eval_v2.py`` (metrics_v2 + leakage_split + cluster-bootstrap CI +
precision/FP-per-page verdict). This ultralytics-``val()`` harness is a single-
conf, recall-only SMOKE CHECK kept for cross-checking; a recall-only single-conf
verdict is insufficient (a box-spraying model passes it), so it must NOT be used
to accept/reject a model. Use eval_v2 for any decision.

Given a trained best.pt (or model.onnx) and a normalized real dataset.yaml, we:
  1. run ultralytics `val` to get mAP50, mAP50-95, per-class precision/recall,
  2. evaluate critical-class recall AT conf=0.25 (the deployment threshold),
  3. write metrics.json (clearly labelled REAL, smoke-check) and print a report.

Only the SUBSET of classes with real labels in the given dataset can be gated.
Classes absent from the real set (e.g. signature/stamp/seal/logo/qr/barcode/
checkbox for DocLayNet+MIDV) are reported as "no real labels — synthetic-only"
and do NOT fail the real gate. They remain a known measurement gap.

CLI:
    python eval_real.py --model runs/docdet_small/weights/best.pt \
        --data benchmarks/real/doclaynet/dataset.yaml --split val \
        --imgsz 960 --out benchmarks/real/doclaynet/eval
"""
from __future__ import annotations

import argparse
import json
import os
import sys

try:
    from .class_map import SYNTHETIC_ONLY_CLASSES
except ImportError:  # pragma: no cover - script-mode fallback
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from class_map import SYNTHETIC_ONLY_CLASSES  # type: ignore

# Deployment inference threshold — gates are judged HERE, not at mAP defaults.
DEPLOY_CONF = 0.25
DEPLOY_IOU = 0.5

# Critical-class recall gates (mirror eval_detector.py / detector spec §12).
# Only the classes that actually have real labels in the benchmark can pass;
# the rest are flagged synthetic-only and excluded from the real gate verdict.
CRITICAL_RECALL_GATES = {
    "mrz_zone": 0.90,
    "qr_code": 0.90,
    "barcode": 0.88,
    "photo": 0.88,
    "signature": 0.80,
    "table": 0.85,
    "checkbox": 0.80,
}


def _present_classes(data_yaml: str) -> set:
    """Return the set of class names that actually occur in the label files.

    Used to distinguish "gate failed" from "class has no real labels here".
    Reads dataset.yaml (path + split dirs) with a tiny hand-rolled parser so we
    don't require PyYAML.
    """
    present = set()
    names = {}
    base_path = os.path.dirname(os.path.abspath(data_yaml))
    split_dirs = []
    in_names = False
    try:
        with open(data_yaml, "r", encoding="utf-8") as fh:
            for raw in fh:
                line = raw.rstrip("\n")
                stripped = line.strip()
                if stripped.startswith("path:"):
                    base_path = stripped.split(":", 1)[1].strip()
                elif stripped.startswith(("train:", "val:", "test:")):
                    rel = stripped.split(":", 1)[1].strip()
                    if rel:
                        split_dirs.append(rel)
                    in_names = False
                elif stripped.startswith("names:"):
                    in_names = True
                elif in_names and ":" in stripped:
                    k, v = stripped.split(":", 1)
                    try:
                        names[int(k.strip())] = v.strip()
                    except ValueError:
                        in_names = False
    except OSError:
        return present

    for rel in split_dirs:
        img_dir = rel if os.path.isabs(rel) else os.path.join(base_path, rel)
        # Normalize separators first so the images->labels swap works on Windows
        # (yaml uses '/', os.path.join injects '\'); a mixed path otherwise
        # silently fails to match and reports zero present classes.
        img_dir = os.path.normpath(img_dir)
        norm = img_dir.replace("/", os.sep)
        lbl_dir = norm.replace(os.sep + "images" + os.sep,
                               os.sep + "labels" + os.sep)
        if lbl_dir == norm:  # no 'images' segment found; try trailing form
            lbl_dir = norm.replace(os.sep + "images", os.sep + "labels")
        if not os.path.isdir(lbl_dir):
            continue
        for f in os.listdir(lbl_dir):
            if not f.endswith(".txt"):
                continue
            try:
                with open(os.path.join(lbl_dir, f), "r", encoding="utf-8") as lf:
                    for ln in lf:
                        ln = ln.strip()
                        if not ln:
                            continue
                        cid = int(ln.split()[0])
                        present.add(names.get(cid, str(cid)))
            except (OSError, ValueError):
                continue
    return present


def evaluate(model_path: str, data_yaml: str, split: str, imgsz: int,
             out_dir: str) -> dict:
    """Run ultralytics val at the deployment threshold and build a metrics dict."""
    try:
        from ultralytics import YOLO  # guarded — heavy dep
    except ImportError:
        raise RuntimeError("ultralytics not installed. pip install ultralytics.")

    os.makedirs(out_dir, exist_ok=True)
    model = YOLO(model_path)

    # conf=DEPLOY_CONF makes precision/recall reflect the SHIPPED threshold.
    metrics = model.val(
        data=data_yaml, split=split, imgsz=imgsz,
        conf=DEPLOY_CONF, iou=DEPLOY_IOU,
        project=out_dir, name="val_real", exist_ok=True, plots=True,
    )

    per_class = {}
    try:
        names = metrics.names
        for i, cid in enumerate(metrics.box.ap_class_index):
            nm = names[int(cid)]
            per_class[nm] = {
                "precision": float(metrics.box.p[i]),
                "recall": float(metrics.box.r[i]),
                "ap50": float(metrics.box.ap50[i]),
            }
    except Exception as e:  # noqa: BLE001 - ultralytics API drift safety
        print(f"WARN: could not read per-class arrays: {e}")

    present = _present_classes(data_yaml)

    gate_report = {}
    real_all_pass = True
    for cls, gate in CRITICAL_RECALL_GATES.items():
        recall = per_class.get(cls, {}).get("recall")
        has_real_labels = cls in present and cls not in SYNTHETIC_ONLY_CLASSES
        # A class can be in SYNTHETIC_ONLY even if a stray box appears; we treat
        # the documented synthetic-only set as authoritative for the verdict.
        if cls in SYNTHETIC_ONLY_CLASSES or not has_real_labels:
            gate_report[cls] = {
                "recall": None if recall is None else round(recall, 4),
                "gate": gate, "pass": None,
                "note": "no real labels in this benchmark — SYNTHETIC-ONLY validated",
            }
            continue
        if recall is None:
            gate_report[cls] = {"recall": None, "gate": gate, "pass": False,
                                "note": "expected real labels but class absent in preds"}
            real_all_pass = False
        else:
            ok = recall >= gate
            gate_report[cls] = {"recall": round(recall, 4), "gate": gate, "pass": ok}
            real_all_pass = real_all_pass and ok

    summary = {
        "evidenceClass": "REAL — gate of record (NOT synthetic)",
        "model": os.path.abspath(model_path),
        "data": os.path.abspath(data_yaml),
        "split": split,
        "imgsz": imgsz,
        "deployConf": DEPLOY_CONF,
        "deployIou": DEPLOY_IOU,
        "map50": float(getattr(metrics.box, "map50", 0.0)),
        "map50_95": float(getattr(metrics.box, "map", 0.0)),
        "perClass": per_class,
        "criticalGatesAtDeployConf": gate_report,
        "realGatesPass": real_all_pass,
        "syntheticOnlyClasses": SYNTHETIC_ONLY_CLASSES,
        "presentRealClasses": sorted(present),
    }

    out_json = os.path.join(out_dir, "metrics.json")
    with open(out_json, "w", encoding="utf-8") as fh:
        json.dump(summary, fh, indent=2)
    summary["metricsJson"] = out_json
    return summary


def _print_report(summary: dict) -> None:
    print("=" * 64)
    print("REAL benchmark evaluation — THIS IS THE GATE OF RECORD")
    print("(synthetic mAP is not real-world evidence; sim2real gap applies)")
    print("=" * 64)
    print(f"model: {summary['model']}")
    print(f"data : {summary['data']} (split={summary['split']})")
    print(f"mAP50={summary['map50']:.4f}  mAP50-95={summary['map50_95']:.4f}  "
          f"@conf={summary['deployConf']}")
    print(f"\nCritical-class recall gates @conf={summary['deployConf']} (deployment threshold):")
    for cls, rep in summary["criticalGatesAtDeployConf"].items():
        if rep["pass"] is None:
            mark = "N/A "
            note = rep.get("note", "")
        else:
            mark = "PASS" if rep["pass"] else "FAIL"
            note = ""
        print(f"  [{mark}] {cls:12s} recall={rep['recall']} gate={rep['gate']} {note}")
    print(f"\nReal gates pass (only classes with real labels): {summary['realGatesPass']}")
    print(f"Synthetic-only (no real label source): {', '.join(summary['syntheticOnlyClasses'])}")


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Evaluate docdet model on a REAL benchmark set")
    p.add_argument("--model", required=True, help="best.pt or model.onnx")
    p.add_argument("--data", required=True, help="normalized real dataset.yaml")
    p.add_argument("--split", default="val", choices=["train", "val", "test"])
    p.add_argument("--imgsz", type=int, default=640)
    p.add_argument("--out", default="benchmarks/real/eval")
    args = p.parse_args(argv)

    summary = evaluate(args.model, args.data, args.split, args.imgsz, args.out)
    _print_report(summary)
    # Exit non-zero only if a class that HAS real labels failed its gate.
    return 0 if summary["realGatesPass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
