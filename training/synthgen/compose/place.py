"""
Placement geometry for the Engine A compositor.

Samples where/how a rendered document lands inside a real background canvas:
  * SCALE — the document occupies 20-70% of the frame (main mass), with a long
    tail to 8% (tiny, far) and 95% (near full-frame, the "uploaded scan" end).
  * ROTATION — +-60 degrees (mostly small, tail to strong off-axis).
  * PERSPECTIVE — per-corner jitter so the quad is a true non-affine
    quadrilateral (phone-camera tilt), not just a rotated rectangle.
  * POSITION / TRUNCATION — usually fully in-frame; sometimes deliberately
    pushed off an edge so the document is partially clipped (the partial-capture
    case that dominates the worst MIDV slice).

Returns the 3x3 homography H mapping the document's own pixel frame
``[(0,0),(dw,0),(dw,dh),(0,dh)]`` onto a target quad in the canvas, plus that
quad. Pure geometry; deterministic given a seeded ``random.Random``.
"""
from __future__ import annotations

import math
import random

import cv2
import numpy as np


def _tailed_uniform(rng: random.Random, lo: float, hi: float,
                    tail_lo: float, tail_hi: float, tail_p: float) -> float:
    """Uniform in [lo,hi] with probability (1-tail_p), else in the wider tail."""
    if rng.random() < tail_p:
        return rng.uniform(tail_lo, tail_hi)
    return rng.uniform(lo, hi)


def sample_placement(rng: random.Random, doc_size: tuple[int, int],
                     canvas_size: tuple[int, int], *,
                     allow_partial: bool = True,
                     partial_prob: float = 0.30) -> tuple[np.ndarray, np.ndarray]:
    """Sample a placement homography for a document inside a canvas.

    Args:
        rng: seeded RNG (determinism).
        doc_size: (dw, dh) document pixel size.
        canvas_size: (W, H) background canvas size.
        allow_partial: permit the document to extend off the canvas edge.
        partial_prob: probability of a deliberately clipped placement.

    Returns:
        (H, quad) where H is a 3x3 float64 homography mapping the doc's corners
        to ``quad`` (4x2 float32, TL,TR,BR,BL order) in canvas coordinates.
    """
    dw, dh = float(doc_size[0]), float(doc_size[1])
    W, H = float(canvas_size[0]), float(canvas_size[1])
    dw = max(1.0, dw); dh = max(1.0, dh)

    # --- scale: target longer side as a fraction of the canvas short side ----
    # Main mass 25-80% (lifted upper bound so large/near-full-frame documents —
    # the MIDV table/flat case, currently the best real slice — are NOT starved),
    # with tails to 10% (tiny/far) and 97% (full-frame "uploaded scan").
    m = min(W, H)
    frac = _tailed_uniform(rng, 0.25, 0.80, 0.10, 0.97, tail_p=0.22)
    target_long = frac * m
    doc_long = max(dw, dh)
    k = target_long / doc_long
    hw, hh = (dw * k) / 2.0, (dh * k) / 2.0  # half-extents of the scaled doc

    # --- base centered rectangle corners (TL,TR,BR,BL) -----------------------
    base = np.array([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]], dtype=np.float64)

    # --- rotation +-60deg (mostly small) -------------------------------------
    deg = _tailed_uniform(rng, -18.0, 18.0, -60.0, 60.0, tail_p=0.35)
    th = math.radians(deg)
    c, s = math.cos(th), math.sin(th)
    R = np.array([[c, -s], [s, c]], dtype=np.float64)
    rot = base @ R.T

    # --- perspective: per-corner jitter up to ~12% of target size ------------
    jit = 0.12 * target_long
    rot = rot + np.array([[rng.uniform(-jit, jit), rng.uniform(-jit, jit)]
                          for _ in range(4)], dtype=np.float64)

    # --- translation: place the center; optionally push off an edge ----------
    # axis-aligned bounds of the rotated/jittered shape (half spans):
    span_x = (rot[:, 0].max() - rot[:, 0].min()) / 2.0
    span_y = (rot[:, 1].max() - rot[:, 1].min()) / 2.0
    if allow_partial and rng.random() < partial_prob:
        # push the center so part of the doc leaves the frame. `over` is CAPPED
        # at 0.45 so the document keeps >=~55% visible along the clipped axis —
        # enough to stay a meaningful partial-capture example while remaining
        # above labels.sample_to_yolo's 0.35 visibility floor, so the
        # document_page box is never silently dropped while its child primitives
        # survive (the page/child inconsistency).
        edge = rng.choice(["l", "r", "t", "b"])
        over = rng.uniform(0.15, 0.45)  # fraction of the half-span pushed out
        cx = rng.uniform(span_x, W - span_x) if edge in ("t", "b") else (
            span_x - over * 2 * span_x if edge == "l" else W - span_x + over * 2 * span_x)
        cy = rng.uniform(span_y, H - span_y) if edge in ("l", "r") else (
            span_y - over * 2 * span_y if edge == "t" else H - span_y + over * 2 * span_y)
    else:
        # fully in-frame when it fits; otherwise center it (large docs).
        lo_x, hi_x = span_x, max(span_x, W - span_x)
        lo_y, hi_y = span_y, max(span_y, H - span_y)
        cx = rng.uniform(lo_x, hi_x) if hi_x > lo_x else W / 2.0
        cy = rng.uniform(lo_y, hi_y) if hi_y > lo_y else H / 2.0

    quad = (rot + np.array([cx, cy], dtype=np.float64)).astype(np.float32)
    src = np.array([[0.0, 0.0], [dw, 0.0], [dw, dh], [0.0, dh]], dtype=np.float32)
    Hm = cv2.getPerspectiveTransform(src, quad)
    return Hm.astype(np.float64), quad.astype(np.float64)
