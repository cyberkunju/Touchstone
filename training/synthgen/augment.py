"""
Capture-degradation augmentation with label-preserving geometry.

Real users photograph documents at angles, in bad light, folded, stained, and
compressed. Per YOLOV11N_DOCUMENT_DETECTOR.md §5.3 we simulate that. Geometric
augmentations (perspective warp, rotation) transform every annotation polygon
through the SAME homography so labels stay pixel-accurate; photometric ones
(blur, glare, shadow, noise, JPEG) leave geometry unchanged.

All ops are seeded and deterministic.
"""
from __future__ import annotations

import io
import random

import cv2
import numpy as np
from PIL import Image

from .config import DEFAULT_BG_RGB
from .core import Annotation, Sample


def _to_np(img: Image.Image) -> np.ndarray:
    return np.asarray(img.convert("RGB"), dtype=np.uint8)


def _to_pil(arr: np.ndarray) -> Image.Image:
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")


def _smooth_mask(mask: np.ndarray, sigma: float, max_dim: int = 256) -> np.ndarray:
    """Gaussian-blur a single-channel mask, computing the blur at LOW resolution.

    Large-sigma Gaussian blur at full resolution is the dominant generation cost
    (sigma can be hundreds of px on a composited frame). Because the mask is
    smooth, blurring a downscaled copy and upscaling is visually identical at a
    fraction of the cost. Deterministic and label-free (no geometry change).
    """
    if sigma <= 0.0:
        return mask
    h, w = mask.shape[:2]
    longest = max(h, w)
    if longest > max_dim:
        scale = max_dim / float(longest)
        sw, sh = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
        small = cv2.resize(mask, (sw, sh), interpolation=cv2.INTER_AREA)
        small = cv2.GaussianBlur(small, (0, 0), sigmaX=max(0.5, sigma * scale))
        return cv2.resize(small, (w, h), interpolation=cv2.INTER_LINEAR)
    return cv2.GaussianBlur(mask, (0, 0), sigmaX=sigma)


def _apply_homography(sample: Sample, H: np.ndarray, out_w: int, out_h: int,
                      border: tuple[int, int, int]) -> None:
    """Warp the image and all annotation polygons by homography H in place."""
    src = _to_np(sample.image)
    warped = cv2.warpPerspective(
        src, H, (out_w, out_h),
        flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT,
        borderValue=border,
    )
    sample.image = _to_pil(warped)
    for ann in sample.annotations:
        pts = ann.polygon.reshape(-1, 1, 2).astype(np.float64)
        out = cv2.perspectiveTransform(pts, H).reshape(-1, 2)
        ann.polygon = out


def perspective(sample: Sample, rng: random.Random, strength: float | None = None) -> None:
    """Random 4-corner perspective warp (simulates phone-camera angle).

    `strength` is the max corner displacement as a fraction of width/height. If
    None, a value in [0.05, 0.30] is drawn — the upper end gives strong off-axis
    captures that the page-detection/dewarp stage must tolerate.
    """
    if strength is None:
        strength = rng.uniform(0.05, 0.30)
    w, h = sample.width, sample.height
    dx = w * strength
    dy = h * strength
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst = np.float32([
        [rng.uniform(0, dx), rng.uniform(0, dy)],
        [w - rng.uniform(0, dx), rng.uniform(0, dy)],
        [w - rng.uniform(0, dx), h - rng.uniform(0, dy)],
        [rng.uniform(0, dx), h - rng.uniform(0, dy)],
    ])
    H = cv2.getPerspectiveTransform(src, dst)
    _apply_homography(sample, H, w, h, DEFAULT_BG_RGB)
    sample.quality_tags.append("perspective")


def _rotate_by(sample: Sample, angle: float, border: tuple[int, int, int]) -> None:
    """Rotate about center by `angle` degrees, expanding the canvas to fit.

    Used by both the small-skew `rotate` and the exact `orient` (90/180/270).
    Annotations are transformed by the SAME affine matrix.
    """
    w, h = sample.width, sample.height
    rad = abs(np.deg2rad(angle))
    new_w = int(round(w * abs(np.cos(rad)) + h * abs(np.sin(rad))))
    new_h = int(round(w * abs(np.sin(rad)) + h * abs(np.cos(rad))))
    M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    M[0, 2] += (new_w - w) / 2
    M[1, 2] += (new_h - h) / 2
    H = np.vstack([M, [0, 0, 1]])
    _apply_homography(sample, H, new_w, new_h, border)


def rotate(sample: Sample, rng: random.Random, max_deg: float = 12.0) -> None:
    """Rotate about center by a small angle, expanding canvas to fit."""
    _rotate_by(sample, rng.uniform(-max_deg, max_deg), DEFAULT_BG_RGB)
    sample.quality_tags.append("skew")


def orient(sample: Sample, rng: random.Random, k: int | None = None) -> None:
    """Apply a hard 90/180/270 orientation flip (relabel-safe via homography).

    Real captures arrive sideways/upside-down. `k` selects 90*k degrees; if
    None one of {90, 180, 270} is chosen. Goes through the same matrix path so
    every annotation polygon is transformed exactly.
    """
    if k is None:
        k = rng.choice([1, 2, 3])
    _rotate_by(sample, 90.0 * k, DEFAULT_BG_RGB)
    sample.quality_tags.append("oriented")


def curl(sample: Sample, rng: random.Random) -> None:
    """Page-curl / bend: a smooth vertical sinusoidal displacement (mesh warp).

    Unlike the darkened `fold` line, this actually bends the sheet. Each column
    x is shifted vertically by d(x) = A*sin(2*pi*f*x/w + phase); we build the
    inverse remap for the image and apply the SAME forward displacement to every
    annotation polygon point, so labels track the bend exactly.
    """
    arr = _to_np(sample.image)
    h, w = arr.shape[:2]
    A = rng.uniform(0.02, 0.06) * h
    freq = rng.uniform(0.5, 1.6)
    phase = rng.uniform(0, 2 * np.pi)
    xs = np.arange(w, dtype=np.float32)
    disp = (A * np.sin(2 * np.pi * freq * xs / w + phase)).astype(np.float32)
    pad = int(np.ceil(A)) + 1
    out_h = h + 2 * pad
    map_x = np.tile(xs[None, :], (out_h, 1))
    rows = np.arange(out_h, dtype=np.float32)[:, None]
    # dst(x, Y) samples src row (Y - pad - disp(x)).
    map_y = (rows - pad) - disp[None, :]
    warped = cv2.remap(arr, map_x, map_y, interpolation=cv2.INTER_LINEAR,
                       borderMode=cv2.BORDER_CONSTANT, borderValue=DEFAULT_BG_RGB)
    sample.image = _to_pil(warped)
    for ann in sample.annotations:
        px = ann.polygon[:, 0]
        d = A * np.sin(2 * np.pi * freq * np.clip(px, 0, w - 1) / w + phase)
        ann.polygon[:, 1] = ann.polygon[:, 1] + pad + d
    sample.quality_tags.append("curl")


def gaussian_blur(sample: Sample, rng: random.Random) -> None:
    arr = _to_np(sample.image)
    k = rng.choice([3, 5, 7])
    arr = cv2.GaussianBlur(arr, (k, k), 0)
    sample.image = _to_pil(arr)
    sample.quality_tags.append("blur")


def motion_blur(sample: Sample, rng: random.Random) -> None:
    arr = _to_np(sample.image)
    size = rng.choice([7, 9, 11, 15])
    kernel = np.zeros((size, size))
    if rng.random() < 0.5:
        kernel[size // 2, :] = 1.0
    else:
        kernel[:, size // 2] = 1.0
    kernel /= size
    arr = cv2.filter2D(arr, -1, kernel)
    sample.image = _to_pil(arr)
    sample.quality_tags.append("motion_blur")


def jpeg(sample: Sample, rng: random.Random) -> None:
    q = rng.randint(25, 60)
    buf = io.BytesIO()
    sample.image.save(buf, format="JPEG", quality=q)
    buf.seek(0)
    sample.image = Image.open(buf).convert("RGB")
    sample.quality_tags.append("jpeg")


def glare(sample: Sample, rng: random.Random) -> None:
    """Add a bright elliptical glare spot."""
    arr = _to_np(sample.image).astype(np.float32)
    h, w = arr.shape[:2]
    mask = np.zeros((h, w), np.float32)
    cx, cy = rng.randint(0, w), rng.randint(0, h)
    ax, ay = rng.randint(w // 8, w // 3), rng.randint(h // 8, h // 3)
    cv2.ellipse(mask, (cx, cy), (ax, ay), 0, 0, 360, 1.0, -1)
    mask = _smooth_mask(mask, max(ax, ay) / 2)
    arr += (mask[..., None] * rng.uniform(80, 160))
    sample.image = _to_pil(arr)
    sample.quality_tags.append("glare")


def shadow(sample: Sample, rng: random.Random) -> None:
    """Darken a random half-plane region (cast shadow)."""
    arr = _to_np(sample.image).astype(np.float32)
    h, w = arr.shape[:2]
    mask = np.zeros((h, w), np.float32)
    pts = np.array([[0, 0], [rng.randint(0, w), 0],
                    [rng.randint(0, w), h], [0, h]], np.int32)
    cv2.fillPoly(mask, [pts], 1.0)
    mask = _smooth_mask(mask, w / 10)
    arr *= (1 - mask[..., None] * rng.uniform(0.25, 0.5))
    sample.image = _to_pil(arr)
    sample.quality_tags.append("shadow")


def noise(sample: Sample, rng: random.Random) -> None:
    arr = _to_np(sample.image).astype(np.float32)
    sigma = rng.uniform(6, 18)
    arr += np.random.default_rng(rng.randint(0, 2**31)).normal(0, sigma, arr.shape)
    sample.image = _to_pil(arr)
    sample.quality_tags.append("scanner_noise")


def low_resolution(sample: Sample, rng: random.Random) -> None:
    """Downscale then upscale to simulate low-DPI capture."""
    w, h = sample.width, sample.height
    f = rng.uniform(0.4, 0.65)
    small = sample.image.resize((max(1, int(w * f)), max(1, int(h * f))), Image.BILINEAR)
    sample.image = small.resize((w, h), Image.BILINEAR)
    sample.quality_tags.append("low_resolution")


def fold(sample: Sample, rng: random.Random) -> None:
    """Draw a soft fold/crease line with a brightness discontinuity."""
    arr = _to_np(sample.image).astype(np.float32)
    h, w = arr.shape[:2]
    if rng.random() < 0.5:
        x = rng.randint(w // 4, 3 * w // 4)
        arr[:, max(0, x - 2):x + 2, :] *= 0.7
        arr[:, x:, :] *= rng.uniform(0.92, 0.98)
    else:
        y = rng.randint(h // 4, 3 * h // 4)
        arr[max(0, y - 2):y + 2, :, :] *= 0.7
        arr[y:, :, :] *= rng.uniform(0.92, 0.98)
    sample.image = _to_pil(arr)
    sample.quality_tags.append("fold")


def stain(sample: Sample, rng: random.Random) -> None:
    """Add translucent brown/gray stains."""
    arr = _to_np(sample.image).astype(np.float32)
    h, w = arr.shape[:2]
    for _ in range(rng.randint(1, 3)):
        cx, cy = rng.randint(0, w), rng.randint(0, h)
        r = rng.randint(w // 20, w // 8)
        mask = np.zeros((h, w), np.float32)
        cv2.circle(mask, (cx, cy), r, 1.0, -1)
        mask = _smooth_mask(mask, r / 2)
        tint = np.array([rng.randint(80, 140), rng.randint(70, 110), rng.randint(50, 90)], np.float32)
        alpha = rng.uniform(0.15, 0.35)
        arr = arr * (1 - mask[..., None] * alpha) + tint * (mask[..., None] * alpha)
    sample.image = _to_pil(arr)
    sample.quality_tags.append("stain")


def exposure(sample: Sample, rng: random.Random) -> None:
    arr = _to_np(sample.image).astype(np.float32)
    if rng.random() < 0.5:
        arr = arr * rng.uniform(1.15, 1.5)  # over
    else:
        arr = arr * rng.uniform(0.55, 0.8)  # under
    sample.image = _to_pil(arr)
    sample.quality_tags.append("exposure")


# Geometric ops come first (they expand/warp the canvas), then photometric.
_GEOMETRIC = [perspective, rotate]
_PHOTOMETRIC = [gaussian_blur, motion_blur, jpeg, glare, shadow, noise,
                low_resolution, fold, stain, exposure]


def augment(sample: Sample, rng: random.Random, intensity: float = 0.7) -> Sample:
    """Apply a random, label-preserving degradation stack to `sample`.

    `intensity` in [0,1] scales how many ops fire. The 'clean' tag is removed
    once any op runs. Returns the same (mutated) sample for convenience.

    Geometry order: a hard 90/180/270 orientation flip (sometimes), then at most
    one continuous warp (perspective OR small skew), then an optional page-curl
    bend. All geometric ops route annotations through the same transform.
    """
    fired = False
    # Hard orientation flip (sideways/upside-down captures).
    if rng.random() < 0.3 * intensity:
        orient(sample, rng)
        fired = True
    # At most one continuous warp (compounding warps destroys readability).
    if rng.random() < 0.6 * intensity:
        rng.choice(_GEOMETRIC)(sample, rng)
        fired = True
    # Optional page-curl bend on top.
    if rng.random() < 0.25 * intensity:
        curl(sample, rng)
        fired = True
    # A handful of photometric effects.
    n = 0
    for op in rng.sample(_PHOTOMETRIC, k=len(_PHOTOMETRIC)):
        if rng.random() < 0.35 * intensity and n < 4:
            op(sample, rng)
            fired = True
            n += 1
    if fired and "clean" in sample.quality_tags:
        sample.quality_tags.remove("clean")
    return sample
