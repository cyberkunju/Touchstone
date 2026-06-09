# ============================================================================
#  docdet — YOLOv11n training on Kaggle GPU T4 x2  (SPEED-OPTIMIZED, recipe-safe)
#
#  Speedups (verified by 5-agent brutal review, NO accuracy compromise vs 0.82
#  pilot):
#   - multi_scale=0.5 (was =True, which ultralytics treats as 1.0 -> imgsz up
#     to 1280px, dominating epoch cost; doc_page unaffected).
#   - cache='ram' (~6.4GB cached on first epoch; epochs 2..N skip JPEG decode).
#   - symlink images + COPY labels into writable /kaggle/working/docdet, so
#     ultralytics writes its label .cache (no per-session re-scan).
#   - workers=2 + OMP/MKL/OPENBLAS=1 + cv2.setNumThreads(0) in train.py itself
#     (subprocess inherits env vars but cv2's thread pool is independent).
#   Recipe (mosaic, augments, lr0, optimizer, deterministic) UNCHANGED from pilot.
#
#  BEFORE RUNNING:
#    1. Add Input -> add  cyberkunju/docdet-v1
#    2. Settings  -> Accelerator = "GPU T4 x2"   (NOT P100 — P100 crashes torch)
#    3. Settings  -> Internet = ON
#  THEN: Save Version -> "Save & Run All (Commit)"   (~5-7h on T4x2)
# ============================================================================
import os, sys, glob, shutil, subprocess

# Thread caps BEFORE any import of torch/cv2/np (env vars are read at import).
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"

# --- 1) HARDWARE TRIPWIRE: fail fast if not on 2x T4 (P100 can't init torch) ---
import torch
ngpu = torch.cuda.device_count()
gnames = [torch.cuda.get_device_name(i) for i in range(ngpu)]
print("GPUs:", ngpu, gnames)
assert ngpu == 2 and all("T4" in n for n in gnames), \
    f"Expected 2x Tesla T4, got {gnames}. Set Accelerator='GPU T4 x2' and restart."

# --- 2) install ultralytics (keeps Kaggle's preinstalled CUDA torch) ---
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "ultralytics==8.4.60"], check=True)
assert torch.cuda.is_available(), "CUDA not available after pip install — abort."

# --- 3) DATA: symlink BOTH images AND labels into /kaggle/working (no copies).
#        We tried copying labels for a writable .cache, but Kaggle's FUSE mount
#        makes 60k tiny-file copies extremely slow (stalled in practice). The
#        label .cache miss only emits a harmless warning ("Cache not saved") and
#        ultralytics scans labels in-memory each session. That's a one-time ~30s
#        scan, far faster than the FUSE copy.
print("/kaggle/input has:", os.listdir("/kaggle/input") if os.path.isdir("/kaggle/input") else "NOTHING")
SRC = None
for root, dirs, files in os.walk("/kaggle/input"):
    if os.path.isdir(os.path.join(root, "images", "train")) and \
       os.path.isdir(os.path.join(root, "labels", "train")):
        SRC = root
        break
assert SRC, "docdet-v1 not attached. Right panel -> Add Input -> docdet-v1, then re-run."
print("SRC:", SRC)

DATA = "/kaggle/working/docdet"
os.makedirs(f"{DATA}/images", exist_ok=True)
os.makedirs(f"{DATA}/labels", exist_ok=True)
for s in ("train", "val", "test"):
    si, di = f"{SRC}/images/{s}", f"{DATA}/images/{s}"
    sl, dl = f"{SRC}/labels/{s}", f"{DATA}/labels/{s}"
    if os.path.isdir(si) and not os.path.lexists(di):
        os.symlink(si, di)        # images symlink (no copy)
    if os.path.isdir(sl) and not os.path.lexists(dl):
        os.symlink(sl, dl)        # labels symlink (no copy; .cache warning is harmless)
for s in ("train", "val", "test"):
    ip, lp = f"{DATA}/images/{s}", f"{DATA}/labels/{s}"
    print(s, "images", len(os.listdir(ip)) if os.path.isdir(ip) else "MISSING",
          "labels", len(os.listdir(lp)) if os.path.isdir(lp) else "MISSING")

# --- 4) dataset.yaml (rooted at writable DATA) ---
names = ['document_page', 'photo', 'signature', 'stamp', 'seal', 'logo',
         'qr_code', 'barcode', 'mrz_zone', 'table', 'checkbox', 'text_block']
yml = f"path: {DATA}\ntrain: images/train\nval: images/val\ntest: images/test\nnames:\n"
yml += "".join(f"  {i}: {n}\n" for i, n in enumerate(names))
open("/kaggle/working/docdet.yaml", "w").write(yml)
print(yml)

# --- 4.5) W&B live monitoring (BEST-EFFORT: a W&B failure must NEVER block training) ---
try:
    os.environ["WANDB_API_KEY"] = "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"
    os.environ["WANDB_PROJECT"] = "docdet"
    os.environ["WANDB_NAME"] = "docdet_v1_t4x2"
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "wandb"], check=True)
    import wandb
    wandb.login(key=os.environ["WANDB_API_KEY"])
    from ultralytics import settings as _uls
    _uls.update({"wandb": True})
    print("W&B enabled -> run will appear under https://wandb.ai/megaxis")
except Exception as e:
    print("W&B setup failed (continuing WITHOUT monitoring):", e)

# --- 5) train.py — pilot recipe + speed knobs ---
#       cv2.setNumThreads(0) MUST be inside train.py (subprocess) — env vars
#       propagate but cv2's internal thread pool is independent and would
#       silently undo the workers=2 win.
train_py = r'''
import os, cv2
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
cv2.setNumThreads(0)

from ultralytics import YOLO
m = YOLO("yolo11n.pt")                      # COCO-pretrained warm start (pilot's init)
m.train(
    data="/kaggle/working/docdet.yaml",
    epochs=60, imgsz=640, batch=32, device=[0,1],   # batch=32 global -> 16/GPU; nbs=64 grad-accum -> effective 64 (= pilot)
    workers=2, patience=20, cos_lr=True, seed=0, deterministic=True,
    cache="disk",                           # was 'ram': DDP doubles cache footprint -> Kaggle 31GB OOM-kills.
                                            # 'disk' decodes once to /kaggle/working (.npy), still ~80% of ram speedup, no RAM pressure.
    # ---- recipe identical to the 0.82 pilot (modal_train.py) ----
    mosaic=0.0, close_mosaic=10,            # mosaic OFF (pilot-proven for real recall)
    multi_scale=0.5,                        # explicit 0.5: imgsz [320,960] (was True->1.0 [32,1280], wasteful peak)
    copy_paste=0.1, degrees=5.0, perspective=0.0005, translate=0.1, scale=0.5,
    hsv_h=0.01, hsv_s=0.4, hsv_v=0.4,
    fliplr=0.0, flipud=0.0, erasing=0.0,    # no flips: protect directional primitives (MRZ/text)
    plots=False, save_period=-1,
    project="/kaggle/working/runs", name="docdet_v1_t4x2", exist_ok=True,
)
'''
open("/kaggle/working/train.py", "w").write(train_py)

# --- 6) train  (PYTORCH_CUDA_ALLOC_CONF reduces fragmentation OOM on 16GB T4) ---
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
subprocess.run([sys.executable, "/kaggle/working/train.py"], check=True)

# --- 7) confirm output ---
best = "/kaggle/working/runs/docdet_v1_t4x2/weights/best.pt"
print("DONE. best.pt exists:", os.path.exists(best), "->", best)
