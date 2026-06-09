"""
Dataset QA — validate a generated YOLO detection dataset before training.

Checks (fails loudly on anything that would silently corrupt training):
  * image/label pairing per split (every image has a label file and vice versa)
  * label syntax: 5 floats/line, class id in [0, nc), coords in [0,1], w/h>0
  * negatives: empty label files are allowed ONLY (counted as background)
  * page consistency: any file with a primitive (class>0) MUST also have a
    document_page (class 0) box — else it teaches "primitives but no page"
  * document_page scale distribution -> estimates full-frame vs composited mix
  * class histogram + boxes/image stats

Usage:
    python -m benchmarks.qa_dataset --data datasets/docdet_v1
Exit code 0 = clean, 1 = problems found.
"""
from __future__ import annotations

import argparse
import os
import sys
from collections import Counter


def _load_classes(data_root: str) -> tuple[int, list[str]]:
    import yaml
    yml = os.path.join(data_root, "dataset.yaml")
    with open(yml, encoding="utf-8") as fh:
        d = yaml.safe_load(fh)
    names = d.get("names")
    if isinstance(names, dict):
        names = [names[k] for k in sorted(names)]
    return len(names), list(names)


def qa(data_root: str) -> int:
    nc, names = _load_classes(data_root)
    print(f"dataset: {data_root}\nclasses ({nc}): {names}\n")

    problems: list[str] = []
    cls_hist = Counter()
    boxes_per_img = []
    page_w = []
    page_h = []
    n_neg = 0
    n_pos = 0
    totals = {}

    for split in ("train", "val", "test"):
        img_dir = os.path.join(data_root, "images", split)
        lbl_dir = os.path.join(data_root, "labels", split)
        if not os.path.isdir(img_dir):
            continue
        imgs = {os.path.splitext(f)[0] for f in os.listdir(img_dir)}
        lbls = {os.path.splitext(f)[0] for f in os.listdir(lbl_dir)} if os.path.isdir(lbl_dir) else set()
        totals[split] = len(imgs)
        miss_lbl = imgs - lbls
        miss_img = lbls - imgs
        if miss_lbl:
            problems.append(f"[{split}] {len(miss_lbl)} images with NO label file (e.g. {list(miss_lbl)[:2]})")
        if miss_img:
            problems.append(f"[{split}] {len(miss_img)} labels with NO image (e.g. {list(miss_img)[:2]})")

        for stem in imgs & lbls:
            lp = os.path.join(lbl_dir, stem + ".txt")
            with open(lp, encoding="utf-8") as fh:
                lines = [ln.strip() for ln in fh if ln.strip()]
            if not lines:
                n_neg += 1
                boxes_per_img.append(0)
                continue
            n_pos += 1
            has_page = False
            ids_here = []
            for ln in lines:
                parts = ln.split()
                if len(parts) != 5:
                    problems.append(f"[{split}] {stem}: bad line '{ln}' (!=5 fields)")
                    continue
                cid = int(float(parts[0]))
                cx, cy, w, h = map(float, parts[1:])
                ids_here.append(cid)
                cls_hist[cid] += 1
                if not (0 <= cid < nc):
                    problems.append(f"[{split}] {stem}: class id {cid} out of range [0,{nc})")
                for v, nm in ((cx, "cx"), (cy, "cy"), (w, "w"), (h, "h")):
                    if not (0.0 <= v <= 1.0):
                        problems.append(f"[{split}] {stem}: {nm}={v} out of [0,1]")
                if w <= 0 or h <= 0:
                    problems.append(f"[{split}] {stem}: non-positive box w={w} h={h}")
                if cid == 0:
                    has_page = True
                    page_w.append(w); page_h.append(h)
            boxes_per_img.append(len(lines))
            # page consistency: primitive present but no page box
            if any(c > 0 for c in ids_here) and not has_page:
                problems.append(f"[{split}] {stem}: has primitives {sorted(set(ids_here))} but NO document_page")

    print(f"splits: {totals}  (positives={n_pos}, negatives/empty={n_neg})")
    if boxes_per_img:
        bpi = [b for b in boxes_per_img if b > 0]
        print(f"boxes/positive-image: min={min(bpi)} max={max(bpi)} mean={sum(bpi)/len(bpi):.1f}")
    print("\nclass histogram (class_id: count):")
    for cid in range(nc):
        nm = names[cid] if cid < len(names) else "?"
        print(f"  {cid:2d} {nm:16s} {cls_hist.get(cid,0)}")

    # full-frame vs composited estimate from document_page area
    if page_w:
        areas = [w * h for w, h in zip(page_w, page_h)]
        full = sum(1 for a in areas if a >= 0.90)
        sub = sum(1 for a in areas if a < 0.90)
        print(f"\ndocument_page boxes: {len(areas)}")
        print(f"  full-frame (area>=0.90): {full}  ({100*full/len(areas):.1f}%)")
        print(f"  sub-region (composited, area<0.90): {sub}  ({100*sub/len(areas):.1f}%)")
        print(f"  page-area mean={sum(areas)/len(areas):.3f} min={min(areas):.3f}")

    print()
    if problems:
        print(f"FAIL: {len(problems)} problem(s):")
        for p in problems[:40]:
            print("  - " + p)
        if len(problems) > 40:
            print(f"  ... and {len(problems)-40} more")
        return 1
    print("QA PASSED: pairing, label syntax, ranges, and page-consistency all clean.")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="QA a generated YOLO dataset")
    ap.add_argument("--data", required=True, help="dataset root")
    args = ap.parse_args(argv)
    return qa(os.path.abspath(args.data))


if __name__ == "__main__":
    raise SystemExit(main())
