"""Dewarp goldens — synthetic warps with mathematically known homographies.

A 'page' with a known internal pattern is perspective-warped onto a dark
desk; rectification must recover the pattern's geometry (checked by locating
the pattern squares in the output). Honesty tests pin the pass-through
behavior: no plausible quad => IDENTICAL input back, never a guess-warp.
"""

from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from stages.dewarp_stage import DewarpResult, find_page_quad, rectify_page  # noqa: E402


def _make_page(w: int = 600, h: int = 800) -> np.ndarray:
    """White page with two black registration squares at known positions."""
    page = np.full((h, w, 3), 250, dtype=np.uint8)
    cv2.rectangle(page, (0, 0), (w - 1, h - 1), (30, 30, 30), 3)  # border ink
    # Registration squares: top-left quarter and bottom-right quarter.
    cv2.rectangle(page, (60, 80), (140, 160), (0, 0, 0), -1)
    cv2.rectangle(page, (w - 140, h - 160), (w - 60, h - 80), (0, 0, 0), -1)
    # Text-ish lines so the page looks like a document.
    for row in range(220, h - 220, 40):
        cv2.rectangle(page, (60, row), (w - 60, row + 10), (60, 60, 60), -1)
    return page


def _warp_onto_desk(page: np.ndarray, corners: list[tuple[int, int]],
                    canvas_wh: tuple[int, int] = (1000, 1200)) -> np.ndarray:
    cw, ch = canvas_wh
    desk = np.full((ch, cw, 3), 55, dtype=np.uint8)      # dark desk
    ph, pw = page.shape[:2]
    src = np.array([[0, 0], [pw - 1, 0], [pw - 1, ph - 1], [0, ph - 1]], dtype=np.float32)
    dst = np.array(corners, dtype=np.float32)
    matrix = cv2.getPerspectiveTransform(src, dst)
    warped = cv2.warpPerspective(page, matrix, (cw, ch),
                                 borderMode=cv2.BORDER_TRANSPARENT)
    mask = cv2.warpPerspective(np.full((ph, pw), 255, dtype=np.uint8), matrix, (cw, ch))
    desk[mask > 0] = warped[mask > 0]
    return desk


def _find_dark_squares(img: np.ndarray) -> list[tuple[float, float]]:
    """Centers (normalized) of large solid-dark blobs."""
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    _, binary = cv2.threshold(gray, 80, 255, cv2.THRESH_BINARY_INV)
    n, _, stats, centroids = cv2.connectedComponentsWithStats(binary, connectivity=8)
    h, w = gray.shape
    out = []
    for i in range(1, n):
        x, y, bw, bh, area = stats[i]
        if area > 0.003 * w * h and 0.5 < bw / max(bh, 1) < 2.0 and area > 0.7 * bw * bh:
            cx, cy = centroids[i]
            out.append((cx / w, cy / h))
    return sorted(out)


def test_finds_and_rectifies_a_perspective_page():
    page = _make_page()
    scene = _warp_onto_desk(page, [(180, 120), (820, 200), (760, 1080), (120, 980)])
    res = rectify_page(scene)
    assert res.method == "classical"
    assert res.quad is not None and len(res.quad) == 4
    # Registration squares must land near their true normalized positions.
    squares = _find_dark_squares(res.image)
    assert len(squares) == 2, f"expected 2 registration squares, got {len(squares)}"
    (ax, ay), (bx, by) = squares
    # True centers on the page: (100/600, 120/800) and (520/600, 680/800).
    assert abs(ax - 100 / 600) < 0.05 and abs(ay - 120 / 800) < 0.05
    assert abs(bx - 520 / 600) < 0.05 and abs(by - 680 / 800) < 0.05


def test_axis_aligned_page_also_rectifies_cleanly():
    page = _make_page()
    scene = _warp_onto_desk(page, [(200, 200), (800, 200), (800, 1000), (200, 1000)])
    res = rectify_page(scene)
    assert res.method == "classical"
    ratio = res.image.shape[1] / res.image.shape[0]
    assert abs(ratio - 600 / 800) < 0.08, "aspect preserved for an unwarped page"


def test_no_page_passes_through_unchanged():
    rng = np.random.default_rng(5)
    noise = rng.integers(0, 255, size=(400, 500, 3), dtype=np.uint8)
    res = rectify_page(noise)
    assert res.method == "none"
    assert res.quad is None
    assert np.array_equal(res.image, noise), "pass-through must be IDENTICAL"


def test_tiny_quad_is_not_a_page():
    desk = np.full((800, 1000, 3), 55, dtype=np.uint8)
    cv2.rectangle(desk, (450, 350), (560, 430), (250, 250, 250), -1)  # a card, not a page
    res = rectify_page(desk)
    assert res.method == "none", "sub-threshold quads must not trigger a warp"


def test_result_shape_is_dataclass_contract():
    res = rectify_page(_warp_onto_desk(_make_page(), [(180, 120), (820, 200), (760, 1080), (120, 980)]))
    assert isinstance(res, DewarpResult)
    if res.quad:
        for x, y in res.quad:
            assert 0 <= x <= 1 and 0 <= y <= 1


def test_find_page_quad_orders_corners():
    scene = _warp_onto_desk(_make_page(), [(180, 120), (820, 200), (760, 1080), (120, 980)])
    quad = find_page_quad(scene)
    assert quad is not None
    tl, tr, br, bl = quad
    assert tl[0] < tr[0] and bl[0] < br[0]      # left of
    assert tl[1] < bl[1] and tr[1] < br[1]      # above
