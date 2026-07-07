"""Quality stage goldens — synthetic pages with known degradation ordering.

The stage's contract is MONOTONICITY (more blur => higher blur score; more
glare => higher glare score; flatter page => lower contrast), plus stable
absolute bands for the canonical cases. Absolute values are pinned loosely;
the ordering assertions are the law.
"""

from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from stages.quality_stage import measure_quality  # noqa: E402


def _text_page(seed: int = 3) -> np.ndarray:
    """Sharp synthetic 'document': dark line strokes on white."""
    img = np.full((900, 1200), 235, dtype=np.uint8)
    rng = np.random.default_rng(seed)
    for row in range(80, 860, 34):
        x = 60
        while x < 1120:
            width = int(rng.integers(20, 90))
            img[row:row + 12, x:x + width] = int(rng.integers(10, 60))
            x += width + int(rng.integers(8, 22))
    return img


def test_blur_is_monotone_in_defocus():
    page = _text_page()
    scores = []
    for k in (0, 3, 9, 21):
        blurred = page if k == 0 else cv2.GaussianBlur(page, (k, k), 0)
        scores.append(measure_quality(blurred).blur)
    assert scores == sorted(scores), f"blur must rise with defocus: {scores}"
    assert scores[0] < 0.35, "sharp text page must score low blur"
    assert scores[-1] > 0.6, "heavy defocus must score high blur"


def test_glare_detects_blown_spot_not_white_paper():
    page = _text_page()
    clean = measure_quality(page)
    assert clean.glare < 0.01, "plain paper is not glare"

    spot = page.copy()
    cv2.circle(spot, (600, 450), 130, 255, -1)     # blown flash spot
    with_spot = measure_quality(spot)
    assert with_spot.glare > clean.glare + 0.02
    bigger = page.copy()
    cv2.circle(bigger, (600, 450), 260, 255, -1)
    assert measure_quality(bigger).glare > with_spot.glare, "glare monotone in area"


def test_contrast_orders_flat_vs_full():
    page = _text_page()
    full = measure_quality(page).contrast
    flat = (page.astype(np.float32) * 0.25 + 128).astype(np.uint8)   # squashed range
    low = measure_quality(flat).contrast
    assert full > 0.6
    assert low < full * 0.5, f"flat page must score much lower ({low} vs {full})"


def test_scores_are_bounded_and_resolution_stable():
    page = _text_page()
    small = cv2.resize(page, (600, 450), interpolation=cv2.INTER_AREA)
    big = cv2.resize(page, (2400, 1800), interpolation=cv2.INTER_CUBIC)
    for img in (page, small, big):
        q = measure_quality(img)
        for v in (q.blur, q.glare, q.contrast):
            assert 0.0 <= v <= 1.0
    # Same content at different captures should land in the same blur band.
    q1, q2 = measure_quality(page), measure_quality(big)
    assert abs(q1.blur - q2.blur) < 0.25


def test_rgb_and_gray_agree():
    page = _text_page()
    rgb = cv2.cvtColor(page, cv2.COLOR_GRAY2RGB)
    a, b = measure_quality(page), measure_quality(rgb)
    assert abs(a.blur - b.blur) < 1e-6
    assert abs(a.contrast - b.contrast) < 1e-6
