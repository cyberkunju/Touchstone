"""Codes stage — zxing-cpp all-formats scan (Documentation/05 section 4).

Scans the rectified page raster AND (when the ladder passes them) proposed
code regions at native resolution. Emits format, payload, box, EC level —
the payload is Reed-Solomon-corrected by the decoder, so a successful decode
is bit-exact evidence (the strongest attestor class the corpus barcode
families are built on).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import zxingcpp


@dataclass
class DecodedCode:
    format: str
    payload: str
    box: tuple[float, float, float, float]     # normalized [x, y, w, h]
    ec_level: str | None


def _to_gray(image: np.ndarray) -> np.ndarray:
    if image.ndim == 2:
        return image
    import cv2

    return cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)


def scan_codes(image: np.ndarray) -> list[DecodedCode]:
    """All-formats scan over a page raster (RGB or grayscale ndarray)."""
    gray = _to_gray(image)
    h, w = gray.shape
    results = zxingcpp.read_barcodes(gray)

    out: list[DecodedCode] = []
    for r in results:
        if not r.valid:
            continue
        # r.text escapes control characters for display (<LF>, <RS>...);
        # the RAW bytes are the evidence — AAMVA payloads carry literal
        # control separators that must survive bit-exact.
        try:
            payload = bytes(r.bytes).decode("utf-8")
        except UnicodeDecodeError:
            payload = bytes(r.bytes).decode("latin-1")
        pos = r.position
        xs = [pos.top_left.x, pos.top_right.x, pos.bottom_right.x, pos.bottom_left.x]
        ys = [pos.top_left.y, pos.top_right.y, pos.bottom_right.y, pos.bottom_left.y]
        x0, x1 = max(0, min(xs)), min(w, max(xs))
        y0, y1 = max(0, min(ys)), min(h, max(ys))
        ec = getattr(r, "ec_level", "") or None
        out.append(DecodedCode(
            format=str(r.format).split(".")[-1],
            payload=payload,
            box=(x0 / w, y0 / h, (x1 - x0) / w, (y1 - y0) / h),
            ec_level=ec,
        ))
    # Deterministic order: top-to-bottom, left-to-right.
    out.sort(key=lambda c: (c.box[1], c.box[0]))
    return out
