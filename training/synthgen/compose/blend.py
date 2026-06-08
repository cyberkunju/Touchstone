"""
Compositing/blending of a warped document onto a real background.

Multiple blend modes are used (chosen per sample) so the detector cannot latch
onto a single boundary artifact — the generalization of Dwibedi et al.'s finding
that blend-invariance materially improves real-world detection:
  * ``alpha``   — feathered alpha composite (soft, realistic edge). Default.
  * ``hard``    — no feather (sharp paste; models a flat scan on a surface).
  * ``poisson`` — seamless (gradient-domain) clone that harmonizes the document
    to the background's lighting; guarded and falls back to alpha on failure.

All inputs are uint8 HxWx3 (RGB) / HxW (mask 0..255); output is uint8 HxWx3.
"""
from __future__ import annotations

import random

import cv2
import numpy as np

BLEND_MODES = ("alpha", "alpha", "alpha", "hard", "poisson")  # weighted toward alpha


def _feather(mask: np.ndarray, rng: random.Random) -> np.ndarray:
    """Soft alpha in [0,1] from a 0/255 mask via a small gaussian feather."""
    k = rng.choice([3, 5, 7, 9])
    soft = cv2.GaussianBlur(mask, (k, k), 0).astype(np.float32) / 255.0
    return np.clip(soft, 0.0, 1.0)


def blend(bg: np.ndarray, fg: np.ndarray, mask: np.ndarray,
          rng: random.Random, mode: str | None = None) -> tuple[np.ndarray, str]:
    """Composite warped foreground ``fg`` onto ``bg`` using ``mask``.

    Returns (composited RGB uint8, mode_used). ``mode=None`` picks a weighted
    random mode. Poisson is attempted only when the masked region is safely
    inside the frame; any failure silently falls back to alpha so generation
    never crashes.
    """
    H, W = bg.shape[:2]
    mode = mode or rng.choice(BLEND_MODES)

    if mode == "hard":
        a = (mask > 127).astype(np.float32)[..., None]
        out = (fg.astype(np.float32) * a + bg.astype(np.float32) * (1.0 - a))
        return np.clip(out, 0, 255).astype(np.uint8), "hard"

    if mode == "poisson":
        ys, xs = np.where(mask > 127)
        if xs.size > 0:
            x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
            cx, cy = int((x0 + x1) / 2), int((y0 + y1) / 2)
            pad = 2
            # seamlessClone needs the patch+center to sit inside the destination.
            if (x0 > pad and y0 > pad and x1 < W - pad and y1 < H - pad):
                try:
                    out = cv2.seamlessClone(
                        fg, bg, mask, (cx, cy),
                        cv2.MIXED_CLONE if rng.random() < 0.5 else cv2.NORMAL_CLONE)
                    return out, "poisson"
                except cv2.error:
                    pass  # fall through to alpha

    a = _feather(mask, rng)[..., None]
    out = (fg.astype(np.float32) * a + bg.astype(np.float32) * (1.0 - a))
    return np.clip(out, 0, 255).astype(np.uint8), "alpha"
