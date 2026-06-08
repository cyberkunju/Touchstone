"""
License / membership card builder — small landscape card.

Composes: document_page (card), photo, logo, text_block fields, barcode/qr,
optional signature. Often has a TD1 MRZ on the back-style variant.
"""
from __future__ import annotations

import random

from PIL import ImageDraw

from .. import fonts, mrz, primitives
from ..core import Sample
from . import base

_TITLES = ["DRIVING LICENCE", "MEMBERSHIP CARD", "STAFF ID", "ACCESS CARD",
           "LIBRARY CARD", "HEALTH CARD"]
_NAMES = ["SAMPLE, JOHN A", "MARTINEZ, LUCAS", "OKAFOR, CHIDI", "SILVA, SOFIA"]


def build(rng: random.Random, seed: int) -> Sample:
    w = rng.randint(900, 1080)
    h = rng.randint(560, 700)
    family = f"license_{rng.choice('abc')}"
    sample = base.new_page(rng, w, h, seed, "license", family)
    m = rng.randint(16, 36)
    tint = rng.choice([(224, 232, 244), (238, 232, 222), (226, 240, 234)])
    base.add_page_boundary(sample, m, m, w - m, h - m, border=True, fill=tint)
    d = ImageDraw.Draw(sample.image)

    pad = rng.randint(20, 34)
    primitives.render_logo(sample, rng, m + pad, m + pad, m + pad + 44, m + pad + 44)
    tf = fonts.pick_sans(rng, rng.randint(22, 30))
    base.draw_text(sample, rng, m + pad + 110, m + pad + 6, rng.choice(_TITLES), tf, (30, 40, 90))

    # Photo right side.
    pw = int((w - 2 * m) * 0.22)
    ph = int(pw * 1.25)
    px = w - m - pad - pw
    py = m + pad + 60
    primitives.render_photo(sample, rng, px, py, px + pw, py + ph)

    lf = fonts.pick_sans(rng, rng.randint(13, 16))
    vf = fonts.pick_sans(rng, rng.randint(15, 19))
    fx = m + pad
    fy = m + pad + 70
    name = rng.choice(_NAMES)
    rows = [
        ("Name", name),
        ("No.", f"{rng.randint(100000, 999999)}"),
        ("Class", rng.choice(["A", "B", "C", "Full", "Standard"])),
        ("Issued", f"{rng.randint(1,28):02d}/{rng.randint(1,12):02d}/2024"),
        ("Expires", f"{rng.randint(1,28):02d}/{rng.randint(1,12):02d}/2030"),
    ]
    for lbl, val in rows:
        if fy > h - m - 120:
            break
        fy = base.label_value_row(sample, rng, fx, fy, lbl + ":", val, lf, vf, gap=10)

    # Signature + code at the bottom.
    if rng.random() < 0.75:
        primitives.render_signature(sample, rng, fx, h - m - 90, fx + 200, h - m - 40)

    if rng.random() < 0.5:
        bw, bh = rng.randint(180, 260), rng.randint(40, 60)
        primitives.render_barcode(sample, rng, w - m - pad - bw, h - m - bh - 24, bw, bh)
    else:
        qsize = rng.randint(70, 100)
        primitives.render_qr(sample, rng, w - m - pad - qsize, h - m - qsize - 16, qsize)

    return base.finalize_document(sample, rng)
