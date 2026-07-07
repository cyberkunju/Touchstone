"""I9 reconciliation gate: the planted-garbage-text-layer trap (GATE P3 item).

Builds minimal PDFs from raw bytes (no writer library):
  - honest: visible text only -> text layer agrees with pixels -> trusted;
  - trap:   correct visible text PLUS invisible (render mode 3) planted
            claims over blank paper -> reconciliation must flag untrusted.

The OCR used for reconciliation is the REAL lattice tap over the real
PP-OCRv5 model — no mocks anywhere in this file.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from stages.ocr_tap import create_session, greedy_decode, load_vocab, normalize_crop, run_rec  # noqa: E402
from stages.reconcile import reconcile_text_layer  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
NATIVE = ROOT / "test_cases" / "native_files"


# ---------------------------------------------------------- pdf assembly ---

def _build_pdf(texts: list[tuple[float, float, str, bool]]) -> bytes:
    """One-page A4 PDF. texts = [(x, y, string, visible)] in PDF points
    (origin bottom-left). visible=False plants the text with render mode 3
    (invisible) — the classic garbage-text-layer attack."""
    content_parts = ["BT /F1 24 Tf"]
    for x, y, s, visible in texts:
        escaped = s.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
        content_parts.append(f"{3 if not visible else 0} Tr")
        content_parts.append(f"1 0 0 1 {x:.1f} {y:.1f} Tm ({escaped}) Tj")
    content_parts.append("ET")
    content = "\n".join(content_parts).encode("latin-1")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream",
    ]

    out = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref_at = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for off in offsets[1:]:
        out += f"{off:010d} 00000 n \n".encode()
    out += (f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_at}\n%%EOF").encode()
    return bytes(out)


# --------------------------------------------------------------- real OCR ---

@pytest.fixture(scope="module")
def ocr_fn():
    session = create_session(ROOT / "public" / "models" / "PP-OCRv5_server_rec_infer.onnx")
    vocab = load_vocab(ROOT / "public" / "models" / "ppocrv5_dict.txt")

    def run(crop):
        raw = run_rec(session, normalize_crop(crop))
        text, _ = greedy_decode(raw, vocab)
        return text

    return run


# ------------------------------------------------------------------ tests ---

def test_honest_pdf_is_trusted(ocr_fn):
    pdf = _build_pdf([
        (60, 760, "INVOICE 2026-4417", True),
        (60, 700, "VENDOR MERIDIAN LABS", True),
        (60, 640, "TOTAL 2860.00", True),
        (60, 580, "DUE 15/08/2026", True),
    ])
    verdict = reconcile_text_layer(pdf, 0, ocr_fn, sample_n=4)
    assert verdict.sampled == 4
    assert verdict.trusted, f"honest layer distrusted: {verdict.details}"
    assert verdict.disagreements == 0


def test_planted_garbage_text_layer_is_caught(ocr_fn):
    """THE trap: pixels say 2860.00 once; the layer ALSO claims invisible
    values over blank paper. Sampling must catch the lie."""
    pdf = _build_pdf([
        (60, 760, "INVOICE 2026-4417", True),
        (60, 640, "TOTAL 2860.00", True),
        # Planted invisible claims (blank paper at these spots):
        (60, 500, "TOTAL 999999.99", False),
        (60, 440, "BENEFICIARY EVIL CORP", False),
        (60, 380, "IBAN XX00 0000 0000", False),
    ])
    verdict = reconcile_text_layer(pdf, 0, ocr_fn, sample_n=5)
    assert verdict.sampled == 5
    assert not verdict.trusted, "planted text layer must be flagged untrusted"
    assert verdict.disagreements >= 2


def test_fully_lying_layer_is_caught(ocr_fn):
    """Visible pixels say one thing; the layer claims something else entirely
    (OCR'd-scan-with-wrong-engine scenario, or full substitution)."""
    pdf = _build_pdf([
        (60, 700, "AMOUNT 1234.56", False),   # claimed but invisible
        (60, 640, "PAYEE JOHN DOE", False),   # claimed but invisible
    ])
    verdict = reconcile_text_layer(pdf, 0, ocr_fn, sample_n=2)
    assert not verdict.trusted


@pytest.mark.parametrize("name", ["invoice_digital_00.pdf", "invoice_digital_03.pdf"])
def test_real_corpus_invoices_are_trusted(ocr_fn, name):
    data = (NATIVE / name).read_bytes()
    verdict = reconcile_text_layer(data, 0, ocr_fn, sample_n=8, seed=1)
    assert verdict.sampled > 0
    assert verdict.trusted, f"{name} wrongly distrusted: {verdict.details}"


def test_empty_text_layer_reconciles_trivially(ocr_fn):
    pdf = _build_pdf([])
    verdict = reconcile_text_layer(pdf, 0, ocr_fn)
    assert verdict.trusted and verdict.sampled == 0
