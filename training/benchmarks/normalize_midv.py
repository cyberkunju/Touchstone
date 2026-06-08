"""
Normalize MIDV (ID/passport documents in the wild) -> YOLO detection labels in
the docdet-v0 12-class scheme.

We derive:
  - document_page(0): the axis-aligned bounding box (AABB) of the document QUAD.
  - photo(1) / mrz_zone(8): from per-field region annotations, IF the dataset
    provides them, via class_map.map_midv_field().

MIDV LAYOUT DIFFERENCES (both documented; MIDV-2020 implemented, MIDV-500 stub):

  MIDV-2020 (templates/ + ... ; ground_truth as JSON):
    Per image there is a JSON object describing the document quad and a set of
    named fields. This loader expects a ground-truth json shaped roughly like:
        {
          "quad": [[x,y],[x,y],[x,y],[x,y]],         # doc corners (px)
          # optional alternative key name handled: "document_quad"
          "fields": {                                  # OR a list, both handled
             "photo":   {"quad": [[x,y]...]},          # region as quad
             "mrz":     {"quad": [[x,y]...]},
             "surname": {"quad": [[x,y]...]},          # -> dropped (no docdet class)
             ...
          }
        }
    Real MIDV-2020 distributes annotations across several json families
    (templates, annotations, ground_truth). Field naming and nesting differ per
    release, so this loader is intentionally tolerant: it accepts quad OR bbox
    for regions, fields as dict OR list, and several key aliases.

  MIDV-500 (data/<doc>/ground_truth/<frame>.json):
    Per-frame json with a single "quad" list of 4 [x,y] points for the document
    only (NO field regions in the base release). So MIDV-500 yields
    document_page(0) ONLY. That path is implemented (quad -> AABB) but field
    extraction is a clear STUB because the base release has no field quads.

Image sizes are read from the image file via Pillow (guarded import) since MIDV
jsons don't reliably carry width/height.

CLI:
    python normalize_midv.py --midv-root MIDV-2020/ --out benchmarks/real/midv2020 \
        --layout midv2020 --split test
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys

try:
    from .class_map import DOCDET_NAMES, MIDV_DOC_QUAD_CLASS, map_midv_field
except ImportError:  # pragma: no cover - script-mode fallback
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from class_map import DOCDET_NAMES, MIDV_DOC_QUAD_CLASS, map_midv_field  # type: ignore

# Provenance + leakage-key utilities (training/ontology). Adding the training
# root to sys.path mirrors the script-mode fallback convention used elsewhere.
try:
    from ontology.provenance import (
        AnnotationProvenance,
        ImageProvenance,
        compute_split_group_key,
        perceptual_hash,
        to_record,
    )
except ImportError:  # pragma: no cover - script-mode fallback
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from ontology.provenance import (  # type: ignore
        AnnotationProvenance,
        ImageProvenance,
        compute_split_group_key,
        perceptual_hash,
        to_record,
    )

IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp")


# ---------------------------------------------------------------------------
# MIDV-500 capture conditions -> human meaning + provenance domain_bucket.
# The 2-letter code prefixes every MIDV-500 frame dir / frame name (e.g. the
# frames CA01_01.tif live under .../images/CA/). Mapping per master plan §9:
#   table-ish (flat surfaces): TA/TS/KA/KS -> phone_table
#   held in hand:              HA/HS       -> phone_handheld
#   cluttered / clipped:       CA/CS/PA/PS -> phone_clutter
# ---------------------------------------------------------------------------
MIDV500_CONDITIONS: dict[str, tuple[str, str]] = {
    "TA": ("table", "phone_table"),
    "TS": ("table", "phone_table"),
    "KA": ("keyboard", "phone_table"),
    "KS": ("keyboard", "phone_table"),
    "HA": ("hand", "phone_handheld"),
    "HS": ("hand", "phone_handheld"),
    "CA": ("clutter", "phone_clutter"),
    "CS": ("clutter", "phone_clutter"),
    "PA": ("partial(clipped)", "phone_clutter"),
    "PS": ("partial(clipped)", "phone_clutter"),
}


def midv500_condition_meaning(cond: str) -> str:
    """Human-readable meaning for a MIDV-500 condition code (e.g. 'CA' -> 'clutter')."""
    return MIDV500_CONDITIONS.get((cond or "").upper(), ("unknown", "phone_clutter"))[0]


def midv500_domain_bucket(cond: str) -> str:
    """Provenance ``domain_bucket`` for a MIDV-500 condition code.

    Falls back to ``phone_clutter`` (the most conservative / hardest bucket) for
    an unrecognized code rather than emitting an invalid enum value.
    """
    return MIDV500_CONDITIONS.get((cond or "").upper(), ("unknown", "phone_clutter"))[1]


def _midv500_provenance_record(out_base: str, doc: str, cond: str,
                               img_path: str) -> dict:
    """Build ONE validated provenance record for a MIDV-500 frame.

    The canonical document is the doc FOLDER (e.g. ``01_alb_id``): every frame
    of one physical document shares ``split_group_key`` so they can never leak
    across train/val/test. domain_bucket is derived from the capture condition,
    license is research-only, the geometry label is a real human-drawn quad
    (label_origin=human) on a real capture (generation_engine=real).
    """
    domain = midv500_domain_bucket(cond)
    img = ImageProvenance(
        image_id=out_base,
        capture_session_id=f"{doc}/{cond}",
        perceptual_hash=perceptual_hash(img_path),
        source_dataset="midv500",
        domain_bucket=domain,
        license_bucket="research_only",
        split_group_key=compute_split_group_key(canonical_document_id=doc),
    )
    ann = AnnotationProvenance(
        ann_id=f"{out_base}#0",
        image_id=out_base,
        label_origin="human",
        generation_engine="real",
        license_bucket="research_only",
        domain_bucket=domain,
    )
    return to_record(img, [ann])


def _license_for(layout: str) -> str:
    # Both MIDV releases are research-use; not a standard SPDX license.
    return "MIDV research-use (Smart Engines / L3i) — see README"


def _image_size(img_path: str) -> tuple:
    """Read (width, height) via Pillow (guarded import)."""
    try:
        from PIL import Image  # noqa: WPS433
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError(
            "Pillow is required to read MIDV image sizes. pip install Pillow."
        ) from exc
    with Image.open(img_path) as im:
        return im.width, im.height


def _quad_to_aabb(quad):
    """List of [x,y] points -> (xmin,ymin,xmax,ymax). None if invalid."""
    if not quad:
        return None
    xs, ys = [], []
    for pt in quad:
        if isinstance(pt, (list, tuple)) and len(pt) >= 2:
            xs.append(float(pt[0]))
            ys.append(float(pt[1]))
    if len(xs) < 2:
        return None
    return min(xs), min(ys), max(xs), max(ys)


def _region_to_aabb(region):
    """A field region given as {'quad':[...]} or {'bbox':[x,y,w,h]} -> AABB."""
    if not isinstance(region, dict):
        return None
    if region.get("quad"):
        return _quad_to_aabb(region["quad"])
    if region.get("bbox"):
        x, y, w, h = region["bbox"]
        return float(x), float(y), float(x) + float(w), float(y) + float(h)
    if region.get("points"):
        return _quad_to_aabb(region["points"])
    return None


def _aabb_to_yolo(aabb, img_w: int, img_h: int):
    """(xmin,ymin,xmax,ymax) px -> clipped normalized (xc,yc,w,h). None if empty."""
    x1, y1, x2, y2 = aabb
    x1 = max(0.0, min(float(img_w), x1))
    y1 = max(0.0, min(float(img_h), y1))
    x2 = max(0.0, min(float(img_w), x2))
    y2 = max(0.0, min(float(img_h), y2))
    if x2 <= x1 or y2 <= y1:
        return None
    xc = (x1 + x2) / 2.0 / img_w
    yc = (y1 + y2) / 2.0 / img_h
    nw = (x2 - x1) / img_w
    nh = (y2 - y1) / img_h
    if nw <= 0.0 or nh <= 0.0:
        return None
    return (min(1.0, max(0.0, xc)), min(1.0, max(0.0, yc)),
            min(1.0, max(0.0, nw)), min(1.0, max(0.0, nh)))


def _iter_fields(gt: dict):
    """Yield (field_name, region_dict) tolerating dict-of-fields or list-of-fields."""
    fields = gt.get("fields")
    if isinstance(fields, dict):
        for name, region in fields.items():
            yield name, region
    elif isinstance(fields, list):
        for item in fields:
            if isinstance(item, dict):
                name = item.get("name") or item.get("type") or item.get("key") or ""
                # region may be the item itself (has quad/bbox) or a nested key.
                region = item.get("region") if isinstance(item.get("region"), dict) else item
                yield name, region


def _doc_quad(gt: dict):
    """Extract the document quad under several possible key aliases."""
    for key in ("quad", "document_quad", "doc_quad", "documentQuad"):
        if gt.get(key):
            return gt[key]
    # Some MIDV-2020 jsons nest the doc under 'document': {'quad': [...]}.
    doc = gt.get("document")
    if isinstance(doc, dict) and doc.get("quad"):
        return doc["quad"]
    return None


def _find_image_for_json(json_path: str, midv_root: str):
    """Best-effort: find the image that pairs with a ground-truth json.

    Tries (a) same basename with an image extension in the same dir, then
    (b) a sibling 'images' dir, then (c) a recursive basename search.
    """
    base = os.path.splitext(os.path.basename(json_path))[0]
    json_dir = os.path.dirname(json_path)
    # (a) same dir
    for ext in IMAGE_EXTS:
        cand = os.path.join(json_dir, base + ext)
        if os.path.isfile(cand):
            return cand
    # (b) sibling images dir (…/ground_truth/x.json -> …/images/x.jpg)
    parent = os.path.dirname(json_dir)
    for sib in ("images", "image", "img"):
        for ext in IMAGE_EXTS:
            cand = os.path.join(parent, sib, base + ext)
            if os.path.isfile(cand):
                return cand
    # (c) recursive search (last resort, capped implicitly by tree size)
    for root, _dirs, files in os.walk(midv_root):
        for f in files:
            if os.path.splitext(f)[0] == base and f.lower().endswith(IMAGE_EXTS):
                return os.path.join(root, f)
    return None


def _write_dataset_yaml(out_root: str, split: str = "test",
                        split_dirs: dict | None = None) -> None:
    names_block = "\n".join(f"  {i}: {n}" for i, n in enumerate(DOCDET_NAMES))
    # If a real leakage-free split has been produced (split_dirs given), point
    # train/val/test at their OWN dirs. Otherwise only ONE split dir is populated;
    # we point all three at it AND emit a loud warning banner so nobody trains on
    # a single-split (train==val==test) dataset and silently leaks 100%.
    if split_dirs:
        train_d = split_dirs.get("train", f"images/{split}")
        val_d = split_dirs.get("val", f"images/{split}")
        test_d = split_dirs.get("test", f"images/{split}")
        banner = "# Leakage-free split produced by leakage_split.assign_splits.\n"
    else:
        train_d = val_d = test_d = f"images/{split}"
        banner = (
            "# WARNING: single-split dataset (train==val==test all point at the\n"
            "# same dir). This is EVAL-ONLY. Do NOT train on this yaml — it leaks\n"
            "# 100%. Produce a leakage-free split with leakage_split.assign_splits\n"
            "# (grouped by split_group_key) before any training use.\n"
        )
    content = (
        "# Auto-generated by normalize_midv.py — docdet-v0 12-class scheme.\n"
        "# REAL benchmark set (MIDV).\n"
        + banner +
        f"path: {os.path.abspath(out_root)}\n"
        f"train: {train_d}\n"
        f"val: {val_d}\n"
        f"test: {test_d}\n"
        f"nc: {len(DOCDET_NAMES)}\n"
        "names:\n"
        f"{names_block}\n"
    )
    with open(os.path.join(out_root, "dataset.yaml"), "w", encoding="utf-8") as fh:
        fh.write(content)


def normalize_midv2020(midv_root: str, out_root: str, split: str,
                       copy_images: bool = True) -> dict:
    """Convert a MIDV-2020-style tree of ground-truth jsons to YOLO labels."""
    img_out = os.path.join(out_root, "images", split)
    lbl_out = os.path.join(out_root, "labels", split)
    os.makedirs(img_out, exist_ok=True)
    os.makedirs(lbl_out, exist_ok=True)

    manifest = []
    n_imgs = n_boxes = n_doc = n_field = n_skip = 0
    lic = _license_for("midv2020")
    provenance_records = []

    for root, _dirs, files in os.walk(midv_root):
        for f in files:
            if not f.lower().endswith(".json"):
                continue
            json_path = os.path.join(root, f)
            try:
                with open(json_path, "r", encoding="utf-8") as fh:
                    gt = json.load(fh)
            except (json.JSONDecodeError, OSError):
                continue
            if not isinstance(gt, dict):
                continue
            quad = _doc_quad(gt)
            if not quad:
                continue  # not a doc-annotation json
            img_path = _find_image_for_json(json_path, midv_root)
            if img_path is None:
                n_skip += 1
                continue
            try:
                img_w, img_h = _image_size(img_path)
            except RuntimeError:
                raise
            except Exception:  # noqa: BLE001 - unreadable image, skip
                n_skip += 1
                continue

            lines = []
            doc_aabb = _quad_to_aabb(quad)
            if doc_aabb:
                yolo = _aabb_to_yolo(doc_aabb, img_w, img_h)
                if yolo:
                    lines.append(f"{MIDV_DOC_QUAD_CLASS} " + " ".join(f"{v:.6f}" for v in yolo))
                    n_doc += 1
            for fname, region in _iter_fields(gt):
                cid = map_midv_field(fname)
                if cid is None:
                    continue
                aabb = _region_to_aabb(region)
                if not aabb:
                    continue
                yolo = _aabb_to_yolo(aabb, img_w, img_h)
                if yolo:
                    lines.append(f"{cid} " + " ".join(f"{v:.6f}" for v in yolo))
                    n_field += 1

            if not lines:
                n_skip += 1
                continue

            base = os.path.splitext(os.path.basename(img_path))[0]
            with open(os.path.join(lbl_out, base + ".txt"), "w", encoding="utf-8") as fh:
                fh.write("\n".join(lines))
            if copy_images:
                shutil.copyfile(img_path, os.path.join(img_out, os.path.basename(img_path)))
            n_imgs += 1
            n_boxes += len(lines)
            # Leakage key: group by the image's source DIRECTORY (one clip/scan
            # folder == one logical document), so frames never leak across splits.
            rel_dir = os.path.dirname(os.path.relpath(img_path, midv_root)) or "midv2020"
            sgk = compute_split_group_key(canonical_document_id=rel_dir)
            manifest.append({
                "image": os.path.basename(img_path),
                "sourceImage": os.path.relpath(img_path, midv_root),
                "sourceType": "midv2020",
                "license": lic,
                "split": split,
                "width": img_w,
                "height": img_h,
                "numBoxes": len(lines),
                "split_group_key": sgk,
                "canonicalDocument": rel_dir,
            })
            try:
                _img = ImageProvenance(
                    image_id=base, capture_session_id=rel_dir,
                    perceptual_hash=perceptual_hash(img_path),
                    source_dataset="midv2020", domain_bucket="phone_handheld",
                    license_bucket="research_only", split_group_key=sgk,
                )
                _ann = AnnotationProvenance(
                    ann_id=f"{base}#0", image_id=base, label_origin="human",
                    generation_engine="real", license_bucket="research_only",
                    domain_bucket="phone_handheld",
                )
                provenance_records.append(to_record(_img, [_ann]))
            except Exception as exc:  # noqa: BLE001 - never fail normalization on provenance
                print(f"WARN: provenance skipped for {base}: {exc}")

    _write_dataset_yaml(out_root, split)
    manifest_path = os.path.join(out_root, f"manifest_{split}.json")
    with open(manifest_path, "w", encoding="utf-8") as fh:
        json.dump({"sourceType": "midv2020", "license": lic, "split": split,
                   "samples": manifest}, fh, indent=2)

    provenance_path = os.path.join(out_root, "provenance.jsonl")
    with open(provenance_path, "w", encoding="utf-8") as fh:
        for rec in provenance_records:
            fh.write(json.dumps(rec) + "\n")

    return {
        "out": os.path.abspath(out_root), "split": split, "layout": "midv2020",
        "images": n_imgs, "boxes": n_boxes, "docBoxes": n_doc,
        "fieldBoxes": n_field, "skipped": n_skip, "manifest": manifest_path,
    }


def _midv500_image_for_json(json_path: str):
    """Deterministically map a MIDV-500 per-frame json to its image.

    Real MIDV-500 layout (verified on the official release):
        <doc>/ground_truth/<COND>/<FRAME>.json
        <doc>/images/<COND>/<FRAME>.tif
    i.e. the image path is the json path with the FIRST 'ground_truth' path
    component replaced by 'images' and the extension swapped to an image ext.
    Avoids the O(tree) recursive search that would be catastrophic on the
    ~15k-image / ~30GB MIDV-500 tree.
    """
    norm = json_path.replace("/", os.sep)
    parts = norm.split(os.sep)
    try:
        gt_idx = next(i for i, p in enumerate(parts) if p.lower() == "ground_truth")
    except StopIteration:
        return None
    parts[gt_idx] = "images"
    base_no_ext = parts[-1]
    base_no_ext = base_no_ext[: base_no_ext.rfind(".")] if "." in base_no_ext else base_no_ext
    img_dir = os.sep.join(parts[:-1])
    for ext in IMAGE_EXTS:
        cand = os.path.join(img_dir, base_no_ext + ext)
        if os.path.isfile(cand):
            return cand
    return None


def normalize_midv500(midv_root: str, out_root: str, split: str,
                      copy_images: bool = True, frame_stride: int = 1) -> dict:
    """MIDV-500: per-frame ground_truth json with a doc quad ONLY.

    Real layout: <doc>/ground_truth/<COND>/<FRAME>.json holds {"quad":[4 pts]}
    for the document only. The per-doc <doc>.json summary holds field/photo/
    signature quads but in FLAT-TEMPLATE coordinates (not mapped to the
    photographed frames), so it is intentionally ignored here.

    Implemented: document_page(0) from the per-frame quad AABB.
    STUB (clearly): no per-frame field regions exist in the base MIDV-500
    release, so photo(1)/mrz_zone(8) are NOT produced. The REAL gate for
    MIDV-500 is therefore document_page detection on phone photos of IDs.

    frame_stride: take every Nth frame within each (doc, condition) dir to build
    a balanced, de-duplicated subset (consecutive video frames are near
    identical). stride=1 keeps all ~15k frames; stride=6 gives ~2.5k images that
    still cover all 50 docs x 10 capture conditions — plenty for a mAP gate and
    far kinder to a hot laptop.
    """
    img_out = os.path.join(out_root, "images", split)
    lbl_out = os.path.join(out_root, "labels", split)
    os.makedirs(img_out, exist_ok=True)
    os.makedirs(lbl_out, exist_ok=True)

    manifest = []
    n_imgs = n_boxes = n_skip = 0
    lic = _license_for("midv500")
    stride = max(1, int(frame_stride))
    provenance_records = []

    for root, _dirs, files in os.walk(midv_root):
        # Per-frame gt lives in <doc>/ground_truth/<COND>/. Require that
        # 'ground_truth' is an ANCESTOR component of this dir (not equality:
        # the frames sit one level deeper, under the capture-condition folder).
        parts = root.replace("/", os.sep).split(os.sep)
        lowered = [p.lower() for p in parts]
        if "ground_truth" not in lowered:
            continue
        # Skip the directory that *is* ground_truth itself (only the per-doc
        # summary json lives there; per-frame jsons are one level deeper).
        if lowered[-1] == "ground_truth":
            continue
        # Deterministic order so frame_stride sampling is reproducible.
        for idx, f in enumerate(sorted(files)):
            if not f.lower().endswith(".json"):
                continue
            if (idx % stride) != 0:
                continue
            json_path = os.path.join(root, f)
            try:
                with open(json_path, "r", encoding="utf-8") as fh:
                    gt = json.load(fh)
            except (json.JSONDecodeError, OSError):
                continue
            quad = gt.get("quad") if isinstance(gt, dict) else None
            if not quad:
                continue
            img_path = _midv500_image_for_json(json_path)
            if img_path is None:
                n_skip += 1
                continue
            try:
                img_w, img_h = _image_size(img_path)
            except RuntimeError:
                raise
            except Exception:  # noqa: BLE001
                n_skip += 1
                continue
            aabb = _quad_to_aabb(quad)
            yolo = _aabb_to_yolo(aabb, img_w, img_h) if aabb else None
            if not yolo:
                n_skip += 1
                continue
            # Unique name: <doc>_<COND>_<FRAME> to avoid collisions across the
            # 500 (doc, condition) dirs that all reuse names like CA01_01.
            gt_pos = lowered.index("ground_truth")
            doc = parts[gt_pos - 1] if gt_pos >= 1 else "doc"
            cond = parts[-1]
            stem = os.path.splitext(os.path.basename(img_path))[0]
            out_base = f"{doc}_{cond}_{stem}"
            with open(os.path.join(lbl_out, out_base + ".txt"), "w", encoding="utf-8") as fh:
                fh.write(f"{MIDV_DOC_QUAD_CLASS} " + " ".join(f"{v:.6f}" for v in yolo))
            if copy_images:
                shutil.copyfile(
                    img_path,
                    os.path.join(img_out, out_base + os.path.splitext(img_path)[1]),
                )
            n_imgs += 1
            n_boxes += 1
            # Leakage key: group by the canonical DOCUMENT folder so every frame
            # of one physical document lands in a single split (never leaks).
            split_group_key = compute_split_group_key(canonical_document_id=doc)
            manifest.append({
                "image": out_base + os.path.splitext(img_path)[1],
                "sourceImage": os.path.relpath(img_path, midv_root),
                "sourceType": "midv500",
                "license": lic, "split": split, "width": img_w, "height": img_h,
                "numBoxes": 1,
                "split_group_key": split_group_key,
                "canonicalDocument": doc,
                "captureCondition": cond,
            })
            # Provenance sidecar record (validated via to_record). Guarded so a
            # single unreadable frame can't abort the whole normalization run.
            try:
                provenance_records.append(
                    _midv500_provenance_record(out_base, doc, cond, img_path)
                )
            except Exception as exc:  # noqa: BLE001 - never fail normalization on provenance
                n_skip += 0  # keep the image; just note the provenance gap
                print(f"WARN: provenance skipped for {out_base}: {exc}")

    _write_dataset_yaml(out_root, split)
    manifest_path = os.path.join(out_root, f"manifest_{split}.json")
    with open(manifest_path, "w", encoding="utf-8") as fh:
        json.dump({"sourceType": "midv500", "license": lic, "split": split,
                   "frameStride": stride, "samples": manifest}, fh, indent=2)

    # Provenance sidecar: one JSON-lines record per image, next to the dataset.
    provenance_path = os.path.join(out_root, "provenance.jsonl")
    with open(provenance_path, "w", encoding="utf-8") as fh:
        for rec in provenance_records:
            fh.write(json.dumps(rec) + "\n")

    return {
        "out": os.path.abspath(out_root), "split": split, "layout": "midv500",
        "images": n_imgs, "boxes": n_boxes, "skipped": n_skip,
        "frameStride": stride,
        "note": "MIDV-500 base release: document_page only (no field regions).",
        "manifest": manifest_path,
        "provenance": provenance_path,
    }


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="MIDV quad/field json -> docdet-v0 YOLO labels")
    p.add_argument("--midv-root", required=True, help="root dir of the MIDV dataset")
    p.add_argument("--out", required=True, help="output dataset root")
    p.add_argument("--layout", default="midv2020", choices=["midv2020", "midv500"],
                   help="annotation layout; midv2020 extracts fields, midv500 is doc-only")
    p.add_argument("--split", default="test", choices=["train", "val", "test"])
    p.add_argument("--frame-stride", type=int, default=1,
                   help="(midv500) keep every Nth frame per condition dir; "
                        "6 gives a balanced ~2.5k-image subset covering all "
                        "docs+conditions (kinder to a hot laptop)")
    p.add_argument("--no-copy-images", action="store_true")
    args = p.parse_args(argv)

    if args.layout == "midv2020":
        stats = normalize_midv2020(args.midv_root, args.out, args.split,
                                   copy_images=not args.no_copy_images)
    else:
        stats = normalize_midv500(args.midv_root, args.out, args.split,
                                  copy_images=not args.no_copy_images,
                                  frame_stride=args.frame_stride)
    print(json.dumps(stats, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
