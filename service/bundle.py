"""Evidence Bundle v1 assembly + validation (Documentation/06).

One constructor per stage output; `validate_bundle` enforces the shared JSON
Schema PLUS the two semantic rules a schema cannot express:
  1. vision-route pages must carry lattices on every OCR line (a lattice-less
     vision bundle is invalid — the whole architecture hinges on it),
  2. `source.pages` equals `len(pages)`.

The schema file (bundle-schema.json) is the single source of truth, mirrored
byte-for-byte into src/perception/; CI diffs the copies.
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

import jsonschema

SCHEMA_PATH = Path(__file__).resolve().parent / "bundle-schema.json"
_SCHEMA = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
_VALIDATOR = jsonschema.Draft202012Validator(_SCHEMA)

VISION_KINDS = {"image", "pdf_scanned", "pdf_hybrid"}


def sha256_of(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def new_bundle(kind: str, sha256: str, pages: list[dict[str, Any]],
               timings: dict[str, float] | None = None,
               stage_errors: list[dict[str, str]] | None = None) -> dict[str, Any]:
    bundle: dict[str, Any] = {
        "bundleVersion": 1,
        "source": {"kind": kind, "sha256": sha256, "pages": len(pages)},
        "timings": timings or {},
        "pages": pages,
    }
    if stage_errors:
        bundle["stageErrors"] = stage_errors
    return bundle


def new_page(index: int, w_px: int, h_px: int,
             deskew_deg: float = 0.0,
             quality: dict[str, float] | None = None) -> dict[str, Any]:
    """Empty page skeleton — stages append into the arrays."""
    return {
        "index": index,
        "geometry": {
            "wPx": w_px,
            "hPx": h_px,
            "deskewDeg": deskew_deg,
            "quality": quality or {"blur": 0.0, "glare": 0.0, "contrast": 1.0},
        },
        "ocr": [],
        "layout": [],
        "codes": [],
        "faces": [],
        "tables": [],
    }


def ocr_line(poly: list[tuple[float, float]], top1: str, conf: float,
             lattice: list[list[tuple[str, float]]],
             rot: int = 0) -> dict[str, Any]:
    return {
        "poly": [list(p) for p in poly],
        "top1": top1,
        "conf": conf,
        "rot": rot,
        "lattice": [[list(pair) for pair in step] for step in lattice],
    }


_CELL_REF = re.compile(r"^([A-Z]+)(\d+)$")


def _ref_to_rc(ref: str) -> tuple[int, int]:
    """'B12' -> (11, 1) zero-based."""
    m = _CELL_REF.match(ref)
    if not m:
        raise ValueError(f"bad cell ref: {ref!r}")
    col = 0
    for ch in m.group(1):
        col = col * 26 + (ord(ch) - 64)
    return int(m.group(2)) - 1, col - 1


def page_from_xlsx_sheet(index: int, sheet: Any) -> dict[str, Any]:
    """NativeSheet (office_stage) -> PageEvidence with native.cells.

    Sheets have no raster; wPx/hPx are nominal 1x1 (geometry is meaningless
    for native routes but the contract keeps one shape for every page).
    """
    merged_by_origin: dict[tuple[int, int], list[int]] = {}
    for rng in sheet.merged:
        start, _, end = rng.partition(":")
        r0, c0 = _ref_to_rc(start)
        r1, c1 = _ref_to_rc(end) if end else (r0, c0)
        merged_by_origin[(r0, c0)] = [r0, c0, r1, c1]

    cells = []
    for cell in sheet.cells:
        r, c = _ref_to_rc(cell.ref)
        entry: dict[str, Any] = {"r": r, "c": c, "value": cell.value}
        if cell.formula:
            entry["formula"] = cell.formula
        if cell.number_format and cell.number_format != "General":
            entry["numFmt"] = cell.number_format
        if (r, c) in merged_by_origin:
            entry["merged"] = merged_by_origin[(r, c)]
        cells.append(entry)

    page = new_page(index, 1, 1)
    page["native"] = {"cells": cells}
    return page


def page_from_csv_rows(index: int, rows: list[list[str]]) -> dict[str, Any]:
    cells = [
        {"r": r, "c": c, "value": value}
        for r, row in enumerate(rows)
        for c, value in enumerate(row)
    ]
    page = new_page(index, 1, 1)
    page["native"] = {"cells": cells}
    return page


def page_from_pdf_digital(pdf_page: Any) -> dict[str, Any]:
    """PdfPage (pdf_stage) -> PageEvidence with native.textRuns.

    Run boxes are normalized 0..1 against the page's point size, clamped to
    the schema's tolerance band (pdfium can report sub-point overshoot).
    """
    w, h = pdf_page.width, pdf_page.height
    clamp = lambda v: max(-0.05, min(1.05, v))  # noqa: E731
    runs = []
    for run in pdf_page.runs:
        x0, y0, x1, y1 = run.box
        runs.append({
            "text": run.text,
            "box": [clamp(x0 / w), clamp(y0 / h),
                    clamp((x1 - x0) / w), clamp((y1 - y0) / h)],
        })
    page = new_page(pdf_page.index, round(w), round(h))
    page["native"] = {"textRuns": runs}
    return page


class BundleInvalid(ValueError):
    """Raised on any contract violation — never returned as a bundle."""


def validate_bundle(bundle: dict[str, Any]) -> None:
    errors = sorted(_VALIDATOR.iter_errors(bundle), key=lambda e: e.json_path)
    if errors:
        first = errors[0]
        raise BundleInvalid(f"{first.json_path}: {first.message}")

    # Semantic rule 1: page count coherence.
    declared = bundle["source"]["pages"]
    actual = len(bundle["pages"])
    if declared != actual:
        raise BundleInvalid(f"source.pages={declared} but {actual} pages present")

    # Semantic rule 2: vision routes must carry lattices on every OCR line.
    # (The schema already requires the property; this guards empty lattices
    # and the pathological zero-OCR vision page with runs claimed as native.)
    if bundle["source"]["kind"] in VISION_KINDS:
        for page in bundle["pages"]:
            for line in page["ocr"]:
                if not line["lattice"]:
                    raise BundleInvalid(
                        f"page {page['index']}: vision-route OCR line without lattice"
                    )
