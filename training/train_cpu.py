"""
CPU-optimized YOLOv11n trainer for docdet — AMX-bf16 + channels_last + tuned threads.

WHY THIS EXISTS: ultralytics DISABLES mixed precision on CPU by design
(`check_amp()` returns False for device='cpu', and its `autocast()` helper
defaults to device='cuda'), so a plain `yolo train device=cpu` runs pure fp32
and leaves the Sapphire-Rapids AMX bf16 tile engine idle. This script injects a
CPU bf16 autocast + channels_last memory format + thread pinning to actually use
AMX, which (with channels_last) is the single biggest CPU-training lever
(~1.4-2.2x end-to-end on this hardware). bf16 needs NO GradScaler (8-bit
exponent == fp32, no overflow) and keeps fp32 master weights, so accuracy is
within run-noise of fp32.

Recipe defaults encode the Phase-2 pilot lesson: mosaic OFF (it hurt real
recall), light geometry, cosine LR, short warmup from the COCO-pretrained init.

Usage (on the c7i, from training/):
    # benchmark a few iters:
    ONEDNN_VERBOSE=1 .venv/bin/python train_cpu.py --data /tmp/noc/dataset.yaml \
        --epochs 1 --batch 16 --bench
    # real 2-stage run is driven by train_cpu_stage.sh
"""
from __future__ import annotations

import argparse
import os

# Thread/affinity MUST be set before torch/numpy import to take effect.
os.environ.setdefault("OMP_NUM_THREADS", "16")   # physical cores (not 32 vCPU; HT hurts conv)
os.environ.setdefault("OMP_PROC_BIND", "close")  # GNU-OMP portable pinning
os.environ.setdefault("OMP_PLACES", "cores")
os.environ.setdefault("KMP_AFFINITY", "granularity=fine,compact,1,0")  # honored if Intel OMP present
os.environ.setdefault("KMP_BLOCKTIME", "1")      # don't spin after parallel regions

import torch
import ultralytics.engine.trainer as trainer_mod
from ultralytics import YOLO


def enable_cpu_bf16_autocast() -> None:
    """Replace ultralytics' trainer-level autocast so the CPU path uses bf16.

    On GPU boxes we defer to the original (CUDA) autocast untouched. On CPU we
    return an ENABLED bf16 autocast context. `amp` stays False at the trainer, so
    GradScaler remains a disabled no-op (correct for bf16) and never touches CUDA.
    """
    _orig = trainer_mod.autocast

    def cpu_bf16_autocast(enabled=False, device="cuda"):
        if torch.cuda.is_available():
            return _orig(enabled, device)
        return torch.autocast(device_type="cpu", dtype=torch.bfloat16, enabled=True)

    trainer_mod.autocast = cpu_bf16_autocast


def _channels_last(trainer) -> None:
    """on_train_start callback: convert the model to NHWC for fast oneDNN conv."""
    try:
        trainer.model = trainer.model.to(memory_format=torch.channels_last)
        print("[train_cpu] model -> channels_last")
    except Exception as e:  # noqa: BLE001
        print(f"[train_cpu] channels_last skipped: {e}")


def main() -> None:
    ap = argparse.ArgumentParser(description="CPU-optimized docdet trainer")
    ap.add_argument("--data", required=True)
    ap.add_argument("--model", default="yolo11n.pt")
    ap.add_argument("--epochs", type=int, default=60)
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--nbs", type=int, default=64)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--threads", type=int, default=16)
    ap.add_argument("--cache", default="disk")     # 'disk' safe; 'ram' only fits at 512
    ap.add_argument("--freeze", type=int, default=None)
    ap.add_argument("--lr0", type=float, default=0.01)
    ap.add_argument("--lrf", type=float, default=0.01)
    ap.add_argument("--warmup", type=float, default=1.0)
    ap.add_argument("--patience", type=int, default=20)
    ap.add_argument("--name", default="docdet_cpu")
    ap.add_argument("--project", default="runs_cpu")
    ap.add_argument("--no-bf16", action="store_true", help="disable AMX bf16 (fp32 control)")
    ap.add_argument("--bench", action="store_true", help="tiny run for timing only")
    args = ap.parse_args()

    import cv2
    cv2.setNumThreads(0)  # stop OpenCV spawning a thread pool per dataloader worker
    torch.set_num_threads(args.threads)
    torch.set_num_interop_threads(1)
    torch.backends.mkldnn.enabled = True
    try:
        torch.set_float32_matmul_precision("high")
    except Exception:  # noqa: BLE001
        pass

    if not args.no_bf16:
        enable_cpu_bf16_autocast()
        print("[train_cpu] CPU bf16 autocast ENABLED (AMX)")
    else:
        print("[train_cpu] bf16 DISABLED (fp32 control)")

    model = YOLO(args.model)
    model.add_callback("on_train_start", _channels_last)

    epochs = 1 if args.bench else args.epochs
    model.train(
        data=args.data, epochs=epochs, imgsz=args.imgsz, batch=args.batch, nbs=args.nbs,
        device="cpu", workers=args.workers, cache=args.cache,
        amp=False,                              # our patch handles autocast; keep CUDA scaler off
        optimizer="SGD", cos_lr=True, lr0=args.lr0, lrf=args.lrf,
        warmup_epochs=args.warmup, patience=args.patience, freeze=args.freeze,
        # Phase-2 pilot recipe: mosaic OFF, light geometry, no flips up.
        mosaic=0.0, close_mosaic=0, mixup=0.0, cutmix=0.0, copy_paste=0.0,
        degrees=3.0, translate=0.06, scale=0.30, shear=0.0, perspective=0.0,
        hsv_h=0.015, hsv_s=0.5, hsv_v=0.4, fliplr=0.5, flipud=0.0,
        erasing=0.0, multi_scale=False,
        plots=False, save_period=-1,
        name=args.name, project=args.project, exist_ok=True, seed=0,
    )


if __name__ == "__main__":
    main()
