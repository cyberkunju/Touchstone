"""Quality stage — blur, glare, contrast (Documentation/05 section 4).

Feeds `geometry.quality` in the bundle (all 0..1; blur/glare 1 = worst,
contrast 1 = best) and the UI rescan hint. Definitions:

  blur:     variance of Laplacian, normalized through a calibrated knee —
            sharp text pages score ≲ 0.2, defocused ones ≳ 0.6.
  glare:    fraction of pixels in highlight-clipping (≥ 250) inside large
            connected patches (a white PAGE is not glare; a blown SPOT is).
  contrast: robust dynamic range (p95 − p5) / 255.

Pure function over a grayscale/RGB ndarray; no thresholds are judgments —
the brain and UI decide what to do with the numbers.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

# Laplacian-variance knee: sharp document photos land in the thousands,
# blurred ones in the tens. Normalized as knee/(knee+var) so the scale is
# monotone, bounded, and resolution-stable after the working resize.
BLUR_KNEE = 250.0
# Working long side — variance of Laplacian is resolution-sensitive, so
# quality is always measured at one scale.
WORK_LONG_SIDE = 1200
# Highlight clipping threshold and the minimum blob area (fraction of page)
# for a clipped region to count as glare rather than specular noise.
GLARE_LEVEL = 250
GLARE_MIN_BLOB_FRAC = 0.0005


@dataclass
class PageQuality:
    blur: float          # 0 sharp .. 1 unusable
    glare: float         # 0 none .. 1 page-consuming
    contrast: float      # 0 flat .. 1 full-range


def _to_work_gray(image: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY) if image.ndim == 3 else image
    h, w = gray.shape
    long_side = max(h, w)
    if long_side > WORK_LONG_SIDE:
        scale = WORK_LONG_SIDE / long_side
        gray = cv2.resize(gray, (max(1, int(w * scale)), max(1, int(h * scale))),
                          interpolation=cv2.INTER_AREA)
    return gray


def measure_quality(image: np.ndarray) -> PageQuality:
    gray = _to_work_gray(image)

    # Blur: variance of Laplacian through the knee.
    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    blur = BLUR_KNEE / (BLUR_KNEE + lap_var)

    # Glare: clipped-highlight pixels belonging to sizable connected blobs.
    clipped = (gray >= GLARE_LEVEL).astype(np.uint8)
    n_labels, labels, stats, _ = cv2.connectedComponentsWithStats(clipped, connectivity=8)
    page_px = gray.size
    min_blob = max(16, int(page_px * GLARE_MIN_BLOB_FRAC))
    glare_px = sum(int(stats[i, cv2.CC_STAT_AREA])
                   for i in range(1, n_labels)
                   if stats[i, cv2.CC_STAT_AREA] >= min_blob)
    # A uniformly white page is paper, not glare: ignore the single blob that
    # covers most of the page when the page has next to no ink contrast.
    if n_labels == 2 and glare_px > 0.85 * page_px:
        glare_px = 0
    glare = min(1.0, glare_px / page_px)

    # Contrast: robust percentile range.
    p5, p95 = np.percentile(gray, (5, 95))
    contrast = float(p95 - p5) / 255.0

    return PageQuality(blur=float(np.clip(blur, 0.0, 1.0)),
                       glare=float(np.clip(glare, 0.0, 1.0)),
                       contrast=float(np.clip(contrast, 0.0, 1.0)))
