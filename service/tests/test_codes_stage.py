"""Codes stage gate — decoded payloads vs corpus manifests (G1 truth).

Boarding passes (Aztec BCBP), shipping labels (Code128 with mod-10 tracking),
licenses (AAMVA PDF417): every corpus barcode payload is truth by
construction, so a decode either matches EXACTLY or the stage fails.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from stages.codes_stage import scan_codes  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]


def _manifest(family: str) -> list[dict]:
    return json.loads(
        (ROOT / "test_cases" / family / "synthetic" / "manifest.json").read_text(encoding="utf-8"))


def _load(family: str, file: str) -> np.ndarray:
    return np.asarray(Image.open(ROOT / "test_cases" / family / "synthetic" / file).convert("RGB"))


def _clean(s: str) -> str:
    return " ".join(str(s).split())


@pytest.mark.parametrize("entry",
                         [e for e in _manifest("boarding_passes") if e["file"].endswith("_clean.png")][:6],
                         ids=lambda e: e["file"])
def test_boarding_aztec_payloads_exact(entry):
    codes = scan_codes(_load("boarding_passes", entry["file"]))
    payloads = {_clean(c.payload) for c in codes}
    assert _clean(entry["truth"]["barcodePayload"]) in payloads, \
        f"{entry['file']}: BCBP payload not decoded (got {len(codes)} codes)"


@pytest.mark.parametrize("entry",
                         [e for e in _manifest("shipping_labels") if e["file"].endswith("_clean.png")][:6],
                         ids=lambda e: e["file"])
def test_shipping_code128_payloads_exact(entry):
    codes = scan_codes(_load("shipping_labels", entry["file"]))
    payloads = {_clean(c.payload) for c in codes}
    assert _clean(entry["truth"]["barcodePayload"]) in payloads


@pytest.mark.parametrize("entry",
                         [e for e in _manifest("licenses") if e["file"].endswith("_clean.png")][:4],
                         ids=lambda e: e["file"])
def test_license_pdf417_aamva_exact(entry):
    codes = scan_codes(_load("licenses", entry["file"]))
    pdf417 = [c for c in codes if "PDF417" in c.format.upper().replace("_", "")]
    assert pdf417, f"{entry['file']}: no PDF417 decoded"
    assert any(_clean(c.payload) == _clean(entry["truth"]["barcodePayload"]) for c in pdf417)


def test_boxes_are_normalized_and_ordered():
    entry = next(e for e in _manifest("shipping_labels") if e["file"].endswith("_clean.png"))
    codes = scan_codes(_load("shipping_labels", entry["file"]))
    assert codes
    for c in codes:
        x, y, w, h = c.box
        assert 0 <= x <= 1 and 0 <= y <= 1 and w > 0 and h > 0
    ys = [c.box[1] for c in codes]
    assert ys == sorted(ys)


def test_blank_paper_decodes_nothing():
    blank = np.full((600, 800, 3), 255, dtype=np.uint8)
    assert scan_codes(blank) == []
