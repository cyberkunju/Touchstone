"""
Engine A orchestrator: rendered document Sample -> realistic composited scene.

Given a rendered full-frame document `Sample` and a `BackgroundBank`, this:
  1. draws a real background canvas,
  2. samples a placement homography (scale/rotation/perspective/partial-crop),
  3. warps the document image onto the canvas and blends it in,
  4. transforms every PRIMITIVE annotation polygon through the SAME homography
     (so labels stay pixel-accurate), and
  5. emits a fresh ``document_page`` annotation from the placed quad (the real
     page boundary — a sub-region of the scene, exactly what was missing in v0).

The returned Sample plugs straight into the existing pipeline: degradation
(`augment.augment`) then labels (`labels.sample_to_yolo`). Deterministic given a
seeded RNG.
"""
from __future__ import annotations

import copy
import random

import cv2
import numpy as np
from PIL import Image

from ..core import Annotation, Sample
from . import blend as _blend
from . import place as _place
from .bank import BackgroundBank

_PAGE_CLASS = "document_page"


def _transform_polygon(poly: np.ndarray, H: np.ndarray) -> np.ndarray:
    """Apply a 3x3 homography to an (N,2) polygon -> (N,2) float64.

    Returns None if the input is non-finite or the transform produces NaN/inf
    (so a degenerate primitive can never leak a NaN label downstream).
    """
    arr = np.asarray(poly, dtype=np.float64)
    if arr.size < 6 or not np.all(np.isfinite(arr)):
        return None
    pts = arr.reshape(-1, 1, 2)
    out = cv2.perspectiveTransform(pts, H).reshape(-1, 2)
    if not np.all(np.isfinite(out)):
        return None
    return out


def compose_sample(doc_sample: Sample, bank: BackgroundBank, rng: random.Random,
                   *, canvas_long_range: tuple[int, int] = (1024, 1280)) -> Sample:
    """Composite a rendered document onto a real background. Returns a new Sample.

    The new Sample carries the document's primitive annotations (transformed)
    plus a single `document_page` quad for the placed document. The original
    full-frame `document_page` (if any) is dropped — the placed quad is the real
    page boundary now.
    """
    # 1) background canvas
    long_side = rng.randint(int(canvas_long_range[0]), int(canvas_long_range[1]))
    bg_pil = bank.sample_canvas(rng, long_side)
    bg = np.asarray(bg_pil, dtype=np.uint8)
    H_canvas, W_canvas = bg.shape[:2]

    # 2) document image + placement
    doc = np.asarray(doc_sample.image.convert("RGB"), dtype=np.uint8)
    dh, dw = doc.shape[:2]
    Hm, quad = _place.sample_placement(rng, (dw, dh), (W_canvas, H_canvas))

    # 3) warp doc onto the canvas + footprint mask.
    # The DOC is warped with BORDER_REPLICATE (not constant black): the soft
    # alpha feather in blend.py extends a few px OUTSIDE the hard footprint, and
    # if those pixels were black they'd paint a dark halo ring on the background
    # — a learnable document_page boundary artifact, the opposite of what
    # blend-invariance is for. Replicating the doc's edge color makes the feather
    # blend a realistic edge instead. The MASK stays a hard constant-0 footprint.
    warped = cv2.warpPerspective(doc, Hm, (W_canvas, H_canvas),
                                 flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    solid = np.full((dh, dw), 255, dtype=np.uint8)
    mask = cv2.warpPerspective(solid, Hm, (W_canvas, H_canvas),
                               flags=cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT,
                               borderValue=0)

    # 4) blend
    composite, blend_mode = _blend.blend(bg, warped, mask, rng)

    # 5) transform primitive annotations through the same homography
    new_anns: list[Annotation] = []
    for ann in doc_sample.annotations:
        if ann.class_name == _PAGE_CLASS:
            continue  # the original full-frame page is replaced by the placed quad
        new_poly = _transform_polygon(ann.polygon, Hm)
        if new_poly is None:
            continue  # degenerate / non-finite -> skip (never emit a NaN label)
        new_anns.append(Annotation(class_name=ann.class_name, polygon=new_poly,
                                    text=ann.text,
                                    meta=dict(ann.meta) if ann.meta else None))

    # 6) the placed document boundary IS the new document_page
    new_anns.insert(0, Annotation(class_name=_PAGE_CLASS,
                                  polygon=np.asarray(quad, dtype=np.float64)))

    out = Sample(
        image=Image.fromarray(composite, "RGB"),
        annotations=new_anns,
        category=doc_sample.category,
        template_family=doc_sample.template_family,
        template_version=doc_sample.template_version,
        seed=doc_sample.seed,
        language=doc_sample.language,
        quality_tags=list(doc_sample.quality_tags) + ["composited", f"blend:{blend_mode}"],
        ground_truth=copy.deepcopy(doc_sample.ground_truth),
    )
    out.ground_truth["composited"] = {
        "blend": blend_mode,
        "canvas": [W_canvas, H_canvas],
        "doc_quad": [[float(x), float(y)] for x, y in quad],
        "background_available": bank.available,
    }
    return out
