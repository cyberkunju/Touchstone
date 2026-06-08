"""
Certificate builder — rich in seals, signatures, logos, decorative borders.

Composes: document_page, decorative border, logo/emblem, title + recipient
text_block, seal, signature(s), certificate number, optional qr_code.
"""
from __future__ import annotations

import random

from PIL import ImageDraw

from .. import fonts, primitives
from ..core import Sample
from . import base

_TITLES = ["CERTIFICATE OF ACHIEVEMENT", "CERTIFICATE OF COMPLETION",
           "CERTIFICATE OF EXCELLENCE", "CERTIFICATE OF MEMBERSHIP",
           "DIPLOMA", "AWARD OF MERIT"]
_NAMES = ["Maria Andersson", "Lucas Martinez", "Anna Kowalski", "Yuki Nakamura",
          "Chidi Okafor", "Sofia Silva", "Omar Hussein", "Elena Petrov"]
_ORGS = ["Norda Institute", "Acme Academy", "Globex University",
         "Zenith Foundation", "Meridian College", "Vertex School"]


def build(rng: random.Random, seed: int) -> Sample:
    w = rng.randint(1100, 1320)
    h = rng.randint(800, 960)
    family = f"certificate_{rng.choice('abc')}"
    sample = base.new_page(rng, w, h, seed, "certificate", family)
    base.add_page_boundary(sample, 0, 0, w - 1, h - 1)
    d = ImageDraw.Draw(sample.image)

    # Decorative double border.
    bcol = rng.choice([(150, 120, 40), (60, 80, 140), (120, 50, 60), (50, 110, 80)])
    for inset, wd in ((24, 4), (36, 1)):
        d.rectangle([inset, inset, w - inset, h - inset], outline=bcol, width=wd)

    # Emblem/logo centered top.
    primitives.render_logo(sample, rng, w // 2 - 30, 60, w // 2 + 30, 120)

    tf = fonts.pick_serif(rng, rng.randint(40, 54))
    title = rng.choice(_TITLES)
    tw, _ = primitives.text_size(d, title, tf)
    primitives.draw_text_block(sample, d, rng, (w - tw) / 2, 150, title, tf, (40, 40, 70))

    sub = fonts.pick_serif(rng, rng.randint(18, 24))
    msg = "This is proudly presented to"
    mw, _ = primitives.text_size(d, msg, sub)
    primitives.draw_text_block(sample, d, rng, (w - mw) / 2, 240, msg, sub, (90, 90, 100))

    nf = fonts.pick_serif(rng, rng.randint(36, 48))
    name = rng.choice(_NAMES)
    nw, _ = primitives.text_size(d, name, nf)
    primitives.draw_text_block(sample, d, rng, (w - nw) / 2, 300, name, nf, (30, 30, 50))
    d.line([(w / 2 - nw / 2 - 20, 360), (w / 2 + nw / 2 + 20, 360)], fill=bcol, width=2)

    org = rng.choice(_ORGS)
    of = fonts.pick_serif(rng, rng.randint(18, 22))
    ow, _ = primitives.text_size(d, org, of)
    primitives.draw_text_block(sample, d, rng, (w - ow) / 2, 400, f"by {org}", of, (80, 80, 95))

    # Certificate number.
    cf = fonts.pick_sans(rng, 16)
    primitives.draw_text_block(sample, d, rng, 60, h - 70,
                               f"No. CERT-{rng.randint(10000, 99999)}", cf, (100, 100, 110))

    # Seal bottom-left, signature bottom-right.
    primitives.render_seal(sample, rng, 90, h - 230, 230, h - 90)
    sig_x = w - rng.randint(360, 420)
    sig_y = h - rng.randint(180, 210)
    primitives.render_signature(sample, rng, sig_x, sig_y, sig_x + 240, sig_y + 70)
    d.line([(sig_x, sig_y + 76), (sig_x + 240, sig_y + 76)], fill=(80, 80, 90), width=1)
    primitives.draw_text_block(sample, d, rng, sig_x + 40, sig_y + 84,
                               rng.choice(["Director", "Registrar", "Dean"]), cf, (90, 90, 100))

    if rng.random() < 0.4:
        qsize = rng.randint(80, 110)
        primitives.render_qr(sample, rng, w - qsize - 60, h - qsize - 60, qsize)

    return base.finalize_document(sample, rng)
