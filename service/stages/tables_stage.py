"""Table stage — rulings-first cell geometry (Documentation/05 section 4).

Classical detector for ruled tables: morphology isolates horizontal and
vertical ruling masks, their intersections define a grid lattice, and cells
are connected runs of grid units with no separating ruling between them
(which yields row/col spans for merged cells).

Emits GEOMETRY ONLY — (r, c, rs, cs, box) per cell. Cell text comes from
ocr/reperceive; semantic closure lives in the brain (frozen separation of
powers). Borderless tables are a different detector (SLANet fallback, later
tier of the ladder) — this stage honestly returns nothing for them.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

# A ruling segment must cover at least this fraction of its span to count as
# a real separator (broken/dashed printing tolerance).
SEGMENT_COVERAGE = 0.55
# Cluster tolerance for snapping ruling coordinates, as a fraction of the
# image's longer side.
SNAP_FRAC = 0.008
# Minimum rulings for a table hypothesis (2 h + 2 v = one closed box).
MIN_LINES = 2
# Minimum unit size in px — thinner grid slivers are line-doubling artifacts.
MIN_UNIT_PX = 6


@dataclass
class TableCell:
    r: int
    c: int
    rs: int
    cs: int
    box: tuple[float, float, float, float]     # normalized [x, y, w, h]


@dataclass
class DetectedTable:
    box: tuple[float, float, float, float]     # normalized
    method: str                                 # 'rulings'
    cells: list[TableCell]


def _binarize_inv(gray: np.ndarray) -> np.ndarray:
    """Dark ink on light paper -> white-on-black working mask."""
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    return binary


def _ruling_masks(binary: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Morphological open with long thin kernels isolates rulings from text.

    A small directional close FIRST bridges dashed/broken printing (gaps up
    to ~1/80 of the span) so real rulings survive the open; text strokes
    rarely align into runs long enough to survive the long open kernel — the
    noise-immunity golden pins that.
    """
    h, w = binary.shape
    h_bridge = cv2.getStructuringElement(cv2.MORPH_RECT, (max(4, w // 80), 1))
    v_bridge = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(4, h // 80)))
    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(8, w // 24), 1))
    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(8, h // 24)))
    horiz = cv2.morphologyEx(
        cv2.morphologyEx(binary, cv2.MORPH_CLOSE, h_bridge), cv2.MORPH_OPEN, h_kernel)
    vert = cv2.morphologyEx(
        cv2.morphologyEx(binary, cv2.MORPH_CLOSE, v_bridge), cv2.MORPH_OPEN, v_kernel)
    return horiz, vert


def _cluster_positions(positions: np.ndarray, tol: int) -> list[int]:
    """Snap noisy 1-D coordinates into cluster centers (sorted)."""
    if positions.size == 0:
        return []
    xs = np.sort(positions)
    clusters: list[list[int]] = [[int(xs[0])]]
    for v in xs[1:]:
        if v - clusters[-1][-1] <= tol:
            clusters[-1].append(int(v))
        else:
            clusters.append([int(v)])
    return [int(round(float(np.mean(c)))) for c in clusters]


def _line_positions(mask: np.ndarray, axis: int, tol: int) -> list[int]:
    """Coordinates of rulings along `axis` (0 = horizontal lines' y, 1 = vertical lines' x)."""
    proj = mask.sum(axis=1 - axis) / 255          # pixels per row/col
    span = mask.shape[1 - axis]
    hits = np.where(proj >= span * 0.25)[0]        # a ruling crosses ≥ 25% of the span
    return _cluster_positions(hits, tol)


def _segment_present(mask: np.ndarray, fixed: int, lo: int, hi: int,
                     axis: int, thickness: int) -> bool:
    """Is there ruling ink along [lo, hi) at coordinate `fixed` (± thickness)?"""
    a = max(0, fixed - thickness)
    b = fixed + thickness + 1
    if axis == 0:   # horizontal segment: row band a:b, columns lo:hi
        window = mask[a:b, lo:hi]
    else:           # vertical segment: rows lo:hi, column band a:b
        window = mask[lo:hi, a:b]
    if window.size == 0:
        return False
    covered = (window.max(axis=axis) > 0).mean()
    return bool(covered >= SEGMENT_COVERAGE)


def detect_tables(image: np.ndarray) -> list[DetectedTable]:
    """Detect ruled tables in an RGB or grayscale page raster.

    Returns tables with grid-resolved cells (merged cells carry rs/cs > 1).
    Non-rectangular merge topologies degrade honestly to per-unit cells.
    """
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY) if image.ndim == 3 else image
    h, w = gray.shape
    tol = max(3, int(round(max(h, w) * SNAP_FRAC)))

    binary = _binarize_inv(gray)
    horiz, vert = _ruling_masks(binary)

    ys = _line_positions(horiz, axis=0, tol=tol)
    xs = _line_positions(vert, axis=1, tol=tol)
    if len(ys) < MIN_LINES or len(xs) < MIN_LINES:
        return []

    # Drop sliver duplicates (double-struck borders).
    ys = [y for i, y in enumerate(ys) if i == 0 or y - ys[i - 1] >= MIN_UNIT_PX]
    xs = [x for i, x in enumerate(xs) if i == 0 or x - xs[i - 1] >= MIN_UNIT_PX]
    if len(ys) < MIN_LINES or len(xs) < MIN_LINES:
        return []

    n_rows, n_cols = len(ys) - 1, len(xs) - 1
    thickness = tol

    # Separator presence between adjacent units.
    # h_sep[i][j]: horizontal ruling at ys[i+1] under unit row i, col j.
    h_sep = [[_segment_present(horiz, ys[i + 1], xs[j], xs[j + 1], 0, thickness)
              for j in range(n_cols)] for i in range(n_rows - 1)]
    # v_sep[i][j]: vertical ruling at xs[j+1] right of unit (i, j).
    v_sep = [[_segment_present(vert, xs[j + 1], ys[i], ys[i + 1], 1, thickness)
              for j in range(n_cols - 1)] for i in range(n_rows)]

    # Flood-fill units into merged-cell components.
    comp = [[-1] * n_cols for _ in range(n_rows)]
    n_comp = 0
    for i in range(n_rows):
        for j in range(n_cols):
            if comp[i][j] != -1:
                continue
            stack = [(i, j)]
            comp[i][j] = n_comp
            while stack:
                ci, cj = stack.pop()
                if ci + 1 < n_rows and not h_sep[ci][cj] and comp[ci + 1][cj] == -1:
                    comp[ci + 1][cj] = n_comp
                    stack.append((ci + 1, cj))
                if ci > 0 and not h_sep[ci - 1][cj] and comp[ci - 1][cj] == -1:
                    comp[ci - 1][cj] = n_comp
                    stack.append((ci - 1, cj))
                if cj + 1 < n_cols and not v_sep[ci][cj] and comp[ci][cj + 1] == -1:
                    comp[ci][cj + 1] = n_comp
                    stack.append((ci, cj + 1))
                if cj > 0 and not v_sep[ci][cj - 1] and comp[ci][cj - 1] == -1:
                    comp[ci][cj - 1] = n_comp
                    stack.append((ci, cj - 1))
            n_comp += 1

    # Components -> cells; non-rectangular components degrade to per-unit.
    units_by_comp: dict[int, list[tuple[int, int]]] = {}
    for i in range(n_rows):
        for j in range(n_cols):
            units_by_comp.setdefault(comp[i][j], []).append((i, j))

    cells: list[TableCell] = []
    for units in units_by_comp.values():
        rows = [u[0] for u in units]
        cols = [u[1] for u in units]
        r0, r1, c0, c1 = min(rows), max(rows), min(cols), max(cols)
        rectangular = len(units) == (r1 - r0 + 1) * (c1 - c0 + 1)
        pieces = [(r0, r1, c0, c1)] if rectangular else [(i, i, j, j) for i, j in units]
        for pr0, pr1, pc0, pc1 in pieces:
            cells.append(TableCell(
                r=pr0, c=pc0, rs=pr1 - pr0 + 1, cs=pc1 - pc0 + 1,
                box=(xs[pc0] / w, ys[pr0] / h,
                     (xs[pc1 + 1] - xs[pc0]) / w, (ys[pr1 + 1] - ys[pr0]) / h),
            ))

    cells.sort(key=lambda c: (c.r, c.c))
    table_box = (xs[0] / w, ys[0] / h, (xs[-1] - xs[0]) / w, (ys[-1] - ys[0]) / h)
    return [DetectedTable(box=table_box, method="rulings", cells=cells)]
