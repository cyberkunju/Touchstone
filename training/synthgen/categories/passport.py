"""
Passport / ID-card builder.

Composes: document_page (the card), photo, mrz_zone (valid ICAO), logo (emblem),
text_block fields, optional signature. ~1/3 of MRZs are deliberately corrupted
(invalid check digits) for verifier-robustness training.
"""
from __future__ import annotations

import random

from PIL import ImageDraw

from .. import fonts, mrz, primitives
from ..core import Sample
from . import base

_LABELS = {
    "type": "Type", "country": "Country Code", "passport_no": "Passport No.",
    "surname": "Surname", "given": "Given Names", "nationality": "Nationality",
    "dob": "Date of Birth", "sex": "Sex", "place": "Place of Birth",
    "issue": "Date of Issue", "expiry": "Date of Expiry", "authority": "Authority",
}
_PLACES = ["LONDON", "BERLIN", "TOKYO", "LAGOS", "SAO PAULO", "WARSAW",
           "MILAN", "TORONTO", "MUMBAI", "DUBAI", "CAIRO", "MADRID"]


def _iso_to_display(yymmdd: str) -> str:
    """YYMMDD -> 'DD MMM YYYY' display string."""
    months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
    yy, mm, dd = int(yymmdd[0:2]), int(yymmdd[2:4]), int(yymmdd[4:6])
    year = 2000 + yy if yy < 40 else 1900 + yy
    mm = max(1, min(12, mm))
    return f"{dd:02d} {months[mm - 1]} {year}"


def build(rng: random.Random, seed: int) -> Sample:
    w = rng.randint(1000, 1280)
    h = rng.randint(680, 860)
    family = f"passport_{rng.choice('abcd')}"
    sample = base.new_page(rng, w, h, seed, "passport", family)

    # Card region inset from the page edges.
    m = rng.randint(20, 50)
    cx0, cy0, cx1, cy1 = m, m, w - m, h - m
    card_tint = rng.choice([(232, 236, 244), (240, 234, 224), (228, 240, 232), (244, 240, 236)])
    base.add_page_boundary(sample, cx0, cy0, cx1, cy1, border=True, fill=card_tint)
    d = ImageDraw.Draw(sample.image)
    cw = cx1 - cx0

    fmt = rng.choice(["TD3", "TD3", "TD2", "TD1"])
    result = mrz.generate(rng, fmt)
    fields = result.fields
    invalid = rng.random() < 0.33
    if invalid:
        result = mrz.corrupt(rng, result)

    # Header: emblem (logo) + title.
    pad = rng.randint(24, 40)
    title_f = fonts.pick_serif(rng, rng.randint(30, 42))
    primitives.render_logo(sample, rng, cx0 + pad, cy0 + pad,
                           cx0 + pad + 60, cy0 + pad + 60)
    title = rng.choice(["PASSPORT", "PASSEPORT", "IDENTITY CARD", "TRAVEL DOCUMENT"])
    base.draw_text(sample, rng, cx0 + pad + 130, cy0 + pad + 8, title, title_f, (30, 40, 90))

    # Photo on the left.
    photo_w = int(cw * 0.24)
    photo_h = int(photo_w * 1.3)
    px0 = cx0 + pad
    py0 = cy0 + pad + 80
    primitives.render_photo(sample, rng, px0, py0, px0 + photo_w, py0 + photo_h)

    # Signature under the photo (sometimes).
    if rng.random() < 0.72:
        sy = py0 + photo_h + 14
        primitives.render_signature(sample, rng, px0, sy, px0 + photo_w, sy + 60)

    # Field column to the right of the photo.
    lf = fonts.pick_sans(rng, rng.randint(16, 20))
    vf = fonts.pick_sans(rng, rng.randint(20, 26))
    fx = px0 + photo_w + rng.randint(30, 50)
    fy = py0
    rows = [
        ("type", fields.get("documentType", "P")),
        ("country", fields.get("issuingCountry", "UTO")),
        ("passport_no", fields.get("documentNumber", "")),
        ("surname", fields.get("surname", "")),
        ("given", fields.get("givenNames", "")),
        ("nationality", fields.get("nationality", "")),
        ("dob", _iso_to_display(fields.get("dateOfBirth", "900101"))),
        ("sex", fields.get("sex", "X")),
        ("place", rng.choice(_PLACES)),
        ("expiry", _iso_to_display(fields.get("expiryDate", "300101"))),
    ]
    for key, val in rows:
        if fy > cy1 - 180:
            break
        fy = base.label_value_row(sample, rng, fx, fy, _LABELS[key], str(val), lf, vf)

    # MRZ band at the bottom.
    mrz_y = cy1 - rng.randint(90, 130)
    primitives.render_mrz(sample, rng, cx0 + pad, mrz_y, cw - 2 * pad, result.lines)

    # Ground-truth MRZ parse. For a CORRUPTED strip we parse the corrupted
    # lines so parsedFields reflect what is actually printed (matching the
    # pixels) rather than the pristine source — otherwise supervision claims a
    # valid parse over a visibly broken MRZ. The printed human-readable card
    # fields legitimately retain the original data (a real forgery/scan defect
    # affects only the MRZ strip).
    if invalid:
        parsed = mrz.parse(result.fmt, result.lines)
    else:
        parsed = fields
    sample.ground_truth["mrz"] = {
        "format": result.fmt, "lines": result.lines,
        "valid": not invalid, "parsedFields": parsed,
    }
    sample.language = "en"
    return base.finalize_document(sample, rng)
