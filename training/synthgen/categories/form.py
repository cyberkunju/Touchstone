"""
Generic form builder — the spec-mandated baseline (covers ALL primitives).

Composes: document_page, text_block labels/values, checkbox groups, table,
signature, optional stamp/seal/logo/qr/barcode. This is the most important
category for universality because a generic form naturally contains every
visual primitive in one layout.
"""
from __future__ import annotations

import random

from PIL import ImageDraw

from .. import fonts, i18n, primitives
from ..core import Sample
from . import base

_TITLES = ["APPLICATION FORM", "REGISTRATION FORM", "REQUEST FORM",
           "ENROLLMENT FORM", "CLAIM FORM", "SURVEY FORM", "INTAKE FORM"]
_LABELS = ["Full Name", "Address", "City", "Postal Code", "Phone", "Email",
           "Date", "Reference", "Department", "Occupation", "Nationality", "ID No."]
_OPTIONS = ["Yes", "No", "Option A", "Option B", "Standard", "Express",
            "Email", "Phone", "Mr", "Ms", "Other"]
_FAKE_VALUES = ["John A. Sample", "12 Example St", "Springfield", "AB1 2CD",
                "555-0100", "user@example.test", "07/03/2026", "REF-48217",
                "Operations", "Engineer", "Utopia", "X9921"]


def build(rng: random.Random, seed: int) -> Sample:
    w = rng.randint(820, 1000)
    h = rng.randint(1080, 1340)
    family = f"form_{rng.choice('abcde')}"
    sample = base.new_page(rng, w, h, seed, "form", family)
    base.add_page_boundary(sample, 0, 0, w - 1, h - 1)
    d = ImageDraw.Draw(sample.image)

    mx = rng.randint(40, 70)
    y = rng.randint(36, 60)

    # Optional non-Latin script for this form (only if a font can render it).
    script = i18n.maybe_pick_script(rng)
    if script != "latin":
        sample.language = i18n.SCRIPT_LANG[script]

    def _loc(role: str, fallback: str) -> str:
        return i18n.pick(rng, script, role, fallback) if script != "latin" else fallback

    def _font(size: int):
        return fonts.pick_script(rng, size, script) if script != "latin" else fonts.pick_sans(rng, size)

    # Header with optional logo.
    if rng.random() < 0.6:
        primitives.render_logo(sample, rng, mx, y, mx + 50, y + 46)
    tf = _font(rng.randint(28, 38))
    title = _loc("title", rng.choice(_TITLES))
    base.draw_text(sample, rng, w / 2 - len(title) * 9, y + 4, title, tf, (35, 35, 55))
    y += rng.randint(70, 95)

    lf = _font(rng.randint(15, 18))
    vf = _font(rng.randint(15, 19))

    # Label/value rows.
    n_fields = rng.randint(5, 8)
    labels = rng.sample(_LABELS, k=min(n_fields, len(_LABELS)))
    for lbl in labels:
        if y > h - 360:
            break
        loc_label = _loc("label", lbl)
        val = rng.choice(_FAKE_VALUES)
        # Sometimes draw a ruled underline (form field line).
        if rng.random() < 0.5:
            d.line([(mx + 180, y + 22), (w - mx, y + 22)], fill=(150, 150, 160), width=1)
        y = base.label_value_row(sample, rng, mx, y, loc_label + ":", val, lf, vf)

    # Checkbox group.
    y += rng.randint(10, 24)
    qf = _font(rng.randint(15, 18))
    section = _loc("label", rng.choice(["Preferred contact:", "Select option:", "Membership:"]))
    base.draw_text(sample, rng, mx, y, section, qf, (60, 60, 75))
    y += rng.randint(28, 38)
    cb_n = rng.randint(2, 4)
    cbx = mx + 10
    size = rng.randint(20, 30)
    for opt in rng.sample(_OPTIONS, k=cb_n):
        loc_opt = _loc("word", opt)
        primitives.render_checkbox(sample, rng, cbx, y, size)
        opt_ann = base.draw_text(sample, rng, cbx + size + 8, y + 1, loc_opt, qf, (40, 40, 50))
        cbx += size + 18 + int(opt_ann.aabb()[2] - opt_ann.aabb()[0]) + 10
        if cbx > w - mx - 120:
            cbx = mx + 10
            y += size + 14
    y += size + rng.randint(24, 40)

    # A small table (e.g. dependents / items).
    if rng.random() < 0.7 and y < h - 320:
        t_rows = rng.randint(3, 5)
        t_h = t_rows * rng.randint(34, 42)
        primitives.render_table(sample, rng, mx, y, w - 2 * mx, t_h, t_rows,
                                rng.randint(3, 4), bordered=rng.random() < 0.6)
        y += t_h + rng.randint(24, 40)

    # Signature + optional seal/stamp near the bottom.
    sy = h - rng.randint(120, 170)
    sig_w = rng.randint(220, 300)
    base.draw_text(sample, rng, mx, sy - 26, _loc("label", "Signature:"), lf, (90, 90, 105))
    primitives.render_signature(sample, rng, mx, sy, mx + sig_w, sy + 64)
    d.line([(mx, sy + 70), (mx + sig_w, sy + 70)], fill=(120, 120, 130), width=1)

    roll = rng.random()
    if roll < 0.45:
        primitives.render_seal(sample, rng, w - mx - 120, sy - 30, w - mx - 20, sy + 70)
    elif roll < 0.8:
        primitives.render_stamp(sample, rng, w - mx - 210, sy - 10, w - mx - 20, sy + 70)

    if rng.random() < 0.3:
        qsize = rng.randint(80, 110)
        primitives.render_qr(sample, rng, w - mx - qsize, rng.randint(60, 120), qsize)

    return base.finalize_document(sample, rng)
