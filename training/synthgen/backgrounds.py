"""
Procedural cluttered/photographic backgrounds for document compositing.

`document_page` must NOT be synonymous with "the whole image" — if every page
fills the frame, the detector never learns the page boundary and the downstream
dewarp/page-detection stage breaks on real photos where a document sits on a
desk at an angle. We composite rendered documents onto these backgrounds so the
page becomes a SUB-REGION surrounded by clutter (and then gets warped off-axis
by the augmentation perspective pass).

All generators are pure given a seeded `random.Random` and return an RGB PIL
image of the requested size.
"""
from __future__ import annotations

import math
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def _gradient(rng: random.Random, w: int, h: int) -> np.ndarray:
    """Smooth two-tone diagonal gradient."""
    c0 = np.array([rng.randint(40, 210) for _ in range(3)], dtype=np.float32)
    c1 = np.array([rng.randint(40, 210) for _ in range(3)], dtype=np.float32)
    ang = rng.uniform(0, math.pi)
    yy = np.arange(h, dtype=np.float32)[:, None]
    xx = np.arange(w, dtype=np.float32)[None, :]
    proj = xx * math.cos(ang) + yy * math.sin(ang)
    proj = (proj - proj.min()) / max(1.0, (proj.max() - proj.min()))
    arr = c0[None, None, :] * (1 - proj[..., None]) + c1[None, None, :] * proj[..., None]
    return arr


def _noise_texture(rng: random.Random, w: int, h: int, base: tuple[int, int, int]) -> np.ndarray:
    """Paper/wood/desk-like noisy texture: tinted base + correlated noise."""
    arr = np.empty((h, w, 3), dtype=np.float32)
    arr[:] = np.array(base, dtype=np.float32)[None, None, :]
    gen = np.random.default_rng(rng.randint(0, 2**31))
    # Low-frequency blotches + high-frequency grain.
    small = gen.normal(0, 1, (max(2, h // 16), max(2, w // 16), 3)).astype(np.float32)
    low = np.asarray(Image.fromarray(
        np.clip(small * 40 + 128, 0, 255).astype(np.uint8)
    ).resize((w, h), Image.BILINEAR), dtype=np.float32) - 128.0
    grain = gen.normal(0, rng.uniform(4, 14), (h, w, 3)).astype(np.float32)
    arr = arr + low * rng.uniform(0.3, 0.8) + grain
    # Optional directional streaks (wood/desk).
    if rng.random() < 0.5:
        freq = rng.uniform(2, 8)
        yy = np.arange(h, dtype=np.float32)[:, None]
        streak = (np.sin(yy / h * math.pi * freq) * rng.uniform(4, 12)).astype(np.float32)
        arr += streak[..., None]
    return arr


def _scatter_shapes(rng: random.Random, img: Image.Image) -> None:
    """Draw scattered distractor shapes (clutter) onto the background."""
    d = ImageDraw.Draw(img, "RGBA")
    w, h = img.size
    for _ in range(rng.randint(2, 7)):
        cx, cy = rng.randint(0, w), rng.randint(0, h)
        r = rng.randint(int(min(w, h) * 0.03), int(min(w, h) * 0.18))
        col = (rng.randint(0, 255), rng.randint(0, 255), rng.randint(0, 255),
               rng.randint(40, 120))
        kind = rng.random()
        if kind < 0.4:
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)
        elif kind < 0.7:
            d.rectangle([cx - r, cy - r, cx + r, cy + r], fill=col)
        else:
            d.line([(cx - r, cy - r), (cx + r, cy + r)], fill=col,
                   width=rng.randint(2, 8))


def _second_document_strip(rng: random.Random, img: Image.Image) -> None:
    """Lay a partial second-document strip at one edge (common in photos)."""
    w, h = img.size
    d = ImageDraw.Draw(img)
    tint = rng.choice([(250, 249, 245), (244, 244, 240), (238, 240, 246)])
    edge = rng.choice(["left", "right", "top", "bottom"])
    if edge in ("left", "right"):
        sw = rng.randint(int(w * 0.1), int(w * 0.28))
        x0 = 0 if edge == "left" else w - sw
        rect = [x0, rng.randint(0, h // 4), x0 + sw, rng.randint(3 * h // 4, h)]
    else:
        sh = rng.randint(int(h * 0.1), int(h * 0.28))
        y0 = 0 if edge == "top" else h - sh
        rect = [rng.randint(0, w // 4), y0, rng.randint(3 * w // 4, w), y0 + sh]
    d.rectangle(rect, fill=tint, outline=(180, 180, 185), width=2)
    # A few text-like ruled lines on the strip.
    rx0, ry0, rx1, ry1 = rect
    for ly in range(int(ry0 + 12), int(ry1 - 8), rng.randint(16, 28)):
        d.line([(rx0 + 8, ly), (rx1 - 8, ly)], fill=(170, 170, 178), width=2)


def make_background(rng: random.Random, w: int, h: int) -> Image.Image:
    """Build a cluttered/photographic background of size (w, h)."""
    style = rng.random()
    if style < 0.35:
        arr = _gradient(rng, w, h)
    elif style < 0.8:
        base = rng.choice([
            (150, 120, 90), (120, 130, 140), (90, 100, 110),
            (170, 160, 150), (60, 70, 80), (140, 120, 100),
        ])
        arr = _noise_texture(rng, w, h, base)
    else:
        # Photo-ish: blurred random gradient + grain.
        arr = _gradient(rng, w, h)
        gen = np.random.default_rng(rng.randint(0, 2**31))
        arr = arr + gen.normal(0, 10, arr.shape).astype(np.float32)
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")
    if rng.random() < 0.5:
        img = img.filter(ImageFilter.GaussianBlur(radius=rng.uniform(0.5, 2.5)))
    if rng.random() < 0.7:
        _scatter_shapes(rng, img)
    if rng.random() < 0.35:
        _second_document_strip(rng, img)
    return img
