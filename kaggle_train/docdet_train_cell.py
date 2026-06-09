# ============================================================================
#  docdet — YOLOv11n training on Kaggle GPU T4 x2   (VERIFIED cell)
#  BEFORE RUNNING (right panel):
#    1. Add Input -> add  cyberkunju/docdet-v1   (Kaggle auto-extracted the zip)
#    2. Settings  -> Accelerator = "GPU T4 x2"   (NOT P100 — P100 crashes torch)
#    3. Settings  -> Internet = ON
#  THEN: Save Version -> "Save & Run All (Commit)"  (batch on T4x2, ~3-5h,
#  survives disconnect). The asserts below abort in ~10s if anything is wrong.
# ============================================================================
import os, sys, glob, shutil, subprocess

# --- 1) HARDWARE TRIPWIRE: fail fast if not on 2x T4 (P100 can't init torch) ---
import torch
ngpu = torch.cuda.device_count()
gnames = [torch.cuda.get_device_name(i) for i in range(ngpu)]
print("GPUs:", ngpu, gnames)
assert ngpu == 2 and all("T4" in n for n in gnames), \
    f"Expected 2x Tesla T4, got {gnames}. Set Accelerator='GPU T4 x2' and restart the session."

# --- 2) install ultralytics (keeps Kaggle's preinstalled CUDA torch) ---
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "ultralytics==8.4.60"], check=True)
assert torch.cuda.is_available(), "CUDA not available after pip install — abort."

# --- 3) DATA: auto-find the attached dataset under /kaggle/input (robust to slug).
#        /kaggle/input is READ-ONLY and ultralytics writes a label .cache, so copy
#        into writable /kaggle/working.
print("/kaggle/input has:", os.listdir("/kaggle/input") if os.path.isdir("/kaggle/input") else "NOTHING")
DATA = "/kaggle/working/data"
SRC = None
for root, dirs, files in os.walk("/kaggle/input"):
    if os.path.isdir(os.path.join(root, "images", "train")) and \
       os.path.isdir(os.path.join(root, "labels", "train")):
        SRC = root
        break
print("detected SRC:", SRC)
zips = glob.glob("/kaggle/input/**/*.zip", recursive=True)
if SRC:
    print("found dataset at:", SRC)
    if not os.path.isdir(os.path.join(DATA, "images")):
        shutil.copytree(SRC, DATA, dirs_exist_ok=True)
elif zips:
    import zipfile
    print("extracting zip:", zips[0])
    with zipfile.ZipFile(zips[0]) as z:
        z.extractall(DATA)
else:
    raise FileNotFoundError("docdet-v1 not attached. Right panel -> Add Input -> docdet-v1, then re-run.")
# purge any stale ultralytics *.cache copied from the c7i (forces a clean rebuild)
for c in glob.glob(DATA + "/**/*.cache", recursive=True):
    os.remove(c)
for s in ("train", "val", "test"):
    ip, lp = f"{DATA}/images/{s}", f"{DATA}/labels/{s}"
    print(s, "images", len(os.listdir(ip)) if os.path.isdir(ip) else "MISSING",
          "labels", len(os.listdir(lp)) if os.path.isdir(lp) else "MISSING")

# --- 4) dataset.yaml (our own; the copied one has stale absolute paths) ---
names = ['document_page', 'photo', 'signature', 'stamp', 'seal', 'logo',
         'qr_code', 'barcode', 'mrz_zone', 'table', 'checkbox', 'text_block']
yml = f"path: {DATA}\ntrain: images/train\nval: images/val\ntest: images/test\nnames:\n"
yml += "".join(f"  {i}: {n}\n" for i, n in enumerate(names))
open("/kaggle/working/docdet.yaml", "w").write(yml)
print(yml)

# --- 4.5) W&B live monitoring (BEST-EFFORT: a W&B failure must NEVER block training) ---
#   Env + ultralytics setting are inherited by the train.py subprocess, so it auto-logs.
try:
    os.environ["WANDB_API_KEY"] = "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"
    os.environ["WANDB_PROJECT"] = "docdet"
    os.environ["WANDB_NAME"] = "docdet_v1_t4x2"
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "wandb"], check=True)
    import wandb
    wandb.login(key=os.environ["WANDB_API_KEY"])
    from ultralytics import settings as _uls
    _uls.update({"wandb": True})
    print("W&B enabled -> https://wandb.ai/megaxis/docdet")
except Exception as e:
    print("W&B setup failed (continuing WITHOUT monitoring):", e)

# --- 5) train.py — EXACT recipe that scored 0.82 on MIDV-500 (pilot control) ---
#        run as a subprocess so ultralytics DDP spawns cleanly across both T4s.
train_py = r'''
from ultralytics import YOLO
m = YOLO("yolo11n.pt")                      # COCO-pretrained warm start
m.train(
    data="/kaggle/working/docdet.yaml",
    epochs=60, imgsz=640, batch=64, device=[0,1],   # batch is GLOBAL -> 32/GPU = pilot's 64
    workers=4, patience=20, cos_lr=True, seed=0, deterministic=True,
    # ---- recipe identical to the 0.82 pilot (modal_train.py) ----
    mosaic=0.0, close_mosaic=10,            # mosaic OFF (pilot-proven for real recall)
    multi_scale=True,                       # scale robustness -> drives document_page recall
    copy_paste=0.1, degrees=5.0, perspective=0.0005, translate=0.1, scale=0.5,
    hsv_h=0.01, hsv_s=0.4, hsv_v=0.4,
    fliplr=0.0, flipud=0.0, erasing=0.0,    # no flips: protect directional primitives (MRZ/text)
    plots=False, save_period=-1,
    project="/kaggle/working/runs", name="docdet_v1_t4x2", exist_ok=True,
)
'''
open("/kaggle/working/train.py", "w").write(train_py)

# --- 6) train ---  (if DDP ever errors, change device=[0,1] -> device=0 above)
subprocess.run([sys.executable, "/kaggle/working/train.py"], check=True)

# --- 7) confirm output ---
best = "/kaggle/working/runs/docdet_v1_t4x2/weights/best.pt"
print("DONE. best.pt exists:", os.path.exists(best), "->", best)
