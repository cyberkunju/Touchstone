"""
Shared helpers for category builders.
"""
from __future__ import annotations

import random

import numpy as np
from PIL import Image, ImageDraw

from .. import backgrounds, fonts, primitives
from ..core import Sample

PAPER_TINTS = [
    (252, 252, 250), (248, 246, 240), (245, 247, 250), (250, 248, 244),
    (244, 244, 246), (253, 251, 245),
]

# Probability a finished document is composited onto a larger cluttered
# background (so document_page is a sub-region, not the whole frame).
COMPOSITE_PROB = 0.62
# Cap on the composited frame's longest side (keeps memory/time bounded).
# The detector trains at <=960px, so >~1280 is wasted compute; capping here is
# the single biggest generation-speed lever (cost scales with side^2).
_MAX_FRAME_SIDE = 1280


def _add_paper_noise(img: Image.Image, rng: random.Random) -> None:
    """Add subtle correlated paper grain in place (the promised page noise)."""
    w, h = img.size
    arr = np.asarray(img, dtype=np.float32)
    gen = np.random.default_rng(rng.randint(0, 2**31))
    grain = gen.normal(0, rng.uniform(2.5, 6.0), (h, w, 1)).astype(np.float32)
    # A faint low-frequency tint variation across the sheet.
    small = gen.normal(0, 1, (max(2, h // 24), max(2, w // 24), 3)).astype(np.float32)
    low = np.asarray(Image.fromarray(
        np.clip(small * 18 + 128, 0, 255).astype(np.uint8)
    ).resize((w, h), Image.BILINEAR), dtype=np.float32) - 128.0
    arr = arr + grain + low * 0.4
    img.paste(Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB"))


def new_page(rng: random.Random, w: int, h: int, seed: int, category: str,
             family: str, version: str = "v1") -> Sample:
    """Create a blank page Sample with a paper-tinted, subtly-noisy background."""
    bg = rng.choice(PAPER_TINTS)
    img = Image.new("RGB", (w, h), bg)
    # Subtle paper noise so the model doesn't key on flat backgrounds.
    _add_paper_noise(img, rng)
    s = Sample(image=img, category=category, template_family=family,
               template_version=version, seed=seed)
    return s


def draw_text(
    sample: Sample,
    rng: random.Random,
    x: float,
    y: float,
    text: str,
    font,
    color=(20, 20, 28),
    *,
    label: bool = True,
):
    """Render a meaningful string and (by default) label it as a text_block.

    Single source of truth for ALL rendered strings (titles, section text,
    option labels, captions, totals labels) so supervision is consistent across
    every category. Wraps `primitives.draw_text_block`, which records the real
    inked box. Pass `label=False` only for purely decorative glyphs.
    """
    d = ImageDraw.Draw(sample.image)
    return primitives.draw_text_block(sample, d, rng, x, y, text, font, color, label=label)


def add_page_boundary(sample: Sample, x0: int, y0: int, x1: int, y1: int,
                      *, border: bool = False, fill: tuple | None = None) -> None:
    """Draw (optionally) and annotate the document_page region."""
    d = ImageDraw.Draw(sample.image)
    if fill is not None:
        d.rectangle([x0, y0, x1, y1], fill=fill)
    if border:
        d.rectangle([x0, y0, x1, y1], outline=(120, 120, 130), width=2)
    sample.add_box("document_page", x0, y0, x1, y1)


def label_value_row(
    sample: Sample,
    rng: random.Random,
    x: int,
    y: int,
    label: str,
    value: str,
    label_font,
    value_font,
    *,
    gap: int = 12,
    label_color=(110, 110, 120),
    value_color=(20, 20, 28),
) -> int:
    """Draw 'Label  Value' on one line; return the next y (below the row).

    Both the label and value are emitted as `text_block` annotations and their
    field link is recorded in ground_truth for relate-layer training.
    """
    d = ImageDraw.Draw(sample.image)
    la = primitives.draw_text_block(sample, d, rng, x, y, label, label_font, label_color)
    lw = la.aabb()[2] - la.aabb()[0]
    va = primitives.draw_text_block(sample, d, rng, x + lw + gap, y, value, value_font, value_color)
    h = max(la.aabb()[3] - la.aabb()[1], va.aabb()[3] - va.aabb()[1])
    sample.ground_truth.setdefault("fields", []).append(
        {"label": label, "value": value,
         "labelBox": [round(c, 1) for c in la.aabb()],
         "valueBox": [round(c, 1) for c in va.aabb()]}
    )
    return int(y + h + rng.randint(8, 16))


def _scale_translate(sample: Sample, scale: float, ox: float, oy: float) -> None:
    """Apply polygon -> polygon*scale + (ox, oy) to every annotation in place."""
    for ann in sample.annotations:
        ann.polygon = ann.polygon * scale + np.array([ox, oy], dtype=np.float64)


def finalize_document(sample: Sample, rng: random.Random) -> Sample:
    """Optionally composite the finished document onto a cluttered background.

    With probability `COMPOSITE_PROB` the rendered page (which currently fills
    the canvas) is placed at random scale/position on a larger procedural
    background, so `document_page` becomes a sub-region. ALL annotation polygons
    are translated to match. Otherwise the full-frame page is kept as-is. This
    is the single finalize hook every document builder calls before returning.
    """
    if rng.random() >= COMPOSITE_PROB:
        return sample

    dw, dh = sample.width, sample.height
    fill = rng.uniform(0.35, 0.75)  # doc's longest side as a fraction of frame
    long_side = max(dw, dh)
    frame_long = int(long_side / fill)
    # Frame slightly larger than the doc on both axes, doc placed at random pos.
    fw = max(dw + 8, int(dw + (frame_long - dw) * rng.uniform(0.5, 1.0)))
    fh = max(dh + 8, int(dh + (frame_long - dh) * rng.uniform(0.5, 1.0)))

    bg = backgrounds.make_background(rng, fw, fh)
    ox = rng.randint(0, max(0, fw - dw))
    oy = rng.randint(0, max(0, fh - dh))
    bg.paste(sample.image, (ox, oy))
    sample.image = bg
    _scale_translate(sample, 1.0, ox, oy)

    # Bound the composited frame size for downstream speed/memory.
    longest = max(sample.width, sample.height)
    if longest > _MAX_FRAME_SIDE:
        s = _MAX_FRAME_SIDE / longest
        nw, nh = max(1, int(sample.width * s)), max(1, int(sample.height * s))
        sample.image = sample.image.resize((nw, nh), Image.BILINEAR)
        _scale_translate(sample, s, 0.0, 0.0)

    sample.quality_tags.append("composited")
    return sample
