"""
eval_v2.py — the WIRED real evaluation gate for docdet-v1.

This replaces the old ultralytics-``val()``-as-verdict gate (``eval_real.py``)
with one driven by the *fixed, well-tested* docdet-v1 instruments in
``benchmarks/metrics_v2.py`` and the leakage machinery in
``ontology/provenance.py``. The headline difference: the recall confidence
interval is computed by the CLUSTER bootstrap (resampling whole documents via
``split_group_key``), NOT a per-frame Wilson interval. MIDV-500 frames are
near-duplicate video frames of the same physical document, so per-frame Wilson
is dishonestly narrow (design effect DEFF >> 1). The cluster CI tells the truth
about the effective sample size; we report the naive Wilson alongside it purely
for contrast.

What this gate does (and does NOT do):
  * RUNS the model (ultralytics ``YOLO.predict``, device=0) over the test images
    and extracts ``document_page`` (class 0) predicted boxes + scores.
  * READS ground-truth boxes from the YOLO label files.
  * SCORES per-class precision/recall + FP/page via ``metrics_v2.evaluate_detections``
    at conf=0.25, IoU=0.5 (the deployment threshold).
  * Computes a CLUSTER-correlated recall CI (``cluster_bootstrap_recall_ci``)
    grouped by ``split_group_key`` AND the naive ``wilson_interval`` for contrast.
  * Reports recall by capture-condition slice and by size bucket.
  * Writes ``metrics_v2.json`` and prints a report labelled
    "REAL GATE (docdet-v1 instruments)".
  * It does NOT use ultralytics' own ``val()`` mAP as the verdict.

CLI:
    python benchmarks/eval_v2.py \
        --model winner_model/best.pt \
        --data benchmarks/real/midv500 \
        --split test --imgsz 640 --conf 0.25 --iou 0.5
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import defaultdict
from typing import Dict, List, Optional, Sequence, Tuple

# --- instrument imports (script-mode fallback convention) ------------------
try:
    from . import metrics_v2 as m
    from .normalize_midv import (
        MIDV500_CONDITIONS,
        midv500_condition_meaning,
        midv500_domain_bucket,
    )
except ImportError:  # pragma: no cover - script-mode fallback
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import metrics_v2 as m  # type: ignore
    from normalize_midv import (  # type: ignore
        MIDV500_CONDITIONS,
        midv500_condition_meaning,
        midv500_domain_bucket,
    )

try:
    from ontology.provenance import compute_split_group_key
except ImportError:  # pragma: no cover - script-mode fallback
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from ontology.provenance import compute_split_group_key  # type: ignore

# docdet-v0 class id for the page (the only class MIDV-500 GT carries).
DOCUMENT_PAGE_CLASS = 0
DEPLOY_CONF = 0.25
DEPLOY_IOU = 0.5
IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp")
_COND_CODES = tuple(MIDV500_CONDITIONS.keys())


# ===========================================================================
# Pure logic — YOLO label IO
# ===========================================================================
def parse_yolo_label_text(text: str) -> List[Tuple[int, float, float, float, float]]:
    """Parse YOLO-format label text into ``(cls, xc, yc, w, h)`` rows (normalized).

    Blank lines and malformed rows are skipped defensively (a label file should
    never crash the gate). Coordinates are returned exactly as written (still
    normalized to [0, 1]); conversion to pixels is :func:`yolo_to_xyxy`.
    """
    rows: List[Tuple[int, float, float, float, float]] = []
    for raw in text.splitlines():
        parts = raw.split()
        if len(parts) < 5:
            continue
        try:
            cls = int(float(parts[0]))
            xc, yc, w, h = (float(parts[1]), float(parts[2]),
                            float(parts[3]), float(parts[4]))
        except ValueError:
            continue
        rows.append((cls, xc, yc, w, h))
    return rows


def yolo_to_xyxy(xc: float, yc: float, w: float, h: float,
                 img_w: int, img_h: int) -> Tuple[float, float, float, float]:
    """Normalized YOLO ``(xc, yc, w, h)`` -> pixel ``(x1, y1, x2, y2)``."""
    cx, cy = xc * img_w, yc * img_h
    bw, bh = w * img_w, h * img_h
    return (cx - bw / 2.0, cy - bh / 2.0, cx + bw / 2.0, cy + bh / 2.0)


def read_gt_record(label_text: str, img_w: int, img_h: int,
                   keep_class: Optional[int] = DOCUMENT_PAGE_CLASS) -> dict:
    """Build a metrics_v2 GT record ``{boxes, classes}`` from YOLO label text.

    ``keep_class=None`` keeps every class; otherwise only rows of that class are
    kept (MIDV-500 GT only ever carries ``document_page``).
    """
    boxes: List[List[float]] = []
    classes: List[int] = []
    for cls, xc, yc, w, h in parse_yolo_label_text(label_text):
        if keep_class is not None and cls != keep_class:
            continue
        boxes.append(list(yolo_to_xyxy(xc, yc, w, h, img_w, img_h)))
        classes.append(cls)
    return {"boxes": boxes, "classes": classes}


# ===========================================================================
# Pure logic — prediction -> record adaptation
# ===========================================================================
def _to_list(x) -> list:
    """Coerce a torch tensor / numpy array / sequence to a plain Python list.

    Kept tiny + dependency-free so prediction adaptation is unit-testable
    without torch: anything exposing ``.cpu()`` / ``.tolist()`` is handled, as
    are plain lists and numpy arrays.
    """
    if x is None:
        return []
    if hasattr(x, "cpu"):
        x = x.cpu()
    if hasattr(x, "numpy"):
        try:
            x = x.numpy()
        except Exception:  # noqa: BLE001
            pass
    if hasattr(x, "tolist"):
        return x.tolist()
    return list(x)


def predictions_to_record(xyxy, classes, scores,
                          keep_class: Optional[int] = DOCUMENT_PAGE_CLASS,
                          conf: float = 0.0) -> dict:
    """Adapt raw prediction arrays into a metrics_v2 prediction record.

    Parameters
    ----------
    xyxy : (N, 4) array-like of pixel boxes.
    classes : (N,) array-like of int class ids.
    scores : (N,) array-like of confidences.
    keep_class : keep only this class (``None`` keeps all).
    conf : drop predictions below this confidence.

    Returns ``{"boxes": [...], "classes": [...], "scores": [...]}`` ready for
    :func:`metrics_v2.evaluate_detections`.
    """
    boxes_l = _to_list(xyxy)
    cls_l = [int(c) for c in _to_list(classes)]
    sc_l = [float(s) for s in _to_list(scores)]
    out_boxes: List[list] = []
    out_cls: List[int] = []
    out_sc: List[float] = []
    for i, c in enumerate(cls_l):
        s = sc_l[i] if i < len(sc_l) else 1.0
        if s < conf:
            continue
        if keep_class is not None and c != keep_class:
            continue
        out_boxes.append([float(v) for v in boxes_l[i]])
        out_cls.append(c)
        out_sc.append(s)
    return {"boxes": out_boxes, "classes": out_cls, "scores": out_sc}


# ===========================================================================
# Pure logic — condition + canonical-doc + split-group-key plumbing
# ===========================================================================
def parse_midv500_source_path(source_image: str) -> Tuple[Optional[str], Optional[str]]:
    """Parse a MIDV-500 ``sourceImage`` path -> ``(canonical_doc, condition)``.

    Layout: ``midv500/<doc>/images/<COND>/<frame>.tif`` -> the doc folder is the
    component just before ``images`` and the condition is the one just after it.
    Returns ``(None, None)`` if the structure is not recognized.
    """
    if not source_image:
        return None, None
    parts = re.split(r"[\\/]+", source_image)
    lowered = [p.lower() for p in parts]
    if "images" in lowered:
        i = lowered.index("images")
        doc = parts[i - 1] if i - 1 >= 0 else None
        cond = parts[i + 1] if i + 1 < len(parts) else None
        return doc, (cond.upper() if cond else None)
    return None, None


def condition_from_name(name: str) -> Optional[str]:
    """Best-effort capture-condition code from an output image name.

    Output names are ``<doc>_<COND>_<frameStem>`` and the frame stem itself
    begins with the same 2-letter code (e.g. ``01_alb_id_CA_CA01_01`` -> ``CA``).
    We look for a known code that appears as a ``_<CODE>_<CODE>...`` token, then
    fall back to the leading 2 letters of the final ``<CODE>NN_MM`` token.
    """
    stem = os.path.splitext(name)[0]
    codes = "|".join(_COND_CODES)
    mobj = re.search(rf"_({codes})_({codes})\d", stem)
    if mobj:
        return mobj.group(1).upper()
    # fallback: last underscore-delimited segment, e.g. 'CA01' -> 'CA'
    seg = stem.split("_")[-1]
    head = seg[:2].upper()
    return head if head in MIDV500_CONDITIONS else None


def canonical_doc_from_name(name: str) -> Optional[str]:
    """Recover the canonical doc folder from an output name (``<doc>_<COND>_<stem>``).

    Returns everything before the ``_<COND>_<COND>...`` marker (the doc folder
    can itself contain underscores, e.g. ``01_alb_id``).
    """
    stem = os.path.splitext(name)[0]
    codes = "|".join(_COND_CODES)
    mobj = re.search(rf"^(.*)_({codes})_(?:{codes})\d", stem)
    if mobj:
        return mobj.group(1)
    return None


def load_provenance_index(provenance_path: str) -> Dict[str, dict]:
    """Read ``provenance.jsonl`` -> ``{image_id: {split_group_key, condition, domain_bucket}}``.

    Tolerates a missing file (returns ``{}``) so the gate still runs on datasets
    normalized before provenance was wired in (it then derives keys from the
    manifest / filename).
    """
    index: Dict[str, dict] = {}
    if not provenance_path or not os.path.isfile(provenance_path):
        return index
    with open(provenance_path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            img = rec.get("image", {})
            image_id = img.get("image_id")
            if not image_id:
                continue
            session = img.get("capture_session_id", "")
            cond = session.split("/")[-1].upper() if "/" in session else None
            index[image_id] = {
                "split_group_key": img.get("split_group_key"),
                "condition": cond,
                "domain_bucket": img.get("domain_bucket"),
            }
    return index


def build_image_index(manifest_samples: Sequence[dict],
                      provenance_index: Optional[Dict[str, dict]] = None,
                      ) -> Dict[str, dict]:
    """Build ``{image_stem: {split_group_key, condition, canonical_doc, domain_bucket}}``.

    Resolution priority for the leakage key:
      1. ``provenance.jsonl`` record (authoritative — written by the normalizer),
      2. an explicit ``split_group_key`` on the manifest entry,
      3. derived via ``compute_split_group_key(canonical_document_id=<doc>)``,
         where the doc is parsed from the manifest ``sourceImage`` path or the
         output filename.
    All three agree by construction because they share ``compute_split_group_key``
    and the same canonical doc folder.
    """
    provenance_index = provenance_index or {}
    index: Dict[str, dict] = {}
    for s in manifest_samples:
        name = s.get("image")
        if not name:
            continue
        stem = os.path.splitext(name)[0]
        doc, cond = parse_midv500_source_path(s.get("sourceImage", ""))
        if doc is None:
            doc = s.get("canonicalDocument") or canonical_doc_from_name(name)
        if cond is None:
            cond = s.get("captureCondition") or condition_from_name(name)

        prov = provenance_index.get(stem, {})
        sgk = (prov.get("split_group_key")
               or s.get("split_group_key")
               or (compute_split_group_key(canonical_document_id=doc) if doc else None))
        if cond is None:
            cond = prov.get("condition")
        index[stem] = {
            "split_group_key": sgk,
            "condition": (cond.upper() if cond else None),
            "canonical_doc": doc,
            "domain_bucket": prov.get("domain_bucket")
            or (midv500_domain_bucket(cond) if cond else None),
        }
    return index


# ===========================================================================
# Pure logic — per-image document_page scoring + cluster aggregation
# ===========================================================================
def score_image_document_page(pred_rec: dict, gt_rec: dict,
                              iou_thr: float = DEPLOY_IOU,
                              conf: float = DEPLOY_CONF) -> Tuple[int, int]:
    """Greedy-match document_page preds to GT for ONE image -> ``(tp, n_gt)``.

    Predictions below ``conf`` are dropped first. Returns the number of matched
    ground-truths (true positives) and the total number of ground-truths (the
    recall denominator for this image).
    """
    p_boxes = pred_rec.get("boxes", [])
    p_scores = pred_rec.get("scores", [1.0] * len(p_boxes))
    keep = [i for i, s in enumerate(p_scores) if s >= conf]
    p_boxes_f = [p_boxes[i] for i in keep]
    g_boxes = gt_rec.get("boxes", [])
    if not g_boxes:
        return 0, 0
    res = m.match_detections(p_boxes_f, g_boxes, iou_thr=iou_thr)
    return len(res["tp"]), len(g_boxes)


def cluster_counts_by_group(per_image: Sequence[Tuple[str, int, int]]
                            ) -> List[Tuple[int, int]]:
    """Collapse per-image ``(group_key, tp, n_gt)`` into per-cluster ``(tp, total)``.

    This is the input to :func:`metrics_v2.cluster_bootstrap_recall_ci`: each
    cluster is one ``split_group_key`` (one physical document), so the bootstrap
    resamples whole documents and the CI reflects the true effective N.
    """
    agg: Dict[str, List[int]] = defaultdict(lambda: [0, 0])
    for gkey, tp, total in per_image:
        key = gkey if gkey is not None else "_ungrouped"
        agg[key][0] += int(tp)
        agg[key][1] += int(total)
    return [(tp, total) for tp, total in agg.values()]


def recall_by_tag(per_image: Sequence[Tuple[str, int, int]]) -> Dict[str, dict]:
    """Pool ``(tag, tp, n_gt)`` -> ``{tag: {recall, tp, total, images}}`` (sorted by tag)."""
    agg: Dict[str, List[int]] = defaultdict(lambda: [0, 0, 0])
    for tag, tp, total in per_image:
        key = tag if tag is not None else "unknown"
        agg[key][0] += int(tp)
        agg[key][1] += int(total)
        agg[key][2] += 1
    out: Dict[str, dict] = {}
    for tag in sorted(agg):
        tp, total, imgs = agg[tag]
        out[tag] = {
            "recall": (tp / total) if total else 0.0,
            "tp": tp, "total": total, "images": imgs,
        }
    return out


# ===========================================================================
# Dataset discovery
# ===========================================================================
def _load_manifest(data_dir: str, split: str) -> List[dict]:
    path = os.path.join(data_dir, f"manifest_{split}.json")
    if not os.path.isfile(path):
        return []
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    return data.get("samples", [])


def _list_split_images(data_dir: str, split: str) -> List[str]:
    img_dir = os.path.join(data_dir, "images", split)
    if not os.path.isdir(img_dir):
        return []
    return [os.path.join(img_dir, f) for f in sorted(os.listdir(img_dir))
            if f.lower().endswith(IMAGE_EXTS)]


def _label_path_for(data_dir: str, split: str, stem: str) -> str:
    return os.path.join(data_dir, "labels", split, stem + ".txt")


# ===========================================================================
# Model execution (ultralytics — lazily imported; NOT used in unit tests)
# ===========================================================================
def run_predictions(model_path: str, source_dir: str,
                    conf: float, iou: float, imgsz: int,
                    device: int | str = 0) -> Dict[str, dict]:
    """Run ``YOLO.predict`` over an image DIRECTORY -> ``{image_stem: raw_pred_arrays}``.

    ``raw_pred_arrays`` is ``{"xyxy", "classes", "scores"}`` of plain lists so it
    can be fed straight to :func:`predictions_to_record`. ultralytics is imported
    here (not at module load) so the pure logic stays test-friendly.

    We stream over the DIRECTORY (``stream=True``) rather than passing a Python
    list of paths: a list routes through ultralytics' in-memory loader, which
    (a) reads every high-res frame into RAM at once (OOM on ~3k TIFs) and
    (b) renames frames to ``image0.jpg``/``image1.jpg`` (losing the filename we
    key on). The directory loader reads from disk one frame at a time and
    preserves ``r.path``.
    """
    try:
        from ultralytics import YOLO  # heavy, guarded
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("ultralytics not installed. pip install ultralytics.") from exc

    model = YOLO(model_path)
    preds: Dict[str, dict] = {}
    results = model.predict(source=source_dir, conf=conf, iou=iou, imgsz=imgsz,
                            device=device, stream=True, verbose=False)
    n = 0
    for r in results:
        stem = os.path.splitext(os.path.basename(r.path))[0]
        b = r.boxes
        if b is None:
            preds[stem] = {"xyxy": [], "classes": [], "scores": []}
        else:
            preds[stem] = {
                "xyxy": _to_list(b.xyxy),
                "classes": [int(c) for c in _to_list(b.cls)],
                "scores": [float(s) for s in _to_list(b.conf)],
            }
        n += 1
        if n % 200 == 0:
            print(f"  predicted {n} images", flush=True)
    print(f"  predicted {n} images (done)", flush=True)
    return preds


# ===========================================================================
# Orchestration
# ===========================================================================
def evaluate(model_path: str, data_dir: str, split: str = "test",
             imgsz: int = 640, conf: float = DEPLOY_CONF, iou: float = DEPLOY_IOU,
             device: int | str = 0, num_classes: int = 12,
             n_boot: int = 2000, seed: int = 0,
             recall_floor: float = 0.90, precision_floor: float = 0.50,
             fp_per_image_ceiling: float = 0.5,
             out_dir: Optional[str] = None) -> dict:
    """Run the WIRED real gate end-to-end and return the metrics dict.

    NOTE on class space: this evaluates ``document_page`` (class 0) on the
    docdet-v0 model we currently have, so ``num_classes`` defaults to 12 and the
    page is class 0. When Model 2 (the 10-class primitive detector on rectified
    crops) exists, call with that class space + ``size_mode="relative"``.
    """
    from PIL import Image  # for image sizes (guarded — Pillow is installed)

    manifest = _load_manifest(data_dir, split)
    provenance_index = load_provenance_index(os.path.join(data_dir, "provenance.jsonl"))
    image_index = build_image_index(manifest, provenance_index)
    image_paths = _list_split_images(data_dir, split)
    if not image_paths:
        raise RuntimeError(f"no images found under {os.path.join(data_dir, 'images', split)}")

    # 1) run the model (stream over the directory; see run_predictions docstring)
    img_dir = os.path.join(data_dir, "images", split)
    raw_preds = run_predictions(model_path, img_dir, conf=conf, iou=iou,
                                imgsz=imgsz, device=device)

    images_preds: List[dict] = []
    images_gts: List[dict] = []
    per_image_group: List[Tuple[str, int, int]] = []     # (split_group_key, tp, n_gt)
    per_image_cond: List[Tuple[str, int, int]] = []      # (condition, tp, n_gt)
    per_image_domain: List[Tuple[str, int, int]] = []    # (domain_bucket, tp, n_gt)
    n_missing_key = 0

    for img_path in image_paths:
        stem = os.path.splitext(os.path.basename(img_path))[0]
        with Image.open(img_path) as im:
            img_w, img_h = im.width, im.height

        label_path = _label_path_for(data_dir, split, stem)
        label_text = ""
        if os.path.isfile(label_path):
            with open(label_path, "r", encoding="utf-8") as lf:
                label_text = lf.read()
        gt_rec = read_gt_record(label_text, img_w, img_h, keep_class=DOCUMENT_PAGE_CLASS)

        raw = raw_preds.get(stem, {"xyxy": [], "classes": [], "scores": []})
        pred_rec = predictions_to_record(raw["xyxy"], raw["classes"], raw["scores"],
                                         keep_class=DOCUMENT_PAGE_CLASS, conf=conf)

        images_preds.append(pred_rec)
        images_gts.append(gt_rec)

        tp, n_gt = score_image_document_page(pred_rec, gt_rec, iou_thr=iou, conf=conf)
        meta = image_index.get(stem, {})
        gkey = meta.get("split_group_key")
        if gkey is None:
            n_missing_key += 1
        cond = meta.get("condition") or "unknown"
        domain = meta.get("domain_bucket") or "unknown"
        per_image_group.append((gkey, tp, n_gt))
        per_image_cond.append((cond, tp, n_gt))
        per_image_domain.append((domain, tp, n_gt))

    # 2) per-class precision/recall + FP/page via the docdet-v1 instrument
    det = m.evaluate_detections(images_preds, images_gts, num_classes=num_classes,
                                iou_thr=iou, conf=conf, size_mode="absolute")
    page = det["per_class"].get(DOCUMENT_PAGE_CLASS, {})
    point_recall = page.get("recall", 0.0)

    # 2b) threshold-independent AP (sweeps all confidences, not just one point)
    ap = m.average_precision_per_class(images_preds, images_gts,
                                       num_classes=num_classes, iou_thr=iou)
    page_ap = ap.get(DOCUMENT_PAGE_CLASS, {}).get("ap", 0.0)

    # 3) cluster-correlated CI (THE point) + naive Wilson for contrast
    cluster_counts = cluster_counts_by_group(per_image_group)
    cluster_ci = m.cluster_bootstrap_recall_ci(cluster_counts, n_boot=n_boot, seed=seed)

    total_tp = sum(tp for _, tp, _ in per_image_group)
    total_gt = sum(n for _, _, n in per_image_group)
    wilson_low, wilson_high = m.wilson_interval(total_tp, total_gt)

    cluster_width = cluster_ci["high"] - cluster_ci["low"]
    wilson_width = wilson_high - wilson_low
    width_ratio = (cluster_width / wilson_width) if wilson_width > 0 else float("inf")

    # 4) slices
    recall_conditions = recall_by_tag(per_image_cond)
    # attach human meaning to each condition slice
    for code, rec in recall_conditions.items():
        rec["meaning"] = midv500_condition_meaning(code) if code in MIDV500_CONDITIONS else code
    recall_domains = recall_by_tag(per_image_domain)

    # 5) VERDICT — a gate is not a gate until it renders pass/fail. Judge
    # document_page recall on the cluster-CI LOWER bound + precision + FP/page.
    verdict = m.gate(
        det, recall_floor=recall_floor, precision_floor=precision_floor,
        fp_per_image_ceiling=fp_per_image_ceiling,
        gated_class_ids=[DOCUMENT_PAGE_CLASS], recall_ci=cluster_ci,
        use_ci_lower=True,
    )

    summary = {
        "gate": "REAL GATE (docdet-v1 instruments)",
        "verdictSource": "metrics_v2 (NOT ultralytics val mAP)",
        "model": os.path.abspath(model_path),
        "data": os.path.abspath(data_dir),
        "split": split,
        "imgsz": imgsz,
        "conf": conf,
        "iou": iou,
        "numImages": len(image_paths),
        "imagesMissingSplitGroupKey": n_missing_key,
        "documentPage": {
            "precision": page.get("precision", 0.0),
            "recall": point_recall,
            "tp": page.get("tp", 0),
            "fp": page.get("fp", 0),
            "fn": page.get("fn", 0),
            "totalGT": total_gt,
        },
        "FP_per_image": det["FP_per_image"],
        "recall_point": point_recall,
        "documentPageAP": page_ap,
        "verdict": verdict,
        "gateThresholds": {
            "recall_floor": recall_floor, "precision_floor": precision_floor,
            "fp_per_image_ceiling": fp_per_image_ceiling,
            "recall_judged_on": "cluster_bootstrap_ci.low",
        },
        "cluster_bootstrap_ci": {
            "recall": cluster_ci["recall"],
            "low": cluster_ci["low"],
            "high": cluster_ci["high"],
            "width": cluster_width,
            "n_clusters": cluster_ci["n_clusters"],
            "n_boot": cluster_ci["n_boot"],
            "grouped_by": "split_group_key (canonical document)",
        },
        "naive_wilson_ci": {
            "recall": point_recall,
            "low": wilson_low,
            "high": wilson_high,
            "width": wilson_width,
            "grouped_by": "per-frame (iid assumption — too narrow)",
        },
        "ci_width_ratio_cluster_over_wilson": width_ratio,
        "recall_by_condition": recall_conditions,
        "recall_by_domain_bucket": recall_domains,
        "recall_by_size": det["recall_by_size"],
    }

    if out_dir is None:
        out_dir = os.path.join(data_dir, "eval_v2")
    os.makedirs(out_dir, exist_ok=True)
    out_json = os.path.join(out_dir, "metrics_v2.json")
    with open(out_json, "w", encoding="utf-8") as fh:
        json.dump(summary, fh, indent=2)
    summary["metricsJson"] = out_json
    return summary


def _print_report(summary: dict) -> None:
    line = "=" * 68
    print(line)
    print("REAL GATE (docdet-v1 instruments)")
    print("verdict from metrics_v2 — NOT ultralytics val() mAP")
    print(line)
    print(f"model : {summary['model']}")
    print(f"data  : {summary['data']} (split={summary['split']}, imgsz={summary['imgsz']})")
    print(f"images: {summary['numImages']}  conf={summary['conf']} IoU={summary['iou']}")
    if summary["imagesMissingSplitGroupKey"]:
        print(f"WARN  : {summary['imagesMissingSplitGroupKey']} images had no split_group_key")
    dp = summary["documentPage"]
    print("\ndocument_page (class 0):")
    print(f"  precision = {dp['precision']:.4f}")
    print(f"  recall    = {dp['recall']:.4f}  (tp={dp['tp']} / gt={dp['totalGT']})")
    print(f"  AP@IoU    = {summary.get('documentPageAP', 0.0):.4f}")
    print(f"  FP/page   = {summary['FP_per_image']:.4f}")

    cb = summary["cluster_bootstrap_ci"]
    nw = summary["naive_wilson_ci"]
    print("\nrecall 95% CONFIDENCE INTERVALS:")
    print(f"  cluster bootstrap : [{cb['low']:.4f}, {cb['high']:.4f}]  "
          f"width={cb['width']:.4f}  (n_clusters={cb['n_clusters']}, by split_group_key)")
    print(f"  naive per-frame   : [{nw['low']:.4f}, {nw['high']:.4f}]  "
          f"width={nw['width']:.4f}  (Wilson, iid)")
    ratio = summary["ci_width_ratio_cluster_over_wilson"]
    print(f"  => cluster CI is {ratio:.2f}x WIDER than naive Wilson "
          f"(the honest effective-N correction)")

    print("\nrecall by capture condition:")
    for code, rec in summary["recall_by_condition"].items():
        print(f"  {code:8s} {rec.get('meaning',''):16s} recall={rec['recall']:.4f} "
              f"(tp={rec['tp']}/{rec['total']}, imgs={rec['images']})")
    print("\nrecall by domain bucket:")
    for b, rec in summary["recall_by_domain_bucket"].items():
        print(f"  {b:16s} recall={rec['recall']:.4f} (tp={rec['tp']}/{rec['total']})")
    print("\nrecall by size bucket:")
    for b, rec in summary["recall_by_size"].items():
        print(f"  {b:8s} recall={rec['recall']:.4f} (tp={rec['tp']}/{rec['total']})")
    v = summary.get("verdict", {})
    gt = summary.get("gateThresholds", {})
    print("\nVERDICT (recall judged on cluster-CI lower bound):")
    print(f"  thresholds: recall>={gt.get('recall_floor')}, "
          f"precision>={gt.get('precision_floor')}, FP/page<={gt.get('fp_per_image_ceiling')}")
    print(f"  PASSED = {v.get('passed')}")
    for b in v.get("blockers", []):
        print(f"    - BLOCKER: {b}")
    print(line)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="WIRED real gate (docdet-v1 instruments)")
    p.add_argument("--model", required=True, help="best.pt")
    p.add_argument("--data", required=True, help="normalized real dataset dir")
    p.add_argument("--split", default="test", choices=["train", "val", "test"])
    p.add_argument("--imgsz", type=int, default=640)
    p.add_argument("--conf", type=float, default=DEPLOY_CONF)
    p.add_argument("--iou", type=float, default=DEPLOY_IOU)
    p.add_argument("--device", default="0")
    p.add_argument("--n-boot", type=int, default=2000)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--recall-floor", type=float, default=0.90,
                   help="document_page recall floor (judged on cluster-CI lower bound)")
    p.add_argument("--precision-floor", type=float, default=0.50,
                   help="document_page precision floor (closes the box-spraying loophole)")
    p.add_argument("--fp-ceiling", type=float, default=0.5,
                   help="max false-positives per page")
    p.add_argument("--out", default=None, help="output dir (default: <data>/eval_v2)")
    args = p.parse_args(argv)

    device: int | str
    try:
        device = int(args.device)
    except ValueError:
        device = args.device

    summary = evaluate(args.model, args.data, split=args.split, imgsz=args.imgsz,
                       conf=args.conf, iou=args.iou, device=device,
                       n_boot=max(1, args.n_boot), seed=args.seed,
                       recall_floor=args.recall_floor,
                       precision_floor=args.precision_floor,
                       fp_per_image_ceiling=args.fp_ceiling, out_dir=args.out)
    _print_report(summary)
    return 0 if summary.get("verdict", {}).get("passed") else 1


if __name__ == "__main__":
    raise SystemExit(main())
