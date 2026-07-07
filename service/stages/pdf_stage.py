"""PDF stage — pypdfium2 text spans + digital/scanned/hybrid classification.

Documentation/05 section 4 (`pdf.py`): per-page text spans with boxes for
digital pages; page classification decides whether OCR is needed at all.
The hybrid-reconciliation sampling (re-OCR of random spans) composes at the
ladder level — this stage only reports what the PDF itself claims.

Digital route = N1 gold: text read from the PDF's own content stream has no
OCR uncertainty. It is still cross-checked downstream (closure laws), but
transcription silents are structurally impossible.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import pypdfium2 as pdfium

# A page is 'digital' when its text objects cover at least this fraction of
# the page area... except coverage is a poor proxy for sparse invoices; the
# robust signal is character count vs. what a raster of that size could hold.
MIN_DIGITAL_CHARS = 32          # fewer extractable chars than this => scanned
RASTER_LONG_SIDE = 2200         # discovery raster budget (05 section 6)


@dataclass
class TextRun:
    """One extracted text run with its page-space box (top-left origin, pt)."""
    text: str
    box: tuple[float, float, float, float]   # x0, y0, x1, y1


@dataclass
class PdfPage:
    index: int
    width: float
    height: float
    kind: str                      # 'digital' | 'scanned'
    runs: list[TextRun] = field(default_factory=list)
    text: str = ""                 # full page text in pdfium reading order

    @property
    def full_text(self) -> str:
        return self.text


def extract_pages(data: bytes) -> list[PdfPage]:
    """Extract per-page text runs and classify each page digital/scanned."""
    doc = pdfium.PdfDocument(data)
    pages: list[PdfPage] = []
    try:
        for i in range(len(doc)):
            page = doc[i]
            width, height = page.get_size()
            textpage = page.get_textpage()
            n_rects = textpage.count_rects()
            runs: list[TextRun] = []
            for r in range(n_rects):
                left, bottom, right, top = textpage.get_rect(r)
                text = textpage.get_text_bounded(left=left, bottom=bottom,
                                                 right=right, top=top)
                if not text.strip():
                    continue
                # PDF origin is bottom-left; normalize to top-left.
                runs.append(TextRun(
                    text=text,
                    box=(left, height - top, right, height - bottom),
                ))
            total_chars = sum(len(r.text.strip()) for r in runs)
            kind = "digital" if total_chars >= MIN_DIGITAL_CHARS else "scanned"
            page_text = textpage.get_text_range()
            pages.append(PdfPage(index=i, width=width, height=height,
                                 kind=kind, runs=runs, text=page_text))
            textpage.close()
            page.close()
    finally:
        doc.close()
    return pages


def classify_document(pages: list[PdfPage]) -> str:
    """'digital' | 'scanned' | 'hybrid' over the whole file."""
    kinds = {p.kind for p in pages}
    if kinds == {"digital"}:
        return "digital"
    if kinds == {"scanned"}:
        return "scanned"
    return "hybrid"


def rasterize_page(data: bytes, index: int,
                   long_side: int = RASTER_LONG_SIDE):
    """Raster a single page for the vision ladder (scanned/hybrid pages).

    Returns a PIL.Image (RGB). Scale chosen so the longer page side maps to
    `long_side` pixels.
    """
    doc = pdfium.PdfDocument(data)
    try:
        page = doc[index]
        width, height = page.get_size()
        scale = long_side / max(width, height)
        bitmap = page.render(scale=scale)
        img = bitmap.to_pil().convert("RGB")
        page.close()
        return img
    finally:
        doc.close()
