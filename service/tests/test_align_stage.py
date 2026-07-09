"""P4.3 tier-2 borderless alignment tests — prose must never become a table."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from stages.align_stage import detect_aligned_table


def line(text: str, x: float, y: float, w: float = 0.1, h: float = 0.02) -> dict:
    return {"text": text, "box": [x, y, w, h]}


def test_detects_clean_borderless_lattice():
    lines = []
    cols = [0.1, 0.4, 0.7]
    headers = ["Item", "Qty", "Price"]
    for c, (x, head) in enumerate(zip(cols, headers)):
        lines.append(line(head, x, 0.1))
    for r in range(4):
        y = 0.16 + r * 0.05
        lines.append(line(f"Widget-{r}", cols[0], y))
        lines.append(line(str(r + 1), cols[1], y))
        lines.append(line(f"{(r + 1) * 5}.00", cols[2], y))
    t = detect_aligned_table(lines)
    assert t is not None
    assert t.method == "cluster"
    rows = {c.r for c in t.cells}
    col_ids = {c.c for c in t.cells}
    assert len(rows) == 5           # header + 4 data
    assert len(col_ids) == 3
    # Reading order within a cell row is left-to-right.
    r1 = sorted((c for c in t.cells if c.r == 1), key=lambda c: c.c)
    assert [c.text for c in r1] == ["Widget-0", "1", "5.00"]


def test_prose_paragraph_is_not_a_table():
    # Left-aligned prose: one x-cluster only ⇒ honestly None.
    lines = [line(f"This is sentence number {i} of a paragraph", 0.1, 0.1 + i * 0.03, w=0.7)
             for i in range(8)]
    assert detect_aligned_table(lines) is None


def test_wrapped_line_cannot_fabricate_a_column():
    cols = [0.1, 0.5]
    lines = []
    for r in range(5):
        y = 0.1 + r * 0.05
        lines.append(line(f"Name-{r}", cols[0], y))
        lines.append(line(f"Value-{r}", cols[1], y))
    # ONE stray wrapped fragment at a third x-position.
    lines.append(line("(continued)", 0.83, 0.2))
    t = detect_aligned_table(lines)
    assert t is not None
    assert max(c.c for c in t.cells) == 1  # still two columns


def test_sparse_scatter_is_rejected_by_occupancy():
    # 4x4 lattice positions but only 5 filled (31% < 60%).
    pts = [(0.1, 0.1), (0.4, 0.1), (0.7, 0.25), (0.1, 0.4), (0.4, 0.55)]
    lines = [line(f"t{i}", x, y) for i, (x, y) in enumerate(pts)]
    assert detect_aligned_table(lines) is None


def test_too_few_rows_or_cols_rejected():
    lines = [
        line("A", 0.1, 0.1), line("B", 0.5, 0.1),
        line("C", 0.1, 0.2), line("D", 0.5, 0.2),
    ]
    assert detect_aligned_table(lines) is None  # 2 rows < MIN_ROWS
