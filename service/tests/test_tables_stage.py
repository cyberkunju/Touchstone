"""Table stage goldens — synthetic ruled grids with mathematically known
geometry (truth by construction, same doctrine as the corpus).

Covers: simple grid, merged cells (both axes), broken/dashed rulings within
segment tolerance, text noise immunity, no-table honesty, and the bundle
integration (cells validate against the contract schema).
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bundle import new_bundle, new_page, validate_bundle  # noqa: E402
from stages.tables_stage import detect_tables  # noqa: E402


def _canvas(w: int = 800, h: int = 600) -> np.ndarray:
    return np.full((h, w), 255, dtype=np.uint8)


def _hline(img: np.ndarray, y: int, x0: int, x1: int, thick: int = 2,
           dashed: bool = False) -> None:
    if dashed:
        for x in range(x0, x1, 24):
            img[y:y + thick, x:min(x + 16, x1)] = 0
    else:
        img[y:y + thick, x0:x1] = 0


def _vline(img: np.ndarray, x: int, y0: int, y1: int, thick: int = 2) -> None:
    img[y0:y1, x:x + thick] = 0


def _grid(img: np.ndarray, xs: list[int], ys: list[int]) -> None:
    for y in ys:
        _hline(img, y, xs[0], xs[-1] + 2)
    for x in xs:
        _vline(img, x, ys[0], ys[-1] + 2)


def test_simple_grid_exact_geometry():
    img = _canvas()
    xs, ys = [100, 300, 500, 700], [100, 200, 300, 400]
    _grid(img, xs, ys)
    tables = detect_tables(img)
    assert len(tables) == 1
    t = tables[0]
    assert t.method == "rulings"
    assert len(t.cells) == 9                       # 3×3
    assert all(c.rs == 1 and c.cs == 1 for c in t.cells)
    # Exact box math for the first cell.
    c00 = next(c for c in t.cells if (c.r, c.c) == (0, 0))
    x, y, w, h = c00.box
    assert abs(x - 100 / 800) < 0.01 and abs(y - 100 / 600) < 0.01
    assert abs(w - 200 / 800) < 0.01 and abs(h - 100 / 600) < 0.01
    # Full coordinate coverage.
    assert {(c.r, c.c) for c in t.cells} == {(i, j) for i in range(3) for j in range(3)}


def test_merged_cell_spans():
    """Omit one interior v-segment and one interior h-segment => spans."""
    img = _canvas()
    xs, ys = [100, 300, 500, 700], [100, 200, 300, 400]
    # Outer border
    _hline(img, ys[0], xs[0], xs[-1] + 2)
    _hline(img, ys[-1], xs[0], xs[-1] + 2)
    _vline(img, xs[0], ys[0], ys[-1] + 2)
    _vline(img, xs[-1], ys[0], ys[-1] + 2)
    # Interior horizontals: full at y=200; at y=300 SKIP the first column span
    _hline(img, ys[1], xs[0], xs[-1] + 2)
    _hline(img, ys[2], xs[1], xs[-1] + 2)          # (rows 1-2 merged in col 0)
    # Interior verticals: full at x=300; at x=500 SKIP the first row span
    _vline(img, xs[1], ys[0], ys[-1] + 2)
    _vline(img, xs[2], ys[1], ys[-1] + 2)          # (cols 1-2 merged in row 0)
    t = detect_tables(img)[0]
    by_rc = {(c.r, c.c): c for c in t.cells}
    assert by_rc[(1, 0)].rs == 2 and by_rc[(1, 0)].cs == 1     # vertical merge
    assert by_rc[(0, 1)].cs == 2 and by_rc[(0, 1)].rs == 1     # horizontal merge
    # Units covered exactly once.
    covered = set()
    for c in t.cells:
        for i in range(c.r, c.r + c.rs):
            for j in range(c.c, c.c + c.cs):
                assert (i, j) not in covered
                covered.add((i, j))
    assert covered == {(i, j) for i in range(3) for j in range(3)}


def test_dashed_rulings_within_tolerance():
    img = _canvas()
    xs, ys = [100, 400, 700], [100, 250, 400]
    for y in ys:
        _hline(img, y, xs[0], xs[-1] + 2, dashed=True)
    for x in xs:
        _vline(img, x, ys[0], ys[-1] + 2)
    t = detect_tables(img)
    assert len(t) == 1 and len(t[0].cells) == 4


def test_text_noise_does_not_create_rulings():
    img = _canvas()
    xs, ys = [100, 400, 700], [100, 250, 400]
    _grid(img, xs, ys)
    rng = np.random.default_rng(7)
    # Dense short "text" strokes inside cells (too short for the kernels).
    for _ in range(300):
        x = int(rng.integers(110, 680))
        y = int(rng.integers(110, 390))
        img[y:y + 2, x:x + int(rng.integers(4, 14))] = 0
    t = detect_tables(img)
    assert len(t) == 1 and len(t[0].cells) == 4, "text must not mint grid lines"


def test_no_table_is_honest_empty():
    img = _canvas()
    rng = np.random.default_rng(11)
    for _ in range(200):
        x = int(rng.integers(50, 740))
        y = int(rng.integers(50, 540))
        img[y:y + 2, x:x + int(rng.integers(4, 20))] = 0
    assert detect_tables(img) == []


def test_single_box_is_one_cell():
    img = _canvas()
    _hline(img, 100, 100, 702)
    _hline(img, 400, 100, 702)
    _vline(img, 100, 100, 402)
    _vline(img, 700, 100, 402)
    t = detect_tables(img)
    assert len(t) == 1
    assert len(t[0].cells) == 1
    assert t[0].cells[0].rs == 1 and t[0].cells[0].cs == 1


def test_cells_flow_into_bundle_contract():
    img = _canvas()
    xs, ys = [100, 300, 500, 700], [100, 200, 300, 400]
    _grid(img, xs, ys)
    t = detect_tables(img)[0]
    page = new_page(0, 800, 600)
    page["tables"].append({
        "box": list(t.box),
        "method": t.method,
        "cells": [{"r": c.r, "c": c.c, "rs": c.rs, "cs": c.cs, "box": list(c.box)}
                  for c in t.cells],
    })
    validate_bundle(new_bundle("image", "0" * 64, [page]))
