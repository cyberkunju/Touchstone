"""Dewarp stage — classical page rectification (05 section 4).

Page contour (adaptive threshold → largest quad) → perspective rectify.
Emits the rectified raster + the method + the found quad; when no plausible
page quad exists the input passes through UNCHANGED with method 'none' —
a wrong rectification is worse than none (it destroys downstream geometry),
so the quad must pass strict plausibility gates before any warp happens.

Text-line-curvature TPS and UVDoc are later ladder tiers (flagged, lazy).
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

# The page quad must cover at least this fraction of the frame to be a page
# (tiny quads are cards/stamps/windows, not the document).
MIN_PAGE_AREA_FRAC = 0.20
# ...and each interior angle must be within this many degrees of 90.
MAX_ANGLE_DEV_DEG = 35.0


@dataclass
class DewarpResult:
    image: np.ndarray
    method: str                                  # 'classical' | 'none'
    quad: list[tuple[float, float]] | None       # normalized TL,TR,BR,BL


def _order_corners(pts: np.ndarray) -> np.ndarray:
    """Order 4 points TL, TR, BR, BL."""
    s = pts.sum(axis=1)
    d = np.diff(pts, axis=1).ravel()
    return np.array([
        pts[np.argmin(s)],       # TL: min x+y
        pts[np.argmin(d)],       # TR: min y-x
        pts[np.argmax(s)],       # BR: max x+y
        pts[np.argmax(d)],       # BL: max y-x
    ], dtype=np.float32)


def _angles_ok(quad: np.ndarray) -> bool:
    for i in range(4):
        a, b, c = quad[i - 1], quad[i], quad[(i + 1) % 4]
        v1, v2 = a - b, c - b
        cos = float(np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-9))
        angle = np.degrees(np.arccos(np.clip(cos, -1, 1)))
        if abs(angle - 90) > MAX_ANGLE_DEV_DEG:
            return False
    return True


def find_page_quad(image: np.ndarray) -> np.ndarray | None:
    """Largest plausible 4-corner page contour, or None (honest miss).

    Otsu on blurred luma (a page is globally brighter than the desk), close,
    largest external contour, 4-corner convex approx — then three
    plausibility gates before any warp is allowed:
      1. area within [MIN_PAGE_AREA_FRAC, 0.98] of the frame (a full-frame
         quad is the image boundary, not a found page),
      2. near-right interior angles,
      3. interior strictly brighter than exterior (paper vs desk) — kills
         phantom quads on noise/texture.
    """
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY) if image.ndim == 3 else image
    h, w = gray.shape

    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    _, thresh = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
    closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    best: np.ndarray | None = None
    best_area = 0.0
    for c in contours:
        area = cv2.contourArea(c)
        if area < MIN_PAGE_AREA_FRAC * w * h or area > 0.98 * w * h or area <= best_area:
            continue
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.02 * peri, True)
        if len(approx) != 4 or not cv2.isContourConvex(approx):
            continue
        quad = _order_corners(approx.reshape(4, 2).astype(np.float32))
        if not _angles_ok(quad):
            continue
        mask = np.zeros((h, w), dtype=np.uint8)
        cv2.fillPoly(mask, [quad.astype(np.int32)], 255)
        inside = float(gray[mask > 0].mean())
        outside_px = gray[mask == 0]
        outside = float(outside_px.mean()) if outside_px.size else 0.0
        if inside < outside + 20:
            continue  # not paper-on-desk contrast — refuse the warp
        best, best_area = quad, area
    return best


def rectify_page(image: np.ndarray) -> DewarpResult:
    """Rectify the page if a plausible quad is found; else pass through."""
    quad = find_page_quad(image)
    if quad is None:
        return DewarpResult(image=image, method="none", quad=None)

    h, w = image.shape[:2]
    (tl, tr, br, bl) = quad
    out_w = int(round(max(np.linalg.norm(tr - tl), np.linalg.norm(br - bl))))
    out_h = int(round(max(np.linalg.norm(bl - tl), np.linalg.norm(br - tr))))
    if out_w < 32 or out_h < 32:
        return DewarpResult(image=image, method="none", quad=None)

    dst = np.array([[0, 0], [out_w - 1, 0], [out_w - 1, out_h - 1], [0, out_h - 1]],
                   dtype=np.float32)
    matrix = cv2.getPerspectiveTransform(quad, dst)
    warped = cv2.warpPerspective(image, matrix, (out_w, out_h))
    quad_norm = [(float(x) / w, float(y) / h) for x, y in quad]
    return DewarpResult(image=warped, method="classical", quad=quad_norm)
