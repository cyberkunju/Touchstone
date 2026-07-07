"""Ladder E2E — bytes to validated bundle over every route, including the
strongest vision golden: a corpus passport whose MRZ truth must be present
in the emitted evidence (checksum truth by construction).

Marks the completion of the service core: after this, P3.1's FastAPI layer
is a thin composition over `perceive()`.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ladder import Models, UnsupportedType, perceive, reperceive  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
NATIVE = ROOT / "test_cases" / "native_files"
PASSPORTS = ROOT / "test_cases" / "passports" / "synthetic"


@pytest.fixture(scope="module")
def models():
    return Models(model_dir=ROOT / "public" / "models")


def test_xlsx_route(models):
    bundle = perceive((NATIVE / "ledger_00.xlsx").read_bytes(), models)
    assert bundle["source"]["kind"] == "xlsx"
    values = {c["value"] for c in bundle["pages"][0]["native"]["cells"]}
    assert "Opening balance" in values
    assert bundle["timings"]["office"] > 0


def test_csv_route(models):
    bundle = perceive((NATIVE / "payroll_00.csv").read_bytes(), models)
    assert bundle["source"]["kind"] == "csv"
    assert len(bundle["pages"][0]["native"]["cells"]) > 10


def test_pdf_digital_route_with_reconciliation(models):
    bundle = perceive((NATIVE / "invoice_digital_00.pdf").read_bytes(), models)
    assert bundle["source"]["kind"] == "pdf_digital"
    runs = bundle["pages"][0]["native"]["textRuns"]
    flat = "".join("".join(r["text"].split()) for r in runs)
    assert "INV-D-2026100" in flat
    assert bundle["timings"]["pdf.reconcile"] > 0, "digital trust must be earned"


def test_unsupported_is_refused(models):
    with pytest.raises(UnsupportedType):
        perceive(b"\x00\x01\x02\x03" * 100, models)


def test_vision_ladder_reads_passport_mrz(models):
    """THE golden: corpus passport -> service ladder -> MRZ in evidence.

    The gate here is honest evidence delivery, not decoding (the brain owns
    decoding): the emitted OCR lines must contain the two MRZ lines' text
    with lattices attached, ready for the checksum beam.
    """
    manifest = json.loads((PASSPORTS / "manifest.json").read_text(encoding="utf-8"))
    entry = next(e for e in manifest if e["file"] == "id00_clean.png")
    truth_l1, truth_l2 = entry["truth"]["mrzLines"]

    bundle = perceive((PASSPORTS / entry["file"]).read_bytes(), models)
    assert bundle["source"]["kind"] == "image"
    page = bundle["pages"][0]
    assert len(page["ocr"]) >= 5, "a passport page has many text lines"

    for line in page["ocr"]:
        assert line["lattice"], "every vision OCR line must carry its lattice"

    def best_similarity(target: str) -> float:
        import difflib
        return max(
            (difflib.SequenceMatcher(None, ln["top1"].replace(" ", ""), target).ratio()
             for ln in page["ocr"]),
            default=0.0,
        )

    sim1, sim2 = best_similarity(truth_l1), best_similarity(truth_l2)
    assert sim1 > 0.85, f"MRZ line 1 not delivered (best sim {sim1:.2f})"
    assert sim2 > 0.85, f"MRZ line 2 not delivered (best sim {sim2:.2f})"

    q = page["geometry"]["quality"]
    assert q["blur"] < 0.5, "clean render must measure sharp"


def test_vision_bundle_validates_and_times(models):
    bundle = perceive((PASSPORTS / "id00_clean.png").read_bytes(), models)
    for stage in ("quality", "ocr.det", "ocr.rec", "codes", "dewarp"):
        assert stage in bundle["timings"]
        assert bundle["timings"][stage] >= 0


def test_codes_flow_through_the_ladder(models):
    """Boarding pass -> perceive() -> BCBP payload in bundle.codes (RS-proven)."""
    import json as _json
    bp_dir = ROOT / "test_cases" / "boarding_passes" / "synthetic"
    manifest = _json.loads((bp_dir / "manifest.json").read_text(encoding="utf-8"))
    entry = next(e for e in manifest if e["file"].endswith("_clean.png"))
    bundle = perceive((bp_dir / entry["file"]).read_bytes(), models)
    payloads = {" ".join(c["payload"].split()) for c in bundle["pages"][0]["codes"]}
    want = " ".join(entry["truth"]["barcodePayload"].split())
    assert want in payloads, "the ladder must deliver the barcode evidence"


def test_lying_pdf_is_demoted_to_vision_at_document_level(models):
    """I9 through the LADDER: one sampled lying page distrusts the whole
    document — its 'digital' pages re-earn content through vision and the
    bundle self-reports pdf_hybrid + textLayerUntrusted."""
    from test_reconcile import _build_pdf

    lying = _build_pdf([
        (60, 760, "INVOICE 2026-4417", True),
        (60, 640, "TOTAL 2860.00", True),
        (60, 500, "TOTAL 999999.99", False),          # planted invisible claim
        (60, 440, "BENEFICIARY EVIL CORP", False),
    ])
    bundle = perceive(lying, models)
    assert bundle["source"]["kind"] == "pdf_hybrid"
    page = bundle["pages"][0]
    assert page["native"]["textLayerUntrusted"] is True
    assert len(page["ocr"]) >= 1, "vision must re-earn the page's content"
    assert all(line["lattice"] for line in page["ocr"])


def test_reperceive_rereads_roi_with_lattice(models):
    """I10: the brain asks for a failed field's ROI; the service re-reads it
    at higher effective DPI and returns lattice-bearing lines. Golden: the
    passport's MRZ band re-read through the foveation path."""
    import difflib

    data = (PASSPORTS / "id00_clean.png").read_bytes()
    manifest = json.loads((PASSPORTS / "manifest.json").read_text(encoding="utf-8"))
    truth_l1 = next(e for e in manifest if e["file"] == "id00_clean.png")["truth"]["mrzLines"][0]

    # Discovery pass locates the MRZ-ish lines; take the best line's poly as
    # the ROI the brain would send back.
    bundle = perceive(data, models)
    best = max(
        bundle["pages"][0]["ocr"],
        key=lambda ln: difflib.SequenceMatcher(
            None, ln["top1"].replace(" ", ""), truth_l1).ratio(),
    )
    xs = [p[0] for p in best["poly"]]
    ys = [p[1] for p in best["poly"]]
    roi = (min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys))

    lines = reperceive(data, 0, [roi], models)
    assert len(lines) == 1
    line = lines[0]
    assert line["lattice"], "foveated read must carry its lattice"
    sim = difflib.SequenceMatcher(
        None, line["top1"].replace(" ", ""), truth_l1).ratio()
    assert sim > 0.85, f"foveated MRZ read degraded (sim {sim:.2f})"


def test_reperceive_refuses_pixelless_routes(models):
    with pytest.raises(UnsupportedType):
        reperceive((NATIVE / "ledger_00.xlsx").read_bytes(), 0,
                   [(0.1, 0.1, 0.5, 0.1)], models)


def test_reperceive_degenerate_roi_is_skipped_not_fabricated(models):
    data = (PASSPORTS / "id00_clean.png").read_bytes()
    lines = reperceive(data, 0, [(0.5, 0.5, 0.0005, 0.0005)], models)
    assert lines == [], "a sub-pixel ROI yields nothing, never an invention"
