"""P3.3 native-route gate: router + pdf + office stages vs the committed
native_files corpus (13 files, G1 truth by construction).

The law mirrors bench/gate.mjs: every truth field must be found EXACTLY in
the native extraction — a wrong value is a silent error and fails loudly.
Digital routes have zero OCR uncertainty, so the bar is exact, not fuzzy.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from router import (  # noqa: E402
    ROUTE_CSV,
    ROUTE_DOCX,
    ROUTE_IMAGE,
    ROUTE_LEGACY_OFFICE,
    ROUTE_PDF,
    ROUTE_UNSUPPORTED,
    ROUTE_XLSX,
    sniff_route,
)
from stages.office_stage import extract_csv, extract_xlsx  # noqa: E402
from stages.pdf_stage import classify_document, extract_pages  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
NATIVE = ROOT / "test_cases" / "native_files"
MANIFEST = json.loads((NATIVE / "manifest.json").read_text(encoding="utf-8"))


def _entries(suffix: str):
    return [e for e in MANIFEST if e["file"].endswith(suffix)]


# ---------------------------------------------------------------- router ---

def test_router_never_uses_extensions():
    """Rename-proof: routing is identical when the name lies."""
    pdf = (NATIVE / "invoice_digital_00.pdf").read_bytes()
    xlsx = (NATIVE / "ledger_00.xlsx").read_bytes()
    csv_b = (NATIVE / "payroll_00.csv").read_bytes()
    assert sniff_route(pdf) == ROUTE_PDF
    assert sniff_route(xlsx) == ROUTE_XLSX
    assert sniff_route(csv_b) == ROUTE_CSV


def test_router_full_corpus():
    want = {".pdf": ROUTE_PDF, ".xlsx": ROUTE_XLSX, ".csv": ROUTE_CSV}
    for entry in MANIFEST:
        data = (NATIVE / entry["file"]).read_bytes()
        suffix = Path(entry["file"]).suffix
        assert sniff_route(data) == want[suffix], entry["file"]


def test_router_rejects_garbage_explicitly():
    assert sniff_route(b"") == ROUTE_UNSUPPORTED
    assert sniff_route(b"\x00\x01\x02\x03" * 64) == ROUTE_UNSUPPORTED
    assert sniff_route(b"just a plain sentence with no separators") == ROUTE_UNSUPPORTED


def test_router_signatures():
    assert sniff_route(b"\x89PNG\r\n\x1a\n" + b"\x00" * 64) == ROUTE_IMAGE
    assert sniff_route(b"\xff\xd8\xff\xe0" + b"\x00" * 64) == ROUTE_IMAGE
    assert sniff_route(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 64) == ROUTE_LEGACY_OFFICE
    # A ZIP that is neither sheet nor doc: unsupported, not guessed.
    import io as _io
    import zipfile as _zip
    buf = _io.BytesIO()
    with _zip.ZipFile(buf, "w") as zf:
        zf.writestr("random.txt", "hi")
    assert sniff_route(buf.getvalue()) == ROUTE_UNSUPPORTED


# ------------------------------------------------------------- pdf stage ---

@pytest.mark.parametrize("entry", _entries(".pdf"), ids=lambda e: e["file"])
def test_pdf_digital_route_exact_truth(entry):
    """Every truth value appears verbatim in the extracted text layer."""
    pages = extract_pages((NATIVE / entry["file"]).read_bytes())
    assert classify_document(pages) == "digital", "invoices are born digital"
    text = "\n".join(p.full_text for p in pages)
    # pdfium may letter-space runs (kerned glyphs emit separated); strip ALL
    # whitespace for containment — character ORDER is still fully asserted.
    flat = "".join(text.split())
    for field_name, want in entry["truth"].items():
        # Amounts render with thousands separators; accept both spellings
        # but require EXACT numeric content (N1: no fuzzy credit).
        candidates = {want}
        if "." in want:
            integer, frac = want.split(".")
            if len(integer) > 3:
                grouped = ""
                while len(integer) > 3:
                    grouped = "," + integer[-3:] + grouped
                    integer = integer[:-3]
                candidates.add(integer + grouped + "." + frac)
        assert any(c in flat for c in candidates), (
            f"{entry['file']}: truth {field_name}={want!r} missing from text layer"
        )


def test_pdf_runs_have_boxes():
    pages = extract_pages((NATIVE / "invoice_digital_00.pdf").read_bytes())
    runs = pages[0].runs
    assert len(runs) >= 5
    for r in runs:
        x0, y0, x1, y1 = r.box
        assert x1 > x0 and y1 > y0, "boxes must be non-degenerate"
        assert 0 <= x0 <= pages[0].width and 0 <= y1 <= pages[0].height


# ---------------------------------------------------------- office stage ---

@pytest.mark.parametrize("entry", _entries(".xlsx"), ids=lambda e: e["file"])
def test_xlsx_exact_cells(entry):
    sheets = extract_xlsx((NATIVE / entry["file"]).read_bytes())
    assert sheets, "workbook must have sheets"
    values = {c.value for s in sheets for c in s.cells}
    for field_name, want in entry["truth"].items():
        # Native cells store the number; accept canonical numeric equality.
        numeric = {v for v in values if _num_eq(v, want)}
        assert numeric, f"{entry['file']}: {field_name}={want!r} not in any cell"


def test_xlsx_captures_formulas_when_present():
    sheets = extract_xlsx((NATIVE / "ledger_00.xlsx").read_bytes())
    all_cells = [c for s in sheets for c in s.cells]
    assert all(
        (c.formula is None) or c.formula.startswith("=") for c in all_cells
    )


@pytest.mark.parametrize("entry", _entries(".csv"), ids=lambda e: e["file"])
def test_csv_exact_rows(entry):
    rows = extract_csv((NATIVE / entry["file"]).read_bytes())
    want_rows = entry["truth"]["rows"]
    # header + data rows
    assert len(rows) == want_rows + 1, (
        f"{entry['file']}: got {len(rows) - 1} data rows, want {want_rows}"
    )
    width = len(rows[0])
    assert width >= 2
    assert all(len(r) == width for r in rows), "ragged rows = wrong dialect"


def _num_eq(a: str, b: str) -> bool:
    try:
        return abs(float(a.replace(",", "")) - float(b.replace(",", ""))) < 0.005
    except ValueError:
        return False
