"""
Label-overlay visualizer — draw YOLO boxes back onto generated images.

Sanity tool to confirm labels align with rendered primitives.

    python -m synthgen.viz --dataset datasets/docdet_v0 --split train --n 12 \
        --out datasets/docdet_v0/_preview
"""
from __future__ import annotations

import argparse
import os
import random

from PIL import Image, ImageDraw, ImageFont

from .config import CLASS_NAMES

# Distinct colors per class for readable overlays.
_COLORS = [
    (230, 25, 75), (60, 180, 75), (255, 130, 0), (0, 130, 200),
    (145, 30, 180), (70, 240, 240), (240, 50, 230), (210, 245, 60),
    (250, 190, 190), (0, 128, 128), (170, 110, 40), (128, 0, 0),
]


def _read_labels(path: str) -> list[tuple[int, float, float, float, float]]:
    out = []
    if not os.path.exists(path):
        return out
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            parts = line.split()
            if len(parts) == 5:
                cid, xc, yc, w, h = parts
                out.append((int(cid), float(xc), float(yc), float(w), float(h)))
    return out


def overlay(img_path: str, lbl_path: str) -> Image.Image:
    img = Image.open(img_path).convert("RGB")
    d = ImageDraw.Draw(img)
    W, H = img.size
    try:
        font = ImageFont.load_default(size=14)
    except TypeError:
        font = ImageFont.load_default()
    for cid, xc, yc, w, h in _read_labels(lbl_path):
        x0 = (xc - w / 2) * W
        y0 = (yc - h / 2) * H
        x1 = (xc + w / 2) * W
        y1 = (yc + h / 2) * H
        color = _COLORS[cid % len(_COLORS)]
        d.rectangle([x0, y0, x1, y1], outline=color, width=2)
        name = CLASS_NAMES[cid] if cid < len(CLASS_NAMES) else str(cid)
        d.rectangle([x0, max(0, y0 - 16), x0 + 8 + len(name) * 7, y0], fill=color)
        d.text((x0 + 3, max(0, y0 - 15)), name, fill=(255, 255, 255), font=font)
    return img


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Overlay YOLO labels on images")
    p.add_argument("--dataset", required=True)
    p.add_argument("--split", default="train")
    p.add_argument("--n", type=int, default=12)
    p.add_argument("--out", default=None)
    p.add_argument("--seed", type=int, default=0)
    args = p.parse_args(argv)

    img_dir = os.path.join(args.dataset, "images", args.split)
    lbl_dir = os.path.join(args.dataset, "labels", args.split)
    out_dir = args.out or os.path.join(args.dataset, "_preview")
    os.makedirs(out_dir, exist_ok=True)

    files = [f for f in os.listdir(img_dir) if f.lower().endswith((".jpg", ".png"))]
    random.Random(args.seed).shuffle(files)
    for f in files[: args.n]:
        stem = os.path.splitext(f)[0]
        img = overlay(os.path.join(img_dir, f), os.path.join(lbl_dir, stem + ".txt"))
        img.save(os.path.join(out_dir, stem + "_overlay.png"))
    print(f"Wrote {min(args.n, len(files))} overlays to {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
