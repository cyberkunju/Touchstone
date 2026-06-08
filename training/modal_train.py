"""
Modal pipeline for the docdet detector — cloud GPU training without data upload.

The synthetic generator is pure, seed-deterministic Python, so instead of
uploading 15k images we **regenerate the exact same dataset inside Modal** into
a persistent Volume, then train on a cloud GPU. Results (weights + ONNX) are
written back to the Volume and downloaded locally.

Why this exists: the laptop 4060 runs ONE nano job at a time (~2.5 min/epoch).
Modal lets us run the training *variants in parallel* on separate GPUs
(baseline + imgsz-960 small-object + augment-tuned all at once) and is the
platform for the heavy P2/P3 work (dewarp, teacher distillation) the 4060
can't do.

Usage (from training/, after `modal token set ...`):
    # On Windows, FIRST force UTF-8 or the Modal CLI hangs on a charmap error:
    #   $env:PYTHONUTF8=1; $env:PYTHONIOENCODING="utf-8"

    # full end-to-end P1, parallel, self-stopping (recommended):
    modal run modal_train.py::full

    # just (re)generate the dataset into the Volume:
    modal run modal_train.py::main --action gen

    # train one variant:
    modal run modal_train.py::main --action train --mode small

    # re-package already-trained runs (eval + complete ONNX artifacts):
    modal run modal_train.py::package

    # list persisted artifacts in the Volume:
    modal run modal_train.py::artifacts

Persistence: results live in the NAMED Modal Volume 'docdet-data', which is
persistent and never auto-deleted. Download locally with:
    modal volume get docdet-data exports/winner ./exports_winner
    modal volume get docdet-data exports ./exports_all
Delete the Volume only when you explicitly choose to: `modal volume delete docdet-data`.
"""
from __future__ import annotations

import modal

# --- reproducibility: vendored base weights ----------------------------------
# We vendor yolo11n.pt INTO the image (with a sha256 assertion) instead of
# letting ultralytics auto-download at runtime. This makes every run start from
# byte-identical weights and removes a network dependency from the hot path.
# sha256/size verified against the published git-lfs pointer for this file.
YOLO11N_URL = "https://huggingface.co/Ultralytics/YOLO11/resolve/main/yolo11n.pt"
YOLO11N_SHA256 = "0ebbc80d4a7680d14987a577cd21342b65ecfd94632bd9a8da63ae6417644ee1"
VENDORED_WEIGHTS = "/weights/yolo11n.pt"

# --- container image: generation + training deps -----------------------------
# Pins are EXACT (==) for reproducibility. torch comes from the CUDA (cu121)
# wheel index so the same build runs on Modal's NVIDIA GPUs; torch 2.5.1 /
# torchvision 0.20.1 is a matched pair compatible with ultralytics 8.4.60.
image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("libgl1", "libglib2.0-0", "libgomp1", "wget")  # OpenCV/OpenMP + downloader
    .pip_install(
        "torch==2.5.1",
        "torchvision==0.20.1",
        index_url="https://download.pytorch.org/whl/cu121",
    )
    .pip_install(
        "ultralytics==8.4.60",
        "onnx==1.17.0",
        "onnxslim==0.1.48",
        "onnxruntime==1.20.1",
        "opencv-python-headless==4.10.0.84",
        "Pillow==10.4.0",
        "numpy==1.26.4",
        "qrcode==7.4.2",
        "python-barcode==0.15.1",
        "PyYAML==6.0.2",
    )
    # Vendor the base weights at build time with a sha256 assertion (fails the
    # build if the artifact ever changes), so train() never auto-downloads.
    .run_commands(
        "mkdir -p /weights",
        f"wget -q -O {VENDORED_WEIGHTS} {YOLO11N_URL}",
        f"echo '{YOLO11N_SHA256}  {VENDORED_WEIGHTS}' | sha256sum -c -",
    )
    # Ship our generator package into the image so Modal can regenerate data.
    .add_local_python_source("synthgen")
)

app = modal.App("docdet-trainer", image=image)

# How often (in epochs) the training callback commits the Volume mid-run so a
# preempted/retried container resumes from a recent checkpoint, not from zero.
COMMIT_EVERY_EPOCHS = 5

# Deployment operating point: production ships conf=0.25 / iou=0.5, so we
# evaluate at the SAME thresholds (not ultralytics' internal max-F1 conf) to get
# real operating-point recall for the critical-class gates.
DEPLOY_CONF = 0.25
DEPLOY_IOU = 0.5

# Deployment-aware winner selection (edge/browser target):
#   - interactive CPU latency ceiling for a single inference, and
#   - the extra mAP the heavier 960 model must earn to justify its cost.
# Default to the 640 model unless 960 both fits the budget AND clears the margin.
LATENCY_BUDGET_MS = 200.0
WINNER_MAP_MARGIN = 0.02

# --- GPU sweet-spot for a NANO model (cost discipline) ----------------------
# yolo11n is ~2.6M params. It CANNOT saturate a big datacenter GPU (A100/H100/
# B200): the kernels are tiny, the batch is small, and the bottleneck is the
# CPU dataloader (augment + compositing), not GPU FLOPs. Paying 5-8x for a B200
# buys almost no extra throughput for a nano net — it would sit mostly idle.
# The real levers are (a) a cheap GPU that fits the model, (b) enough CPU cores
# to feed it, and (c) running the two pilot arms in PARALLEL (same GPU-hours,
# half the wallclock). L4 (24GB, Ada) is the documented sweet-spot: ~$0.80/hr,
# ~30% cheaper than A10G, and far cheaper than any A100-class card, while still
# fitting yolo11n at imgsz 960 / batch 32 with headroom.
GPU = "L4"
# Dataloader cores per training container — keep the cheap GPU fed so it is the
# bottleneck, not data prep (compositing is CPU-heavy).
TRAIN_CPU = 8.0

# Persistent storage for datasets, runs and exports (survives between calls).
vol = modal.Volume.from_name("docdet-data", create_if_missing=True)
VOL = "/data"

# Per-mode training presets (mirror train_detector.py; batch sized for cloud GPU).
PRESETS = {
    "smoke": dict(epochs=3, imgsz=640, batch=32, patience=0),
    "baseline": dict(epochs=100, imgsz=640, batch=64, patience=20),
    "small": dict(epochs=150, imgsz=960, batch=32, patience=30),
}

# Variants we train/eval/export, with their inference image size.
IMGSZ = {"baseline": 640, "small": 960}

# Dataset completion sentinel: written ONLY after vol.commit() so its presence
# proves a fully-persisted dataset (never trust bare file existence).
SENTINEL = "_COMPLETE.json"


def _gather_or_cancel(handles: dict, stage: str) -> dict:
    """Resolve a dict of spawned Modal handles, cancelling orphans on failure.

    GPU containers bill until their timeout, so a single failed variant must not
    leave its siblings running. We .get() each handle; if any raises we CANCEL
    every still-outstanding handle in the finally block before re-raising, with
    a clear aggregated error. On success nothing is left outstanding.
    """
    results: dict = {}
    pending = dict(handles)
    try:
        for name, h in handles.items():
            results[name] = h.get()
            pending.pop(name, None)
        return results
    except Exception as exc:  # noqa: BLE001 - re-raised after cleanup
        print(f"[{stage}] FAILED: {type(exc).__name__}: {exc}")
        raise
    finally:
        for name, h in pending.items():
            try:
                h.cancel()
                print(f"[{stage}] cancelled outstanding handle: {name}")
            except Exception as ce:  # noqa: BLE001 - best-effort cleanup
                print(f"[{stage}] cancel '{name}' failed: {ce}")


def _choose_winner(eval_res: dict, exp: dict) -> dict:
    """Pick the deployment winner with a documented multi-objective rule.

    Quality signal = hard-set mAP50-95 (robustness under capture degradation).
    Cost signal    = on-CPU onnx latency from export().

    Rule (edge/browser target, default to the lighter 640 model):
      1. Start with 'baseline' (640) — the interactive default.
      2. Only promote 'small' (960) if it BOTH fits the interactive latency
         budget AND beats 640's hard mAP50-95 by >= WINNER_MAP_MARGIN.
      3. When in doubt (missing latency, thin margin), keep 640.
    Both variants are still exported; this only marks the winner.
    """
    def hard_map(run: str) -> float:
        v = eval_res.get(f"{run}/hard", {}).get("map50_95")
        return float(v) if v is not None else -1.0

    def latency(run: str):
        return exp.get(run, {}).get("latency_ms_cpu")

    base, cand = "baseline", "small"
    winner = base  # default to the lighter edge model
    reason = "default 640 (interactive edge target)"
    base_map, cand_map = hard_map(base), hard_map(cand)
    cand_lat = latency(cand)
    cand_fits = cand_lat is not None and cand_lat <= LATENCY_BUDGET_MS
    margin = cand_map - base_map
    if cand_fits and margin >= WINNER_MAP_MARGIN:
        winner = cand
        reason = (f"960 fits {LATENCY_BUDGET_MS:.0f}ms budget (~{cand_lat:.0f}ms) "
                  f"and beats 640 by {margin:.3f} mAP (>= {WINNER_MAP_MARGIN})")
    else:
        if not cand_fits:
            reason = (f"960 over latency budget "
                      f"({'n/a' if cand_lat is None else f'{cand_lat:.0f}ms'} "
                      f"> {LATENCY_BUDGET_MS:.0f}ms) — keep 640")
        elif margin < WINNER_MAP_MARGIN:
            reason = (f"960 mAP gain {margin:.3f} below margin "
                      f"{WINNER_MAP_MARGIN} — keep 640")
    return {"winner": winner, "reason": reason,
            "baselineHardMap": base_map, "smallHardMap": cand_map,
            "smallLatencyMsCpu": cand_lat,
            "latencyBudgetMs": LATENCY_BUDGET_MS, "mapMargin": WINNER_MAP_MARGIN}


@app.function(volumes={VOL: vol}, cpu=8.0, timeout=7200)
def generate(count: int = 15000, seed: int = 1000, out: str = "docdet_v0",
             force_split: str | None = None, augment: float = 0.75,
             intensity: float = 0.7, force: bool = False,
             compose: bool = False, bg_dir: str | None = None,
             compose_prob: float = 1.0) -> dict:
    """Regenerate a dataset into the Volume at /data/<out> (no upload).

    Idempotent via a COMPLETION SENTINEL, never bare existence: we skip ONLY
    when `<out>/_COMPLETE.json` exists AND records the same requested count,
    AND image_count == label_count, AND the expected splits are present. Any
    missing / partial / mismatched / stale (wrong-count) dataset is wiped and
    regenerated, so we can never silently train on the wrong data.

    Engine A (Phase 2): with ``compose=True`` and a ``bg_dir`` of real
    backgrounds (in the Volume), each rendered document is composited onto a real
    scene (scaled/rotated/perspective/partial-crop) before degradation — the
    lever that moves real document_page recall.
    """
    import json
    import os
    import shutil
    from synthgen.generate import main as gen_main

    out_abs = os.path.join(VOL, out)
    sentinel_path = os.path.join(out_abs, SENTINEL)
    # With --force-split, every sample lands in one split; otherwise the
    # generator emits train/val/test. Expected non-empty splits drive the check.
    expected_splits = [force_split] if force_split else ["train", "val", "test"]

    def _count(kind: str, split: str) -> int:
        d = os.path.join(out_abs, kind, split)
        return len(os.listdir(d)) if os.path.isdir(d) else 0

    def _images(split: str) -> int:
        return _count("images", split)

    def _labels(split: str) -> int:
        return _count("labels", split)

    vol.reload()
    if not force and os.path.exists(sentinel_path):
        try:
            with open(sentinel_path, encoding="utf-8") as fh:
                sent = json.load(fh)
        except Exception as e:  # noqa: BLE001 - corrupt sentinel => regenerate
            sent = None
            print(f"[generate] unreadable sentinel ({e}) — regenerating")
        if sent is not None:
            img_now = sum(_images(s) for s in expected_splits)
            lbl_now = sum(_labels(s) for s in expected_splits)
            splits_ok = all(_images(s) > 0 for s in expected_splits)
            if (sent.get("requestedCount") == count
                    and sent.get("imageCount") == sent.get("labelCount")
                    and sent.get("imageCount") == img_now
                    and img_now == lbl_now
                    and splits_ok
                    # also match the data-defining knobs, so a pre-existing
                    # NON-composited dataset is never silently reused for a
                    # composited request (or vice versa), nor a different seed/aug.
                    and bool(sent.get("compose")) == bool(compose)
                    and sent.get("seed") == seed
                    and sent.get("augment") == augment
                    and sent.get("intensity") == intensity
                    and sent.get("composeProb") == compose_prob):
                print(f"[generate] {out_abs} verified complete "
                      f"(count={count}, images={img_now}) — skipping")
                return {"out": out_abs, "images": img_now, "skipped": True,
                        "sentinel": sent}
            print(f"[generate] sentinel mismatch (req={sent.get('requestedCount')} "
                  f"vs {count}, img={img_now}, lbl={lbl_now}) — regenerating")

    # Missing / partial / mismatched: wipe and regenerate from scratch.
    if os.path.isdir(out_abs):
        print(f"[generate] wiping {out_abs} before regeneration")
        shutil.rmtree(out_abs)

    argv = ["--out", out_abs, "--count", str(count), "--seed", str(seed),
            "--augment", str(augment), "--intensity", str(intensity),
            "--workers", "8", "--quiet"]
    if force_split:
        argv += ["--force-split", force_split]
    if compose:
        argv += ["--compose", "--compose-prob", str(compose_prob)]
        if bg_dir:
            argv += ["--bg-dir", bg_dir]
    gen_main(argv)

    img_count = sum(_images(s) for s in expected_splits)
    lbl_count = sum(_labels(s) for s in expected_splits)
    per_split = {s: _images(s) for s in ("train", "val", "test")}
    # Persist the data FIRST, then write the sentinel so its presence proves a
    # fully-committed dataset.
    vol.commit()
    sentinel = {
        "out": out, "requestedCount": count, "seed": seed,
        "imageCount": img_count, "labelCount": lbl_count,
        "splits": per_split, "forceSplit": force_split,
        "augment": augment, "intensity": intensity,
        "compose": compose, "bgDir": bg_dir, "composeProb": compose_prob,
        "classVersion": _class_version(),
    }
    with open(sentinel_path, "w", encoding="utf-8") as fh:
        json.dump(sentinel, fh, indent=2)
    vol.commit()

    print(f"[generate] {img_count} images / {lbl_count} labels at {out_abs} "
          f"(splits={per_split})")
    return {"out": out_abs, "images": img_count, "labels": lbl_count,
            "sentinel": sentinel}


def _class_version() -> str:
    """Best-effort read of the dataset class version (for sentinel/summary)."""
    try:
        from synthgen.config import CLASS_VERSION
        return CLASS_VERSION
    except Exception:  # noqa: BLE001
        return "unknown"


# Critical-class recall gates (plan §10 / detector §12).
CRITICAL_GATES = {
    "mrz_zone": 0.90, "qr_code": 0.90, "barcode": 0.88, "photo": 0.88,
    "signature": 0.80, "table": 0.85, "checkbox": 0.80,
}


@app.function(volumes={VOL: vol}, gpu=GPU, timeout=3600)
def evaluate(run: str = "baseline", data: str = "docdet_v0/dataset.yaml",
             split: str = "test", imgsz: int = 640) -> dict:
    """Run validation for a finished run; return mAP + critical-gate pass.

    Validates at the DEPLOYED operating point (conf=0.25, iou=0.5) rather than
    ultralytics' internal max-F1 confidence, so the critical-class recall gates
    reflect what production will actually catch. The conf/iou used is recorded
    in the returned dict (and thus in metrics.json downstream).
    """
    from ultralytics import YOLO

    vol.reload()
    weights = f"{VOL}/runs/docdet_{run}/weights/best.pt"
    model = YOLO(weights)
    m = model.val(data=f"{VOL}/{data}", split=split, imgsz=imgsz,
                  conf=DEPLOY_CONF, iou=DEPLOY_IOU,
                  project=f"{VOL}/runs", name=f"eval_{run}_{split}", exist_ok=True)
    per_class = {}
    try:
        names = m.names
        for i, cid in enumerate(m.box.ap_class_index):
            per_class[names[int(cid)]] = {
                "precision": float(m.box.p[i]), "recall": float(m.box.r[i]),
                "ap50": float(m.box.ap50[i]),
            }
    except Exception as e:  # noqa: BLE001
        print(f"[evaluate] per-class read failed: {e}")
    gates = {}
    all_pass = True
    for cls, g in CRITICAL_GATES.items():
        r = per_class.get(cls, {}).get("recall")
        ok = r is not None and r >= g
        all_pass = all_pass and ok
        gates[cls] = {"recall": None if r is None else round(r, 4), "gate": g, "pass": ok}
    vol.commit()
    out = {
        "run": run, "split": split,
        "conf": DEPLOY_CONF, "iou": DEPLOY_IOU,
        "map50": float(getattr(m.box, "map50", 0.0)),
        "map50_95": float(getattr(m.box, "map", 0.0)),
        "allCriticalGatesPass": all_pass, "gates": gates,
    }
    print(f"[evaluate] {run}/{split}@conf{DEPLOY_CONF}: mAP50={out['map50']:.4f} "
          f"mAP50-95={out['map50_95']:.4f} gates_pass={all_pass}")
    return out


@app.function(volumes={VOL: vol}, gpu=GPU, cpu=TRAIN_CPU, timeout=10800, retries=2)
def train(mode: str = "baseline", data: str = "docdet_v0/dataset.yaml",
          gpu_note: str = GPU, run_name: str | None = None,
          mosaic: float = 1.0, epochs: int | None = None) -> dict:
    """Train one variant on a cloud GPU; write weights into the Volume.

    ``run_name`` overrides the default ``docdet_<mode>`` run directory so a pilot
    (e.g. ``docdet_v1pilot``) never collides with the v0 runs. ``mosaic`` exposes
    the mosaic-augmentation probability: the Engine-A pilot sets ``mosaic=0`` so
    the model trains on the compositor's CALIBRATED scale distribution rather than
    a 4-image mosaic collage that re-shrinks docs ~2x and fabricates internal
    rectangle edges (which fights the "find the document sub-region" objective).

    ``epochs`` overrides the preset epoch count. The pilot uses a SHORTER budget
    (60) than the full preset (100): we only need to detect MOVEMENT (does Engine
    A data shift real recall vs the matched control?), and 60 epochs is enough to
    read that signal at ~40% less GPU cost. The eventual scale run uses the full
    preset.

    Reliability:
      * Modal `retries=2` restarts a crashed/preempted container.
      * If `runs/docdet_<mode>/weights/last.pt` exists we resume from it.
      * An on_fit_epoch_end callback commits the Volume every few epochs so a
        retry resumes from a recent checkpoint instead of from scratch.
    nano (yolo11n) fits comfortably on L4 (24GB) even at imgsz 960 / batch 32,
    and with TRAIN_CPU dataloader cores the cheap GPU stays fed — so we avoid the
    much pricier A100/B200 class cards a nano model can never saturate.
    """
    import os
    import time

    from ultralytics import YOLO

    vol.reload()  # see dataset committed by generate()
    cfg = PRESETS[mode]
    n_epochs = epochs if epochs is not None else cfg["epochs"]
    name = run_name or f"docdet_{mode}"
    last_pt = f"{VOL}/runs/{name}/weights/last.pt"
    resume = os.path.exists(last_pt)
    t0 = time.time()

    # Resume from the in-progress checkpoint if present, else the vendored base.
    model = YOLO(last_pt) if resume else YOLO(VENDORED_WEIGHTS)
    if resume:
        print(f"[train] resuming {name} from {last_pt}")

    def _commit_cb(trainer):  # persist checkpoints mid-run for crash/preempt safety
        try:
            ep = int(getattr(trainer, "epoch", 0))
            if (ep + 1) % COMMIT_EVERY_EPOCHS == 0:
                vol.commit()
                print(f"[train] committed Volume at epoch {ep + 1}")
        except Exception as e:  # noqa: BLE001 - never let a commit kill training
            print(f"[train] mid-run commit failed: {e}")

    model.add_callback("on_fit_epoch_end", _commit_cb)

    results = model.train(
        data=f"{VOL}/{data}",
        epochs=n_epochs, imgsz=cfg["imgsz"], batch=cfg["batch"],
        patience=cfg["patience"], project=f"{VOL}/runs", name=name,
        exist_ok=True, device=0, resume=resume,
        # Reproducibility: fixed seed + deterministic kernels.
        seed=0, deterministic=True,
        # --- recipe (kept consistent with train_detector.py) ---
        fliplr=0.0, flipud=0.0,        # directional primitives (MRZ/text) — no flips
        erasing=0.0,                   # default 0.4 erases tiny critical primitives (checkbox/qr/mrz)
        multi_scale=True,              # scale robustness for small-object recall
        mosaic=mosaic, close_mosaic=10,  # mosaic prob (pilot sets 0 — see docstring)
        copy_paste=0.1,                # modest paste aug to enrich rare primitives
        cos_lr=True,                   # cosine LR decay for a cleaner final convergence
        degrees=5.0, perspective=0.0005,  # sane doc-scan jitter only
        hsv_h=0.01, hsv_s=0.4, hsv_v=0.4,  # modest photometric jitter (within doc values)
    )
    vol.commit()
    rd = getattr(results, "results_dict", {})
    out = {
        "mode": mode, "gpu": gpu_note, "resumed": resume, "epochs": n_epochs,
        "minutes": round((time.time() - t0) / 60, 1),
        "map50": rd.get("metrics/mAP50(B)"),
        "map50_95": rd.get("metrics/mAP50-95(B)"),
        "weights": f"{VOL}/runs/{name}/weights/best.pt",
    }
    print(f"[train] {out}")
    return out


@app.function(volumes={VOL: vol}, gpu=GPU, timeout=3600)
def export(run: str = "baseline", imgsz: int = 640, opset: int = 17,
           metrics: dict | None = None) -> dict:
    """Export a finished run to a COMPLETE, integration-ready artifact package.

    Writes into a PER-RUN dir (no collisions) the full set the browser engine
    needs, matching src/ai-runtime/yolo.ts (attribute-major [4+nc, anchors],
    class-aware NMS done in JS, so nms=False):
        model.onnx, best.pt, classes.json, metadata.json (sha256 + imgsz),
        preprocessing.json, postprocessing.json, metrics.json
    """
    import hashlib
    import json
    import os
    import shutil
    import time

    from ultralytics import YOLO
    from synthgen.config import CLASS_NAMES, CLASS_VERSION

    vol.reload()
    weights = f"{VOL}/runs/docdet_{run}/weights/best.pt"
    if not os.path.exists(weights):
        raise FileNotFoundError(f"weights not found: {weights}")

    model = YOLO(weights)
    onnx_src = model.export(format="onnx", imgsz=imgsz, opset=opset,
                            simplify=True, nms=False, dynamic=False)

    ver = CLASS_VERSION.split("-")[-1]  # "v0"
    model_id = f"yolov11n-docdet-{ver}-{run}"
    out_dir = f"{VOL}/exports/{model_id}"
    os.makedirs(out_dir, exist_ok=True)
    dst_onnx = os.path.join(out_dir, "model.onnx")
    shutil.copyfile(str(onnx_src), dst_onnx)
    shutil.copyfile(weights, os.path.join(out_dir, "best.pt"))

    h = hashlib.sha256()
    with open(dst_onnx, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    sha = h.hexdigest()

    with open(os.path.join(out_dir, "classes.json"), "w", encoding="utf-8") as fh:
        json.dump(CLASS_NAMES, fh, indent=2)
    with open(os.path.join(out_dir, "preprocessing.json"), "w", encoding="utf-8") as fh:
        json.dump({
            "inputName": "images", "imgsz": imgsz, "letterbox": True,
            "padValue": 114, "channelOrder": "RGB", "layout": "NCHW",
            "normalize": {"scale": 1 / 255.0, "mean": [0, 0, 0], "std": [1, 1, 1]},
        }, fh, indent=2)
    with open(os.path.join(out_dir, "postprocessing.json"), "w", encoding="utf-8") as fh:
        json.dump({
            "outputLayout": "[4 + numClasses, numAnchors]",
            "numClasses": len(CLASS_NAMES), "boxFormat": "cxcywh_model_pixels",
            "nms": "class-aware, in JS (src/ai-runtime/yolo.ts)",
            "defaultConfThreshold": 0.25, "defaultIouThreshold": 0.5,
        }, fh, indent=2)
    meta = {
        "modelId": model_id, "modelVersion": f"{model_id}-0.1.0",
        "classVersion": CLASS_VERSION, "baseModel": "yolo11n.pt",
        "imgsz": imgsz, "opset": opset, "sha256": sha,
        "executionProvider": "webgpu-then-wasm", "run": run,
        "createdAt": int(time.time()),
    }
    with open(os.path.join(out_dir, "metadata.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2)

    # Deployment-aware signal: measure a quick on-CPU onnxruntime latency at the
    # model's imgsz. The edge/browser target is latency-sensitive, so this feeds
    # the multi-objective winner rule in the orchestrator.
    latency_ms = _onnx_cpu_latency_ms(dst_onnx, imgsz)
    if latency_ms is not None:
        print(f"[export] {model_id} CPU latency ~{latency_ms:.1f} ms @ imgsz {imgsz}")

    metrics_out = dict(metrics) if metrics else {}
    metrics_out["latencyMsCpu"] = latency_ms
    metrics_out["imgsz"] = imgsz
    with open(os.path.join(out_dir, "metrics.json"), "w", encoding="utf-8") as fh:
        json.dump(metrics_out, fh, indent=2)
    vol.commit()
    print(f"[export] {model_id} sha256={sha[:16]}... -> {out_dir}")
    return {"model_id": model_id, "dir": out_dir, "sha256": sha, "imgsz": imgsz,
            "latency_ms_cpu": latency_ms}


def _onnx_cpu_latency_ms(onnx_path: str, imgsz: int, runs: int = 8,
                         warmup: int = 2) -> float | None:
    """Mean single-image CPU inference latency (ms) over a few dummy runs.

    Best-effort: returns None if onnxruntime can't load/run the model so a
    measurement hiccup never fails the export.
    """
    import time

    try:
        import numpy as np
        import onnxruntime as ort

        so = ort.SessionOptions()
        sess = ort.InferenceSession(onnx_path, sess_options=so,
                                    providers=["CPUExecutionProvider"])
        inp = sess.get_inputs()[0]
        shape = [d if isinstance(d, int) and d > 0 else 1 for d in inp.shape]
        # Fall back to the known NCHW square layout if the export is dynamic.
        if len(shape) == 4:
            shape = [1, shape[1] if shape[1] in (1, 3) else 3, imgsz, imgsz]
        dummy = np.random.rand(*shape).astype(np.float32)
        feed = {inp.name: dummy}
        for _ in range(max(0, warmup)):
            sess.run(None, feed)
        t0 = time.perf_counter()
        for _ in range(max(1, runs)):
            sess.run(None, feed)
        return round((time.perf_counter() - t0) / max(1, runs) * 1000.0, 2)
    except Exception as e:  # noqa: BLE001 - latency is advisory, never fatal
        print(f"[export] latency measurement skipped: {e}")
        return None


@app.function(volumes={VOL: vol}, timeout=600)
def write_summary(train_res: dict, eval_res: dict, exp: dict, best: str,
                  winner_info: dict | None = None) -> dict:
    """Persist a top-level SUMMARY.json and copy the winner to exports/winner/.

    Records the resolved environment (key package versions), the dataset
    completion sentinels, the class version and the winner-selection rationale,
    so a SUMMARY.json is a self-contained, reproducible record of the run.
    """
    import json
    import os
    import shutil

    vol.reload()
    out = f"{VOL}/exports"
    os.makedirs(out, exist_ok=True)
    summary = {
        "winner": best, "winnerModelId": exp[best]["model_id"],
        "winnerSelection": winner_info,
        "classVersion": _class_version(),
        "environment": _resolved_env(),
        "datasets": _dataset_sentinels(),
        "train": train_res, "eval": eval_res, "exports": exp,
    }
    with open(os.path.join(out, "SUMMARY.json"), "w", encoding="utf-8") as fh:
        json.dump(summary, fh, indent=2)
    wdir = os.path.join(out, "winner")
    if os.path.isdir(wdir):
        shutil.rmtree(wdir)
    shutil.copytree(exp[best]["dir"], wdir)
    vol.commit()
    print(f"[summary] winner={best} -> {out}/SUMMARY.json and {wdir}/")
    return {"summary": f"{out}/SUMMARY.json", "winner_dir": wdir}


def _resolved_env() -> dict:
    """Capture key package versions (reproducibility record for SUMMARY.json)."""
    import sys

    pkgs = ["torch", "torchvision", "ultralytics", "onnx", "onnxslim",
            "onnxruntime", "opencv-python-headless", "Pillow", "numpy",
            "qrcode", "python-barcode", "PyYAML"]
    versions = {}
    try:
        import importlib.metadata as im
        for name in pkgs:
            try:
                versions[name] = im.version(name)
            except Exception:  # noqa: BLE001 - package may report under another dist name
                versions[name] = None
    except Exception as e:  # noqa: BLE001
        print(f"[summary] env capture failed: {e}")
    return {"python": sys.version.split()[0], "packages": versions,
            "vendoredWeightsSha256": YOLO11N_SHA256}


def _dataset_sentinels() -> dict:
    """Read the per-dataset completion sentinels written by generate()."""
    import json
    import os

    found = {}
    base = VOL
    if os.path.isdir(base):
        for entry in os.listdir(base):
            sp = os.path.join(base, entry, SENTINEL)
            if os.path.isfile(sp):
                try:
                    with open(sp, encoding="utf-8") as fh:
                        found[entry] = json.load(fh)
                except Exception as e:  # noqa: BLE001
                    found[entry] = {"error": str(e)}
    return found


@app.function(volumes={VOL: vol}, timeout=600)
def list_artifacts(path: str = "exports") -> list:
    """List files under /data/<path> with sizes (for easy discovery)."""
    import os

    vol.reload()
    base = f"{VOL}/{path}"
    found = []
    for root, _dirs, files in os.walk(base):
        for f in files:
            p = os.path.join(root, f)
            found.append((p.replace(VOL + "/", ""), os.path.getsize(p)))
    return sorted(found)


@app.function(volumes={VOL: vol}, cpu=4.0, timeout=3600)
def fetch_backgrounds(out: str = "assets/backgrounds/coco_val2017") -> dict:
    """Download the real-background bank (COCO val2017, 5000 scenes) into the
    Volume so in-Volume compositing can use it. Idempotent: skips if already
    extracted (>=4000 images present).
    """
    import os
    import urllib.request
    import zipfile

    vol.reload()
    out_abs = os.path.join(VOL, out)
    os.makedirs(out_abs, exist_ok=True)

    def _img_count() -> int:
        n = 0
        for _r, _d, files in os.walk(out_abs):
            n += sum(1 for f in files if f.lower().endswith((".jpg", ".jpeg", ".png")))
        return n

    if _img_count() >= 4000:
        print(f"[bg] {out_abs} already has {_img_count()} images — skipping")
        return {"out": out_abs, "images": _img_count(), "skipped": True}

    url = "http://images.cocodataset.org/zips/val2017.zip"
    zpath = os.path.join(out_abs, "val2017.zip")
    print(f"[bg] downloading {url}")
    urllib.request.urlretrieve(url, zpath)
    print("[bg] extracting")
    with zipfile.ZipFile(zpath) as zf:
        zf.extractall(out_abs)
    os.remove(zpath)
    vol.commit()
    n = _img_count()
    if n < 4000:
        raise RuntimeError(
            f"[bg] only {n} background images extracted at {out_abs} (expected ~5000) "
            "— refusing to proceed; a thin/empty bank yields useless composited data.")
    print(f"[bg] {n} background images at {out_abs}")
    return {"out": out_abs, "images": n, "skipped": False}


@app.function(volumes={VOL: vol}, timeout=86400)
def pilot(count: int = 30000, seed: int = 2000) -> dict:
    """ENGINE A PILOT (plan §11 step 3-4), server-side + self-stopping.

    Runs a CONTROLLED ablation so the result is attributable to Engine A, not to
    confounds (data size / seed / augmentation). Two arms, IDENTICAL except for
    compositing:
      * PILOT   — `docdet_v1_pilot`   : compose=True  (docs on real scenes)
      * CONTROL — `docdet_v1_control` : compose=False (v0-style full-frame)
    Same count / seed / augment / intensity / recipe / mosaic=0 for both. Engine
    A's effect = (pilot MIDV recall) - (control MIDV recall).

    IMPORTANT this trains the v0 single 12-class detector (incl text_block) as a
    DATA-LEVER ISOLATION TEST — NOT the v1 staged Models 1/2. We hold the
    architecture constant and change only the data, to decide if Engine A data
    alone moves document_page recall before paying for the staged refactor.

    The GATE runs LOCALLY (`benchmarks/eval_v2.py` on MIDV-500) on the downloaded
    weights — eval is light, so the laptop stays cool while TRAINING ran here.
    GO criterion = MOVEMENT: pilot recall clears the baseline cluster-CI upper
    bound (~0.48) AND beats the control arm; the 0.70/0.90 figures are the later
    PHASE gate, not this pilot's go/no-go.
    """
    import json

    bg = fetch_backgrounds.remote()
    print("BG:", json.dumps(bg, indent=2))
    bg_dir = f"{VOL}/assets/backgrounds"

    # 1) two datasets in parallel (CPU): composited pilot + matched control.
    gen = _gather_or_cancel({
        "pilot": generate.spawn(count=count, seed=seed, out="docdet_v1_pilot",
                                augment=0.85, intensity=0.8,
                                compose=True, bg_dir=bg_dir, compose_prob=0.9),
        "control": generate.spawn(count=count, seed=seed, out="docdet_v1_control",
                                  augment=0.85, intensity=0.8, compose=False),
    }, "generate")
    print("GEN:", json.dumps(gen, indent=2))

    # 2) train both arms in parallel (GPU), mosaic OFF, identical recipe.
    # 60 epochs (vs the 100-epoch preset) is enough to read the MOVEMENT signal
    # for a go/no-go and is ~40% cheaper; the later SCALE run uses the full budget.
    tr = _gather_or_cancel({
        "pilot": train.spawn(mode="baseline", data="docdet_v1_pilot/dataset.yaml",
                             run_name="docdet_v1pilot", mosaic=0.0, epochs=60),
        "control": train.spawn(mode="baseline", data="docdet_v1_control/dataset.yaml",
                               run_name="docdet_v1control", mosaic=0.0, epochs=60),
    }, "train")
    print("TRAIN:", json.dumps(tr, indent=2))

    # 3) export both (GPU) for local MIDV evaluation.
    exp = _gather_or_cancel({
        "pilot": export.spawn(run="v1pilot", imgsz=640, metrics={"arm": "pilot"}),
        "control": export.spawn(run="v1control", imgsz=640, metrics={"arm": "control"}),
    }, "export")
    print("EXPORT:", json.dumps(exp, indent=2))
    return {"background": bg, "datasets": gen, "train": tr, "export": exp,
            "note": "Engine A effect = pilot MIDV recall - control MIDV recall "
                    "(run benchmarks/eval_v2.py locally on both downloaded best.pt)."}


@app.function(volumes={VOL: vol}, timeout=86400)
def pipeline(count: int = 15000, hard: int = 1500) -> dict:
    """SERVER-SIDE orchestrator — runs the whole P1 end-to-end on Modal.

    Runs as a detached cloud function so it completes independently of the
    (flaky on Windows) local CLI. It spawns the GPU jobs, waits, evaluates,
    exports both variants, picks a deployment-aware winner, writes SUMMARY, and
    returns — then everything stops.

    Orphan prevention: every stage gathers its spawned handles through
    `_gather_or_cancel`, so if any sibling job fails the rest are cancelled
    instead of billing to their timeouts.
    """
    import json

    # 1) datasets (CPU) — clean train set + locked hard holdout.
    gen_handles = {
        "clean": generate.spawn(count=count, out="docdet_v0"),
        "hard": generate.spawn(count=hard, out="docdet_v0_hard",
                               force_split="test", augment=1.0, intensity=1.0),
    }
    print("GEN:", json.dumps(_gather_or_cancel(gen_handles, "generate"), indent=2))

    # 2) train both variants in parallel (GPU).
    train_res = _gather_or_cancel(
        {m: train.spawn(mode=m) for m in IMGSZ}, "train")
    print("TRAIN:", json.dumps(train_res, indent=2))

    # 3) evaluate at the deployed operating point on clean + hard splits (GPU).
    ev_handles = {}
    for r in IMGSZ:
        ev_handles[f"{r}/clean"] = evaluate.spawn(
            run=r, data="docdet_v0/dataset.yaml", split="test", imgsz=IMGSZ[r])
        ev_handles[f"{r}/hard"] = evaluate.spawn(
            run=r, data="docdet_v0_hard/dataset.yaml", split="test", imgsz=IMGSZ[r])
    eval_res = _gather_or_cancel(ev_handles, "evaluate")
    print("EVAL:", json.dumps(eval_res, indent=2))

    # 4) export BOTH variants (GPU) — also measures CPU onnx latency.
    exp = _gather_or_cancel(
        {m: export.spawn(run=m, imgsz=IMGSZ[m], metrics={
            "clean": eval_res.get(f"{m}/clean"), "hard": eval_res.get(f"{m}/hard")})
         for m in IMGSZ}, "export")
    print("EXPORTS:", json.dumps(exp, indent=2))

    # 5) deployment-aware winner (latency budget + mAP margin; default 640).
    winner_info = _choose_winner(eval_res, exp)
    best = winner_info["winner"]
    print("WINNER:", json.dumps(winner_info, indent=2))
    summary = write_summary.remote(train_res, eval_res, exp, best, winner_info)
    print("SUMMARY:", summary, "WINNER:", best)
    return {"winner": best, "winnerInfo": winner_info,
            "train": train_res, "eval": eval_res, "exports": exp}


@app.local_entrypoint()
def main(action: str = "all", mode: str = "baseline", count: int = 15000,
         run: str = "baseline"):
    """Single-flow entry: gen and/or train and/or export.

    WINDOWS WARNING: this entrypoint uses BLOCKING .remote() calls, which keep
    the local Modal CLI attached for the whole (multi-hour) run. On Windows the
    CLI can hang on a charmap/encoding error and orphan the job. For any long
    action prefer the DETACHED orchestrator instead:
        modal run --detach modal_train.py::full      # full P1 end-to-end
        modal run --detach modal_train.py::package    # re-eval/export only
    If you must use main() on Windows, first force UTF-8:
        $env:PYTHONUTF8=1; $env:PYTHONIOENCODING="utf-8"
    """
    imgsz = 960 if run == "small" else 640
    if action in ("gen", "all"):
        print(generate.remote(count=count))
    if action in ("train", "all"):
        print(train.remote(mode=mode))
    if action in ("export", "all"):
        print(export.remote(run=run, imgsz=imgsz))


@app.function(volumes={VOL: vol}, timeout=86400)
def repackage() -> dict:
    """Server-side: re-eval + complete export on ALREADY-TRAINED runs (no retrain).

    Mirrors the pipeline's orphan-prevention: each stage gathers its handles via
    `_gather_or_cancel`, so a single failure cancels outstanding GPU jobs.
    """
    import json

    ev_handles = {}
    for r in IMGSZ:
        ev_handles[f"{r}/clean"] = evaluate.spawn(
            run=r, data="docdet_v0/dataset.yaml", split="test", imgsz=IMGSZ[r])
        ev_handles[f"{r}/hard"] = evaluate.spawn(
            run=r, data="docdet_v0_hard/dataset.yaml", split="test", imgsz=IMGSZ[r])
    eval_res = _gather_or_cancel(ev_handles, "evaluate")
    train_res = {r: {"weights": f"{VOL}/runs/docdet_{r}/weights/best.pt"} for r in IMGSZ}
    exp = _gather_or_cancel(
        {m: export.spawn(run=m, imgsz=IMGSZ[m], metrics={
            "clean": eval_res.get(f"{m}/clean"), "hard": eval_res.get(f"{m}/hard")})
         for m in IMGSZ}, "export")
    winner_info = _choose_winner(eval_res, exp)
    best = winner_info["winner"]
    print("WINNER:", json.dumps(winner_info, indent=2))
    print("SUMMARY:",
          write_summary.remote(train_res, eval_res, exp, best, winner_info),
          "WINNER:", best)
    return {"winner": best, "winnerInfo": winner_info,
            "eval": eval_res, "exports": exp}


@app.local_entrypoint()
def pilot_run(count: int = 30000, seed: int = 2000):
    """Launch the ENGINE A PILOT (controlled ablation) detached on Modal.

        modal run --detach modal_train.py::pilot_run

    Spawns the server-side `pilot`: fetch backgrounds -> generate composited
    PILOT + matched no-compose CONTROL (same count/seed/augment) -> train both
    (mosaic off) -> export both. Returns immediately. After it finishes, download
    BOTH arms' weights and run the LOCAL gate on each:
        modal volume get docdet-data exports/yolov11n-docdet-v0-v1pilot   ./pilot_export
        modal volume get docdet-data exports/yolov11n-docdet-v0-v1control ./control_export
        python benchmarks/eval_v2.py --model pilot_export/best.pt   --data benchmarks/real/midv500 --split test --recall-floor 0.70
        python benchmarks/eval_v2.py --model control_export/best.pt --data benchmarks/real/midv500 --split test --recall-floor 0.70
    Engine A effect = pilot recall - control recall. GO = clear movement above
    the baseline cluster-CI upper bound (~0.48) AND pilot > control.
    """
    call = pilot.spawn(count=count, seed=seed)
    print(f"PILOT LAUNCHED (detached). call_id={call.object_id}")
    print("Track:   modal app list   then   modal app logs <app-id>")


@app.local_entrypoint()
def full(count: int = 15000, hard: int = 1500):
    """Launch the full P1 pipeline DETACHED on Modal (robust to client death).

    ALWAYS run with --detach so it survives the local CLI:
        modal run --detach modal_train.py::full

    Spawns the server-side `pipeline` orchestrator and returns immediately. The
    pipeline runs gen -> train(640+960 parallel) -> eval(clean+hard) -> export
    both + winner, entirely on Modal, then stops itself.
    """
    call = pipeline.spawn(count=count, hard=hard)
    print(f"PIPELINE LAUNCHED (detached). call_id={call.object_id}")
    print("Track:   modal app list   then   modal app logs <app-id>")
    print("When done: modal run modal_train.py::artifacts")


@app.local_entrypoint()
def package():
    """Re-package already-trained runs (eval + complete ONNX), detached on Modal.

        modal run --detach modal_train.py::package
    """
    call = repackage.spawn()
    print(f"REPACKAGE LAUNCHED (detached). call_id={call.object_id}")


@app.local_entrypoint()
def artifacts(path: str = "exports"):
    """List persisted artifacts in the Volume (easy discovery)."""
    for p, s in list_artifacts.remote(path=path):
        print(f"{s:>12}  {p}")
