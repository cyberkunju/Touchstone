"""Layout stage decode (P4.1 wiring half) — faithful Python port of the
browser's YOLO letterbox/decode/NMS (src/ai-runtime/yolo.ts).

Model-agnostic: PP-DocLayout exports and DocLayout-YOLO both emit the
attribute-major [4 + C, anchors] tensor this decodes; the A/B harness runs
both models THROUGH THIS ONE DECODE so the comparison isolates the weights,
not the plumbing. The class-name/count mismatch is a loud error — a drifted
classes.json would silently mislabel every region (N1 applies to labels).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class Letterbox:
    scale: float
    pad_x: float
    pad_y: float
    model_size: int


@dataclass
class LayoutDetection:
    class_id: int
    class_name: str
    box: tuple[float, float, float, float]     # normalized corners x1,y1,x2,y2
    score: float


def compute_letterbox(src_w: int, src_h: int, model_size: int) -> Letterbox:
    if src_w <= 0 or src_h <= 0:
        return Letterbox(scale=1.0, pad_x=0.0, pad_y=0.0, model_size=model_size)
    scale = min(model_size / src_w, model_size / src_h)
    return Letterbox(
        scale=scale,
        pad_x=(model_size - src_w * scale) / 2,
        pad_y=(model_size - src_h * scale) / 2,
        model_size=model_size,
    )


def _iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter == 0:
        return 0.0
    area_a = (a[2] - a[0]) * (a[3] - a[1])
    area_b = (b[2] - b[0]) * (b[3] - b[1])
    return inter / (area_a + area_b - inter)


def _nms(dets: list[LayoutDetection], threshold: float) -> list[LayoutDetection]:
    """Per-class NMS, score-descending (browser twin)."""
    ordered = sorted(dets, key=lambda d: -d.score)
    keep: list[LayoutDetection] = []
    suppressed: set[int] = set()
    for i, cur in enumerate(ordered):
        if i in suppressed:
            continue
        keep.append(cur)
        for j in range(i + 1, len(ordered)):
            if j in suppressed or ordered[j].class_id != cur.class_id:
                continue
            if _iou(cur.box, ordered[j].box) >= threshold:
                suppressed.add(j)
    return keep


def post_process_layout(
    tensor: np.ndarray,
    class_names: list[str],
    letterbox: Letterbox,
    src_w: int,
    src_h: int,
    confidence_threshold: float = 0.35,
    nms_threshold: float = 0.5,
) -> list[LayoutDetection]:
    """Decode an attribute-major [4 + C, anchors] output tensor.

    Rows 0..3: cx, cy, w, h in MODEL pixel space; rows 4..: per-class scores
    in [0, 1]. Boxes map back through the inverse letterbox into original
    normalized coordinates, clamped to [0, 1].
    """
    rows, anchors = tensor.shape
    num_classes = rows - 4
    if num_classes < 1:
        raise ValueError(f"tensor has {rows} rows — no class rows present")
    if len(class_names) != num_classes:
        raise ValueError(
            f"class-name count mismatch: model emits {num_classes} classes but "
            f"{len(class_names)} names supplied — refusing to mislabel regions")

    scores = tensor[4:, :]                      # [C, anchors]
    class_ids = np.argmax(scores, axis=0)
    max_scores = scores[class_ids, np.arange(anchors)]
    keep_mask = max_scores >= confidence_threshold

    sc, px, py = letterbox.scale, letterbox.pad_x, letterbox.pad_y
    clamp = lambda v: float(min(1.0, max(0.0, v)))  # noqa: E731

    dets: list[LayoutDetection] = []
    for col in np.nonzero(keep_mask)[0]:
        cx, cy, w, h = (float(tensor[r, col]) for r in range(4))
        x1, y1 = cx - w / 2, cy - h / 2
        x2, y2 = cx + w / 2, cy + h / 2
        box = (
            clamp((x1 - px) / sc / src_w),
            clamp((y1 - py) / sc / src_h),
            clamp((x2 - px) / sc / src_w),
            clamp((y2 - py) / sc / src_h),
        )
        cid = int(class_ids[col])
        dets.append(LayoutDetection(
            class_id=cid,
            class_name=class_names[cid],
            box=box,
            score=float(max_scores[col]),
        ))
    return _nms(dets, nms_threshold)


def letterbox_image(rgb: np.ndarray, model_size: int) -> tuple[np.ndarray, Letterbox]:
    """RGB page -> [1, 3, S, S] float32 (pixel/255), gray-padded letterbox."""
    import cv2

    h, w = rgb.shape[:2]
    lb = compute_letterbox(w, h, model_size)
    scaled = cv2.resize(rgb, (max(1, round(w * lb.scale)), max(1, round(h * lb.scale))),
                        interpolation=cv2.INTER_LINEAR)
    canvas = np.full((model_size, model_size, 3), 114, dtype=np.uint8)
    y0, x0 = int(lb.pad_y), int(lb.pad_x)
    canvas[y0:y0 + scaled.shape[0], x0:x0 + scaled.shape[1]] = scaled
    tensor = (canvas.astype(np.float32) / 255.0).transpose(2, 0, 1)[np.newaxis]
    return np.ascontiguousarray(tensor), lb
