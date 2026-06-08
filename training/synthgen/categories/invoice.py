"""
Invoice / receipt builder.

Composes: document_page (full), logo, text_block header fields, table (line
items), qr_code and/or barcode, optional stamp. Emits arithmetic ground truth
(subtotal/tax/total) for downstream table-validation training.
"""
from __future__ import annotations

import random

from PIL import ImageDraw

from .. import fonts, i18n, primitives
from ..core import Sample
from . import base

_VENDORS = ["NORDA SUPPLY", "ACME PARTS CO", "GLOBEX LTD", "ZENITH TRADING",
            "MERIDIAN GOODS", "AXION SERVICES", "VERTEX WHOLESALE"]
_ITEMS = ["Widget", "Bracket", "Cable", "Service hr", "License", "Adapter",
          "Module", "Filter", "Sensor", "Mount", "Panel", "Connector"]


def build(rng: random.Random, seed: int) -> Sample:
    w = rng.randint(840, 1000)
    h = rng.randint(1100, 1320)
    family = f"invoice_{rng.choice('abc')}"
    sample = base.new_page(rng, w, h, seed, "invoice", family)
    base.add_page_boundary(sample, 0, 0, w - 1, h - 1)
    d = ImageDraw.Draw(sample.image)

    mx = rng.randint(40, 70)
    y = rng.randint(40, 70)

    # Header: logo + vendor + INVOICE title.
    primitives.render_logo(sample, rng, mx, y, mx + 50, y + 50, name=rng.choice(_VENDORS).split()[0])
    tf = fonts.pick_sans(rng, rng.randint(34, 46))
    script = i18n.maybe_pick_script(rng)
    title_txt = i18n.pick(rng, script, "title", "INVOICE") if script != "latin" else "INVOICE"
    title_font = fonts.pick_script(rng, rng.randint(34, 46), script) if script != "latin" else tf
    base.draw_text(sample, rng, w - mx - 220, y, title_txt, title_font, (40, 40, 60))
    if script != "latin":
        sample.language = i18n.SCRIPT_LANG[script]
    y += rng.randint(70, 100)

    lf = fonts.pick_sans(rng, rng.randint(15, 18))
    vf = fonts.pick_sans(rng, rng.randint(15, 18))
    inv_no = f"INV-{rng.randint(10000, 99999)}"
    y = base.label_value_row(sample, rng, mx, y, "Invoice No:", inv_no, lf, vf)
    y = base.label_value_row(sample, rng, mx, y, "Date:", f"{rng.randint(1,28):02d}/{rng.randint(1,12):02d}/2026", lf, vf)
    y = base.label_value_row(sample, rng, mx, y, "Bill To:", rng.choice(["Globex Inc", "Initech", "Umbrella Co", "Stark LLC"]), lf, vf)
    y += rng.randint(20, 40)

    # Line-item table with real arithmetic.
    rows = rng.randint(4, 8)
    cols = 4
    table_h = (rows + 1) * rng.randint(34, 44)
    cells = [["Item", "Qty", "Unit", "Amount"]]
    subtotal = 0
    for _ in range(rows):
        qty = rng.randint(1, 12)
        unit = rng.randint(5, 400)
        amount = qty * unit
        subtotal += amount
        cells.append([rng.choice(_ITEMS), str(qty), f"{unit}.00", f"{amount}.00"])
    primitives.render_table(sample, rng, mx, y, w - 2 * mx, table_h, rows + 1, cols,
                            bordered=rng.random() < 0.7, header=True, cells=cells)
    y += table_h + rng.randint(20, 40)

    # Totals.
    tax = round(subtotal * rng.choice([0.05, 0.1, 0.15, 0.2]))
    total = subtotal + tax
    tf2 = fonts.pick_sans(rng, rng.randint(16, 20))
    tx = w - mx - 260
    base.label_value_row(sample, rng, tx, y, "Subtotal:", f"{subtotal}.00", lf, tf2)
    y = base.label_value_row(sample, rng, tx, y + 4, "Tax:", f"{tax}.00", lf, tf2)
    bf = fonts.pick_sans(rng, rng.randint(20, 26))
    y = base.label_value_row(sample, rng, tx, y + 6, "Total:", f"{total}.00", bf, bf)
    y += rng.randint(20, 50)

    # Codes near the footer.
    if rng.random() < 0.7:
        qsize = rng.randint(90, 130)
        primitives.render_qr(sample, rng, mx, h - qsize - 50, qsize,
                             payload=f"{inv_no}|TOTAL:{total}.00")
    if rng.random() < 0.6:
        bw, bh = rng.randint(220, 320), rng.randint(50, 80)
        primitives.render_barcode(sample, rng, w - mx - bw, h - bh - 60, bw, bh,
                                  payload=str(rng.randint(10**9, 10**11)))
    # Occasional PAID stamp.
    if rng.random() < 0.5:
        sx = rng.randint(mx, w - mx - 220)
        sy = rng.randint(int(h * 0.4), int(h * 0.7))
        primitives.render_stamp(sample, rng, sx, sy, sx + 200, sy + 90)

    sample.ground_truth["invoice"] = {
        "invoiceNo": inv_no, "subtotal": subtotal, "tax": tax, "total": total,
    }
    return base.finalize_document(sample, rng)
