"""
Export a trained YOLOv11n docdet model to ONNX for ONNX Runtime Web, and
package it into the engine's model-artifact layout.

    python export_detector.py --weights training_runs/docdet_docdet-v0_baseline/weights/best.pt

Produces (under --out, default exports/yolov11n-docdet-v0/):
    model.onnx           opset-17, imgsz 640, simplified
    classes.json         the v0 class list (order == YOLO class ids)
    metadata.json        version + input/output contract
    preprocessing.json   letterbox + normalization contract
    postprocessing.json  output layout + NMS contract (matches src/ai-runtime/yolo.ts)

The JS postprocessor in src/ai-runtime/yolo.ts expects an attribute-major
tensor [4 + numClasses, numAnchors] and runs class-aware NMS itself, so we
export RAW predictions (nms=False).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil

from synthgen.config import CLASS_NAMES, CLASS_VERSION

MODEL_ID = f"yolov11n-docdet-{CLASS_VERSION.split('-')[-1]}"  # yolov11n-docdet-v0


def _sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _onnx_cpu_latency_ms(onnx_path: str, imgsz: int, runs: int = 8,
                         warmup: int = 2) -> float | None:
    """Mean single-image CPU inference latency (ms) at the model's imgsz.

    Deployment-aware signal for the latency-sensitive edge/browser target.
    Best-effort: returns None if onnxruntime can't load/run the model.
    """
    import time

    try:
        import numpy as np
        import onnxruntime as ort

        sess = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
        inp = sess.get_inputs()[0]
        shape = [d if isinstance(d, int) and d > 0 else 1 for d in inp.shape]
        if len(shape) == 4:
            shape = [1, shape[1] if shape[1] in (1, 3) else 3, imgsz, imgsz]
        dummy = np.random.rand(*shape).astype(np.float32)
        feed = {inp.name: dummy}
        for _ in range(max(0, warmup)):
            sess.run(None, feed)
        t0 = time.perf_counter()
        for _ in range(max(1, runs)):
            sess.run(None, feed)
        return round((time.perf_counter() - t0) / max(1, runs) * 1000.0, 2)
    except Exception as e:  # noqa: BLE001 - latency is advisory, never fatal
        print(f"WARN: latency measurement skipped: {e}")
        return None


def main() -> int:
    p = argparse.ArgumentParser(description="Export YOLOv11n docdet to ONNX")
    p.add_argument("--weights", required=True)
    p.add_argument("--imgsz", type=int, default=640)
    p.add_argument("--opset", type=int, default=17)
    p.add_argument("--out", default=f"exports/{MODEL_ID}")
    p.add_argument("--version", default="0.1.0")
    args = p.parse_args()

    try:
        from ultralytics import YOLO
    except ImportError:
        print("ERROR: pip install ultralytics onnx on the GPU/export box.")
        return 2

    os.makedirs(args.out, exist_ok=True)
    model = YOLO(args.weights)
    onnx_path = model.export(format="onnx", imgsz=args.imgsz, opset=args.opset,
                             simplify=True, nms=False, dynamic=False)
    dst_onnx = os.path.join(args.out, "model.onnx")
    shutil.copyfile(str(onnx_path), dst_onnx)

    with open(os.path.join(args.out, "classes.json"), "w", encoding="utf-8") as fh:
        json.dump(CLASS_NAMES, fh, indent=2)

    with open(os.path.join(args.out, "preprocessing.json"), "w", encoding="utf-8") as fh:
        json.dump({
            "inputName": "images",
            "imgsz": args.imgsz,
            "letterbox": True,
            "padValue": 114,
            "channelOrder": "RGB",
            "layout": "NCHW",
            "normalize": {"scale": 1 / 255.0, "mean": [0, 0, 0], "std": [1, 1, 1]},
        }, fh, indent=2)

    with open(os.path.join(args.out, "postprocessing.json"), "w", encoding="utf-8") as fh:
        json.dump({
            "outputLayout": "[4 + numClasses, numAnchors]",
            "numClasses": len(CLASS_NAMES),
            "boxFormat": "cxcywh_model_pixels",
            "nms": "class-aware, in JS (src/ai-runtime/yolo.ts)",
            "defaultConfThreshold": 0.25,
            "defaultIouThreshold": 0.5,
        }, fh, indent=2)

    meta = {
        "modelId": MODEL_ID,
        "modelVersion": f"{MODEL_ID}-{args.version}",
        "classVersion": CLASS_VERSION,
        "baseModel": "yolo11n.pt",
        "imgsz": args.imgsz,
        "opset": args.opset,
        "sha256": _sha256(dst_onnx),
        "executionProvider": "webgpu-then-wasm",
    }
    with open(os.path.join(args.out, "metadata.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2)

    # Deployment-aware latency signal at the model's imgsz (advisory).
    latency_ms = _onnx_cpu_latency_ms(dst_onnx, args.imgsz)
    with open(os.path.join(args.out, "metrics.json"), "w", encoding="utf-8") as fh:
        json.dump({"latencyMsCpu": latency_ms, "imgsz": args.imgsz}, fh, indent=2)

    print(f"Exported -> {args.out}")
    print(f"  model.onnx sha256={meta['sha256'][:16]}...")
    if latency_ms is not None:
        print(f"  CPU latency ~{latency_ms:.1f} ms @ imgsz {args.imgsz}")
    print("  Next: copy model.onnx into public/models/<modelId>/ and register it")
    print("        in src/ai-runtime/model-registry.ts (executionProvider 'wasm'/'webgpu').")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
