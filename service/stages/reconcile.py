"""Hybrid text-layer reconciliation (I9, Documentation/05 section 4 `pdf.py`).

A PDF's text layer is a CLAIM, not evidence: OCR'd scans embed whatever some
other engine once guessed, and malicious files can plant arbitrary invisible
text. Digital-route trust is only granted after sampled spans are re-OCR'd
from the RENDERED pixels and agree with the layer's claims. Disagreement
flags the page `textLayerUntrusted` — it is then treated as scanned (full
vision ladder), never silently believed (N1 applies to file metadata too).
"""

from __future__ import annotations

import random
import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Callable

from PIL import Image

from stages.pdf_stage import extract_pages, rasterize_page

# Spans shorter than this (normalized) are unsampleable (single glyphs,
# kerning fragments) — they carry no reconciliation signal.
MIN_SPAN_CHARS = 4
# A sampled span whose re-OCR similarity falls below this disagrees.
AGREE_SIMILARITY = 0.6
# Untrusted verdict when more than this fraction of samples disagree
# (one OCR hiccup on a legit page must not poison the route).
UNTRUSTED_FRAC = 0.34
# Raster scale for re-OCR crops (body text -> comfortably above rec height).
RECONCILE_LONG_SIDE = 2200


def _normalize(s: str) -> str:
    return re.sub(r"\s+", "", s).upper()


def _similarity(a: str, b: str) -> float:
    if not a and not b:
        return 1.0
    return SequenceMatcher(None, a, b).ratio()


@dataclass
class ReconcileVerdict:
    trusted: bool
    sampled: int
    disagreements: int
    details: list[dict]


def reconcile_text_layer(
    data: bytes,
    page_index: int,
    ocr_fn: Callable[[Image.Image], str],
    sample_n: int = 8,
    seed: int = 0,
) -> ReconcileVerdict:
    """Sample text-layer spans, re-OCR their rendered pixels, compare.

    `ocr_fn` is the recognition tap (crop -> text); injected so the
    reconciler stays a pure orchestration over (pdf bytes, OCR).
    """
    pages = extract_pages(data)
    page = pages[page_index]
    candidates = [r for r in page.runs if len(_normalize(r.text)) >= MIN_SPAN_CHARS]
    if not candidates:
        # Nothing claimed => nothing to distrust; vision ladder handles pixels.
        return ReconcileVerdict(trusted=True, sampled=0, disagreements=0, details=[])

    rng = random.Random(seed)
    sample = rng.sample(candidates, min(sample_n, len(candidates)))

    img = rasterize_page(data, page_index, long_side=RECONCILE_LONG_SIDE)
    sx, sy = img.width / page.width, img.height / page.height

    details: list[dict] = []
    disagreements = 0
    for run in sample:
        x0, y0, x1, y1 = run.box
        pad = 3
        crop = img.crop((
            max(0, int(x0 * sx) - pad), max(0, int(y0 * sy) - pad),
            min(img.width, int(x1 * sx) + pad), min(img.height, int(y1 * sy) + pad),
        ))
        claimed = _normalize(run.text)
        seen = _normalize(ocr_fn(crop)) if crop.width >= 4 and crop.height >= 4 else ""
        sim = _similarity(seen, claimed)
        agree = sim >= AGREE_SIMILARITY
        if not agree:
            disagreements += 1
        details.append({"claimed": run.text, "seen": seen, "similarity": round(sim, 3), "agree": agree})

    trusted = (disagreements / len(sample)) <= UNTRUSTED_FRAC
    return ReconcileVerdict(trusted=trusted, sampled=len(sample),
                            disagreements=disagreements, details=details)
