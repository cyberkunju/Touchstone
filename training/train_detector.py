"""
Train the YOLOv11n document-primitive detector (docdet-v0).

Run on the GPU box AFTER generating the dataset. Mirrors the commands in
docs/10_DATA_AND_TRAINING/TRAIN_YOLOV11N.md (smoke -> baseline -> tuned) but
wraps them so version/class metadata is recorded with the run.

    pip install ultralytics onnx onnxruntime   # + matching torch CUDA build
    python train_detector.py --data datasets/docdet_v0/dataset.yaml --mode baseline

Modes:
    smoke    3 epochs, batch 8  (verify the pipeline)
    baseline 100 epochs, imgsz 640, batch 16
    small    150 epochs, imgsz 960 (small-object recall: qr/checkbox/mrz)
"""
from __future__ import annotations

import argparse
import json
import os
import time

from synthgen.config import CLASS_VERSION

_PRESETS = {
    "smoke": dict(epochs=3, imgsz=640, batch=8, patience=0),
    "baseline": dict(epochs=100, imgsz=640, batch=16, patience=20),
    "small": dict(epochs=150, imgsz=960, batch=8, patience=30),
}


def main() -> int:
    p = argparse.ArgumentParser(description="Train YOLOv11n docdet")
    p.add_argument("--data", required=True, help="dataset.yaml path")
    p.add_argument("--mode", choices=list(_PRESETS), default="baseline")
    p.add_argument("--model", default="yolo11n.pt", help="base weights")
    p.add_argument("--project", default="training_runs")
    p.add_argument("--name", default=None)
    p.add_argument("--device", default=None, help="e.g. 0 or 0,1 or cpu")
    p.add_argument("--resume", action="store_true")
    args = p.parse_args()

    try:
        from ultralytics import YOLO
    except ImportError:
        print("ERROR: pip install ultralytics (and a CUDA torch build) on the GPU box.")
        return 2

    cfg = _PRESETS[args.mode]
    name = args.name or f"docdet_{CLASS_VERSION}_{args.mode}"
    model = YOLO(args.model)

    t0 = time.time()
    results = model.train(
        data=args.data,
        epochs=cfg["epochs"],
        imgsz=cfg["imgsz"],
        batch=cfg["batch"],
        patience=cfg["patience"],
        project=args.project,
        name=name,
        device=args.device,
        resume=args.resume,
        # Reproducibility: fixed seed + deterministic kernels (matches modal_train.py).
        seed=0,
        deterministic=True,
        # Document-appropriate augmentation. We already bake heavy capture
        # degradation into the synthetic data, so keep YOLO's photometric jitter
        # modest and tune the recipe for small/critical primitives. Kept in lockstep
        # with modal_train.py's train() so local and cloud runs match.
        fliplr=0.0,            # no horizontal flip — directional primitives (MRZ/text)
        flipud=0.0,            # no vertical flip — same reason
        erasing=0.0,           # default 0.4 erases tiny critical primitives (checkbox/qr/mrz)
        multi_scale=True,      # scale robustness aids small-object recall
        mosaic=1.0,            # mosaic on for context variety...
        close_mosaic=10,       # ...but disabled for the last 10 epochs to settle boxes
        copy_paste=0.1,        # modest paste aug to enrich rare primitives
        cos_lr=True,           # cosine LR decay for cleaner final convergence
        degrees=5.0,           # small rotation only — sane for scanned docs
        perspective=0.0005,    # tiny perspective — sane doc-scan jitter
        hsv_h=0.01,
        hsv_s=0.4,
        hsv_v=0.4,
    )

    run_dir = os.path.join(args.project, name)
    meta = {
        "classVersion": CLASS_VERSION,
        "baseModel": args.model,
        "mode": args.mode,
        "config": cfg,
        "data": os.path.abspath(args.data),
        "trainedSeconds": round(time.time() - t0, 1),
        "trainedAt": int(time.time()),
    }
    os.makedirs(run_dir, exist_ok=True)
    with open(os.path.join(run_dir, "docdet_meta.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2)
    print(f"Training complete -> {run_dir} (best.pt under weights/)")
    print(f"Metrics: {getattr(results, 'results_dict', {})}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
