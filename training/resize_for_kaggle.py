"""One-off: make a lean copy of a YOLO dataset for upload (resize long side <=MAX).

YOLO labels are normalized (fraction of W/H), so downscaling the image leaves the
labels exactly valid. We train at imgsz<=640, so 1024 keeps full headroom while
cutting ~44GB of high-res renders to a few GB. Parallel across all cores.
"""
from __future__ import annotations
import multiprocessing as mp
import os
import shutil
import sys
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else "datasets/docdet_v1"
DST = sys.argv[2] if len(sys.argv) > 2 else "datasets/docdet_v1_k"
MAXSIDE = int(sys.argv[3]) if len(sys.argv) > 3 else 1024


def _process(args):
    split, fn = args
    sp = os.path.join(SRC, "images", split, fn)
    dp = os.path.join(DST, "images", split, fn)
    try:
        with Image.open(sp) as im:
            im = im.convert("RGB")
            w, h = im.size
            m = max(w, h)
            if m > MAXSIDE:
                s = MAXSIDE / float(m)
                im = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
            im.save(dp, "JPEG", quality=88)
        return 1
    except Exception as e:  # noqa: BLE001
        print("ERR", sp, e)
        return 0


def main():
    tasks = []
    for split in ("train", "val", "test"):
        sd = os.path.join(SRC, "images", split)
        if not os.path.isdir(sd):
            continue
        os.makedirs(os.path.join(DST, "images", split), exist_ok=True)
        for fn in os.listdir(sd):
            tasks.append((split, fn))
    print("images to resize:", len(tasks), flush=True)
    with mp.Pool(32) as p:
        n = sum(p.imap_unordered(_process, tasks, chunksize=64))
    print("resized:", n, flush=True)
    # labels (small) + yaml copied as-is; labels are resolution-independent.
    if os.path.isdir(os.path.join(SRC, "labels")):
        shutil.copytree(os.path.join(SRC, "labels"), os.path.join(DST, "labels"), dirs_exist_ok=True)
    if os.path.isfile(os.path.join(SRC, "dataset.yaml")):
        shutil.copyfile(os.path.join(SRC, "dataset.yaml"), os.path.join(DST, "dataset.yaml"))
    print("labels+yaml copied -> ", DST, flush=True)


if __name__ == "__main__":
    main()
