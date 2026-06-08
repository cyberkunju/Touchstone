"""
Diagnostic: break down REAL MIDV-500 document_page detection by CAPTURE
CONDITION, so we understand WHERE the sim2real gap lives.

MIDV-500 captures every document under several conditions (encoded in the
source path .../images/<COND>/<frame>.tif). Some conditions deliberately show
the document only PARTIALLY in frame (clipped / partial), which a detector
trained on full-frame synthetic docs is expected to miss. Splitting recall by
condition separates "model can't handle real photos" from "model can't detect a
document fragment that's half out of frame" — a very different story.

For each test image we compute, at the deployment threshold (conf>=0.25):
  - GT box (single document_page AABB from the YOLO label),
  - best IoU vs any predicted document_page box,
  - hit = best IoU >= 0.5  (recall numerator),
and aggregate recall per condition code + a full-vs-partial grouping.

Usage:
    python benchmarks/analyze_midv_by_condition.py \
        --model winner_model/best.pt \
        --dataset-root benchmarks/real/midv500 --imgsz 640
"""
from __future__ import annotations

import argparse
import json
import os
import sys

CONF = 0.25
IOU_HIT = 0.5
DOC_CLASS = 0

# Best-effort human labels for MIDV-500 condition codes (device suffix A/S).
COND_DESC = {
    "TA": "table", "TS": "table",
    "KA": "keyboard", "KS": "keyboard",
    "HA": "hand", "HS": "hand",
    "PA": "partial(clipped)", "PS": "partial(clipped)",
    "CA": "clutter", "CS": "clutter",
}
# Conditions where the document is intentionally only partially in frame.
PARTIAL_CODES = {"PA", "PS"}


def _iou(a, b):
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    area_a = (ax2 - ax1) * (ay2 - ay1)
    area_b = (bx2 - bx1) * (by2 - by1)
    return inter / (area_a + area_b - inter)


def _gt_box(label_path, w, h):
    """Read the single document_page YOLO line -> pixel xyxy. None if absent."""
    try:
        with open(label_path, "r", encoding="utf-8") as fh:
            for ln in fh:
                p = ln.split()
                if len(p) == 5 and int(p[0]) == DOC_CLASS:
                    xc, yc, bw, bh = (float(p[1]) * w, float(p[2]) * h,
                                      float(p[3]) * w, float(p[4]) * h)
                    return (xc - bw / 2, yc - bh / 2, xc + bw / 2, yc + bh / 2)
    except OSError:
        return None
    return None


def _cond_of(image_name, manifest_map):
    """Condition code from manifest sourceImage path (.../<COND>/<frame>)."""
    src = manifest_map.get(image_name)
    if src:
        parts = src.replace("/", os.sep).split(os.sep)
        if len(parts) >= 2:
            return parts[-2]  # the COND folder right above the frame
    # Fallback: parse from out_base "<doc>_<COND>_<stem>" — stem starts w/ COND.
    return "??"


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--dataset-root", required=True)
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--split", default="test")
    args = ap.parse_args(argv)

    from ultralytics import YOLO
    from PIL import Image

    root = args.dataset_root
    img_dir = os.path.join(root, "images", args.split)
    lbl_dir = os.path.join(root, "labels", args.split)
    manifest_path = os.path.join(root, f"manifest_{args.split}.json")
    manifest_map = {}
    if os.path.isfile(manifest_path):
        with open(manifest_path, "r", encoding="utf-8") as fh:
            man = json.load(fh)
        for s in man.get("samples", []):
            manifest_map[s["image"]] = s.get("sourceImage", "")

    images = [f for f in os.listdir(img_dir)
              if f.lower().endswith((".tif", ".tiff", ".jpg", ".jpeg", ".png"))]
    images.sort()

    model = YOLO(args.model)
    stats = {}  # cond -> {n, hit, tp, fp}

    BATCH = 64
    for i in range(0, len(images), BATCH):
        batch = images[i:i + BATCH]
        paths = [os.path.join(img_dir, f) for f in batch]
        results = model.predict(paths, imgsz=args.imgsz, conf=CONF, iou=0.7,
                                verbose=False, device=0)
        for f, res in zip(batch, results):
            w, h = Image.open(os.path.join(img_dir, f)).size
            gt = _gt_box(os.path.join(lbl_dir, os.path.splitext(f)[0] + ".txt"), w, h)
            cond = _cond_of(f, manifest_map)
            st = stats.setdefault(cond, {"n": 0, "hit": 0, "tp": 0, "fp": 0})
            st["n"] += 1
            preds = []
            for b, c in zip(res.boxes.xyxy.tolist(), res.boxes.cls.tolist()):
                if int(c) == DOC_CLASS:
                    preds.append(b)
            best = max((_iou(gt, p) for p in preds), default=0.0) if gt else 0.0
            if gt and best >= IOU_HIT:
                st["hit"] += 1
            for p in preds:
                if gt and _iou(gt, p) >= IOU_HIT:
                    st["tp"] += 1
                else:
                    st["fp"] += 1

    # Aggregate
    rows = []
    grp = {"full": {"n": 0, "hit": 0}, "partial": {"n": 0, "hit": 0}}
    for cond in sorted(stats):
        st = stats[cond]
        rec = st["hit"] / st["n"] if st["n"] else 0.0
        rows.append((cond, COND_DESC.get(cond, "?"), st["n"], round(rec, 4)))
        bucket = "partial" if cond in PARTIAL_CODES else "full"
        grp[bucket]["n"] += st["n"]
        grp[bucket]["hit"] += st["hit"]

    print("=" * 60)
    print("MIDV-500 document_page recall by capture condition @conf=0.25, IoU>=0.5")
    print("=" * 60)
    print(f"{'cond':6s} {'meaning':18s} {'images':>7s} {'recall':>8s}")
    for cond, desc, n, rec in rows:
        print(f"{cond:6s} {desc:18s} {n:7d} {rec:8.3f}")
    print("-" * 60)
    for bucket in ("full", "partial"):
        g = grp[bucket]
        r = g["hit"] / g["n"] if g["n"] else 0.0
        print(f"{bucket:8s} images={g['n']:5d} recall={r:.3f}")

    out = {
        "model": os.path.abspath(args.model),
        "conf": CONF, "iouHit": IOU_HIT, "imgsz": args.imgsz,
        "byCondition": {c: {"meaning": d, "images": n, "recall": r}
                        for c, d, n, r in rows},
        "grouped": {b: {"images": grp[b]["n"],
                        "recall": (grp[b]["hit"] / grp[b]["n"]) if grp[b]["n"] else 0.0}
                    for b in grp},
    }
    out_path = os.path.join(root, "eval", "by_condition.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=2)
    print(f"\nwrote {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
