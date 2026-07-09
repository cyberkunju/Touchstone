"""Borderless-table alignment stage (P4.3 tier 2, Documentation/10 §4.1).

When the rulings detector honestly returns nothing but OCR boxes cluster
into a lattice, the table structure IS the alignment: x-cluster the box
edges into columns, y-cluster the baselines into rows. Model-free tier —
SLANet_plus/LORE remain a flag-future upgrade slot behind the same output
contract (method field records which tier produced the grid).

Emits GEOMETRY ONLY, same contract as tables_stage (frozen separation:
semantic closure lives in the brain). Honesty laws:
  - a lattice requires ≥3 rows × ≥2 cols AND ≥60% grid occupancy — prose
    paragraphs and address blocks must NOT become tables;
  - column count is established by the MAJORITY of rows, not the union —
    one wrapped line must not fabricate a phantom column.
"""

from __future__ import annotations

from dataclasses import dataclass

# Cluster tolerance as a fraction of the page dimension.
X_SNAP_FRAC = 0.02
Y_SNAP_FRAC = 0.012
MIN_ROWS = 3
MIN_COLS = 2
MIN_OCCUPANCY = 0.6


@dataclass
class AlignedCell:
    r: int
    c: int
    rs: int
    cs: int
    box: tuple[float, float, float, float]      # normalized [x, y, w, h]
    text: str


@dataclass
class AlignedTable:
    box: tuple[float, float, float, float]
    method: str                                  # 'cluster' (schema-frozen tier name)
    cells: list[AlignedCell]


def _cluster(values: list[float], tol: float) -> list[float]:
    """1-D single-linkage clustering → sorted cluster centers."""
    if not values:
        return []
    ordered = sorted(values)
    clusters: list[list[float]] = [[ordered[0]]]
    for v in ordered[1:]:
        if v - clusters[-1][-1] <= tol:
            clusters[-1].append(v)
        else:
            clusters.append([v])
    return [sum(c) / len(c) for c in clusters]


def _nearest(centers: list[float], v: float) -> int:
    best = 0
    for i, c in enumerate(centers):
        if abs(c - v) < abs(centers[best] - v):
            best = i
    return best


def detect_aligned_table(
    ocr_lines: list[dict],
) -> AlignedTable | None:
    """Detect ONE aligned lattice from OCR line boxes.

    `ocr_lines`: [{'text': str, 'box': [x, y, w, h] normalized}, ...]
    Returns None honestly when no lattice exists.
    """
    boxes = [(l["text"], tuple(l["box"])) for l in ocr_lines if l.get("text", "").strip()]
    if len(boxes) < MIN_ROWS * MIN_COLS:
        return None

    # Row clustering on y-centers.
    y_centers = [b[1][1] + b[1][3] / 2 for b in boxes]
    rows = _cluster(y_centers, Y_SNAP_FRAC)
    if len(rows) < MIN_ROWS:
        return None

    # Column clustering on LEFT edges (tables left-align columns far more
    # reliably than they center them; numeric right-alignment still yields
    # stable left edges within a column's width envelope).
    x_lefts = [b[1][0] for b in boxes]
    cols = _cluster(x_lefts, X_SNAP_FRAC)
    if len(cols) < MIN_COLS:
        return None

    # Assign every box to its (row, col) cell.
    grid: dict[tuple[int, int], list[tuple[str, tuple[float, float, float, float]]]] = {}
    for text, box in boxes:
        r = _nearest(rows, box[1] + box[3] / 2)
        c = _nearest(cols, box[0])
        grid.setdefault((r, c), []).append((text, box))

    # Majority-of-rows column law: count columns per row; keep columns that
    # appear in ≥50% of rows. One wrapped line cannot fabricate a column.
    col_votes = [0] * len(cols)
    for r in range(len(rows)):
        for c in range(len(cols)):
            if (r, c) in grid:
                col_votes[c] += 1
    kept_cols = [c for c, votes in enumerate(col_votes) if votes * 2 >= len(rows)]
    if len(kept_cols) < MIN_COLS:
        return None
    col_remap = {c: i for i, c in enumerate(kept_cols)}

    # Occupancy over the KEPT lattice.
    occupied = sum(1 for (r, c) in grid if c in col_remap)
    total = len(rows) * len(kept_cols)
    if occupied / total < MIN_OCCUPANCY:
        return None

    cells: list[AlignedCell] = []
    for (r, c), members in sorted(grid.items()):
        if c not in col_remap:
            continue
        xs = [m[1][0] for m in members]
        ys = [m[1][1] for m in members]
        x2s = [m[1][0] + m[1][2] for m in members]
        y2s = [m[1][1] + m[1][3] for m in members]
        cells.append(AlignedCell(
            r=r, c=col_remap[c], rs=1, cs=1,
            box=(min(xs), min(ys), max(x2s) - min(xs), max(y2s) - min(ys)),
            text=" ".join(m[0] for m in sorted(members, key=lambda m: m[1][0])),
        ))

    all_x = [cell.box[0] for cell in cells]
    all_y = [cell.box[1] for cell in cells]
    all_x2 = [cell.box[0] + cell.box[2] for cell in cells]
    all_y2 = [cell.box[1] + cell.box[3] for cell in cells]
    return AlignedTable(
        box=(min(all_x), min(all_y), max(all_x2) - min(all_x), max(all_y2) - min(all_y)),
        method="cluster",
        cells=cells,
    )
