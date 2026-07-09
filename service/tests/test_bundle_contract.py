"""Evidence Bundle contract tests (P3.4 core, Documentation/06 section 7).

Proves the seam end-to-end with REAL stage outputs, not toy dicts:
  xlsx corpus file -> office stage -> bundle -> validates,
  digital pdf      -> pdf stage    -> bundle -> validates,
  golden crop      -> lattice tap  -> bundle -> validates,
plus every rejection the brain relies on (missing lattice, page-count lie,
bad sha, unknown kind) and the forward-compat law (unknown fields pass).
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bundle import (  # noqa: E402
    BundleInvalid,
    new_bundle,
    new_page,
    ocr_line,
    page_from_csv_rows,
    page_from_pdf_digital,
    page_from_xlsx_sheet,
    sha256_of,
    validate_bundle,
)
from stages.office_stage import extract_csv, extract_xlsx  # noqa: E402
from stages.pdf_stage import extract_pages  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
NATIVE = ROOT / "test_cases" / "native_files"
REC_MODEL = ROOT / "public" / "models" / "PP-OCRv5_server_rec_infer.onnx"
REC_VOCAB = ROOT / "public" / "models" / "ppocrv5_dict.txt"
SHA = "0" * 64


# ------------------------------------------------------- real-route goldens

@pytest.mark.skipif(not (NATIVE / "ledger_00.xlsx").exists(),
                    reason="native XLSX fixture is gitignored; Modal runs the artifact gate")
def test_xlsx_route_bundles_and_validates():
    data = (NATIVE / "ledger_00.xlsx").read_bytes()
    sheets = extract_xlsx(data)
    pages = [page_from_xlsx_sheet(i, s) for i, s in enumerate(sheets)]
    bundle = new_bundle("xlsx", sha256_of(data), pages, timings={"office": 12.5})
    validate_bundle(bundle)
    cells = bundle["pages"][0]["native"]["cells"]
    assert any(c["value"] == "Opening balance" for c in cells)
    assert all(isinstance(c["r"], int) and isinstance(c["c"], int) for c in cells)


@pytest.mark.skipif(not (NATIVE / "invoice_digital_00.pdf").exists(),
                    reason="native PDF fixture is gitignored; Modal runs the artifact gate")
def test_pdf_digital_route_bundles_and_validates():
    data = (NATIVE / "invoice_digital_00.pdf").read_bytes()
    pdf_pages = extract_pages(data)
    pages = [page_from_pdf_digital(p) for p in pdf_pages]
    bundle = new_bundle("pdf_digital", sha256_of(data), pages)
    validate_bundle(bundle)
    runs = bundle["pages"][0]["native"]["textRuns"]
    assert len(runs) >= 5
    for r in runs:
        x, y, w, h = r["box"]
        assert -0.05 <= x <= 1.05 and w > 0 and h > 0


@pytest.mark.skipif(not (NATIVE / "payroll_00.csv").exists(),
                    reason="native CSV fixture is gitignored; Modal runs the artifact gate")
def test_csv_route_bundles_and_validates():
    data = (NATIVE / "payroll_00.csv").read_bytes()
    rows = extract_csv(data)
    bundle = new_bundle("csv", sha256_of(data), [page_from_csv_rows(0, rows)])
    validate_bundle(bundle)
    assert bundle["pages"][0]["native"]["cells"][0]["r"] == 0


@pytest.mark.skipif(not (REC_MODEL.exists() and REC_VOCAB.exists()),
                    reason="OCR model artifacts are gitignored; Modal runs the lattice gate")
def test_vision_route_with_real_lattice_validates():
    """The whole point: tap -> OcrLine -> bundle, lattice intact."""
    from PIL import Image, ImageDraw, ImageFont

    from stages.ocr_tap import create_session, load_vocab, tap_line

    session = create_session(REC_MODEL)
    vocab = load_vocab(REC_VOCAB)

    font = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 64)
    img = Image.new("RGB", (760, 96), "white")
    ImageDraw.Draw(img).text((12, 12), "TOTAL: 2860.00", font=font, fill="black")

    text, conf, lattice, _ = tap_line(session, img, vocab)
    page = new_page(0, 2200, 1400, quality={"blur": 0.1, "glare": 0.0, "contrast": 0.8})
    page["ocr"].append(ocr_line(
        poly=[(0.1, 0.4), (0.5, 0.4), (0.5, 0.45), (0.1, 0.45)],
        top1=text, conf=conf, lattice=lattice,
    ))
    bundle = new_bundle("image", SHA, [page], timings={"ocr.rec": 40.0})
    validate_bundle(bundle)
    steps = bundle["pages"][0]["ocr"][0]["lattice"]
    assert len(steps) >= 8
    assert all(len(step[0]) == 2 for step in steps)


# ------------------------------------------------------------- rejections

def _minimal_vision_bundle():
    page = new_page(0, 100, 100)
    page["ocr"].append(ocr_line(
        poly=[(0, 0), (1, 0), (1, 0.1), (0, 0.1)],
        top1="X", conf=0.9,
        lattice=[[("X", 0.9), ("", 0.1)]],
    ))
    return new_bundle("image", SHA, [page])


def test_valid_minimal_bundle_passes():
    validate_bundle(_minimal_vision_bundle())


def test_missing_lattice_is_rejected():
    b = _minimal_vision_bundle()
    del b["pages"][0]["ocr"][0]["lattice"]
    with pytest.raises(BundleInvalid, match="lattice"):
        validate_bundle(b)


def test_empty_lattice_on_vision_route_is_rejected():
    b = _minimal_vision_bundle()
    b["pages"][0]["ocr"][0]["lattice"] = []
    with pytest.raises(BundleInvalid):
        validate_bundle(b)


def test_page_count_lie_is_rejected():
    b = _minimal_vision_bundle()
    b["source"]["pages"] = 7
    with pytest.raises(BundleInvalid, match="pages"):
        validate_bundle(b)


def test_bad_sha_is_rejected():
    b = _minimal_vision_bundle()
    b["source"]["sha256"] = "not-a-sha"
    with pytest.raises(BundleInvalid):
        validate_bundle(b)


def test_unknown_kind_is_rejected():
    b = _minimal_vision_bundle()
    b["source"]["kind"] = "spreadsheet"
    with pytest.raises(BundleInvalid):
        validate_bundle(b)


def test_bad_rot_is_rejected():
    b = _minimal_vision_bundle()
    b["pages"][0]["ocr"][0]["rot"] = 45
    with pytest.raises(BundleInvalid):
        validate_bundle(b)


# ------------------------------------------------------ forward compat law

def test_unknown_fields_are_tolerated():
    """v1 governance: additive fields must never break a validator."""
    b = _minimal_vision_bundle()
    b["futureTopLevel"] = {"anything": True}
    b["pages"][0]["futurePageField"] = [1, 2, 3]
    b["pages"][0]["ocr"][0]["futureLineField"] = "ok"
    validate_bundle(b)
