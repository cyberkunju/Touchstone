"""The ladder (P3.4/05 section 5) — bytes in, validated Evidence Bundle out.

Composes router + stages into the one orchestration every endpoint calls:

  route(bytes) ->
    xlsx / csv / docx : native cells, zero OCR
    pdf               : digital pages -> native.textRuns (+ I9 reconciliation
                        sampling); scanned pages -> vision ladder on raster
    image             : vision ladder (quality -> det -> rec taps -> lattice)

Stage failures never masquerade as success: each failed stage appends to
stageErrors while the rest still deliver (partials are explicit).
Every bundle passes validate_bundle before leaving this module.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from bundle import (
    new_bundle,
    new_page,
    ocr_line,
    page_from_csv_rows,
    page_from_pdf_digital,
    page_from_xlsx_sheet,
    sha256_of,
    validate_bundle,
)
from router import (
    ROUTE_CSV,
    ROUTE_DOCX,
    ROUTE_IMAGE,
    ROUTE_PDF,
    ROUTE_XLSX,
    sniff_route,
)
from stages import (
    codes_stage,
    det_stage,
    dewarp_stage,
    office_stage,
    pdf_stage,
    quality_stage,
    tables_stage,
)
from stages.ocr_tap import create_session, load_vocab, tap_line
from stages.reconcile import reconcile_text_layer


class UnsupportedType(ValueError):
    """Explicit refusal — never guessed (router law)."""


@dataclass
class Models:
    """Lazy model registry — sessions load on first use and stay resident."""
    model_dir: Path
    _det: Any = None
    _rec: Any = None
    _vocab: list[str] | None = None

    @property
    def det(self):
        if self._det is None:
            self._det = create_session(self.model_dir / "PP-OCRv5_server_det_infer.onnx")
        return self._det

    @property
    def rec(self):
        if self._rec is None:
            self._rec = create_session(self.model_dir / "PP-OCRv5_server_rec_infer.onnx")
        return self._rec

    @property
    def vocab(self) -> list[str]:
        if self._vocab is None:
            self._vocab = load_vocab(self.model_dir / "ppocrv5_dict.txt")
        return self._vocab


def _vision_page(models: Models, img: Image.Image, index: int,
                 timings: dict[str, float],
                 stage_errors: list[dict[str, str]]) -> dict[str, Any]:
    """dewarp -> quality -> det -> rec-with-lattice -> codes -> tables."""
    rgb = img.convert("RGB")
    arr = np.asarray(rgb)

    # Dewarp first: geometry fixes benefit every later stage. The stage is
    # honesty-gated (no plausible page quad => IDENTICAL pass-through), so
    # full-frame scans and synthetic renders are untouched by construction.
    t0 = time.perf_counter()
    try:
        dw = dewarp_stage.rectify_page(arr)
        if dw.method != "none":
            arr = dw.image
            rgb = Image.fromarray(arr)
    except Exception as e:  # noqa: BLE001
        stage_errors.append({"stage": "dewarp", "code": "INTERNAL", "detail": str(e)})
        dw = None
    timings["dewarp"] = timings.get("dewarp", 0) + (time.perf_counter() - t0) * 1000

    t0 = time.perf_counter()
    q = quality_stage.measure_quality(arr)
    timings["quality"] = timings.get("quality", 0) + (time.perf_counter() - t0) * 1000

    page = new_page(index, rgb.width, rgb.height,
                    quality={"blur": q.blur, "glare": q.glare, "contrast": q.contrast})
    if dw is not None and dw.method != "none":
        page["geometry"]["dewarp"] = {"applied": True, "method": "classical"}

    t0 = time.perf_counter()
    try:
        boxes = det_stage.detect_lines(models.det, rgb)
    except Exception as e:  # noqa: BLE001 — partials are explicit, not fatal
        stage_errors.append({"stage": "ocr.det", "code": "INTERNAL", "detail": str(e)})
        boxes = []
    timings["ocr.det"] = timings.get("ocr.det", 0) + (time.perf_counter() - t0) * 1000

    t0 = time.perf_counter()
    for x0, y0, x1, y1 in boxes:
        crop = rgb.crop((int(x0 * rgb.width), int(y0 * rgb.height),
                         int(x1 * rgb.width), int(y1 * rgb.height)))
        if crop.width < 4 or crop.height < 4:
            continue
        try:
            text, conf, lattice, _ = tap_line(models.rec, crop, models.vocab)
        except Exception as e:  # noqa: BLE001
            stage_errors.append({"stage": "ocr.rec", "code": "INTERNAL", "detail": str(e)})
            continue
        if not lattice:
            continue
        page["ocr"].append(ocr_line(
            poly=[(x0, y0), (x1, y0), (x1, y1), (x0, y1)],
            top1=text, conf=conf, lattice=lattice,
        ))
    timings["ocr.rec"] = timings.get("ocr.rec", 0) + (time.perf_counter() - t0) * 1000

    t0 = time.perf_counter()
    try:
        for code in codes_stage.scan_codes(arr):
            page["codes"].append({
                "format": code.format,
                "payload": code.payload,
                "box": list(code.box),
                **({"ecLevel": code.ec_level} if code.ec_level else {}),
            })
    except Exception as e:  # noqa: BLE001
        stage_errors.append({"stage": "codes", "code": "INTERNAL", "detail": str(e)})
    timings["codes"] = timings.get("codes", 0) + (time.perf_counter() - t0) * 1000

    t0 = time.perf_counter()
    try:
        for t in tables_stage.detect_tables(arr):
            page["tables"].append({
                "box": list(t.box),
                "method": t.method,
                "cells": [{"r": c.r, "c": c.c, "rs": c.rs, "cs": c.cs, "box": list(c.box)}
                          for c in t.cells],
            })
    except Exception as e:  # noqa: BLE001
        stage_errors.append({"stage": "tables", "code": "INTERNAL", "detail": str(e)})
    timings["tables"] = timings.get("tables", 0) + (time.perf_counter() - t0) * 1000

    return page


def perceive(data: bytes, models: Models) -> dict[str, Any]:
    """The single entry: bytes -> validated EvidenceBundle."""
    route = sniff_route(data)
    sha = sha256_of(data)
    timings: dict[str, float] = {}
    stage_errors: list[dict[str, str]] = []

    if route == ROUTE_XLSX:
        t0 = time.perf_counter()
        sheets = office_stage.extract_xlsx(data)
        timings["office"] = (time.perf_counter() - t0) * 1000
        pages = [page_from_xlsx_sheet(i, s) for i, s in enumerate(sheets)]
        bundle = new_bundle("xlsx", sha, pages, timings, stage_errors or None)

    elif route == ROUTE_CSV:
        t0 = time.perf_counter()
        rows = office_stage.extract_csv(data)
        timings["office"] = (time.perf_counter() - t0) * 1000
        bundle = new_bundle("csv", sha, [page_from_csv_rows(0, rows)], timings)

    elif route == ROUTE_DOCX:
        t0 = time.perf_counter()
        content = office_stage.extract_docx(data)
        timings["office"] = (time.perf_counter() - t0) * 1000
        # Paragraph/table text as native cells (r = flow order).
        cells = [{"r": i, "c": 0, "value": p} for i, p in enumerate(content.paragraphs)]
        page = new_page(0, 1, 1)
        page["native"] = {"cells": cells}
        bundle = new_bundle("docx", sha, [page], timings)

    elif route == ROUTE_PDF:
        t0 = time.perf_counter()
        pdf_pages = pdf_stage.extract_pages(data)
        timings["pdf.text"] = (time.perf_counter() - t0) * 1000
        doc_kind = pdf_stage.classify_document(pdf_pages)

        def _reocr(crop: Image.Image) -> str:
            text, _, _, _ = tap_line(models.rec, crop, models.vocab)
            return text

        # I9 sampling is per DOCUMENT, not per page: re-OCR-ing every page
        # of a 25-page digital PDF blows the 1s/25-pages budget for a check
        # whose power comes from sampling. Deterministic spread: first,
        # middle, last digital pages. A caught lie on ANY sampled page
        # distrusts the whole document's text layer (a file with one planted
        # page is a planted file).
        digital_idx = [p.index for p in pdf_pages if p.kind == "digital"]
        sample_pages: set[int] = set()
        if digital_idx:
            sample_pages = {digital_idx[0], digital_idx[len(digital_idx) // 2],
                            digital_idx[-1]}
        doc_layer_trusted = True
        t0 = time.perf_counter()
        for idx in sorted(sample_pages):
            verdict = reconcile_text_layer(data, idx, _reocr, sample_n=6)
            if not verdict.trusted:
                doc_layer_trusted = False
                break
        if sample_pages:
            timings["pdf.reconcile"] = (time.perf_counter() - t0) * 1000

        pages = []
        for p in pdf_pages:
            if p.kind == "digital" and doc_layer_trusted:
                pages.append(page_from_pdf_digital(p))
            elif p.kind == "digital":
                # I9: lying text layer -> the whole doc's claims are untrusted;
                # every "digital" page re-earns its content through vision.
                page = _vision_page(
                    models, pdf_stage.rasterize_page(data, p.index), p.index,
                    timings, stage_errors)
                page["native"] = {"textLayerUntrusted": True}
                pages.append(page)
            else:
                pages.append(_vision_page(
                    models, pdf_stage.rasterize_page(data, p.index), p.index,
                    timings, stage_errors))

        kinds = {"digital": "pdf_digital", "scanned": "pdf_scanned", "hybrid": "pdf_hybrid"}
        untrusted = any(pg.get("native", {}).get("textLayerUntrusted") for pg in pages)
        kind = "pdf_hybrid" if untrusted else kinds[doc_kind]
        bundle = new_bundle(kind, sha, pages, timings, stage_errors or None)

    elif route == ROUTE_IMAGE:
        import io
        img = Image.open(io.BytesIO(data))
        page = _vision_page(models, img, 0, timings, stage_errors)
        bundle = new_bundle("image", sha, [page], timings, stage_errors or None)

    else:
        raise UnsupportedType(f"route {route!r} is not perceivable")

    validate_bundle(bundle)
    return bundle


def reperceive(data: bytes, page_index: int,
               rois: list[tuple[float, float, float, float]],
               models: Models,
               dpi_scale: float = 2.0) -> list[dict[str, Any]]:
    """Foveation callback (I10, 05 section 2 `/v1/reperceive`).

    The brain knows which fields failed verification; it sends normalized
    ROI boxes ([x, y, w, h], 0..1 of the page) and gets fresh OcrLines read
    at `dpi_scale`x the discovery resolution — with full lattices, since the
    whole point is giving the checksum/grammar beams richer evidence.

    Pure function over (bytes, rois): the HTTP layer owns scratch caching
    and the 410 GONE contract. Images and PDF pages both re-rasterize from
    the ORIGINAL bytes, so magnification is real (native pixels for images,
    higher-DPI re-render for PDFs), never upscaled blur from a cached raster.
    """
    route = sniff_route(data)
    if route == ROUTE_IMAGE:
        import io
        page_img = Image.open(io.BytesIO(data)).convert("RGB")
        if page_index != 0:
            raise UnsupportedType("images have exactly one page")
    elif route == ROUTE_PDF:
        page_img = pdf_stage.rasterize_page(
            data, page_index,
            long_side=int(pdf_stage.RASTER_LONG_SIDE * dpi_scale))
    else:
        raise UnsupportedType(f"route {route!r} has no pixels to reperceive")

    lines: list[dict[str, Any]] = []
    for x, y, w, h in rois:
        # A degenerate ROI (sub-4px before any padding) is a nonsense request:
        # skip it — padding must never manufacture readable pixels out of a
        # box that named none (N1: no evidence, no claim-shaped output).
        if w * page_img.width < 4 or h * page_img.height < 4:
            continue
        # Clamp the ROI, pad slightly (fields sit tight in their boxes).
        pad_x, pad_y = 0.01, 0.005
        x0 = max(0.0, x - pad_x)
        y0 = max(0.0, y - pad_y)
        x1 = min(1.0, x + w + pad_x)
        y1 = min(1.0, y + h + pad_y)
        crop = page_img.crop((int(x0 * page_img.width), int(y0 * page_img.height),
                              int(x1 * page_img.width), int(y1 * page_img.height)))
        if crop.width < 4 or crop.height < 4:
            continue
        # Images: magnify the native crop so small fields reach a height the
        # recognizer resolves well (rec input is 48 px tall; a 20 px-tall
        # source crop otherwise interpolates away its detail before the tap).
        if route == ROUTE_IMAGE and dpi_scale > 1.0:
            crop = crop.resize((int(crop.width * dpi_scale),
                                int(crop.height * dpi_scale)),
                               Image.Resampling.LANCZOS)
        text, conf, lattice, _ = tap_line(models.rec, crop, models.vocab)
        if not lattice:
            continue
        lines.append(ocr_line(
            poly=[(x0, y0), (x1, y0), (x1, y1), (x0, y1)],
            top1=text, conf=conf, lattice=lattice,
        ))
    return lines
