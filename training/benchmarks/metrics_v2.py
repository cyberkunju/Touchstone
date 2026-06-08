"""
docdet-v1 staged-topology evaluation metrics (v2).

This module is the single source of truth for *geometry-level* and
*detection-level* metrics used to gate the two docdet-v1 models:

  * Model 1 (page locator)      -> predicts a quad/polygon for ``document_page``.
                                   Gated on polygon IoU, corner error and
                                   page coverage.
  * Model 2 (primitive detector)-> predicts axis-aligned boxes (AABB) for the
                                   10 primitive classes on a rectified crop.
                                   Gated on greedy-matched precision/recall,
                                   false-positives-per-page, a class confusion
                                   matrix and per-size-bucket recall.

Design goals
------------
* Pure functions operating on plain Python lists / numpy arrays. NO dependency
  on ultralytics or torch, so the module is fast to import and trivially
  testable.
* ``shapely`` is used (and only used) for polygon / quad IoU where rotated
  geometry matters.
* Follows the benchmarks/ script-mode import fallback convention (try relative
  import, except ImportError -> sys.path.insert) so it can be imported both as
  ``benchmarks.metrics_v2`` and as a top-level script.

Conventions
-----------
* AABB boxes are ``(x1, y1, x2, y2)`` with ``x2 >= x1`` and ``y2 >= y1`` in
  pixel coordinates.
* Quads are a list/array of 4 ``(x, y)`` corner points. Order does not need to
  match between two quads for :func:`corner_error` (we match by nearest corner).
* "background" is represented in the confusion matrix as the extra last
  row/column (index ``num_classes``): the background *row* counts missed gts
  (false negatives), the background *column* counts false-alarm predictions
  (false positives with no gt).
"""
from __future__ import annotations

import math
import os
import sys
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np

try:  # pragma: no cover - exercised indirectly
    from shapely.geometry import Polygon
except ImportError as exc:  # pragma: no cover - shapely is a hard dependency here
    raise ImportError(
        "metrics_v2 requires shapely for polygon IoU; install with `pip install shapely`"
    ) from exc

# Script-mode import fallback (mirrors the convention used elsewhere in
# benchmarks/, e.g. eval_real.py). We don't *need* class_map for the math, but
# we expose the canonical primitive count when it is importable so callers can
# default ``num_classes`` sensibly.
try:
    from .class_map import DOCDET_NAMES  # type: ignore
except ImportError:  # pragma: no cover - script-mode fallback
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    try:
        from class_map import DOCDET_NAMES  # type: ignore
    except Exception:  # pragma: no cover - class_map is optional for the math
        DOCDET_NAMES = None  # type: ignore


# ---------------------------------------------------------------------------
# Size buckets (COCO-style)
# ---------------------------------------------------------------------------
SMALL_MAX_AREA = 32 ** 2      # 1024 px^2  -> area < 1024 is "small"
MEDIUM_MAX_AREA = 96 ** 2     # 9216 px^2  -> 1024 <= area < 9216 is "medium"
SIZE_BUCKETS = ("small", "medium", "large")


# ===========================================================================
# 1. AABB IoU
# ===========================================================================
def iou_xyxy(a: Sequence[float], b: Sequence[float]) -> float:
    """Intersection-over-Union of two axis-aligned boxes.

    Parameters
    ----------
    a, b : sequence of 4 floats
        Boxes in ``(x1, y1, x2, y2)`` format.

    Returns
    -------
    float
        IoU in ``[0, 1]``. Returns ``0.0`` for disjoint boxes and for any box
        with non-positive area.
    """
    ax1, ay1, ax2, ay2 = float(a[0]), float(a[1]), float(a[2]), float(a[3])
    bx1, by1, bx2, by2 = float(b[0]), float(b[1]), float(b[2]), float(b[3])

    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)

    inter_w = max(0.0, inter_x2 - inter_x1)
    inter_h = max(0.0, inter_y2 - inter_y1)
    inter = inter_w * inter_h
    if inter <= 0.0:
        return 0.0

    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    if union <= 0.0:
        return 0.0
    return inter / union


def iou_matrix(preds: Sequence[Sequence[float]],
               gts: Sequence[Sequence[float]]) -> np.ndarray:
    """Vectorized IoU between every prediction box and every gt box.

    Parameters
    ----------
    preds : (N, 4) array-like of xyxy boxes.
    gts   : (M, 4) array-like of xyxy boxes.

    Returns
    -------
    np.ndarray
        ``(N, M)`` matrix where ``out[i, j]`` is ``iou_xyxy(preds[i], gts[j])``.
        Shape is always 2-D, even when N or M is 0.
    """
    p = np.asarray(preds, dtype=np.float64).reshape(-1, 4)
    g = np.asarray(gts, dtype=np.float64).reshape(-1, 4)
    n, m = p.shape[0], g.shape[0]
    if n == 0 or m == 0:
        return np.zeros((n, m), dtype=np.float64)

    # Pairwise intersection coordinates via broadcasting -> (N, M).
    inter_x1 = np.maximum(p[:, 0][:, None], g[:, 0][None, :])
    inter_y1 = np.maximum(p[:, 1][:, None], g[:, 1][None, :])
    inter_x2 = np.minimum(p[:, 2][:, None], g[:, 2][None, :])
    inter_y2 = np.minimum(p[:, 3][:, None], g[:, 3][None, :])

    inter_w = np.clip(inter_x2 - inter_x1, 0.0, None)
    inter_h = np.clip(inter_y2 - inter_y1, 0.0, None)
    inter = inter_w * inter_h

    area_p = np.clip(p[:, 2] - p[:, 0], 0.0, None) * np.clip(p[:, 3] - p[:, 1], 0.0, None)
    area_g = np.clip(g[:, 2] - g[:, 0], 0.0, None) * np.clip(g[:, 3] - g[:, 1], 0.0, None)
    union = area_p[:, None] + area_g[None, :] - inter

    with np.errstate(divide="ignore", invalid="ignore"):
        iou = np.where(union > 0.0, inter / union, 0.0)
    return iou


# ===========================================================================
# 2. Polygon / quad IoU (shapely)
# ===========================================================================
def _as_polygon(quad: Sequence[Sequence[float]]) -> Polygon:
    """Build a (repaired) shapely Polygon from 4 (x, y) corner points.

    Self-intersecting / degenerate quads are repaired with ``.buffer(0)`` which
    returns a valid geometry with the same covered area. Non-finite coordinates
    (NaN / inf) are rejected up front because shapely would otherwise produce a
    silently meaningless geometry (a NaN area sails past ``area <= 0`` guards).
    """
    pts = [(float(x), float(y)) for x, y in quad]
    flat = [c for p in pts for c in p]
    if not all(math.isfinite(c) for c in flat):
        raise ValueError("polygon coordinates must be finite (got NaN/inf)")
    poly = Polygon(pts)
    if not poly.is_valid:
        poly = poly.buffer(0)
    return poly


def polygon_iou(quad_a: Sequence[Sequence[float]],
                quad_b: Sequence[Sequence[float]]) -> float:
    """IoU of two quads/polygons using shapely.

    Each quad is a list of 4 ``(x, y)`` points (any winding order). Invalid or
    self-intersecting inputs are repaired with ``.buffer(0)`` before the
    boolean ops, so a "bowtie" quad is handled gracefully. Non-finite inputs
    return ``0.0`` rather than silent garbage.

    Returns
    -------
    float
        IoU in ``[0, 1]``; ``0.0`` if either polygon has zero area, they are
        disjoint, or any coordinate is non-finite.
    """
    try:
        pa = _as_polygon(quad_a)
        pb = _as_polygon(quad_b)
    except ValueError:
        return 0.0
    if pa.area <= 0.0 or pb.area <= 0.0:
        return 0.0
    inter = pa.intersection(pb).area
    if inter <= 0.0:
        return 0.0
    union = pa.area + pb.area - inter
    if union <= 0.0:
        return 0.0
    return inter / union


# ===========================================================================
# 3. Corner error (order-invariant)
# ===========================================================================
def _match_corner_order(pred_quad: np.ndarray, gt_quad: np.ndarray) -> np.ndarray:
    """Return pred corners reordered to align with gt corners by the OPTIMAL
    one-to-one assignment (minimum total Euclidean distance).

    A greedy nearest-corner assignment is NOT optimal and can inflate the
    reported corner error (observed up to ~2.6x on adversarial quads), which
    would unfairly fail a good page locator. For the 4-corner quad case the
    optimal assignment is found by exhaustively evaluating all permutations
    (4! = 24, or n! in general) — trivial cost, no scipy dependency, and exact.
    """
    n = gt_quad.shape[0]
    # distance matrix d[i, j] = ||gt[i] - pred[j]||
    d = np.linalg.norm(gt_quad[:, None, :] - pred_quad[None, :, :], axis=2)
    best_perm = None
    best_cost = float("inf")
    for perm in _permutations(range(n)):
        cost = float(sum(d[i, perm[i]] for i in range(n)))
        if cost < best_cost:
            best_cost = cost
            best_perm = perm
    assigned_pred = np.asarray(best_perm, dtype=int)
    return pred_quad[assigned_pred]


def _permutations(seq):
    """Local itertools.permutations shim (kept explicit for clarity)."""
    import itertools
    return itertools.permutations(seq)


def corner_error(pred_quad: Sequence[Sequence[float]],
                 gt_quad: Sequence[Sequence[float]],
                 normalizer: Optional[float] = None) -> Dict[str, float]:
    """Mean & max Euclidean corner error between two quads.

    The pred corners are first matched to gt corners by nearest-corner
    assignment, so the result is invariant to the *ordering* of the input
    corners (a quad listed clockwise vs counter-clockwise gives the same error).

    Parameters
    ----------
    pred_quad, gt_quad : list of 4 (x, y) points.
    normalizer : float, optional
        If ``None`` (default) the error is normalized by the gt diagonal length
        (so the result is scale-invariant, fraction-of-diagonal). Pass an
        explicit float to divide by your own normalizer, or pass ``0`` /
        a negative value to get raw pixel errors.

    Returns
    -------
    dict
        ``{"mean": <mean corner error>, "max": <max corner error>}``.
    """
    p = np.asarray(pred_quad, dtype=np.float64).reshape(-1, 2)
    g = np.asarray(gt_quad, dtype=np.float64).reshape(-1, 2)
    if p.shape[0] != g.shape[0]:
        raise ValueError("pred_quad and gt_quad must have the same number of corners")

    p_aligned = _match_corner_order(p, g)
    dists = np.linalg.norm(p_aligned - g, axis=1)

    if normalizer is None:
        # Default: normalize by the gt diagonal (max pairwise corner distance).
        diag = _quad_diagonal(g)
        denom = diag if diag > 0 else 1.0
    elif normalizer and normalizer > 0:
        denom = float(normalizer)
    else:
        denom = 1.0  # raw pixels

    return {"mean": float(dists.mean() / denom), "max": float(dists.max() / denom)}


def _quad_diagonal(quad: np.ndarray) -> float:
    """Largest pairwise distance between corners (the quad's diagonal)."""
    d = np.linalg.norm(quad[:, None, :] - quad[None, :, :], axis=2)
    return float(d.max())


# ===========================================================================
# 4. Page coverage
# ===========================================================================
def page_coverage(pred_quad: Sequence[Sequence[float]],
                  gt_quad: Sequence[Sequence[float]]) -> float:
    """Fraction of the true page area covered by the prediction.

    Defined as ``intersection_area / gt_area``. Unlike IoU this does not
    penalise the prediction for being *larger* than the gt; it answers "how much
    of the real page did we capture".

    Returns
    -------
    float
        Coverage in ``[0, 1]``; ``0.0`` if gt has zero area.
    """
    try:
        pa = _as_polygon(pred_quad)
        pb = _as_polygon(gt_quad)
    except ValueError:
        return 0.0
    if pb.area <= 0.0:
        return 0.0
    inter = pa.intersection(pb).area
    return max(0.0, inter) / pb.area


# ===========================================================================
# 5. Size buckets
# ===========================================================================
def size_bucket(area_px: float) -> str:
    """COCO-style size bucket for an area in pixels^2.

    * ``area < 32**2``        -> ``"small"``
    * ``32**2 <= area < 96**2`` -> ``"medium"``
    * ``area >= 96**2``       -> ``"large"``
    """
    area = float(area_px)
    if area < SMALL_MAX_AREA:
        return "small"
    if area < MEDIUM_MAX_AREA:
        return "medium"
    return "large"


def box_area_xyxy(box: Sequence[float]) -> float:
    """Area of an xyxy box (clamped at 0 for inverted boxes)."""
    return max(0.0, float(box[2]) - float(box[0])) * max(0.0, float(box[3]) - float(box[1]))


def bucketize(boxes_with_area: Iterable) -> Dict[str, List[int]]:
    """Group item indices into size buckets.

    Parameters
    ----------
    boxes_with_area : iterable
        Either an iterable of scalar areas, or an iterable of xyxy boxes (length
        4 each). For boxes the area is computed via :func:`box_area_xyxy`.

    Returns
    -------
    dict
        ``{"small": [...indices...], "medium": [...], "large": [...]}``.
    """
    buckets: Dict[str, List[int]] = {b: [] for b in SIZE_BUCKETS}
    for idx, item in enumerate(boxes_with_area):
        if np.isscalar(item):
            area = float(item)
        else:
            arr = np.asarray(item, dtype=np.float64).reshape(-1)
            area = box_area_xyxy(arr) if arr.size == 4 else float(arr[0])
        buckets[size_bucket(area)].append(idx)
    return buckets


# ===========================================================================
# 6. Greedy matching at an IoU threshold (per class)
# ===========================================================================
def match_detections(preds: Sequence[Sequence[float]],
                     gts: Sequence[Sequence[float]],
                     iou_thr: float = 0.5,
                     pred_classes: Optional[Sequence[int]] = None,
                     gt_classes: Optional[Sequence[int]] = None,
                     ) -> Dict[str, list]:
    """Greedy one-to-one matching of predictions to ground-truths.

    Matching is performed *per class* when ``pred_classes`` / ``gt_classes`` are
    supplied: a prediction can only match a gt of the same class. Within a class
    the highest-IoU pairs are matched first; each pred matches at most one gt and
    vice versa, and only pairs with ``IoU >= iou_thr`` count as true positives.

    Parameters
    ----------
    preds, gts : array-like of xyxy boxes.
    iou_thr : float
        Minimum IoU for a valid match.
    pred_classes, gt_classes : sequences of ints, optional
        Class id per pred / gt. If omitted all boxes are treated as one class.

    Returns
    -------
    dict
        ``{
            "tp": [(pred_idx, gt_idx, iou), ...],
            "fp": [pred_idx, ...],   # unmatched predictions
            "fn": [gt_idx, ...],     # unmatched ground-truths
        }``
    """
    n_pred = len(preds)
    n_gt = len(gts)

    if pred_classes is None:
        pred_classes = [0] * n_pred
    if gt_classes is None:
        gt_classes = [0] * n_gt

    iou = iou_matrix(preds, gts) if (n_pred and n_gt) else np.zeros((n_pred, n_gt))

    matched_pred = set()
    matched_gt = set()
    tp: List[Tuple[int, int, float]] = []

    # Build candidate pairs (same class, IoU >= thr), sort by IoU descending.
    candidates: List[Tuple[float, int, int]] = []
    for i in range(n_pred):
        for j in range(n_gt):
            if pred_classes[i] != gt_classes[j]:
                continue
            v = iou[i, j]
            if v >= iou_thr:
                candidates.append((float(v), i, j))
    candidates.sort(key=lambda t: t[0], reverse=True)

    for v, i, j in candidates:
        if i in matched_pred or j in matched_gt:
            continue
        matched_pred.add(i)
        matched_gt.add(j)
        tp.append((i, j, v))

    fp = [i for i in range(n_pred) if i not in matched_pred]
    fn = [j for j in range(n_gt) if j not in matched_gt]
    return {"tp": tp, "fp": fp, "fn": fn}


# ===========================================================================
# Helpers for per-image detection records
# ===========================================================================
def _coerce_image_record(record) -> Tuple[np.ndarray, List[int], np.ndarray]:
    """Normalize a per-image record into (boxes Nx4, classes list, scores N).

    Accepted shapes:
      * dict with keys ``boxes`` (Nx4), ``classes`` (N), optional ``scores`` (N)
      * tuple/list ``(boxes, classes)`` or ``(boxes, classes, scores)``
    """
    if isinstance(record, dict):
        boxes = record.get("boxes", [])
        classes = record.get("classes", [])
        scores = record.get("scores", None)
    else:
        boxes = record[0]
        classes = record[1]
        scores = record[2] if len(record) > 2 else None

    boxes_arr = np.asarray(boxes, dtype=np.float64).reshape(-1, 4) if len(boxes) else np.zeros((0, 4))
    classes_list = [int(c) for c in classes]
    if scores is None:
        scores_arr = np.ones(len(classes_list), dtype=np.float64)
    else:
        scores_arr = np.asarray(scores, dtype=np.float64).reshape(-1)
    return boxes_arr, classes_list, scores_arr


def _safe_div(num: float, den: float) -> float:
    return float(num) / float(den) if den else 0.0


# ===========================================================================
# Ignore-region masking (CLASS_SPEC `ignore_region` + per-instance ignore)
# ===========================================================================
def _box_center(box: Sequence[float]) -> Tuple[float, float]:
    return ((float(box[0]) + float(box[2])) / 2.0,
            (float(box[1]) + float(box[3])) / 2.0)


def _ignore_to_polygon(region):
    """An ignore region given as a 4+-point polygon OR an xyxy box -> Polygon."""
    arr = np.asarray(region, dtype=np.float64)
    if arr.ndim == 2 and arr.shape[0] >= 3:           # polygon: N x 2 points
        try:
            return _as_polygon(arr)
        except ValueError:
            return None
    flat = arr.reshape(-1)
    if flat.size == 4:                                # xyxy box
        x1, y1, x2, y2 = flat
        try:
            return _as_polygon([(x1, y1), (x2, y1), (x2, y2), (x1, y2)])
        except ValueError:
            return None
    return None


def _center_in_ignore(box: Sequence[float], ignore_polys: list) -> bool:
    """True if the box CENTER falls inside any ignore-region polygon."""
    if not ignore_polys:
        return False
    cx, cy = _box_center(box)
    from shapely.geometry import Point  # local import; shapely already required
    pt = Point(cx, cy)
    for poly in ignore_polys:
        if poly is not None and poly.covers(pt):
            return True
    return False


def _ignore_flags(record) -> list:
    """Extract a per-box ignore flag list from a record (dict 'ignore' key)."""
    if isinstance(record, dict):
        ig = record.get("ignore")
        if ig is not None:
            return [bool(x) for x in ig]
    return []


# ===========================================================================
# 7 + 8. Evaluate detections over a list of images
# ===========================================================================
def evaluate_detections(images_preds: Sequence,
                        images_gts: Sequence,
                        num_classes: int,
                        iou_thr: float = 0.5,
                        conf: float = 0.25,
                        size_mode: str = "absolute",
                        size_ref: Optional[Sequence[float]] = None,
                        images_ignore: Optional[Sequence] = None) -> dict:
    """Aggregate detection metrics over a list of images.

    Each element of ``images_preds`` / ``images_gts`` is a per-image record (see
    :func:`_coerce_image_record`). Predictions below ``conf`` are dropped before
    matching.

    A SINGLE class-agnostic greedy match (predictions in DESCENDING score order,
    COCO-style) drives BOTH the confusion matrix and the per-class
    precision/recall, so the two can never disagree: by construction
    ``confusion[c, c] == tp[c]``, ``fp[c] == column_c_sum - tp[c]`` and
    ``fn[c] == row_c_sum - tp[c]``. A matched pair with mismatched classes counts
    as BOTH a miss for the gt class and a false-positive for the predicted class
    (it lands off-diagonal in the confusion matrix). Out-of-range class ids are
    skipped defensively (never index out of bounds).

    Size buckets: ``size_mode="absolute"`` uses COCO pixel-area thresholds;
    ``size_mode="relative"`` buckets each gt by its area as a FRACTION of a
    reference area (per-image ``size_ref`` list of image areas, or a single
    area) — the correct choice when Model 2 runs on variable-resolution
    rectified crops, where absolute pixels conflate resolution with object scale.

    Returns a dict with: ``per_class`` (precision/recall/tp/fp/fn),
    ``FP_per_image`` (== sum of per-class fp / num_images), ``confusion``
    ((num_classes+1) square; last row/col == background false-alarm/miss),
    ``recall_by_size``, ``num_images``, ``iou_thr``, ``conf``, ``size_mode``.
    """
    if len(images_preds) != len(images_gts):
        raise ValueError("images_preds and images_gts must have the same length")
    if size_mode not in ("absolute", "relative"):
        raise ValueError("size_mode must be 'absolute' or 'relative'")

    num_images = len(images_preds)
    bg = num_classes
    confusion = np.zeros((num_classes + 1, num_classes + 1), dtype=np.int64)
    size_tp = {b: 0 for b in SIZE_BUCKETS}
    size_total = {b: 0 for b in SIZE_BUCKETS}

    def _in_range(c: int) -> bool:
        return 0 <= c < num_classes

    for idx, (pred_rec, gt_rec) in enumerate(zip(images_preds, images_gts)):
        p_boxes, p_classes, p_scores = _coerce_image_record(pred_rec)
        g_boxes, g_classes, _ = _coerce_image_record(gt_rec)

        # ---- ignore masking: per-instance flags + free-floating ignore_regions
        ignore_polys = []
        if images_ignore is not None and idx < len(images_ignore) and images_ignore[idx]:
            ignore_polys = [_ignore_to_polygon(r) for r in images_ignore[idx]]
        gt_ignore_flags = _ignore_flags(gt_rec)
        ignored_gt = set()
        for gj in range(len(g_classes)):
            flagged = gj < len(gt_ignore_flags) and gt_ignore_flags[gj]
            if flagged or _center_in_ignore(g_boxes[gj], ignore_polys):
                ignored_gt.add(gj)

        # confidence threshold
        keep = p_scores >= conf
        if not np.all(keep):
            p_boxes = p_boxes[keep]
            p_classes = [c for c, k in zip(p_classes, keep) if k]
            p_scores = p_scores[keep]

        iou = iou_matrix(p_boxes, g_boxes) if (len(p_boxes) and len(g_boxes)) else \
            np.zeros((len(p_boxes), len(g_boxes)))

        # greedy class-agnostic match, predictions in DESCENDING score order.
        # IGNORED gts are NOT eligible matches (they neither help recall nor
        # absorb a prediction as a TP); preds that land on them are dropped below.
        order = np.argsort(-p_scores) if len(p_scores) else np.array([], dtype=int)
        matched_gt: dict[int, int] = {}   # gt_idx -> pred_idx
        matched_pred: dict[int, int] = {}  # pred_idx -> gt_idx
        for pi in order:
            pi = int(pi)
            best_j, best_v = -1, iou_thr
            for gj in range(len(g_classes)):
                if gj in matched_gt or gj in ignored_gt:
                    continue
                v = iou[pi, gj]
                if v >= best_v:
                    best_v, best_j = v, gj
            if best_j >= 0:
                matched_gt[best_j] = pi
                matched_pred[pi] = best_j

        # tally confusion from the single matching
        size_ref_area = (_resolve_size_ref(size_ref, idx, num_images)
                         if size_mode == "relative" else None)
        for gj in range(len(g_classes)):
            if gj in ignored_gt:
                continue  # ignored gt: excluded from loss AND recall denominator
            gc = g_classes[gj]
            if not _in_range(gc):
                continue
            b = _gt_size_bucket(g_boxes[gj], size_mode, size_ref_area)
            size_total[b] += 1
            if gj in matched_gt:
                pc = p_classes[matched_gt[gj]]
                if _in_range(pc):
                    confusion[gc, pc] += 1
                    if pc == gc:
                        size_tp[b] += 1
                else:  # matched to an out-of-range pred class -> treat as miss
                    confusion[gc, bg] += 1
            else:
                confusion[gc, bg] += 1  # miss
        for pi in range(len(p_classes)):
            pc = p_classes[pi]
            if not _in_range(pc):
                continue
            if pi in matched_pred:
                gc = g_classes[matched_pred[pi]]
                if not _in_range(gc):
                    confusion[bg, pc] += 1  # matched gt out of range -> false alarm
                continue
            # unmatched prediction: a false alarm UNLESS it lands on an ignore
            # region or overlaps an ignored gt (then it simply does not count).
            if _center_in_ignore(p_boxes[pi], ignore_polys):
                continue
            if ignored_gt and len(g_boxes):
                if any(iou[pi, gj] >= iou_thr for gj in ignored_gt):
                    continue
            confusion[bg, pc] += 1  # false alarm

    # derive per-class metrics from the confusion matrix (consistent by construction)
    per_class = {}
    total_fp = 0
    for c in range(num_classes):
        tp_c = int(confusion[c, c])
        fp_c = int(confusion[:, c].sum() - tp_c)   # predicted c but gt != c (incl bg)
        fn_c = int(confusion[c, :].sum() - tp_c)   # gt c but predicted != c (incl bg)
        per_class[c] = {
            "precision": _safe_div(tp_c, tp_c + fp_c),
            "recall": _safe_div(tp_c, tp_c + fn_c),
            "tp": tp_c, "fp": fp_c, "fn": fn_c,
        }
        total_fp += fp_c

    recall_by_size = {
        b: {"recall": _safe_div(size_tp[b], size_total[b]),
            "tp": int(size_tp[b]), "total": int(size_total[b])}
        for b in SIZE_BUCKETS
    }

    return {
        "per_class": per_class,
        "FP_per_image": _safe_div(total_fp, num_images),
        "confusion": confusion,
        "recall_by_size": recall_by_size,
        "num_images": num_images,
        "iou_thr": iou_thr,
        "conf": conf,
        "size_mode": size_mode,
    }


def _resolve_size_ref(size_ref, idx: int, num_images: int = None) -> float:
    """Reference area for relative size bucketing (per-image list or scalar).

    Raises on a non-positive reference (a zero/negative image area would silently
    dump every object into the 'small' bucket) and on a per-image list whose
    length does not match the number of images.
    """
    if size_ref is None:
        raise ValueError("size_mode='relative' requires size_ref (image area(s))")
    if np.ndim(size_ref) == 0:  # scalar (incl. 0-d numpy array)
        val = float(size_ref)
    else:
        if num_images is not None and len(size_ref) != num_images:
            raise ValueError(
                f"size_ref length {len(size_ref)} != num_images {num_images}")
        if idx >= len(size_ref):
            raise ValueError(f"size_ref has no entry for image index {idx}")
        val = float(size_ref[idx])
    if val <= 0:
        raise ValueError(f"size_ref area must be > 0 (got {val})")
    return val


def _gt_size_bucket(box, size_mode: str, ref_area: Optional[float]) -> str:
    """Size bucket for a gt box, absolute (px^2) or relative (fraction of ref)."""
    area = box_area_xyxy(box)
    if size_mode == "absolute":
        return size_bucket(area)
    frac = area / ref_area if ref_area and ref_area > 0 else 0.0
    # relative thresholds: <0.1% small, <1% medium, else large (object-scale,
    # resolution-invariant — appropriate for variable-size rectified crops).
    if frac < 0.001:
        return "small"
    if frac < 0.01:
        return "medium"
    return "large"


# ===========================================================================
# 9. Per-slice aggregation
# ===========================================================================
def aggregate_by_slice(per_image_results: Sequence[dict],
                       slice_tags: Sequence) -> Dict:
    """Aggregate per-image detection counts by an arbitrary slice tag.

    Parameters
    ----------
    per_image_results : sequence of dicts
        One dict per image with at least integer keys ``tp``, ``fp``, ``fn``
        (e.g. ``{"tp": 3, "fp": 1, "fn": 0}``).
    slice_tags : sequence
        Parallel sequence giving the slice tag (any hashable) for each image,
        e.g. a per-image condition like ``"clean"`` / ``"blurred"``.

    Returns
    -------
    dict
        ``{tag: {"precision", "recall", "tp", "fp", "fn", "num_images"}}``.
    """
    if len(per_image_results) != len(slice_tags):
        raise ValueError("per_image_results and slice_tags must have the same length")

    acc: Dict = {}
    for res, tag in zip(per_image_results, slice_tags):
        a = acc.setdefault(tag, {"tp": 0, "fp": 0, "fn": 0, "num_images": 0})
        a["tp"] += int(res.get("tp", 0))
        a["fp"] += int(res.get("fp", 0))
        a["fn"] += int(res.get("fn", 0))
        a["num_images"] += 1

    out: Dict = {}
    for tag, a in acc.items():
        out[tag] = {
            "precision": _safe_div(a["tp"], a["tp"] + a["fp"]),
            "recall": _safe_div(a["tp"], a["tp"] + a["fn"]),
            "FP_per_image": _safe_div(a["fp"], a["num_images"]),
            "tp": a["tp"],
            "fp": a["fp"],
            "fn": a["fn"],
            "num_images": a["num_images"],
        }
    return out


# ===========================================================================
# 10. Wilson score interval + CI-guarded recall
# ===========================================================================
def wilson_interval(successes: int, total: int, z: float = 1.96) -> Tuple[float, float]:
    """Wilson score confidence interval for a binomial proportion.

    More reliable than the normal approximation for small samples / extreme
    proportions, which is exactly the regime our recall gates live in.

    Parameters
    ----------
    successes : int
        Number of successes (e.g. true positives).
    total : int
        Number of trials (e.g. tp + fn). ``total == 0`` returns ``(0.0, 1.0)``
        (maximal uncertainty rather than a divide-by-zero).
    z : float
        Z-score for the desired confidence (1.96 == 95%).

    Returns
    -------
    (low, high) : tuple of floats, each clamped to ``[0, 1]``.
    """
    if total <= 0:
        return (0.0, 1.0)
    if successes < 0 or successes > total:
        raise ValueError(
            f"wilson_interval: successes ({successes}) must satisfy 0 <= successes <= total ({total})"
        )
    n = float(total)
    phat = float(successes) / n
    z2 = z * z
    denom = 1.0 + z2 / n
    center = phat + z2 / (2.0 * n)
    radicand = max(0.0, (phat * (1.0 - phat) + z2 / (4.0 * n)) / n)
    margin = z * math.sqrt(radicand)
    low = (center - margin) / denom
    high = (center + margin) / denom
    return (max(0.0, low), min(1.0, high))


def recall_with_ci(tp: int, fn: int, z: float = 1.96) -> Dict[str, float]:
    """Point-estimate recall plus a Wilson confidence interval.

    Returns
    -------
    dict
        ``{"recall": phat, "low": ci_low, "high": ci_high, "tp": tp,
        "total": tp + fn}``. With no positives (``tp + fn == 0``) recall is
        reported as ``0.0`` with the maximally-uncertain ``[0, 1]`` interval.
    """
    total = int(tp) + int(fn)
    low, high = wilson_interval(int(tp), total, z=z)
    return {
        "recall": _safe_div(tp, total),
        "low": low,
        "high": high,
        "tp": int(tp),
        "total": total,
    }


def cluster_bootstrap_recall_ci(cluster_counts: Sequence[Tuple[int, int]],
                                alpha: float = 0.05, n_boot: int = 2000,
                                seed: int = 0) -> Dict[str, float]:
    """Recall point estimate + CI via the CLUSTER bootstrap.

    Detections are NOT iid: many near-duplicate frames come from one document /
    capture session, so the per-frame correlation makes a plain Wilson interval
    too narrow (design effect DEFF = 1 + (m̄-1)·ρ), which lets borderline models
    slip past a gate. The cluster bootstrap respects that structure by resampling
    whole CLUSTERS (leakage groups) with replacement and recomputing recall, so
    the interval widens to reflect the true effective sample size.

    Parameters
    ----------
    cluster_counts : sequence of (tp, total) per cluster (e.g. per document /
        capture_session / pHash-cluster — the same grouping as the leakage key).
    alpha : two-sided significance (0.05 -> 95% CI).
    n_boot, seed : bootstrap resamples and RNG seed.

    Returns
    -------
    dict with ``recall`` (pooled point estimate), ``low``, ``high`` (percentile
    CI over the cluster resamples), ``n_clusters``, ``n_boot``.
    """
    counts = [(int(tp), int(tot)) for tp, tot in cluster_counts if int(tot) > 0]
    n = len(counts)
    if n == 0:
        return {"recall": 0.0, "low": 0.0, "high": 1.0, "n_clusters": 0,
                "n_boot": n_boot, "degenerate": True}
    tp_tot = sum(tp for tp, _ in counts)
    den_tot = sum(t for _, t in counts)
    point = _safe_div(tp_tot, den_tot)

    # Guard degenerate bootstrap requests: n_boot<=0 would make np.percentile
    # blow up on an empty array, and a single cluster / a request for <2 resamples
    # cannot produce a meaningful interval — return the point as a zero-width
    # interval and FLAG it (degenerate) so a caller/gate can refuse to trust it
    # rather than reading a falsely tight CI.
    if n_boot is None or n_boot < 1 or n < 2:
        return {"recall": point, "low": point, "high": point,
                "n_clusters": n, "n_boot": max(0, int(n_boot or 0)),
                "degenerate": True}

    rng = np.random.default_rng(seed)
    idx = np.arange(n)
    tp_arr = np.array([tp for tp, _ in counts], dtype=np.float64)
    tot_arr = np.array([t for _, t in counts], dtype=np.float64)
    boots = np.empty(n_boot, dtype=np.float64)
    for b in range(n_boot):
        pick = rng.choice(idx, size=n, replace=True)
        d = tot_arr[pick].sum()
        boots[b] = (tp_arr[pick].sum() / d) if d > 0 else 0.0
    low = float(np.percentile(boots, 100.0 * (alpha / 2.0)))
    high = float(np.percentile(boots, 100.0 * (1.0 - alpha / 2.0)))
    return {"recall": point, "low": low, "high": high,
            "n_clusters": n, "n_boot": n_boot, "degenerate": False}


def average_precision_per_class(images_preds: Sequence, images_gts: Sequence,
                                num_classes: int, iou_thr: float = 0.5,
                                images_ignore: Optional[Sequence] = None) -> dict:
    """COCO/VOC-style all-point Average Precision per class at one IoU threshold.

    Unlike :func:`evaluate_detections` (a single operating point), AP sweeps ALL
    predictions by descending score, so it is threshold-independent and detects
    a model that only looks good at one conf. Ignored gts / ignore-regions are
    excluded (a pred on an ignored gt or ignore-region is dropped, not an FP;
    ignored gts are not counted in the recall denominator).

    Returns ``{class_id: {"ap": float, "n_gt": int}, "mAP": float}``.
    """
    # gather, per class: detections (score, image, box) and per-image gt boxes
    dets = {c: [] for c in range(num_classes)}
    gts = {c: {} for c in range(num_classes)}      # class -> {img_idx: [boxes]}
    n_gt = {c: 0 for c in range(num_classes)}
    ign = {}                                        # img_idx -> [ignore polys]

    for idx, (pred_rec, gt_rec) in enumerate(zip(images_preds, images_gts)):
        if images_ignore is not None and idx < len(images_ignore) and images_ignore[idx]:
            ign[idx] = [_ignore_to_polygon(r) for r in images_ignore[idx]]
        g_boxes, g_classes, _ = _coerce_image_record(gt_rec)
        gflags = _ignore_flags(gt_rec)
        for gj, gc in enumerate(g_classes):
            if not (0 <= gc < num_classes):
                continue
            flagged = gj < len(gflags) and gflags[gj]
            if flagged or _center_in_ignore(g_boxes[gj], ign.get(idx, [])):
                continue
            gts[gc].setdefault(idx, []).append(g_boxes[gj])
            n_gt[gc] += 1
        p_boxes, p_classes, p_scores = _coerce_image_record(pred_rec)
        for pi, pc in enumerate(p_classes):
            if 0 <= pc < num_classes:
                dets[pc].append((float(p_scores[pi]), idx, p_boxes[pi]))

    aps = {}
    for c in range(num_classes):
        d = sorted(dets[c], key=lambda t: -t[0])
        npos = n_gt[c]
        if npos == 0:
            aps[c] = {"ap": 0.0, "n_gt": 0}
            continue
        matched = {img: set() for img in gts[c]}
        tp = np.zeros(len(d)); fp = np.zeros(len(d))
        for i, (_score, img, box) in enumerate(d):
            gboxes = gts[c].get(img, [])
            best_j, best_iou = -1, iou_thr
            for gj, gb in enumerate(gboxes):
                if gj in matched[img]:
                    continue
                v = iou_xyxy(box, gb)
                if v >= best_iou:
                    best_iou, best_j = v, gj
            if best_j >= 0:
                matched[img].add(best_j); tp[i] = 1
            elif _center_in_ignore(box, ign.get(img, [])):
                tp[i] = 0; fp[i] = 0  # on an ignore-region: neither
            else:
                fp[i] = 1
        tpc = np.cumsum(tp); fpc = np.cumsum(fp)
        rec = tpc / npos
        prec = tpc / np.maximum(tpc + fpc, 1e-12)
        # all-point interpolation (monotone precision envelope)
        mrec = np.concatenate(([0.0], rec, [1.0]))
        mpre = np.concatenate(([0.0], prec, [0.0]))
        for i in range(len(mpre) - 1, 0, -1):
            mpre[i - 1] = max(mpre[i - 1], mpre[i])
        i = np.where(mrec[1:] != mrec[:-1])[0]
        ap = float(np.sum((mrec[i + 1] - mrec[i]) * mpre[i + 1]))
        aps[c] = {"ap": ap, "n_gt": npos}
    valid = [v["ap"] for v in aps.values() if v["n_gt"] > 0]
    aps["mAP"] = float(np.mean(valid)) if valid else 0.0
    return aps


def gate(eval_result: dict, *, recall_floor: float = 0.90,
         precision_floor: float = 0.0, fp_per_image_ceiling: float = None,
         gated_class_ids: Sequence[int] = None,
         recall_ci: Optional[dict] = None,
         use_ci_lower: bool = True) -> dict:
    """Render a PASS/FAIL verdict from an :func:`evaluate_detections` result.

    This is the missing VERDICT layer: a descriptive metrics dict is not a gate.
    A model passes only if, for every gated class, recall meets ``recall_floor``
    AND precision meets ``precision_floor`` AND (optionally) FP-per-page is under
    ``fp_per_image_ceiling``.

    Honesty rules:
      * Recall is judged on the cluster-bootstrap CI LOWER BOUND when a
        ``recall_ci`` is supplied and ``use_ci_lower`` (so a wide/uncertain CI
        cannot sneak a borderline point estimate past the gate). A DEGENERATE CI
        (too few clusters / n_boot) is itself a blocker — we refuse to certify on
        an untrustworthy interval.
      * Precision-floor>0 closes the box-spraying loophole that recall-only gating
        leaves open.

    Returns ``{"passed": bool, "blockers": [...], "checks": {...}}``.
    """
    per_class = eval_result.get("per_class", {})
    if gated_class_ids is None:
        gated_class_ids = list(per_class.keys())
    blockers, checks = [], {}

    # global recall CI gate (document_page / aggregate), if provided
    if recall_ci is not None:
        if recall_ci.get("degenerate"):
            blockers.append("recall CI is degenerate (too few clusters / n_boot) — cannot certify")
        judged = recall_ci["low"] if use_ci_lower else recall_ci["recall"]
        checks["recall_ci_judged"] = {"value": judged, "floor": recall_floor,
                                      "low": recall_ci["low"], "point": recall_ci["recall"]}
        if judged < recall_floor:
            blockers.append(
                f"recall {'CI-low' if use_ci_lower else 'point'}={judged:.4f} < floor {recall_floor}")

    fp_pi = eval_result.get("FP_per_image")
    if fp_per_image_ceiling is not None and fp_pi is not None:
        checks["fp_per_image"] = {"value": fp_pi, "ceiling": fp_per_image_ceiling}
        if fp_pi > fp_per_image_ceiling:
            blockers.append(f"FP/page={fp_pi:.4f} > ceiling {fp_per_image_ceiling}")

    for c in gated_class_ids:
        pc = per_class.get(c)
        if pc is None:
            continue
        ok_r = pc["recall"] >= recall_floor
        ok_p = pc["precision"] >= precision_floor
        checks[f"class_{c}"] = {"recall": pc["recall"], "precision": pc["precision"],
                                "recall_ok": ok_r, "precision_ok": ok_p}
        if not ok_r:
            blockers.append(f"class {c} recall {pc['recall']:.4f} < {recall_floor}")
        if not ok_p:
            blockers.append(f"class {c} precision {pc['precision']:.4f} < {precision_floor}")

    return {"passed": len(blockers) == 0, "blockers": blockers, "checks": checks}


__all__ = [
    "iou_xyxy",
    "iou_matrix",
    "polygon_iou",
    "corner_error",
    "page_coverage",
    "size_bucket",
    "box_area_xyxy",
    "bucketize",
    "match_detections",
    "evaluate_detections",
    "aggregate_by_slice",
    "wilson_interval",
    "recall_with_ci",
    "cluster_bootstrap_recall_ci",
    "average_precision_per_class",
    "gate",
    "SIZE_BUCKETS",
    "SMALL_MAX_AREA",
    "MEDIUM_MAX_AREA",
]
