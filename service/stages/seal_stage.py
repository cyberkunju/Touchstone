"""Stamp/seal extraction stage (F12, P4.3, Documentation/10 §3).

Classical chroma-outlier detector: stamps are red/blue/violet INK on
otherwise low-saturation documents. HSV gates isolate saturated colored
pixels far from the page's dominant hue; morphological close bridges the
ring gaps; contours above a size floor become seal candidates with masks.

Layout-model `seal` boxes union in when available (flag-future); this tier
is model-free and honest: a black-and-white page yields NOTHING.

Emits geometry + mask only (crop PNGs are the caller's concern — the stage
never touches disk).
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

# Saturation floor: page paper/print sits < ~40; stamp ink well above.
MIN_SATURATION = 70
# Value floor: exclude near-black print (black text is saturation-low anyway,
# but JPEG noise makes dark pixels hue-unstable).
MIN_VALUE = 60
# A seal must cover at least this fraction of the page area…
MIN_AREA_FRAC = 0.0004
# …and at most this (a fully-tinted page is a colored FORM, not a stamp).
MAX_AREA_FRAC = 0.25
# Hue windows (OpenCV H∈[0,180)): red wraps; blue/violet contiguous.
RED_LO_1, RED_HI_1 = 0, 12
RED_LO_2, RED_HI_2 = 168, 180
BLUE_LO, BLUE_HI = 90, 150


@dataclass
class SealCandidate:
    box: tuple[float, float, float, float]     # normalized [x, y, w, h]
    dominant_hue: str                           # 'red' | 'blue'
    ink_frac: float                             # colored fraction inside box
    mask: np.ndarray                            # uint8 0/255, box-local


def detect_seals(rgb: np.ndarray) -> list[SealCandidate]:
    """Detect stamp/seal candidates on an RGB uint8 page array."""
    h, w = rgb.shape[:2]
    if h < 32 or w < 32:
        return []
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    hch, sch, vch = hsv[..., 0], hsv[..., 1], hsv[..., 2]

    saturated = (sch >= MIN_SATURATION) & (vch >= MIN_VALUE)
    red = saturated & (((hch >= RED_LO_1) & (hch <= RED_HI_1)) |
                       ((hch >= RED_LO_2) & (hch < RED_HI_2)))
    blue = saturated & (hch >= BLUE_LO) & (hch <= BLUE_HI)

    out: list[SealCandidate] = []
    for name, mask_bool in (("red", red), ("blue", blue)):
        mask = (mask_bool.astype(np.uint8)) * 255
        if int(mask.sum()) == 0:
            continue
        # Close ring gaps (stamp rings are thin; text inside is sparse).
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
        closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for contour in contours:
            x, y, cw, ch = cv2.boundingRect(contour)
            frac = (cw * ch) / (w * h)
            if frac < MIN_AREA_FRAC or frac > MAX_AREA_FRAC:
                continue
            local = mask[y:y + ch, x:x + cw]
            ink = float((local > 0).mean())
            if ink < 0.03:                       # bounding box mostly empty
                continue
            out.append(SealCandidate(
                box=(x / w, y / h, cw / w, ch / h),
                dominant_hue=name,
                ink_frac=round(ink, 4),
                mask=local,
            ))
    # Largest first; cap to avoid confetti pages flooding the bundle.
    out.sort(key=lambda s: s.box[2] * s.box[3], reverse=True)
    return out[:6]
