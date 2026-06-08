"""
Real-background / confuser image bank for the Engine A compositor.

Scans a directory tree ONCE for image files and serves seeded random samples as
RGB PIL images resized to a target canvas. Designed to be cheap to construct in
each multiprocessing worker (it only stores a sorted list of paths) and fully
deterministic given a seeded ``random.Random``.
"""
from __future__ import annotations

import os
import random

from PIL import Image

_IMG_EXTS = (".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff")


class BackgroundBank:
    """A pool of real background images sampled by a seeded RNG.

    Args:
        root: directory tree to scan (recursively) for images.
        max_scan: cap on number of files indexed (None = all). Keeps worker
            construction bounded on huge banks.
    """

    def __init__(self, root: str, max_scan: int | None = None):
        self.root = root
        self.paths = self._scan(root, max_scan)

    @staticmethod
    def _scan(root: str, max_scan: int | None) -> list[str]:
        out: list[str] = []
        if not root or not os.path.isdir(root):
            return out
        for r, _d, files in os.walk(root):
            for f in files:
                if f.lower().endswith(_IMG_EXTS):
                    out.append(os.path.join(r, f))
                    if max_scan is not None and len(out) >= max_scan:
                        out.sort()
                        return out
        out.sort()  # deterministic order independent of filesystem walk order
        return out

    def __len__(self) -> int:
        return len(self.paths)

    @property
    def available(self) -> bool:
        return len(self.paths) > 0

    def sample_canvas(self, rng: random.Random, long_side: int) -> Image.Image:
        """Return a real background as an RGB image whose LONG side == long_side.

        The image is loaded, EXIF-free converted to RGB, scaled so its longer
        side equals ``long_side`` (preserving aspect), then used as the
        compositing canvas. Falls back to a neutral gray canvas if the bank is
        empty or the chosen file is unreadable (so generation never crashes).
        """
        if not self.paths:
            return Image.new("RGB", (long_side, long_side), (200, 200, 200))
        path = rng.choice(self.paths)
        try:
            with Image.open(path) as _im:
                img = _im.convert("RGB")  # fully loaded; file handle closed on exit
        except Exception:  # noqa: BLE001 - unreadable file -> safe fallback
            return Image.new("RGB", (long_side, long_side), (200, 200, 200))
        w, h = img.size
        if max(w, h) <= 0:
            return Image.new("RGB", (long_side, long_side), (200, 200, 200))
        scale = long_side / float(max(w, h))
        nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
        return img.resize((nw, nh), Image.BILINEAR)
