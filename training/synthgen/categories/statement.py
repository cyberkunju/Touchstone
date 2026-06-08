"""
Bank/utility statement builder — table-heavy with running balances.

Composes: document_page, logo, header text_blocks, large transaction table,
optional barcode. Emits balance-progression ground truth for table validation.
"""
from __future__ import annotations

import random

from PIL import ImageDraw

from .. import fonts, primitives
from ..core import Sample
from . import base

_BANKS = ["Norda Bank", "Globex Credit", "Zenith Savings", "Meridian Trust",
          "Vertex Financial", "Axion Bank"]
_DESCS = ["Card Payment", "Direct Debit", "Transfer In", "ATM Withdrawal",
          "Salary", "Refund", "Subscription", "Interest", "Fee", "Deposit"]


def build(rng: random.Random, seed: int) -> Sample:
    w = rng.randint(860, 1020)
    h = rng.randint(1140, 1360)
    family = f"statement_{rng.choice('abc')}"
    sample = base.new_page(rng, w, h, seed, "statement", family)
    base.add_page_boundary(sample, 0, 0, w - 1, h - 1)
    d = ImageDraw.Draw(sample.image)

    mx = rng.randint(40, 64)
    y = rng.randint(40, 60)
    primitives.render_logo(sample, rng, mx, y, mx + 50, y + 48, name=rng.choice(_BANKS).split()[0])
    tf = fonts.pick_sans(rng, rng.randint(26, 34))
    base.draw_text(sample, rng, w - mx - 320, y, "ACCOUNT STATEMENT", tf, (40, 40, 60))
    y += rng.randint(64, 90)

    lf = fonts.pick_sans(rng, 15)
    vf = fonts.pick_sans(rng, 15)
    y = base.label_value_row(sample, rng, mx, y, "Account:", f"****{rng.randint(1000,9999)}", lf, vf)
    y = base.label_value_row(sample, rng, mx, y, "Period:", "01/2026 - 02/2026", lf, vf)
    opening = rng.randint(500, 5000)
    y = base.label_value_row(sample, rng, mx, y, "Opening Balance:", f"{opening}.00", lf, vf)
    y += rng.randint(16, 30)

    # Transaction table with running balance.
    n = rng.randint(8, 16)
    cells = [["Date", "Description", "Amount", "Balance"]]
    bal = opening
    for i in range(n):
        delta = rng.randint(-400, 600)
        bal += delta
        sign = "+" if delta >= 0 else "-"
        cells.append([f"{rng.randint(1,28):02d}/01", rng.choice(_DESCS),
                      f"{sign}{abs(delta)}.00", f"{bal}.00"])
    t_h = (n + 1) * rng.randint(30, 38)
    primitives.render_table(sample, rng, mx, y, w - 2 * mx, t_h, n + 1, 4,
                            bordered=rng.random() < 0.5, header=True, cells=cells)
    y += t_h + rng.randint(20, 40)

    bf = fonts.pick_sans(rng, 18)
    base.label_value_row(sample, rng, w - mx - 280, y, "Closing Balance:", f"{bal}.00", bf, bf)

    if rng.random() < 0.6:
        bw, bh = rng.randint(220, 300), rng.randint(46, 70)
        primitives.render_barcode(sample, rng, mx, h - bh - 50, bw, bh)

    sample.ground_truth["statement"] = {"opening": opening, "closing": bal}
    return base.finalize_document(sample, rng)
