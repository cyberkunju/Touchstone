"""
Modal app for REAL-dataset benchmarking of the docdet detector.

Separate app ("docdet-bench") from the trainer, but it REUSES the SAME named
Volume "docdet-data" so it can read models the trainer wrote
(runs/docdet_<mode>/weights/best.pt) and persist normalized real datasets +
metrics alongside them.

Pipeline (none of it runs automatically — this file only DEFINES the jobs):
    1. download_dataset : fetch a public dataset into the Volume.
    2. normalize        : run the matching normalizer in-container -> YOLO labels.
    3. eval             : run eval_real against a model already in the Volume.
    4. bench            : convenience orchestrator (normalize -> eval).

WINDOWS / UTF-8 NOTE:
    The Modal CLI on Windows can crash with a charmap UnicodeEncodeError when a
    job prints non-ASCII. ALWAYS force UTF-8 before `modal run`:
        $env:PYTHONUTF8=1; $env:PYTHONIOENCODING="utf-8"

Example (after `modal token set ...`, from training/):
    # 1) download DocLayNet core (small COCO subset) into the Volume:
    modal run benchmarks/modal_bench.py::download --dataset doclaynet
    # 2) normalize the val split to docdet-v0 YOLO labels:
    modal run benchmarks/modal_bench.py::run_normalize --dataset doclaynet --split val
    # 3) evaluate the trained 'small' model on it (gate of record):
    modal run benchmarks/modal_bench.py::run_eval --dataset doclaynet --run small --split val
    # or do normalize+eval in one shot:
    modal run benchmarks/modal_bench.py::run_bench --dataset doclaynet --run small --split val
"""
from __future__ import annotations

import modal

# Pinned deps — mirror the trainer image so model loading/val behaves identically.
image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("libgl1", "libglib2.0-0", "libgomp1", "wget", "unzip")
    .pip_install(
        "ultralytics==8.4.60",
        "opencv-python-headless>=4.9.0",
        "Pillow>=10.2.0",
        "numpy>=1.26.0",
        "PyYAML>=6.0.1",
        "datasets>=2.19.0",      # for HF-hosted datasets (DocLayNet mirror, etc.)
        "huggingface-hub>=0.23.0",
        "requests>=2.31.0",
    )
    # Ship the benchmark package (class_map + normalizers + eval_real) into the
    # image so the normalizers/eval run in-container without local data upload.
    .add_local_python_source("benchmarks")
)

app = modal.App("docdet-bench", image=image)

# SAME named, persistent Volume the trainer uses.
vol = modal.Volume.from_name("docdet-data", create_if_missing=True)
VOL = "/data"

# Where each normalized real dataset lands inside the Volume.
REAL_ROOT = f"{VOL}/benchmarks/real"

# Per-dataset config: where raw data lives in the Volume + how to normalize.
# URLs/HF ids are documented; large/licensed ones carry an explicit TODO with
# the exact command an operator must run.
DATASETS = {
    "doclaynet": {
        "raw": f"{VOL}/benchmarks/raw/doclaynet",
        "out": f"{REAL_ROOT}/doclaynet",
        "license": "CDLA-Permissive-1.0",
        # DocLayNet core is on Hugging Face: "ds4sd/DocLayNet" (and a smaller
        # "ds4sd/DocLayNet-v1.1"). The COCO json + PNGs are also at
        # https://github.com/DS4SD/DocLayNet (S3 zip links in the README).
        "hf_id": "ds4sd/DocLayNet",
        "normalizer": "doclaynet",
    },
    "midv2020": {
        "raw": f"{VOL}/benchmarks/raw/midv2020",
        "out": f"{REAL_ROOT}/midv2020",
        "license": "MIDV research-use (Smart Engines / L3i)",
        # MIDV-2020: http://l3i-share.univ-lr.fr / ftp.smartengines.com
        # Large + research-use gated; no anonymous direct HF mirror guaranteed.
        "hf_id": None,
        "normalizer": "midv2020",
    },
    "midv500": {
        "raw": f"{VOL}/benchmarks/raw/midv500",
        "out": f"{REAL_ROOT}/midv500",
        "license": "MIDV research-use (Smart Engines)",
        # MIDV-500: ftp://smartengines.com/midv-500/dataset/
        "hf_id": None,
        "normalizer": "midv500",
    },
}


@app.function(volumes={VOL: vol}, cpu=4.0, timeout=7200)
def download_dataset(dataset: str = "doclaynet") -> dict:
    """Download a public dataset into the Volume's raw/ area.

    DocLayNet: pulled from Hugging Face via `datasets` (guarded import).
    MIDV-*:    research-use + large; we DO NOT auto-download. We create the
               target dir and print the EXACT command an operator must run, so
               the step is reproducible without guessing.
    """
    import os

    if dataset not in DATASETS:
        raise ValueError(f"unknown dataset '{dataset}'. known: {list(DATASETS)}")
    cfg = DATASETS[dataset]
    raw = cfg["raw"]
    os.makedirs(raw, exist_ok=True)
    vol.reload()

    if dataset == "doclaynet":
        # Preferred path: Hugging Face. We snapshot the repo files so we get the
        # COCO json + images locally in the Volume.
        try:
            from huggingface_hub import snapshot_download  # guarded
        except ImportError as exc:
            raise RuntimeError("huggingface-hub missing in image") from exc
        # NOTE: DocLayNet on HF is large. To limit egress/time you may restrict
        # to the COCO json + a subset of PNGs via allow_patterns. Adjust as needed.
        path = snapshot_download(
            repo_id=cfg["hf_id"], repo_type="dataset",
            local_dir=raw, allow_patterns=["*.json", "*COCO*", "*.zip"],
        )
        vol.commit()
        print(f"[download] doclaynet -> {path}")
        return {"dataset": dataset, "raw": raw, "note": "verify COCO json + PNG dir paths"}

    # MIDV: licensed/large -> explicit TODO, no silent network pulls.
    todo = {
        "midv2020": (
            "TODO (operator): download MIDV-2020 (research-use). Example:\n"
            "  wget -r -np -nH --cut-dirs=2 "
            "ftp://ftp.smartengines.com/midv-2020/  -P " + raw + "\n"
            "  # or fetch from http://l3i-share.univ-lr.fr and unzip into " + raw
        ),
        "midv500": (
            "TODO (operator): download MIDV-500 (research-use). Example:\n"
            "  wget -r -np -nH --cut-dirs=2 "
            "ftp://ftp.smartengines.com/midv-500/dataset/ -P " + raw
        ),
    }[dataset]
    print(todo)
    return {"dataset": dataset, "raw": raw, "todo": todo, "downloaded": False}


@app.function(volumes={VOL: vol}, cpu=8.0, timeout=7200)
def normalize(dataset: str = "doclaynet", split: str = "val",
              coco_json: str | None = None, images_dir: str | None = None) -> dict:
    """Run the matching normalizer in-container, writing YOLO labels to the Volume.

    For doclaynet you may pass explicit --coco-json/--images-dir (paths inside
    the Volume) if the download layout differs from the default guess.
    """
    import os

    if dataset not in DATASETS:
        raise ValueError(f"unknown dataset '{dataset}'")
    cfg = DATASETS[dataset]
    vol.reload()

    if cfg["normalizer"] == "doclaynet":
        from benchmarks.normalize_doclaynet import normalize as norm_doclaynet
        cj = coco_json or os.path.join(cfg["raw"], "COCO", f"{split}.json")
        idir = images_dir or os.path.join(cfg["raw"], "PNG")
        if not os.path.isfile(cj):
            raise FileNotFoundError(
                f"COCO json not found at {cj}. Pass --coco-json with the real "
                "path inside the Volume (inspect with modal volume ls docdet-data).")
        stats = norm_doclaynet(coco_json=cj, images_dir=idir,
                               out_root=cfg["out"], split=split)
    elif cfg["normalizer"] == "midv2020":
        from benchmarks.normalize_midv import normalize_midv2020
        stats = normalize_midv2020(midv_root=cfg["raw"], out_root=cfg["out"], split=split)
    elif cfg["normalizer"] == "midv500":
        from benchmarks.normalize_midv import normalize_midv500
        stats = normalize_midv500(midv_root=cfg["raw"], out_root=cfg["out"], split=split)
    else:
        raise ValueError(f"no normalizer for {dataset}")

    vol.commit()
    print(f"[normalize] {dataset}/{split}: {stats}")
    return stats


@app.function(volumes={VOL: vol}, gpu="A10G", timeout=3600)
def eval_model(dataset: str = "doclaynet", run: str = "small", split: str = "val",
               imgsz: int = 960) -> dict:
    """Run eval_real against a model already trained into the Volume.

    Reads runs/docdet_<run>/weights/best.pt. THIS IS THE GATE OF RECORD —
    real-set metrics, not synthetic.
    """
    import os
    from benchmarks.eval_real import evaluate

    if dataset not in DATASETS:
        raise ValueError(f"unknown dataset '{dataset}'")
    cfg = DATASETS[dataset]
    vol.reload()

    model_path = f"{VOL}/runs/docdet_{run}/weights/best.pt"
    if not os.path.exists(model_path):
        raise FileNotFoundError(
            f"model not found: {model_path}. Train it first with the trainer app "
            "(modal_train.py) so the Volume has runs/docdet_<run>/weights/best.pt.")
    data_yaml = os.path.join(cfg["out"], "dataset.yaml")
    if not os.path.exists(data_yaml):
        raise FileNotFoundError(
            f"normalized dataset.yaml not found: {data_yaml}. Run `normalize` first.")
    out_dir = os.path.join(cfg["out"], f"eval_{run}_{split}")
    summary = evaluate(model_path=model_path, data_yaml=data_yaml,
                       split=split, imgsz=imgsz, out_dir=out_dir)
    vol.commit()
    print(f"[eval] REAL gate of record: mAP50={summary['map50']:.4f} "
          f"mAP50-95={summary['map50_95']:.4f} realGatesPass={summary['realGatesPass']}")
    return summary


@app.function(volumes={VOL: vol}, timeout=600)
def list_real(path: str = "benchmarks/real") -> list:
    """List normalized real datasets + metrics in the Volume (discovery)."""
    import os

    vol.reload()
    base = f"{VOL}/{path}"
    found = []
    for root, _dirs, files in os.walk(base):
        for f in files:
            p = os.path.join(root, f)
            found.append((p.replace(VOL + "/", ""), os.path.getsize(p)))
    return sorted(found)


@app.local_entrypoint()
def download(dataset: str = "doclaynet"):
    """Download a dataset into the Volume (DocLayNet auto; MIDV prints a TODO)."""
    print(download_dataset.remote(dataset=dataset))


@app.local_entrypoint()
def run_normalize(dataset: str = "doclaynet", split: str = "val",
                  coco_json: str = "", images_dir: str = ""):
    """Normalize a downloaded dataset into docdet-v0 YOLO labels."""
    print(normalize.remote(dataset=dataset, split=split,
                           coco_json=coco_json or None,
                           images_dir=images_dir or None))


@app.local_entrypoint()
def run_eval(dataset: str = "doclaynet", run: str = "small", split: str = "val",
             imgsz: int = 960):
    """Evaluate a trained model on a normalized real dataset (gate of record)."""
    print(eval_model.remote(dataset=dataset, run=run, split=split, imgsz=imgsz))


@app.local_entrypoint()
def run_bench(dataset: str = "doclaynet", run: str = "small", split: str = "val",
              imgsz: int = 960):
    """Convenience: normalize THEN eval in one invocation."""
    print(normalize.remote(dataset=dataset, split=split))
    print(eval_model.remote(dataset=dataset, run=run, split=split, imgsz=imgsz))


@app.local_entrypoint()
def real_artifacts(path: str = "benchmarks/real"):
    """List normalized real datasets + metrics persisted in the Volume."""
    for p, s in list_real.remote(path=path):
        print(f"{s:>12}  {p}")
