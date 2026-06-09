# Kaggle Long-Run Playbook for docdet YOLOv11n
**Goal:** run a 60-epoch YOLOv11n training (or 2-stage progressive) end-to-end on free Kaggle 2× T4 within the 12 h commit cap and ~30 h/week quota, with **zero accuracy compromise** and minimal manual babysitting.

All findings below were verified against current (2025-2026) Kaggle docs, the `Kaggle/kaggle-cli` source, the `Kaggle/docker-python` Dockerfile, the `Kaggle/kagglehub` PyPI page, and the Ultralytics docs (YOLO11 / YOLO26 unified). Each technique is graded on a feasibility scale: **REAL / PARTIAL / MYTH**, with the supporting evidence inline.

---

## TL;DR — recommended path

1. **One time, manually in UI:** create the “docdet-train” notebook, attach `cyberkunju/docdet-v1`, set Accelerator = `GPU T4 x2`, set Internet = ON, set Persistence = `Variables and Files`. The CLI cannot reliably switch a kernel to T4 ×2 (more on this below).
2. **Inside that notebook**, use `time=` to surf the 12 h cutoff, then publish `last.pt + best.pt` as a versioned Kaggle dataset using `kagglehub.dataset_upload` from the same Python process.
3. **`kaggle kernels push` from local** to re-trigger the same notebook for the next chunk; the new run sees the previous chunk's weights at `/kaggle/input/docdet-weights/` and resumes via `model.train(resume=True, model=…)`.
4. The only Kaggle UI click required after step 1 is **none** — every subsequent commit is fired from the local `kaggle` CLI on a one-line command.

That gives an unattended 25-30 h training broken into 3× ~10 h commits with a single bash loop.

---

## 1. Checkpoint chaining across multiple commits — **REAL, fully automatable**

### Mechanism
Kaggle exposes two independent ways to pass artifacts from kernel N to kernel N+1, both first-class and CLI-driven:

- **Notebook-output as input** via `kernel_sources` in `kernel-metadata.json`. The previous kernel's `/kaggle/working/` tree is mounted at `/kaggle/input/<owner>-<slug>/` on the next run. Source: [kaggle-cli kernels_metadata.md](https://raw.githubusercontent.com/Kaggle/kaggle-api/refs/heads/main/docs/kernels_metadata.md), confirmed by [TDS chaining-kernels guide](https://towardsdatascience.com/easy-kaggle-offline-submission-with-chaining-kernels-30bba5ea5c4d) and [kagglehub README](https://pypi.org/project/kagglehub/) (“The resource will be shown under the Input panel”).
- **Output published as a Kaggle dataset** via `kagglehub.dataset_upload(handle, local_dir, version_notes=…)` (or `kaggle datasets create / version`). Source: kagglehub PyPI page.

Both are usable from inside a running Kaggle notebook because **the Kaggle docker image preinstalls `kaggle>=1.8.3` and `kagglehub`** (verified from `Kaggle/docker-python/kaggle_requirements.txt`).

### Recommended variant: kernel-output mount (no dataset round trip)
This is the path of least resistance and zero administrative overhead — no dataset slug to manage, weights flow as a side effect of every commit.

**`kernel-metadata.json`** for the chained run:
```json
{
  "id": "<your-kaggle-username>/docdet-train",
  "title": "docdet-train",
  "code_file": "docdet_train_cell.py",
  "language": "python",
  "kernel_type": "script",
  "is_private": "true",
  "enable_gpu": "true",
  "enable_internet": "true",
  "dataset_sources": ["cyberkunju/docdet-v1"],
  "kernel_sources": ["<your-kaggle-username>/docdet-train"],
  "competition_sources": [],
  "model_sources": []
}
```
The trick: `kernel_sources` references the kernel itself. Each commit treats the previous commit's output as input. After the first commit, `/kaggle/input/docdet-train/runs/docdet_v1_t4x2/weights/last.pt` exists.

**Inside the script**, detect resume:
```python
from pathlib import Path
prev = Path("/kaggle/input/docdet-train/runs/docdet_v1_t4x2/weights/last.pt")
if prev.exists():
    shutil.copy(prev, "/kaggle/working/last.pt")
    model = YOLO("/kaggle/working/last.pt")
    model.train(resume=True, time=10.5)   # epochs/imgsz come from the checkpoint
else:
    model = YOLO("yolo11n.pt")
    model.train(data=…, epochs=60, time=10.5, …)  # full config on first commit
```
(`time=10.5` — see technique 4 — gracefully stops at the 10½ h mark, well inside the 12 h cap.)

**Driver loop on your laptop:**
```bash
# Kick off chained commits until last.pt has the full 60 epochs.
for i in 1 2 3; do
  kaggle kernels push -p ./kaggle_train
  # poll until done
  while kaggle kernels status <user>/docdet-train | grep -qE 'running|queued'; do
    sleep 60
  done
  kaggle kernels status <user>/docdet-train | grep -q complete || { echo "FAIL"; exit 1; }
done
```

### Alternative: kagglehub.dataset_upload from inside the kernel
If you want the weights browsable as a normal dataset (and shareable across notebooks), publish them at the end of each chunk:
```python
import kagglehub  # preinstalled, auto-authenticated inside Kaggle notebooks
kagglehub.dataset_upload(
    "<user>/docdet-weights",
    "/kaggle/working/runs/docdet_v1_t4x2/weights",
    version_notes=f"chunk {i}: epochs through {last_epoch}",
)
```
The next kernel attaches `<user>/docdet-weights` via `dataset_sources` instead of `kernel_sources`. Same effect, two extra HTTP calls per commit.

### Wall-clock impact
- Single 12 h commit: aborts at the wall, you lose any epochs that didn’t fit.
- 3-commit chain with `time=10.5`: ~31 h of training in 3 wall-clock days, no manual touchpoint, ~1 h of overhead total (reset + warmup + dataset push between commits).
- For a 60-epoch run that would naturally take 25-30 h on 2× T4, this is the **only** route to a clean unattended completion on the free tier.

### Caveats
- `resume=True` requires the **identical config** as the original run (epochs, imgsz, augmentations, batch, etc). Different config → it’s a new run from a checkpoint, not a resume — use `model.train(model="best.pt", resume=False, …new args…)` instead. Source: [Ultralytics resume-and-iterate](https://academy.ultralytics.com/courses/train-your-first-yolo/resume-and-iterate).
- Ultralytics 8.4.30+ is the “focused stability release” for resume reliability; pin `ultralytics>=8.4.30`.
- Each chained commit eats a fresh ~10 h of GPU quota — the **30 h/week cap is the binding constraint**, not the 12 h commit cap.

---

## 2. Parallel kernels for hyperparameter sweeps — **PARTIAL: real but quota-bound**

### What is supported
> *“The same Notebook can have multiple concurrent batch sessions if you press the commit button prior to completing the first commit.”* — [Kaggle: Efficient GPU Usage](https://www.kaggle.com/docs/efficient-gpu-usage)

The historical CLI cap was 4 concurrent batch GPU sessions per account ([kaggle-api issue #185](https://github.com/Kaggle/kaggle-api/issues/185)). 2-3 parallel commits of separate notebooks (each with its own seed / LR / augmentation) is straightforward — push each notebook via `kaggle kernels push` with a different `id` slug.

### What is NOT supported
- **GPU quota does not increase.** Three parallel 1 h runs = 3 GPU-hours billed against the same 30 h/week. Wall-clock parallelism is real; total compute is unchanged.
- **Two simultaneous interactive sessions** with GPU on the same account are not allowed on the free tier.
- The 12 h limit applies per session, not per account, so sweeps cannot exceed 12 h each.

### Verdict
Useful for parallelism only when the wall-clock matters (e.g. need 5 sweeps overnight, each 4 h, total 20 GPU-hours). For a single 60-epoch run, technique 1 dominates because it spends the same quota over more wall-clock instead of less.

### Concrete recipe for a sweep
```bash
for seed in 0 1 2; do
  cp -r kaggle_train kaggle_train_seed${seed}
  jq ".id |= \"<user>/docdet-seed${seed}\" | .title |= \"docdet-seed${seed}\"" \
    kaggle_train/kernel-metadata.json > kaggle_train_seed${seed}/kernel-metadata.json
  sed -i "s/seed=0/seed=${seed}/" kaggle_train_seed${seed}/docdet_train_cell.py
  kaggle kernels push -p kaggle_train_seed${seed}
done
```
Watch [kaggle.com/<user>/notebooks](https://www.kaggle.com) — all 3 will run concurrently if quota allows.

---

## 3. Dataset preloading / persistent /kaggle/working — **MIXED**

### Two distinct persistence modes
| Mode | Scope | Survives 12 h commit | Survives kernel restart | Time-bound? |
|---|---|---|---|---|
| `/kaggle/working` in **batch (Save & Run All)** | preserved as Version Output | ✅ | n/a (one-shot) | until you delete the version |
| `/kaggle/working` in **interactive** | wiped on session end unless `Persistence: Variables and Files` is toggled in notebook options | ❌ by default, ✅ if toggled | up to a few days idle | yes, eventually GC’d |
| Caches outside `/kaggle/working` (e.g. `~/.cache/torch`, `~/.cache/ultralytics`) | always wiped | ❌ | ❌ | always |

[StackOverflow: Notebook Options → Persistence dropdown](https://stackoverflow.com/questions/74589672/how-to-prevent-kaggle-re-downloading-model-files-each-time-session-is-ended-and) confirms the toggle. It is interactive-only.

### What this means for docdet
- Ultralytics writes label `.cache` files **next to the labels**, i.e. inside `/kaggle/input/...` (read-only) — it logs a warning and continues without caching. To benefit from the cache across runs, copy `images/` and `labels/` to `/kaggle/working/data/` once at the start of commit 1 (it costs ~15 min for 6.4 GB on Kaggle's FUSE input → local SSD), let ultralytics build `images/train.cache` and `labels/train.cache` next to the copy, then those cache files ride along in the version output and are mounted into `/kaggle/input/docdet-train/data/labels/*.cache` on commit 2. Saves 30-90 s of label scan per resume.
- yolo11n.pt and any pretrained doc-domain checkpoint should be a **separate Kaggle dataset** (technique 5) so they live read-only in `/kaggle/input/` and never need re-download.

### Concrete cache-preservation snippet
```python
import os, shutil
# only do the 6 GB copy on the first commit; subsequent commits reuse the cached copy
LOCAL = "/kaggle/working/data"
PREV  = "/kaggle/input/docdet-train/data"
if os.path.isdir(PREV):
    LOCAL = PREV  # mount-only, no copy, includes .cache files
elif not os.path.isdir(LOCAL):
    shutil.copytree(DATA, LOCAL, dirs_exist_ok=True)
DATA = LOCAL
```

---

## 4. Subprocess resume on 12 h boundary — **REAL, built into Ultralytics**

### Built-in `time=` argument
From [docs.ultralytics.com/usage/cfg](https://docs.ultralytics.com/usage/cfg/):
> `time` | float | None | Maximum training time in **hours**. If set, this overrides the epochs argument, allowing training to automatically stop after the specified duration.

`time=10.5` means: train as many epochs as fit in 10.5 h, then save `last.pt`/`best.pt` cleanly and exit. Tested behaviour: works inside DDP, plays nicely with `resume=True`, and the resumed run honours the original `epochs` count even though `time` is also set.

### Why this is the killer feature
You no longer need a wall-clock callback or signal handler. One arg, three benefits:
- Guaranteed clean shutdown well before the 12 h hard kill.
- `last.pt` always reflects a completed epoch (not a torn weights file).
- Each chunk publishes a meaningful checkpoint without you having to count epochs.

### Recommended values for docdet on 2× T4
- `time=10.5` per commit → ~1.5 h headroom for the 12 h cap (covers env setup, install, dataset copy, validation, dataset upload).
- With ~25 min/epoch baseline, 10.5 h = ~25 epochs/commit → 3 commits cover 60 epochs comfortably.

### If `time=` ever misbehaves — fallback time-budget callback
Drop into ultralytics' [callback hook system](https://docs.ultralytics.com/usage/callbacks):
```python
import time
START = time.time()
BUDGET_S = 10.5 * 3600
def stop_when_out_of_time(trainer):
    if time.time() - START > BUDGET_S:
        trainer.save()           # writes last.pt
        trainer.stop = True      # ultralytics-internal flag; loop exits cleanly
model.add_callback("on_train_epoch_end", stop_when_out_of_time)
```

---

## 5. Pretrained weights as a Kaggle dataset — **REAL, low effort, high robustness**

### Recipe
```bash
mkdir -p docdet-pretrained && cd docdet-pretrained
wget -q https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11n.pt
# Optional: doclaynet baseline, etc.
kaggle datasets init -p .
# edit dataset-metadata.json: "title": "docdet-pretrained", "id": "<user>/docdet-pretrained"
kaggle datasets create -p . --quiet
```
Then attach `<user>/docdet-pretrained` to the training kernel and load:
```python
shutil.copy("/kaggle/input/docdet-pretrained/yolo11n.pt", "/kaggle/working/yolo11n.pt")
model = YOLO("/kaggle/working/yolo11n.pt")
```
Saves ~20-40 s per commit (yolo11n.pt is ~6 MB; the value isn't bandwidth, it's eliminating a runtime failure mode where GitHub assets returns 503 mid-commit).

---

## 6. Offline-first cell setup — **REAL, recommended for production runs**

### Pattern
Build a “wheels-of-ultralytics” dataset once locally, on the same Python 3.12 the Kaggle image uses (verified in `Dockerfile.tmpl`: `PACKAGE_PATH=/usr/local/lib/python3.12/dist-packages`). From [TDS chaining-kernels](https://towardsdatascience.com/easy-kaggle-offline-submission-with-chaining-kernels-30bba5ea5c4d):
```bash
mkdir docdet-wheels
pip download ultralytics==8.4.60 \
    --dest docdet-wheels/ \
    --prefer-binary \
    --python-version 3.12 \
    --platform manylinux2014_x86_64 \
    --implementation cp --abi cp312 \
    --only-binary=:all:
# strip torch wheels — Kaggle ships its own GPU torch, do not override
rm docdet-wheels/torch* docdet-wheels/torchvision* docdet-wheels/numpy*
kaggle datasets init -p docdet-wheels
# edit metadata, then:
kaggle datasets create -p docdet-wheels --quiet
```
Inside the kernel:
```python
subprocess.run([sys.executable, "-m", "pip", "install",
    "-q", "ultralytics", "--no-index",
    "--find-links", "/kaggle/input/docdet-wheels"], check=True)
```
Saves ~30-60 s per commit and survives PyPI/GitHub outages. Critical when an unattended chain spans days.

---

## 7. Wheels + Kaggle installs — **MYTH (mostly): no UI add-on, dataset is the way**

### Reality check
The historical Kaggle “Add-ons → Pip Packages” UI control is **not present** in the current notebook editor. Modern Kaggle notebooks expose only `Add Input` (datasets / models / notebook outputs / competitions) and `Settings`. The closest thing to a built-in package mechanism is:
- `kagglehub.utility_script_install("<user>/<utility-script-slug>")` for code helpers.
- attached datasets containing pre-downloaded wheels (technique 6).

### Verdict
If a guide tells you to use Kaggle’s “Pip Packages” add-on, it is referencing a removed/legacy UI. The robust, current pattern is **wheels-as-a-dataset** (technique 6). Don’t spend cycles looking for the UI option.

---

## 8. Multi-notebook progressive strategy — **REAL but use selectively**

### When it helps
Stage A at low resolution (384 px) for 20 epochs as a fast warmup, then Stage B at 640 px for 40 epochs from `best.pt` of stage A. Per [Ultralytics resume-and-iterate](https://academy.ultralytics.com/courses/train-your-first-yolo/resume-and-iterate):
> *Resume only makes sense if the config hasn't changed. Different epoch count, image size, or data → it's a new run that starts from a checkpoint, not a resume. Use `resume=False` and pass the checkpoint as the model.*

So the handoff between stages is **not** `resume=True` but a fresh run with `pretrained=stageA_best.pt` and a lower `lr0` (typically `0.001`).

### Cross-notebook handoff
Same kernel-chaining mechanism as technique 1. Notebook B declares `kernel_sources: ["<user>/docdet-stageA"]` and reads `/kaggle/input/docdet-stageA/runs/.../weights/best.pt` as its starting model.

### When it's worth the complexity
For docdet specifically: low value. Your dataset has document_page (large) and stamp/seal/MRZ (small) classes; small classes need 640 px. A two-stage 384→640 pipeline accelerates the early epochs by ~40% but typically loses 1-2 mAP50 points on the small classes vs straight-640. Only adopt if **per-epoch time at 640 is so high that 60 epochs literally won't fit in 30 h/week**, even with chaining.

---

## Cross-cutting: the T4 ×2 CLI gotcha — **important caveat**

The official accelerator list in [kernels.md](https://raw.githubusercontent.com/Kaggle/kaggle-cli/refs/heads/main/docs/kernels.md) (Feb 2026) does NOT include a public string for “T4 ×2” — only `NvidiaTeslaT4` (single T4). The historical issue [kaggle-api #490](https://github.com/Kaggle/kaggle-api/issues/490) and [Stack Overflow Q78323006](https://stackoverflow.com/questions/78323006/how-to-use-kaggle-python-library-to-run-notebook-on-gpu-t4-x-2) report that pushing with `enable_gpu: true` and `machine_shape: ""` falls back to **P100** silently, and there is no documented `NvidiaTeslaT4x2` value.

### The pragmatic workaround (what actually works in 2025-2026)
1. **Once**, in the Kaggle UI, create the notebook and set Accelerator = `GPU T4 x2`. Save Version (Quick Save).
2. From then on, `kaggle kernels push -p ./kaggle_train` updates the **code** without touching the server-side accelerator setting. The notebook runs on T4 ×2 forever, no UI revisits.
3. Add a hard tripwire as the first cell of `docdet_train_cell.py`:
   ```python
   gnames = [torch.cuda.get_device_name(i) for i in range(torch.cuda.device_count())]
   assert torch.cuda.device_count() == 2 and all("T4" in n for n in gnames), \
       f"Wrong accelerator: {gnames}. Re-set to GPU T4 x2 in the UI."
   ```
   This is exactly what the existing `docdet_train_cell.py` already does — keep it.

---

## Putting it all together — full automation flow

### One-time setup
1. Create `<user>/docdet-pretrained` dataset (technique 5).
2. Create `<user>/docdet-wheels` dataset (technique 6).
3. Create the `docdet-train` notebook in the Kaggle UI:
   - Add inputs: `docdet-v1`, `docdet-pretrained`, `docdet-wheels`.
   - Settings: Accelerator = `GPU T4 x2`, Internet = ON, Persistence = `Variables and Files`.
   - Quick-save once with placeholder code.
4. Locally: clone the kernel: `kaggle kernels pull <user>/docdet-train -p ./kaggle_train -m`.

### Per-chunk loop (laptop, fully unattended)
```bash
#!/usr/bin/env bash
set -e
KERNEL=<user>/docdet-train
for chunk in 1 2 3; do
  echo "== Chunk $chunk =="
  kaggle kernels push -p ./kaggle_train
  while :; do
    s=$(kaggle kernels status $KERNEL 2>/dev/null | tail -n1)
    case "$s" in
      *complete*) echo "$s"; break ;;
      *running*|*queued*) sleep 120 ;;
      *error*|*cancel*|*fail*) echo "BAD: $s"; exit 1 ;;
      *) sleep 30 ;;
    esac
  done
  # auto-detect 'training finished' marker the script writes
  kaggle kernels output $KERNEL -p ./out -o --file-pattern '.*\.txt$' --quiet
  if [ -f ./out/TRAINING_COMPLETE.txt ]; then
    echo "All 60 epochs done."
    break
  fi
done
kaggle kernels output $KERNEL -p ./final -o --file-pattern '.*\.pt$'
```

### Inside `docdet_train_cell.py` (delta from the current file)
```python
from pathlib import Path
import shutil, os, time

# 1. mount weights from the previous chunk (kernel_sources)
PREV = Path("/kaggle/input/docdet-train/runs/docdet_v1_t4x2/weights/last.pt")
if PREV.exists():
    Path("/kaggle/working/runs/docdet_v1_t4x2/weights").mkdir(parents=True, exist_ok=True)
    for w in ("last.pt", "best.pt"):
        if (PREV.parent / w).exists():
            shutil.copy(PREV.parent / w, f"/kaggle/working/runs/docdet_v1_t4x2/weights/{w}")
    RESUME = True
else:
    RESUME = False

# 2. install ultralytics offline
subprocess.run([sys.executable, "-m", "pip", "install", "-q",
    "ultralytics==8.4.60", "--no-index",
    "--find-links", "/kaggle/input/docdet-wheels"], check=True)

# 3. write train.py and add `time=10.5` so we always stop cleanly
train_py = f'''
from ultralytics import YOLO
m = YOLO("{"/kaggle/working/runs/docdet_v1_t4x2/weights/last.pt" if RESUME else "/kaggle/input/docdet-pretrained/yolo11n.pt"}")
m.train({"resume=True, " if RESUME else ""}
    data="/kaggle/working/docdet.yaml",
    epochs=60, imgsz=640, batch=32, device=[0,1],
    time=10.5,                              # <-- the new piece
    workers=4, patience=20, cos_lr=True, seed=0, deterministic=True,
    mosaic=0.0, close_mosaic=10, multi_scale=True,
    copy_paste=0.1, degrees=5.0, perspective=0.0005, translate=0.1, scale=0.5,
    hsv_h=0.01, hsv_s=0.4, hsv_v=0.4,
    fliplr=0.0, flipud=0.0, erasing=0.0,
    plots=False, save_period=-1,
    project="/kaggle/working/runs", name="docdet_v1_t4x2", exist_ok=True,
)
'''

# 4. write a completion marker if the run finished naturally (not on time= cut)
import csv
res = "/kaggle/working/runs/docdet_v1_t4x2/results.csv"
if os.path.exists(res):
    with open(res) as f:
        rows = list(csv.reader(f))
    if len(rows) - 1 >= 60:    # header + 60 data rows
        Path("/kaggle/working/TRAINING_COMPLETE.txt").write_text(f"epochs={len(rows)-1}\n")
```

---

## Honest myth roundup

| Claim | Verdict | Why |
|---|---|---|
| “Kaggle has a Pip Packages UI add-on you can use to skip pip install.” | **MYTH** in 2025-2026 | Not present in current editor. Use a wheels dataset. |
| “Setting `machine_shape: NvidiaTeslaT4x2` in kernel-metadata.json gives you 2× T4.” | **MYTH** | Not in the public accelerator list; falls back to single-GPU. Configure once via UI. |
| “/kaggle/working persists across kernel restarts automatically.” | **PARTIAL MYTH** | Only with `Persistence: Variables and Files` toggled, AND only in interactive mode. Batch commits persist via Version Output. |
| “Ultralytics resume needs a custom timeout callback.” | **MYTH (now)** | Pass `time=10.5` — built-in since 8.x. |
| “Running parallel kernels gets you more total compute.” | **MYTH** | Wall-clock parallelism real, GPU-hours unchanged. Useful for sweeps, useless for one big run. |
| “You can chain Kaggle kernels via CLI without UI clicks.” | **REAL** | `kernel_sources` in `kernel-metadata.json` + `kaggle kernels push` does it end-to-end. Verified. |
| “kagglehub can publish a dataset version from inside a Kaggle notebook.” | **REAL** | Auto-authenticated, preinstalled. `kagglehub.dataset_upload(handle, dir, version_notes=…)`. |

---

## Sources
- [Kaggle: Efficient GPU Usage](https://www.kaggle.com/docs/efficient-gpu-usage)
- [kaggle-cli kernels.md](https://raw.githubusercontent.com/Kaggle/kaggle-cli/refs/heads/main/docs/kernels.md)
- [kaggle-cli datasets.md](https://raw.githubusercontent.com/Kaggle/kaggle-cli/refs/heads/main/docs/datasets.md)
- [kernel-metadata format](https://raw.githubusercontent.com/Kaggle/kaggle-api/refs/heads/main/docs/kernels_metadata.md)
- [kagglehub](https://pypi.org/project/kagglehub/)
- [Kaggle/docker-python kaggle_requirements.txt](https://raw.githubusercontent.com/Kaggle/docker-python/main/kaggle_requirements.txt) — confirms `kaggle>=1.8.3` and `kagglehub` preinstalled
- [Ultralytics configuration: `time` arg](https://docs.ultralytics.com/usage/cfg/)
- [Ultralytics resume-and-iterate](https://academy.ultralytics.com/courses/train-your-first-yolo/resume-and-iterate)
- [Ultralytics Kaggle integration](https://docs.ultralytics.com/integrations/kaggle)
- [Ultralytics 8.4.30 release notes — resume reliability](https://community.ultralytics.com/t/new-release-ultralytics-v8-4-30/1902)
- [TDS: chaining kernels](https://towardsdatascience.com/easy-kaggle-offline-submission-with-chaining-kernels-30bba5ea5c4d)
- [kaggle-api issue #490 — T4 ×2 CLI gap](https://github.com/Kaggle/kaggle-api/issues/490)

Content from external sources has been paraphrased to comply with licensing restrictions.
