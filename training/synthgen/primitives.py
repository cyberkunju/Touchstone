"""
Primitive renderers — the universal visual building blocks.

Every document category composes these. Each renderer draws onto a PIL image
and records a pixel-perfect `Annotation` on the `Sample`, so YOLO labels come
for free. Renderers are pure given a seeded `random.Random`.

Primitives: text_block, photo, signature, stamp, seal, logo, qr_code, barcode,
mrz_zone, table, checkbox (+ document_page boundary is added by categories).
"""
from __future__ import annotations

import io
import math
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from . import fonts
from .core import Annotation, Sample, rect_polygon

RGB = tuple[int, int, int]


# --------------------------------------------------------------------------- #
# Text helpers                                                                 #
# --------------------------------------------------------------------------- #

def text_size(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont) -> tuple[int, int]:
    """Width/height of `text` in pixels (Pillow textbbox)."""
    l, t, r, b = draw.textbbox((0, 0), text, font=font)
    return r - l, b - t


def text_ink_box(
    draw: ImageDraw.ImageDraw,
    x: float,
    y: float,
    text: str,
    font: ImageFont.FreeTypeFont,
) -> tuple[float, float, float, float]:
    """Real inked bounding box of `text` drawn at top-left anchor (x, y).

    Uses Pillow's `textbbox` at the *actual* draw origin so the box hugs the
    rendered glyphs (ascenders AND descenders) instead of being derived from a
    size + manual origin, which shifts the box up by the ascender bearing and
    clips descenders. Empty/whitespace text collapses to a zero-area box at
    (x, y).
    """
    if not text:
        return float(x), float(y), float(x), float(y)
    l, t, r, b = draw.textbbox((x, y), text, font=font)
    return float(l), float(t), float(r), float(b)


def draw_text_block(
    sample: Sample,
    draw: ImageDraw.ImageDraw,
    rng: random.Random,
    x: float,
    y: float,
    text: str,
    font: ImageFont.FreeTypeFont,
    color: RGB = (20, 20, 24),
    *,
    label: bool = True,
) -> Annotation:
    """Render a single line of text and record a `text_block` annotation.

    Returns the annotation (also appended to the sample) so callers can read its
    box for layout. Set `label=False` to draw without emitting a detector box
    (used for sub-parts already covered by a parent box, e.g. table text).

    The recorded polygon is the *real inked* box (`textbbox` at the draw
    origin), so it matches the pixels to within a sub-pixel and includes
    descenders.
    """
    draw.text((x, y), text, font=font, fill=color)
    l, t, r, b = text_ink_box(draw, x, y, text, font)
    ann = Annotation("text_block", rect_polygon(l, t, r, b), text=text)
    if label:
        sample.add(ann)
    return ann


# --------------------------------------------------------------------------- #
# Photo / portrait                                                             #
# --------------------------------------------------------------------------- #

def render_photo(sample: Sample, rng: random.Random, x0: int, y0: int, x1: int, y1: int) -> Annotation:
    """Render a synthetic portrait placeholder (clearly fake, no real faces).

    A soft gradient background + simple head/shoulders silhouette. This is a
    *placeholder*; realism for the face itself is irrelevant — the detector only
    needs the photo region to look photo-like (smooth gradients, a subject).
    """
    w, h = x1 - x0, y1 - y0
    img = Image.new("RGB", (w, h), (210, 215, 225))
    d = ImageDraw.Draw(img)
    # Gradient background.
    top = np.array([rng.randint(150, 210), rng.randint(160, 215), rng.randint(170, 225)])
    bot = np.array([rng.randint(90, 150), rng.randint(100, 160), rng.randint(110, 170)])
    arr = np.zeros((h, w, 3), dtype=np.uint8)
    for row in range(h):
        t = row / max(1, h - 1)
        arr[row, :, :] = (top * (1 - t) + bot * t).astype(np.uint8)
    img = Image.fromarray(arr)
    d = ImageDraw.Draw(img)
    skin = (rng.randint(180, 225), rng.randint(150, 190), rng.randint(120, 160))
    # Shoulders.
    d.ellipse([w * 0.15, h * 0.62, w * 0.85, h * 1.25], fill=(60, 70, 90))
    # Head.
    d.ellipse([w * 0.30, h * 0.18, w * 0.70, h * 0.62], fill=skin)
    img = img.filter(ImageFilter.GaussianBlur(radius=max(0.4, w / 220)))
    sample.image.paste(img, (x0, y0))
    return sample.add_box("photo", x0, y0, x1, y1)


# --------------------------------------------------------------------------- #
# Signature                                                                    #
# --------------------------------------------------------------------------- #

def render_signature(sample: Sample, rng: random.Random, x0: int, y0: int, x1: int, y1: int) -> Annotation:
    """Render a license-safe scribble signature (random smooth strokes).

    The annotation is the tight box around the *actual* stroke points (plus a
    small ink pad), NOT the allocated region — an empty margin around a
    signature otherwise teaches the detector loose boxes.
    """
    w, h = x1 - x0, y1 - y0
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    ink = (rng.randint(10, 40), rng.randint(20, 60), rng.randint(80, 140), 255)
    strokes = rng.randint(2, 4)
    cy = h * 0.55
    stroke_w = max(1, int(h * 0.04))
    all_pts: list[tuple[float, float]] = []
    for _ in range(strokes):
        pts = []
        n = rng.randint(6, 10)
        x = w * 0.05
        for i in range(n):
            x += (w * 0.9) / n * rng.uniform(0.6, 1.4)
            y = cy + math.sin(i * rng.uniform(0.8, 1.8)) * h * rng.uniform(0.12, 0.3)
            pts.append((min(x, w - 2), max(2, min(y, h - 2))))
        if len(pts) >= 2:
            d.line(pts, fill=ink, width=stroke_w, joint="curve")
            all_pts.extend(pts)
    sample.image.paste(overlay, (x0, y0), overlay)
    if all_pts:
        pad = stroke_w / 2 + 1
        xs = [p[0] for p in all_pts]
        ys = [p[1] for p in all_pts]
        bx0 = x0 + max(0.0, min(xs) - pad)
        by0 = y0 + max(0.0, min(ys) - pad)
        bx1 = x0 + min(float(w), max(xs) + pad)
        by1 = y0 + min(float(h), max(ys) + pad)
    else:  # pragma: no cover - strokes always produced
        bx0, by0, bx1, by1 = x0, y0, x1, y1
    return sample.add_box("signature", bx0, by0, bx1, by1)


# --------------------------------------------------------------------------- #
# Stamp / seal                                                                 #
# --------------------------------------------------------------------------- #

def render_stamp(sample: Sample, rng: random.Random, x0: int, y0: int, x1: int, y1: int) -> Annotation:
    """Render a rotated rubber-stamp (rounded rectangle + text).

    The annotation hugs the rotated rounded-rect (the actual ink), not the
    transparent pad ring of the expanded canvas. We rotate a matching mask by
    the SAME angle and read its tight bbox.
    """
    w, h = x1 - x0, y1 - y0
    pad = 6
    radius = int(h * 0.2)
    big = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    color = rng.choice([(150, 30, 30), (30, 60, 140), (40, 110, 60)])
    a = rng.randint(150, 220)
    ink = (*color, a)
    inner = [pad, pad, pad + w - 1, pad + h - 1]
    d.rounded_rectangle(inner, radius=radius,
                        outline=ink, width=max(2, int(h * 0.06)))
    f = fonts.pick_sans(rng, max(10, int(h * 0.28)))
    txt = rng.choice(["APPROVED", "RECEIVED", "PAID", "VERIFIED", "COPY", "ORIGINAL"])
    tw, th = text_size(d, txt, f)
    d.text((pad + (w - tw) / 2, pad + (h - th) / 2), txt, font=f, fill=ink)
    angle = rng.uniform(-25, 25)
    big = big.rotate(angle, expand=True, resample=Image.BICUBIC)
    # Same rotation on a filled mask of just the rounded-rect -> tight bbox.
    mask = Image.new("L", (w + 2 * pad, h + 2 * pad), 0)
    ImageDraw.Draw(mask).rounded_rectangle(inner, radius=radius, fill=255)
    mask = mask.rotate(angle, expand=True, resample=Image.BICUBIC)
    px = x0 - (big.width - w) // 2
    py = y0 - (big.height - h) // 2
    sample.image.paste(big, (px, py), big)
    bbox = mask.getbbox()  # (l, t, r, b) in rotated-canvas coords
    if bbox is None:  # pragma: no cover - mask always has ink
        bbox = (0, 0, big.width, big.height)
    bl, bt, br, bb = bbox
    return sample.add_box("stamp", px + bl, py + bt, px + br, py + bb)


def render_seal(sample: Sample, rng: random.Random, x0: int, y0: int, x1: int, y1: int) -> Annotation:
    """Render a circular official seal (concentric rings + radial text feel)."""
    w, h = x1 - x0, y1 - y0
    s = min(w, h)
    overlay = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    color = rng.choice([(40, 70, 130), (130, 40, 50), (50, 100, 60)])
    a = rng.randint(150, 220)
    ink = (*color, a)
    d.ellipse([2, 2, s - 3, s - 3], outline=ink, width=max(2, int(s * 0.04)))
    d.ellipse([s * 0.12, s * 0.12, s * 0.88, s * 0.88], outline=ink, width=max(1, int(s * 0.02)))
    # Inner star.
    cx = cy = s / 2
    r1, r2 = s * 0.30, s * 0.14
    pts = []
    for i in range(10):
        ang = math.pi / 2 + i * math.pi / 5
        r = r1 if i % 2 == 0 else r2
        pts.append((cx + r * math.cos(ang), cy - r * math.sin(ang)))
    d.polygon(pts, outline=ink)
    sample.image.paste(overlay, (x0, y0), overlay)
    return sample.add_box("seal", x0, y0, x0 + s, y0 + s)


# --------------------------------------------------------------------------- #
# Logo                                                                         #
# --------------------------------------------------------------------------- #

def render_logo(sample: Sample, rng: random.Random, x0: int, y0: int, x1: int, y1: int,
                name: str | None = None) -> Annotation:
    """Render a simple geometric fake logo (shape mark + wordmark)."""
    w, h = x1 - x0, y1 - y0
    d = ImageDraw.Draw(sample.image)
    color = (rng.randint(20, 120), rng.randint(40, 140), rng.randint(80, 200))
    mark = rng.choice(["circle", "square", "triangle", "hex"])
    ms = int(h * 0.9)
    mx, my = x0, y0 + (h - ms) // 2
    if mark == "circle":
        d.ellipse([mx, my, mx + ms, my + ms], fill=color)
    elif mark == "square":
        d.rounded_rectangle([mx, my, mx + ms, my + ms], radius=int(ms * 0.18), fill=color)
    elif mark == "triangle":
        d.polygon([(mx + ms / 2, my), (mx, my + ms), (mx + ms, my + ms)], fill=color)
    else:
        pts = [(mx + ms / 2 + ms / 2 * math.cos(math.radians(60 * i)),
                my + ms / 2 + ms / 2 * math.sin(math.radians(60 * i))) for i in range(6)]
        d.polygon(pts, fill=color)
    word = name or rng.choice(["NORDA", "ACME", "GLOBEX", "ZENITH", "MERIDIAN", "AXION", "VERTEX"])
    f = fonts.pick_sans(rng, max(10, int(h * 0.55)))
    wx = mx + ms + 8
    wy = y0 + (h - int(h * 0.55)) / 2
    d.text((wx, wy), word, font=f, fill=color)
    # Real inked right/bottom edge of the wordmark (no ascender-bearing drift).
    _, _, wr, wb = text_ink_box(d, wx, wy, word, f)
    return sample.add_box("logo", x0, y0, max(mx + ms, wr), max(float(y1), wb))


# --------------------------------------------------------------------------- #
# QR / barcode                                                                 #
# --------------------------------------------------------------------------- #

def render_qr(sample: Sample, rng: random.Random, x0: int, y0: int, size: int,
              payload: str | None = None) -> Annotation:
    """Render a real, decodable QR code (qrcode lib)."""
    import qrcode

    data = payload or f"DOC:{rng.randint(10**6, 10**9)}"
    qr = qrcode.QRCode(border=2, box_size=4,
                       error_correction=qrcode.constants.ERROR_CORRECT_M)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    img = img.resize((size, size), Image.NEAREST)
    sample.image.paste(img, (x0, y0))
    return sample.add_box("qr_code", x0, y0, x0 + size, y0 + size,
                          meta={"payload": data})


def render_barcode(sample: Sample, rng: random.Random, x0: int, y0: int, w: int, h: int,
                   payload: str | None = None) -> Annotation:
    """Render a real Code128 barcode (python-barcode), scaled to (w, h)."""
    import barcode
    from barcode.writer import ImageWriter

    data = payload or "".join(str(rng.randint(0, 9)) for _ in range(rng.randint(8, 12)))
    code = barcode.get("code128", data, writer=ImageWriter())
    buf = io.BytesIO()
    code.write(buf, options={"write_text": False, "module_height": 8.0,
                             "quiet_zone": 1.0})
    buf.seek(0)
    img = Image.open(buf).convert("RGB").resize((w, h), Image.NEAREST)
    sample.image.paste(img, (x0, y0))
    return sample.add_box("barcode", x0, y0, x0 + w, y0 + h, meta={"payload": data})


# --------------------------------------------------------------------------- #
# MRZ                                                                          #
# --------------------------------------------------------------------------- #

def render_mrz(sample: Sample, rng: random.Random, x0: int, y0: int, w: int,
               lines: list[str]) -> Annotation:
    """Render MRZ text lines in a monospace font; box covers all lines.

    The box is the real inked extent (textbbox per line), so descenders and the
    true line height are included instead of an estimated origin+size.
    """
    d = ImageDraw.Draw(sample.image)
    n = len(lines)
    # Size font to fit the widest line into w.
    fsize = max(10, int(w / (max(len(l) for l in lines) * 0.62)))
    f = fonts.pick_mono(rng, fsize)
    lh = int(fsize * 1.25)
    y = y0
    minl = mint = float("inf")
    maxr = maxb = float("-inf")
    for line in lines:
        d.text((x0, y), line, font=f, fill=(15, 15, 15))
        l, t, r, b = text_ink_box(d, x0, y, line, f)
        minl = min(minl, l)
        mint = min(mint, t)
        maxr = max(maxr, r)
        maxb = max(maxb, b)
        y += lh
    if not (maxr > minl and maxb > mint):  # pragma: no cover - empty/space lines
        minl, mint, maxr, maxb = float(x0), float(y0), float(x0 + w), float(y)
    return sample.add_box("mrz_zone", minl, mint, maxr, maxb,
                          meta={"lines": lines})


# --------------------------------------------------------------------------- #
# Checkbox                                                                     #
# --------------------------------------------------------------------------- #

def render_checkbox(sample: Sample, rng: random.Random, x0: int, y0: int, size: int,
                    checked: bool | None = None) -> Annotation:
    """Render a checkbox (optionally ticked). Box is the control only."""
    d = ImageDraw.Draw(sample.image)
    d.rectangle([x0, y0, x0 + size, y0 + size], outline=(40, 40, 40),
                width=max(1, size // 12))
    if checked is None:
        checked = rng.random() < 0.5
    if checked:
        d.line([(x0 + size * 0.2, y0 + size * 0.55),
                (x0 + size * 0.45, y0 + size * 0.8),
                (x0 + size * 0.85, y0 + size * 0.2)],
               fill=(20, 20, 20), width=max(1, size // 8), joint="curve")
    return sample.add_box("checkbox", x0, y0, x0 + size, y0 + size,
                          meta={"checked": checked})


# --------------------------------------------------------------------------- #
# Table                                                                        #
# --------------------------------------------------------------------------- #

def render_table(
    sample: Sample,
    rng: random.Random,
    x0: int,
    y0: int,
    w: int,
    h: int,
    rows: int,
    cols: int,
    *,
    bordered: bool = True,
    header: bool = True,
    cells: list[list[str]] | None = None,
) -> Annotation:
    """Render a table (bordered or borderless) and record one `table` box.

    Cell text is drawn but NOT individually detector-labelled (the v0 class set
    has no table_cell); the full table region is the single annotation, per
    YOLOV11N_DOCUMENT_DETECTOR.md §4.9. Cell text + structure are emitted as
    ground truth for downstream table training.
    """
    d = ImageDraw.Draw(sample.image)
    row_h = h / rows
    col_w = w / cols
    line_col = (70, 70, 80)
    if bordered:
        for r in range(rows + 1):
            yy = y0 + r * row_h
            d.line([(x0, yy), (x0 + w, yy)], fill=line_col, width=1)
        for c in range(cols + 1):
            xx = x0 + c * col_w
            d.line([(xx, y0), (xx, y0 + h)], fill=line_col, width=1)
    elif header:
        d.line([(x0, y0 + row_h), (x0 + w, y0 + row_h)], fill=line_col, width=2)

    f = fonts.pick_sans(rng, max(9, int(row_h * 0.4)))
    fb = fonts.pick_sans(rng, max(9, int(row_h * 0.42)))
    grid: list[list[str]] = []
    for r in range(rows):
        row_cells = []
        for c in range(cols):
            if cells and r < len(cells) and c < len(cells[r]):
                txt = cells[r][c]
            elif header and r == 0:
                txt = rng.choice(["Item", "Qty", "Price", "Total", "Date", "Desc", "Amount"])
            else:
                txt = str(rng.randint(1, 999)) if c > 0 else rng.choice(
                    ["Widget", "Service", "Part", "Item " + str(r), "Fee"])
            row_cells.append(txt)
            cx = x0 + c * col_w + 4
            cy = y0 + r * row_h + (row_h - int(row_h * 0.42)) / 2
            font = fb if (header and r == 0) else f
            d.text((cx, cy), txt, font=font, fill=(25, 25, 30))
        grid.append(row_cells)
    return sample.add_box("table", x0, y0, x0 + w, y0 + h,
                          meta={"rows": rows, "cols": cols, "cells": grid,
                                "bordered": bordered})
