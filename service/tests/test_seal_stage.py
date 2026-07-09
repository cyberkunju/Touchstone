"""F12 seal detection tests — synthetic goldens, honesty first."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from stages.seal_stage import detect_seals


def page(w: int = 800, h: int = 600) -> np.ndarray:
    """White page with black 'text' rows (low saturation everywhere)."""
    img = np.full((h, w, 3), 245, dtype=np.uint8)
    for y in range(60, h - 60, 40):
        img[y:y + 12, 60:w - 60] = 30       # black-ish print
    return img


def stamp_ring(img: np.ndarray, cx: int, cy: int, r: int, color: tuple[int, int, int]) -> None:
    """Draw an unfilled ring (classic round stamp)."""
    yy, xx = np.ogrid[:img.shape[0], :img.shape[1]]
    d2 = (xx - cx) ** 2 + (yy - cy) ** 2
    ring = (d2 <= r ** 2) & (d2 >= (r - 6) ** 2)
    img[ring] = color


def test_red_round_stamp_detected_with_mask():
    img = page()
    stamp_ring(img, 600, 450, 70, (200, 30, 40))       # red ring
    seals = detect_seals(img)
    assert len(seals) == 1
    s = seals[0]
    assert s.dominant_hue == "red"
    # Box covers the ring (±)
    x, y, w, h = s.box
    assert abs((x + w / 2) * 800 - 600) < 20
    assert abs((y + h / 2) * 600 - 450) < 20
    assert s.mask.max() == 255


def test_blue_stamp_and_red_stamp_both_found():
    img = page()
    stamp_ring(img, 200, 150, 60, (200, 30, 40))       # red
    stamp_ring(img, 600, 400, 60, (30, 60, 200))       # blue
    hues = {s.dominant_hue for s in detect_seals(img)}
    assert hues == {"red", "blue"}


def test_black_and_white_page_yields_nothing():
    assert detect_seals(page()) == []


def test_fully_tinted_page_is_not_a_stamp():
    img = np.full((600, 800, 3), 0, dtype=np.uint8)
    img[..., 0] = 200                                   # solid red page
    img[..., 1] = 30
    img[..., 2] = 40
    assert detect_seals(img) == []


def test_tiny_chroma_noise_rejected():
    img = page()
    img[100:103, 100:103] = (220, 20, 40)               # 3x3 red speck
    assert detect_seals(img) == []
