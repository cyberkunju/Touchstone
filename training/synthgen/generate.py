"""
synthgen CLI — generate an auto-labelled YOLO detection dataset.

Usage (from training/):
    python -m synthgen.generate --out datasets/docdet_v0 --count 2000
    python -m synthgen.generate --out datasets/docdet_v0_hard --count 500 \
        --force-split test --augment 1.0 --intensity 1.0

Determinism: every sample's content + augmentation is seeded from (base_seed +
index), so a run is fully reproducible. Splits are assigned by hashing the seed,
so no rendered image can appear in two splits.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import multiprocessing as mp
import os
import random
import sys
import time

from . import augment as aug
from . import categories as cats
from . import labels as lbl
from .compose import BackgroundBank, compose_sample
from .config import CLASS_VERSION


def _parse_weights(spec: str | None) -> dict[str, float]:
    if not spec:
        return dict(cats.DEFAULT_WEIGHTS)
    out: dict[str, float] = {}
    for part in spec.split(","):
        name, _, val = part.partition("=")
        name = name.strip()
        if name in cats.REGISTRY:
            out[name] = float(val)
    return out or dict(cats.DEFAULT_WEIGHTS)


def _weighted_pick(rng: random.Random, weights: dict[str, float]) -> str:
    names = list(weights.keys())
    cum = list(weights.values())
    return rng.choices(names, weights=cum, k=1)[0]


def _split_for_seed(seed: int, val: float, test: float, forced: str | None) -> str:
    if forced:
        return forced
    bucket = int(hashlib.sha1(str(seed).encode()).hexdigest(), 16) % 1000 / 1000.0
    if bucket < test:
        return "test"
    if bucket < test + val:
        return "val"
    return "train"


def _ensure_dirs(root: str) -> None:
    for sub in ("images/train", "images/val", "images/test",
                "labels/train", "labels/val", "labels/test", "manifests"):
        os.makedirs(os.path.join(root, sub), exist_ok=True)


# --- worker (module-level so it is picklable for multiprocessing) ------------

_CFG: dict = {}
_BANK: dict = {}  # per-worker cache: {"bank": BackgroundBank | None}


def _init_worker(cfg: dict) -> None:
    """Pool initializer: stash the run config in each worker process."""
    # Pin OpenCV (and BLAS) to a SINGLE thread per worker. Each of the N worker
    # processes otherwise lets OpenCV/OpenBLAS spawn one thread PER CORE, so N
    # procs x C cores = N*C threads thrash a C-core box (load average explodes
    # to >500 on 32 cores, ~3x slower from context-switching). One compute
    # thread per process => clean 1:1 mapping of workers to cores = full,
    # efficient utilisation.
    try:
        import cv2
        cv2.setNumThreads(1)
    except Exception:  # noqa: BLE001 - never let a tuning call break generation
        pass
    _CFG.clear()
    _CFG.update(cfg)
    # Build the background bank ONCE per worker (scans the dir once), not per
    # sample. None when compositing is off or the bank dir is empty/missing.
    _BANK.clear()
    bank = None
    bg_dir = cfg.get("bg_dir")
    if cfg.get("compose") and bg_dir:
        bank = BackgroundBank(bg_dir)
    _BANK["bank"] = bank


def _generate_one(index: int) -> tuple[str, str] | None:
    """Render, augment, label and persist a single sample.

    Returns (split, category) on success, or None if the sample was degenerate
    (a POSITIVE sample that warped fully out of frame). NEGATIVE/decoy samples
    (`sample.allow_empty`) are written with an EMPTY label file and counted —
    they are intentional hard negatives, not degenerate. Fully deterministic for
    a given index.
    """
    cfg = _CFG
    seed = cfg["seed"] + index
    rng = random.Random(seed)
    category = _weighted_pick(rng, cfg["weights"])
    sample = cats.REGISTRY[category](rng, seed)

    # Engine A: composite the rendered document onto a real background scene
    # (doc becomes a sub-region: scaled, rotated, perspective-warped, possibly
    # partially clipped). Done BEFORE degradation so the capture-degradation
    # graph then acts on the whole scene. NEGATIVES/decoys (allow_empty) are NOT
    # composited — compose_sample adds a document_page, which would turn a hard
    # negative into a mislabeled positive and destroy the negative curriculum.
    bank = _BANK.get("bank")
    composited = False
    if (cfg.get("compose") and bank is not None and bank.available
            and not sample.allow_empty):
        if rng.random() < cfg.get("compose_prob", 1.0):
            sample = compose_sample(sample, bank, rng)
            composited = True

    if rng.random() < cfg["augment"]:
        aug.augment(sample, rng, intensity=cfg["intensity"])

    split = _split_for_seed(seed, cfg["val"], cfg["test"], cfg["force_split"])
    boxes = lbl.sample_to_yolo(sample)
    if not boxes and not sample.allow_empty:
        # A positive sample with no usable boxes (e.g. fully warped out of
        # frame) is degenerate -> skip.
        return None

    # Page/child consistency: a composited scene must never carry document
    # primitives WITHOUT a document_page box (that would teach "primitives exist
    # but there is no page here", fighting document_page recall). If the page was
    # clipped away while children survived, drop the whole sample.
    if composited and boxes and not any(b.class_id == 0 for b in boxes):
        return None

    root = cfg["root"]
    sample_id = f"syn_{category}_{seed:08d}"
    sample.image.convert("RGB").save(
        os.path.join(root, "images", split, sample_id + ".jpg"), format="JPEG", quality=92)
    # Negative samples get a deliberately empty .txt (YOLO treats it as a
    # background image with no objects).
    lbl.write_label_file(os.path.join(root, "labels", split, sample_id + ".txt"), boxes)

    man = lbl.sample_manifest(sample, sample_id, boxes)
    man["split"] = split
    man["negative"] = bool(sample.allow_empty and not boxes)
    with open(os.path.join(root, "manifests", sample_id + ".json"), "w", encoding="utf-8") as fh:
        json.dump(man, fh, indent=2)
    return split, category


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Synthetic document detection dataset generator")
    p.add_argument("--out", required=True, help="output dataset root")
    p.add_argument("--count", type=int, default=500, help="number of samples")
    p.add_argument("--seed", type=int, default=1000, help="base seed")
    p.add_argument("--val", type=float, default=0.15, help="val fraction")
    p.add_argument("--test", type=float, default=0.15, help="test fraction")
    p.add_argument("--augment", type=float, default=0.75,
                   help="fraction of samples that receive capture-degradation")
    p.add_argument("--intensity", type=float, default=0.7,
                   help="augmentation intensity in [0,1]")
    p.add_argument("--force-split", choices=["train", "val", "test"], default=None,
                   help="put ALL samples in one split (for locked hard/holdout sets)")
    p.add_argument("--weights", default=None,
                   help="category weights, e.g. 'passport=0.3,invoice=0.2,form=0.5'")
    p.add_argument("--categories", default=None,
                   help="comma list to restrict categories")
    p.add_argument("--compose", action="store_true",
                   help="Engine A: composite documents onto real backgrounds (Phase 2)")
    p.add_argument("--bg-dir", default="assets/backgrounds",
                   help="real-background bank dir (scanned recursively) for --compose")
    p.add_argument("--compose-prob", type=float, default=0.20,
                   help="fraction of samples composited onto a real background. "
                        "DEFAULT 0.20 (surgical): the Phase-2 pilot showed heavy "
                        "compositing (0.9) HURT real document_page recall (0.685 vs "
                        "0.822 full-frame control) because frame-filling docs dominate "
                        "the real distribution; a small composited minority adds "
                        "partial/scene robustness (the worst real slice) WITHOUT "
                        "shifting the bulk away from full-frame. Raise only with evidence.")
    p.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 1),
                   help="parallel worker processes (default: CPU count - 1)")
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    weights = _parse_weights(args.weights)
    if args.categories:
        keep = {c.strip() for c in args.categories.split(",")}
        weights = {k: v for k, v in weights.items() if k in keep} or weights

    root = os.path.abspath(args.out)
    _ensure_dirs(root)
    lbl.write_dataset_yaml(os.path.join(root, "dataset.yaml"), root)

    # Fail fast: --compose with an empty/missing background bank would silently
    # fall back to full-frame v0-style data (useless for the Phase-2 lever).
    if args.compose:
        probe = BackgroundBank(os.path.abspath(args.bg_dir))
        if not probe.available:
            raise SystemExit(
                f"--compose requested but no background images found under "
                f"{os.path.abspath(args.bg_dir)!r}. Fetch them first "
                f"(python fetch_datasets.py --only coco_val2017) or pass --bg-dir.")
        print(f"[compose] background bank: {len(probe)} images @ {args.bg_dir}",
              file=sys.stderr)

    run_manifest = {
        "classVersion": CLASS_VERSION,
        "baseSeed": args.seed,
        "count": args.count,
        "weights": weights,
        "augment": args.augment,
        "intensity": args.intensity,
        "forcedSplit": args.force_split,
        "workers": args.workers,
        "compose": args.compose,
        "bgDir": os.path.abspath(args.bg_dir) if args.compose else None,
        "composeProb": args.compose_prob,
        "createdAt": int(time.time()),
        "splits": {"train": 0, "val": 0, "test": 0},
        "categoryCounts": {},
    }

    cfg = {
        "root": root, "seed": args.seed, "weights": weights,
        "val": args.val, "test": args.test, "force_split": args.force_split,
        "augment": args.augment, "intensity": args.intensity,
        "compose": args.compose,
        "bg_dir": os.path.abspath(args.bg_dir) if args.compose else None,
        "compose_prob": args.compose_prob,
    }

    def _tally(result: tuple[str, str] | None) -> None:
        if result is None:
            return
        split, category = result
        run_manifest["splits"][split] += 1
        run_manifest["categoryCounts"][category] = run_manifest["categoryCounts"].get(category, 0) + 1

    t0 = time.time()
    done = 0
    if args.workers <= 1:
        _init_worker(cfg)
        for i in range(args.count):
            _tally(_generate_one(i))
            done += 1
            if not args.quiet and done % 100 == 0:
                rate = done / (time.time() - t0)
                print(f"  {done}/{args.count}  ({rate:.1f}/s)", file=sys.stderr)
    else:
        with mp.Pool(processes=args.workers, initializer=_init_worker, initargs=(cfg,)) as pool:
            for result in pool.imap_unordered(_generate_one, range(args.count), chunksize=16):
                _tally(result)
                done += 1
                if not args.quiet and done % 100 == 0:
                    rate = done / (time.time() - t0)
                    print(f"  {done}/{args.count}  ({rate:.1f}/s)", file=sys.stderr)

    with open(os.path.join(root, "run_manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(run_manifest, fh, indent=2)

    if not args.quiet:
        dt = time.time() - t0
        kept = sum(run_manifest["splits"].values())
        print(f"Done: {kept}/{args.count} samples in {dt:.1f}s -> {root}", file=sys.stderr)
        print(f"  splits={run_manifest['splits']}  categories={run_manifest['categoryCounts']}",
              file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
