"""
Hard-negative / decoy builder — confusables that must NOT be detected.

Precision matters: a detector trained only on positives learns to fire on
anything vaguely document-like. These samples render *confusables* — things
that look like a primitive but are not one — and emit ZERO boxes. The generator
persists them as background images with an EMPTY label file (Sample.allow_empty
= True), teaching the model what to ignore:

  - QR-like module grids that are not valid/finder-pattern QR codes
  - circular/star marks that are not seals
  - line grids that are not tables
  - printed/UI checkboxes outside any form context
  - photo-ish gradients that are not portraits
  - near-blank / torn paper
  - decorative icon clusters

Pure given a seeded `random.Random`. Adds NO annotations.
"""
from __future__ import annotations

import math
import random

import numpy as np
from PIL import Image, ImageDraw

from .. import backgrounds, fonts
from ..core import Sample


def _fake_qr(d: ImageDraw.ImageDraw, rng: random.Random, x0, y0, s) -> None:
    """A random module grid WITHOUT QR finder patterns (not decodable)."""
    n = rng.randint(12, 24)
    cell = s / n
    for r in range(n):
        for c in range(n):
            if rng.random() < 0.5:
                d.rectangle([x0 + c * cell, y0 + r * cell,
                             x0 + (c + 1) * cell, y0 + (r + 1) * cell], fill=(20, 20, 20))
    # Deliberately NO 3 corner finder squares -> not a QR code.


def _fake_seal(d: ImageDraw.ImageDraw, rng: random.Random, cx, cy, r) -> None:
    """Concentric circles / star but thin, decorative — not an official seal."""
    col = (rng.randint(120, 200), rng.randint(120, 200), rng.randint(120, 200))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=col, width=1)
    pts = []
    for i in range(10):
        ang = math.pi / 2 + i * math.pi / 5
        rr = r * (0.5 if i % 2 == 0 else 0.22)
        pts.append((cx + rr * math.cos(ang), cy - rr * math.sin(ang)))
    d.polygon(pts, outline=col)


def _fake_grid(d: ImageDraw.ImageDraw, rng: random.Random, x0, y0, w, h) -> None:
    """A bare line grid with no cell content / headers — not a real table."""
    cols = rng.randint(3, 7)
    rows = rng.randint(3, 8)
    col = (rng.randint(150, 200),) * 3
    for c in range(cols + 1):
        xx = x0 + w * c / cols
        d.line([(xx, y0), (xx, y0 + h)], fill=col, width=1)
    for r in range(rows + 1):
        yy = y0 + h * r / rows
        d.line([(x0, yy), (x0 + w, yy)], fill=col, width=1)


def _fake_checkboxes(d: ImageDraw.ImageDraw, rng: random.Random, x0, y0) -> None:
    """UI/printed checkbox glyphs out of any form context."""
    for i in range(rng.randint(2, 5)):
        s = rng.randint(14, 26)
        x = x0 + i * (s + rng.randint(20, 60))
        d.rectangle([x, y0, x + s, y0 + s], outline=(120, 120, 120), width=1)


def _decorative_icons(d: ImageDraw.ImageDraw, rng: random.Random, w, h) -> None:
    for _ in range(rng.randint(3, 8)):
        cx, cy = rng.randint(0, w), rng.randint(0, h)
        r = rng.randint(10, 40)
        col = (rng.randint(80, 220), rng.randint(80, 220), rng.randint(80, 220))
        shp = rng.random()
        if shp < 0.33:
            d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=col, width=2)
        elif shp < 0.66:
            d.line([(cx - r, cy), (cx + r, cy)], fill=col, width=3)
            d.line([(cx, cy - r), (cx, cy + r)], fill=col, width=3)
        else:
            d.polygon([(cx, cy - r), (cx - r, cy + r), (cx + r, cy + r)], outline=col)


def _torn_paper(img: Image.Image, rng: random.Random) -> None:
    """Overlay a ragged near-blank paper patch (torn edge)."""
    w, h = img.size
    d = ImageDraw.Draw(img)
    pw, ph = rng.randint(int(w * 0.4), int(w * 0.8)), rng.randint(int(h * 0.4), int(h * 0.8))
    ox, oy = rng.randint(0, w - pw), rng.randint(0, h - ph)
    # Ragged top edge.
    pts = [(ox, oy + ph), (ox, oy)]
    x = ox
    while x < ox + pw:
        x += rng.randint(8, 24)
        pts.append((min(x, ox + pw), oy + rng.randint(0, 14)))
    pts.append((ox + pw, oy + ph))
    d.polygon(pts, fill=rng.choice([(250, 249, 244), (244, 243, 238), (238, 238, 234)]))


def build(rng: random.Random, seed: int) -> Sample:
    """Render a hard-negative sample with NO labelled primitives."""
    w = rng.randint(700, 1200)
    h = rng.randint(700, 1300)
    img = backgrounds.make_background(rng, w, h)
    sample = Sample(image=img, category="decoy", template_family="decoy",
                    template_version="v1", seed=seed, allow_empty=True)
    sample.quality_tags = ["negative"]
    d = ImageDraw.Draw(sample.image)

    # Pick a few confusable elements to scatter.
    kinds = ["fake_qr", "fake_seal", "fake_grid", "fake_checkboxes",
             "decorative", "torn", "blank", "photoish"]
    k = rng.randint(1, 3)
    for kind in rng.sample(kinds, k=k):
        if kind == "fake_qr":
            s = rng.randint(80, 200)
            _fake_qr(d, rng, rng.randint(0, max(1, w - s)), rng.randint(0, max(1, h - s)), s)
        elif kind == "fake_seal":
            r = rng.randint(40, 110)
            _fake_seal(d, rng, rng.randint(r, w - r), rng.randint(r, h - r), r)
        elif kind == "fake_grid":
            gw, gh = rng.randint(200, w - 40), rng.randint(120, max(140, h - 40))
            _fake_grid(d, rng, rng.randint(0, max(1, w - gw)),
                       rng.randint(0, max(1, h - gh)), gw, gh)
        elif kind == "fake_checkboxes":
            _fake_checkboxes(d, rng, rng.randint(20, w // 2), rng.randint(20, h - 40))
        elif kind == "decorative":
            _decorative_icons(d, rng, w, h)
        elif kind == "torn":
            _torn_paper(sample.image, rng)
            d = ImageDraw.Draw(sample.image)
        elif kind == "blank":
            pass  # near-blank: just the background
        elif kind == "photoish":
            # A smooth gradient blob that is NOT a portrait.
            gx, gy = rng.randint(0, w - 100), rng.randint(0, h - 100)
            gw, gh = rng.randint(100, 300), rng.randint(100, 300)
            arr = np.asarray(sample.image, dtype=np.float32)
            yy, xx = np.mgrid[0:gh, 0:gw].astype(np.float32)
            blob = (np.sin(xx / gw * math.pi) * np.sin(yy / gh * math.pi))[..., None]
            tint = np.array([rng.randint(60, 200) for _ in range(3)], np.float32)
            y1, x1 = min(h, gy + gh), min(w, gx + gw)
            arr[gy:y1, gx:x1] = (
                arr[gy:y1, gx:x1] * (1 - 0.5 * blob[: y1 - gy, : x1 - gx])
                + tint * 0.5 * blob[: y1 - gy, : x1 - gx]
            )
            sample.image = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")
            d = ImageDraw.Draw(sample.image)

    # No annotations on purpose. This is a negative sample.
    return sample
