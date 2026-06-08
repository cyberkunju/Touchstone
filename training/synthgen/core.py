"""
Core data structures shared across the synthetic generator.

Everything we draw is placed by us, so we record an exact annotation for every
primitive at draw time. Annotations carry a *polygon* (4+ points in pixel
coordinates), not just an axis-aligned box, so that geometric augmentations
(perspective warp, rotation) can transform the label precisely and we recover a
tight axis-aligned box afterwards.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

import numpy as np

from .config import CLASS_ID

if TYPE_CHECKING:  # pragma: no cover - typing only
    from PIL import Image as PILImage


# A polygon is an (N, 2) float array of (x, y) pixel coordinates.
Polygon = np.ndarray


@dataclass
class Annotation:
    """A single labelled primitive on the canvas.

    `class_name` must be a key of `config.CLASS_ID`. `polygon` is an (N, 2)
    array of pixel coordinates (clockwise from top-left for rectangles). The
    optional `text` / `meta` carry OCR ground truth and structured payloads for
    downstream (non-detector) supervision; the detector only consumes the box.
    """

    class_name: str
    polygon: Polygon
    text: str | None = None
    meta: dict | None = None

    @property
    def class_id(self) -> int:
        return CLASS_ID[self.class_name]

    def aabb(self) -> tuple[float, float, float, float]:
        """Axis-aligned bounding box (x_min, y_min, x_max, y_max) in pixels."""
        xs = self.polygon[:, 0]
        ys = self.polygon[:, 1]
        return float(xs.min()), float(ys.min()), float(xs.max()), float(ys.max())


def rect_polygon(x0: float, y0: float, x1: float, y1: float) -> Polygon:
    """Build a 4-point rectangle polygon (TL, TR, BR, BL)."""
    return np.array(
        [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
        dtype=np.float64,
    )


@dataclass
class Sample:
    """A rendered document plus its annotations and provenance metadata.

    The image is held as a PIL RGB image until the pipeline finishes; labels are
    derived from `annotations` after augmentation.
    """

    image: "PILImage.Image"
    annotations: list[Annotation] = field(default_factory=list)
    category: str = "generic"
    template_family: str = "unknown"
    template_version: str = "v1"
    seed: int = 0
    language: str = "en"
    # Negative / hard-negative samples (decoys) legitimately carry zero boxes.
    # The persistence layer (generate.py) writes them with an EMPTY label file
    # instead of discarding them as degenerate.
    allow_empty: bool = False
    quality_tags: list[str] = field(default_factory=lambda: ["clean"])
    # Free-form structured ground truth (fields, table cells, mrz parse, code
    # payloads). Not used by the detector but emitted for OCR/relate training.
    ground_truth: dict = field(default_factory=dict)

    @property
    def width(self) -> int:
        return self.image.width

    @property
    def height(self) -> int:
        return self.image.height

    def add(self, ann: Annotation) -> None:
        self.annotations.append(ann)

    def add_box(
        self,
        class_name: str,
        x0: float,
        y0: float,
        x1: float,
        y1: float,
        *,
        text: str | None = None,
        meta: dict | None = None,
    ) -> Annotation:
        """Convenience: append an axis-aligned box annotation and return it."""
        ann = Annotation(
            class_name=class_name,
            polygon=rect_polygon(x0, y0, x1, y1),
            text=text,
            meta=meta,
        )
        self.annotations.append(ann)
        return ann
