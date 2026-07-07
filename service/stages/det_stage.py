"""Detection stage — DBNet forward + browser-twin post-processing.

Mirrors src/workers/inference.worker.ts (runDetForward) and
src/ai-runtime/ocr.ts (postProcessDBNet) so service and browser fallback
produce the same evidence from the same pixels:
  - resize long side to `limit_side`, snap BOTH dims to multiples of 32,
  - luma-percentile contrast stretch (2/98) — the browser's enhanceForOcr
    stretch step,
  - ImageNet normalization (mean/std), CHW,
  - prob map -> binarize 0.3 -> 4-neighborhood components -> mean-prob 0.6
    filter -> min-size 3 -> unclip area*1.5/perimeter -> normalized boxes
    sorted by (y, x).
"""

from __future__ import annotations

import numpy as np
import onnxruntime as ort
from PIL import Image

DET_LIMIT_SIDE = 960
DET_SIZE_MULTIPLE = 32
BINARY_THRESHOLD = 0.3
BOX_THRESHOLD = 0.6
UNCLIP_RATIO = 1.5
MIN_SIZE = 3

_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def snap_to_multiple(value: float, mult: int = DET_SIZE_MULTIPLE) -> int:
    """Browser twin: round to nearest multiple, floor at one multiple."""
    snapped = round(value / mult) * mult
    return max(mult, snapped)


def contrast_stretch(rgb: np.ndarray, low_pct: float = 2, high_pct: float = 98) -> np.ndarray:
    """Luma-percentile linear stretch, per channel (image-enhance twin)."""
    luma = (0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]).astype(np.uint8)
    hist = np.bincount(luma.ravel(), minlength=256)
    total = luma.size
    cum = np.cumsum(hist)
    lo_idx = np.searchsorted(cum, max(1, (low_pct / 100) * total))
    hi_idx = np.searchsorted(cum, (high_pct / 100) * total)
    lo, hi = int(lo_idx), int(min(hi_idx, 255))
    if hi <= lo:
        return rgb.copy()
    scale = 255.0 / (hi - lo)
    return np.clip((rgb.astype(np.float32) - lo) * scale, 0, 255).astype(np.uint8)


def prepare_det_tensor(img: Image.Image,
                       limit_side: int = DET_LIMIT_SIDE
                       ) -> tuple[np.ndarray, int, int]:
    """RGB page -> [1, 3, H, W] float32 tensor + target dims."""
    rgb_img = img.convert("RGB")
    long_side = max(rgb_img.width, rgb_img.height)
    scale = limit_side / long_side if long_side > limit_side else 1.0
    target_w = snap_to_multiple(rgb_img.width * scale)
    target_h = snap_to_multiple(rgb_img.height * scale)
    resized = np.asarray(rgb_img.resize((target_w, target_h), Image.Resampling.BILINEAR))
    stretched = contrast_stretch(resized)
    norm = (stretched.astype(np.float32) / 255.0 - _MEAN) / _STD
    chw = np.ascontiguousarray(np.transpose(norm, (2, 0, 1))[np.newaxis, ...])
    return chw, target_w, target_h


def post_process_dbnet(prob_map: np.ndarray,
                       binary_threshold: float = BINARY_THRESHOLD,
                       box_threshold: float = BOX_THRESHOLD,
                       unclip_ratio: float = UNCLIP_RATIO,
                       min_size: int = MIN_SIZE) -> list[tuple[float, float, float, float]]:
    """[H, W] prob map -> normalized (xMin, yMin, xMax, yMax) boxes.

    Vectorized twin of the browser's flood fill: connected components via
    OpenCV (4-connectivity), identical filtering and unclip math.
    """
    import cv2

    map_h, map_w = prob_map.shape
    binary = (prob_map >= binary_threshold).astype(np.uint8)
    n_labels, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=4)

    boxes: list[tuple[float, float, float, float]] = []
    for i in range(1, n_labels):
        x, y, w, h, _area = stats[i]
        box_w, box_h = w - 1, h - 1            # browser uses inclusive extents
        if box_w < min_size or box_h < min_size:
            continue
        mask = labels == i
        mean_prob = float(prob_map[mask].mean())
        if mean_prob < box_threshold:
            continue
        area = box_w * box_h
        perimeter = 2 * (box_w + box_h)
        distance = (area * unclip_ratio) / perimeter if perimeter > 0 else 0.0
        ex_min = max(0.0, x - distance)
        ey_min = max(0.0, y - distance)
        ex_max = min(float(map_w), x + box_w + distance)
        ey_max = min(float(map_h), y + box_h + distance)
        boxes.append((ex_min / map_w, ey_min / map_h, ex_max / map_w, ey_max / map_h))

    boxes.sort(key=lambda b: (b[1], b[0]))
    return boxes


def detect_lines(session: ort.InferenceSession, img: Image.Image,
                 limit_side: int = DET_LIMIT_SIDE
                 ) -> list[tuple[float, float, float, float]]:
    """Full det pass: page image -> normalized text-line boxes."""
    tensor, _, _ = prepare_det_tensor(img, limit_side)
    input_name = session.get_inputs()[0].name
    out = session.run(None, {input_name: tensor})[0]     # [1, 1, H, W]
    return post_process_dbnet(out[0, 0])
