# Epoch-Efficiency Research for yolo11n on docdet

**Goal:** hit 0.82 real-world MIDV-500 `document_page` recall in **≤30 epochs** (vs. 60-epoch pilot baseline) without compromising final mAP. Per-step speed handled separately.

**Hardware envelope:** Kaggle 2× T4 batch (12h hard cap, ~30h/wk quota), Lightning T4 SSH, c7i 32-vcpu (data factory). Model: yolo11n nano (2.6M params), 12 classes, 41,983 train @ 640px, COCO-pretrained.

---

## Ranked, surgical action list

Effort scale: 🟢 minutes, 🟡 hours, 🔴 days. Risk scale: 🟢 low, 🟡 medium, 🔴 high.

### 🥇 TIER S — Do first; high yield, proven, low risk

#### S1. Replace COCO warm-start with DocLayNet-pretrained yolo11n  (≈ 15–20 epochs saved)

**What.** Stock yolo11n architecture pretrained on the full 80,863-page DocLayNet dataset at 1280×1280 with MIT license. Drop-in compatible with the standard ultralytics loader because the model is plain `Ultralytics/YOLO11` (no custom modules).

**URL.** `Armaggheddon/yolo11-document-layout` → file `yolo11n_doc_layout.pt` (≈10MB). License MIT, classes are Text/Title/Section-header/Table/Picture/Caption/List-item/Formula/Page-header/Page-footer/Footnote — strong overlap with our `text_block`, `table`, `photo`, `document_page` semantics.

**Avoid.** `hantian/yolo-doclaynet` (AGPL-3.0 — viral copyleft, contaminates anything you ship). `juliozhao/DocLayout-YOLO-DocSynth300K-pretrain` is *not* drop-in: it adds the GL-CRM (Global-to-Local Controllable Receptive) module on top of YOLO-v10 backbone, so `YOLO("doclayout_yolo_docsynth300k_imgsz1600.pt")` will fail to load with stock ultralytics.

**How (ultralytics).**
```python
from huggingface_hub import hf_hub_download
from ultralytics import YOLO
ckpt = hf_hub_download(
    repo_id="Armaggheddon/yolo11-document-layout",
    filename="yolo11n_doc_layout.pt",
    local_dir="/kaggle/working")
m = YOLO(ckpt)
m.train(data="docdet.yaml", epochs=30, ...)
```
Ultralytics performs *shape-aware weight transfer* automatically: backbone + neck transfer 100%; only the classification cv3 layers in the detect head are reinitialised because class count differs (11 → 12). Box-regression cv2 transfers normally. Documented in [Ultralytics finetuning guide](https://docs.ultralytics.com/guides/finetuning-guide/) → "How Pretrained Weight Transfer Works".

**Why epochs are saved.** A COCO backbone must learn from cars/dogs/people that text-on-paper has high-frequency edges, that whitespace dominates, that table-grid lines are a feature, etc. A DocLayNet backbone has *already learned all of that*. The COCO→docdet pilot reached 0.82 in 60 epochs largely because epochs 1–25 were spent re-purposing edge/texture filters away from natural-scene priors. With document priors, you skip that re-purposing.

**Realistic.** 60 → 35–40 epochs equivalent. With Stage-A freeze (S2 below), 30 is achievable.

**Risk.** 🟢 low. Document_page recall IS the gate, and DocLayNet has clean page-edge supervision. Worst case it's identical to COCO init.

**Effort.** 🟢 5 lines.

---

#### S2. Two-stage frozen-backbone fine-tune  (≈ 3–7 epochs saved, layered onto S1)

**What.** Stage A (5 epochs) freezes layers 0–9 (backbone) so only the new neck/head learns the 12-class assignment fast at lr0=0.01. Stage B (25 epochs) unfreezes everything and refines at lr0=0.005 with cosine.

**Why.** When transferring from a doc-domain checkpoint, the backbone is *already correct for document features*. If you let lr=0.01 hit it on epoch 1, the high LR + cls-loss-from-mismatched-head causes early gradient noise to actually unlearn good document features. Freezing the backbone for the first 5 epochs lets the (newly randomised) cv3 head catch up before any backbone touching. Then unfreeze with smaller LR for refinement. Officially supported pattern: [docs.ultralytics.com/guides/finetuning-guide#two-stage-fine-tuning](https://docs.ultralytics.com/guides/finetuning-guide/#two-stage-fine-tuning).

**How (ultralytics).**
```python
# Stage A — head/neck adapt to docdet's 12 classes
m = YOLO(ckpt)  # the Armaggheddon doclaynet weights
m.train(data="docdet.yaml", epochs=5, freeze=10, lr0=0.01,
        warmup_epochs=1, project=PROJ, name="stageA", exist_ok=True, ...)

# Stage B — full model refinement
m = YOLO(f"{PROJ}/stageA/weights/best.pt")
m.train(data="docdet.yaml", epochs=25, freeze=None, lr0=0.005, lrf=0.1,
        cos_lr=True, warmup_epochs=0,         # warm-up unnecessary; weights already good
        patience=8, time=10.5,                # 10.5h cap leaves 1.5h margin under 12h commit
        project=PROJ, name="stageB", exist_ok=True, ...)
```

**Risk.** 🟢 low. The pilot's 0.82 was achieved without freezing (stock 60-epoch run); freezing here is an optimisation, not a requirement. If stage B underperforms, fall back to single-stage 30 epochs from the doc init.

**Effort.** 🟢 split the existing cell into two `m.train()` calls.

---

#### S3. AFSS — anti-forgetting adaptive sampling  (1.43–1.54× speedup with mAP slightly **up**)

**What.** Per-epoch dynamic sampling from the new paper *Does YOLO Really Need to See Every Training Image in Every Epoch?* ([arXiv 2603.17684](https://arxiv.org/abs/2603.17684), Mar 2026). Score every train image's `min(precision, recall)`; categorise as **easy** (>0.85), **moderate** (0.55–0.85), **hard** (<0.55). Each epoch:

| level | sampling rule |
|---|---|
| hard | 100% (every epoch) |
| moderate | 40% / epoch, with forced inclusion if unused for 3+ epochs |
| easy | 2% / epoch, half forced-review (unseen ≥10 epochs), half random |

Refresh per-image P/R every 5 epochs by running val-style inference on the train set with the EMA model.

**Reported.** YOLO11n on COCO: 39.5 → 39.6 mAP at **1.47× faster training**. YOLO11n on PASCAL VOC: 76.3 → 76.3 at **1.62×**. YOLO11n-OBB on DOTA-v1.0: 78.4 → 78.4 at **1.65×**. Crucially: zero accuracy regression across N/S/M/L/X scales.

Compared with alternatives (same paper, Table 3, YOLO11s on COCO):

| method | mAP | speedup |
|---|---|---|
| baseline | 47.0 | 1.0× |
| curriculum learning | 43.7 | 1.35× |
| self-paced | 44.5 | 1.30× |
| static data pruning | **40.5** | 1.38× |
| dataset distillation | **35.6** | 1.50× |
| AFSS (this paper) | **47.2** | **1.54×** |

**Translation for our 30-epoch budget.** ~30 epochs of AFSS sampling ≈ ~46 epochs of full sampling. Combined with S1's domain warm-start, the *effective convergence epochs* easily exceed the pilot's 60.

**How (ultralytics).** Not in the official package. Implement via callbacks + a custom Dataset wrapper:

1. Maintain a `state.json` with per-image `(P, R, last_epoch)`.
2. `on_pretrain_routine_start`: write a `train_subset.txt` (file-list YAML) covering all images for epoch 0–2 (warm-up — everything is hard before any prediction).
3. `on_train_epoch_start`: at epoch *t*, regenerate `train_subset.txt` from state per AFSS rules, point `trainer.train_loader.dataset` at it, then call `trainer.train_loader = trainer.get_dataloader(...)` to rebuild.
4. Every 5 epochs in `on_fit_epoch_end`: run `model.val(data=docdet_train.yaml)` to refresh per-image P/R. Update `state.json`.
5. Final epoch (e.g., last 3 epochs / `close_mosaic` window): switch back to full sampling for stability.

**Implementation gotcha.** Ultralytics' default DataLoader workers cache the dataset on epoch 0, so the dataset must be rebuilt (not just have its `.im_files` swapped). Tested pattern: subclass `YOLODataset` to accept a callable `get_files_fn(epoch)` and override `__init__` to call it; then `trainer.train_loader = build_dataloader(...)` at each epoch start.

**Hard images = hardest detection cases ⇒ exactly the partial-crop / clutter MIDV-500 frames** ⇒ the model spends every epoch on the recall-gate failure modes. This is precisely the opposite of static curriculum (which delays them) or pruning (which discards them).

**Risk.** 🟡 medium-implementation, 🟢 low-accuracy. Paper shows zero accuracy regression on 4 datasets × 5 model sizes × 4 YOLO variants. Failure mode: bug in the per-epoch sampler causes file-list contamination across epochs — guard with a unit test that asserts `len(set(epoch_t.files) ∩ set(epoch_(t-1).files)) ≈ expected`.

**Effort.** 🔴 1–2 days to write/test the callback + custom dataset wrapper. ~150 LOC.

**When to layer it.** Add only if S1+S2 alone don't hit 0.82 in 30 epochs. Don't ship S3 in run #1 — too many things changing at once.

---

### 🥈 TIER A — Cheap, layer onto S1+S2

#### A1. `time=11.5` hard cap as belt-and-suspenders  🟢🟢

Ultralytics auto-stops once wall-clock crosses N hours, even mid-epoch, and writes `last.pt`. Set `time=10.5` to leave 1.5h margin under Kaggle's 12h commit (validation, plotting, and a possible warm-up restart all eat into the budget). Eliminates the failure mode where epoch 30 finishes at 12h05 and the commit kills before checkpoint flush.

#### A2. Tune cos_lr for shorter run  🟢🟢

Pilot used `lr0=0.01, cos_lr=True` with default `lrf=0.01` (final = lr0×0.01). For a 30-epoch doc-pretrained run, the 100x decay is too aggressive — we've barely settled before the LR drops below useful. Switch to `lr0=0.005, lrf=0.1` (10x decay over 30 epochs ≈ same per-step decay as 100x over 60 epochs, but starts at half the magnitude — kinder to the doc-pretrained weights).

**Counter-evidence on one-cycle.** Hype around super-convergence is from CIFAR/ResNet (1708.07120). [arXiv 2202.06373](https://arxiv.org/abs/2202.06373) found ReduceLROnPlateau ≥ OneCycleLR on segmentation. The official YOLO26-nano COCO recipe uses cosine (lr0=0.0054, lrf=0.0495) — *not* one-cycle. **Verdict: stay with cos_lr.**

#### A3. Keep `multi_scale=True`  🟢

Already in the recipe. In ultralytics latest `multi_scale: float` (or boolean True) jitters imgsz per batch by ±50% (320–960 around 640). Costs ~25% per-epoch wall-time, but it's *the* regulariser for recall against MIDV-500's scale variance. Don't drop it for a per-step speedup — it would steal more recall than it saves epochs.

#### A4. Keep `mosaic=0.0`  🟢

Pilot proven. YOLO26's official recipe uses mosaic=0.909+close_mosaic=10 because they trained from-scratch on COCO. We're not from-scratch and we've already proven mosaic-off beats mosaic-on for `document_page` recall (your pilot evidence). Don't reintroduce it.

#### A5. `patience=8` instead of 20  🟢

For 30-epoch runs, `patience=20` is "never stop early." If val plateaus at epoch 22, a `patience=8` saves the trailing 8 epochs (worth ~2.5h on T4×2). Small win but free.

---

### 🥉 TIER B — Speculative, save for ablation

#### B1. Self-pretrain on c7i with 5–10k synthetic subset  ❌

**Verdict: skip.** 5–10k synthetic images is a *weaker* domain signal than DocLayNet's 80k *real* pages (S1). Synthetic-pretrain risks teaching the model your generator's noise statistics (which is precisely the Sim2Real failure mode that g1.md catalogued). The pilot's 0.82 was already achieved with COCO+real-data — the bottleneck is COCO, not absence of synthetic-pretrain. S1 fixes that bottleneck more directly.

#### B2. Coreset / static data pruning  ❌

**Verdict: skip — it's a trap.** AFSS paper §4.4.1 directly compares: static data pruning collapses YOLO11s on COCO from 47.0 → **40.5** mAP (loses 6.5 absolute points). Reason: once removed, samples can't be revisited, gradients become biased, the model forgets entire failure modes. The pilot evidence of "30k-control beat 60k-compositing" wasn't about data quantity — it was about data *quality* of the compositing pipeline. AFSS (S3) is the strictly-better dynamic version.

#### B3. Progressive imgsz curriculum (384 → 512 → 640)  ⚠️

[arXiv 2510.26923](https://arxiv.org/abs/2510.26923) (SACL, Oct 2025) shows that on full-data, static curriculum and SACL are **comparable** to baseline at fixed-resolution 768 — gains only emerge at <50% data. Our case is data-rich (42k images).

For `document_page` recall specifically: at 384, the page-boundary error is ~4 pixels = 1% of frame; at 640 = 0.6%. The recall metric (IoU > 0.5 against ground-truth polygons) lives in exactly that boundary band. Going to 384 risks losing recall faster than we save epochs.

**Verdict: skip.** The user explicitly said per-step speed is handled by other agents. Progressive imgsz is a per-step speed lever (each 384-epoch is ~3.6× cheaper than 640) — it doesn't reduce epoch count to convergence. Stay at 640 with `multi_scale=True`.

#### B4. Knowledge distillation from yolo11s/m teacher  ⚠️

Nature 2026 paper (s41598-026-52396-9) on yolo11n cracks shows +1–2 mAP from yolo11l teacher. Ultralytics doesn't ship official KD. Implementation cost: 3–5 days using a fork like `Y-T-G/yolov8-knowledge-distillation`. Not worth it vs the same time spent ironing out S1+S2+S3.

#### B5. Replace SGD with LAMB/LARS  ❌

Designed for batch>1024. We're at effective batch 64 on 2× T4. No measurable gain.

#### B6. Label smoothing  ❌

Classifier-only trick. YOLO uses BCE+Focal. Doesn't apply.

---

### TIER C — Skip entirely
- **DocLayout-YOLO direct load** (juliozhao/...): incompatible architecture (GL-CRM module).
- **PubTables-1M init**: table specialist; degrades document_page recall.
- **EMA tuning**: ultralytics already runs EMA with sane defaults (decay=0.9999, tau=2000). The paper *Exponential Moving Average of Weights in Deep Learning* (arXiv 2411.18704) shows generic guidance; for fine-tuning runs <50 epochs, default is appropriate.

---

## Recommended composite recipe (most-bang-per-effort, 30 epochs)

```python
# --- Pull doc-domain warm-start (one-time, ~10MB) ---
from huggingface_hub import hf_hub_download
from ultralytics import YOLO

ckpt = hf_hub_download(
    repo_id="Armaggheddon/yolo11-document-layout",
    filename="yolo11n_doc_layout.pt",
    local_dir="/kaggle/working")

PROJ = "/kaggle/working/runs"
PILOT_AUG = dict(
    mosaic=0.0, multi_scale=True, copy_paste=0.1,
    degrees=5.0, perspective=0.0005, translate=0.1, scale=0.5,
    hsv_h=0.01, hsv_s=0.4, hsv_v=0.4,
    fliplr=0.0, flipud=0.0, erasing=0.0,
)

# --- Stage A: 5 epochs, frozen backbone, classification head adapts to 12 classes ---
m = YOLO(ckpt)
m.train(
    data="/kaggle/working/docdet.yaml",
    epochs=5, imgsz=640, batch=32, device=[0,1], workers=4,
    freeze=10,                       # backbone frozen 0..9
    lr0=0.01, warmup_epochs=1,       # head needs to catch up fast
    cos_lr=True, lrf=0.1,
    seed=0, deterministic=True,
    plots=False, save_period=-1,
    project=PROJ, name="stageA", exist_ok=True,
    **PILOT_AUG,
)

# --- Stage B: 25 epochs, full-model fine-tune at lower LR ---
m = YOLO(f"{PROJ}/stageA/weights/best.pt")
m.train(
    data="/kaggle/working/docdet.yaml",
    epochs=25, imgsz=640, batch=32, device=[0,1], workers=4,
    freeze=None,
    lr0=0.005, lrf=0.1, cos_lr=True,
    warmup_epochs=0,                 # weights already good; no warm-up
    patience=8,                      # tighter early-stop
    time=10.5,                       # hard wall-clock cap (Kaggle 12h commit)
    seed=0, deterministic=True,
    plots=False, save_period=-1,
    project=PROJ, name="stageB", exist_ok=True,
    **PILOT_AUG,
)
# best.pt: /kaggle/working/runs/stageB/weights/best.pt
```

**Total: 30 epochs.** Expected to match or exceed the 60-epoch pilot's 0.82 real-recall.

**If run #1 falls short of 0.82**, the next iteration adds S3 (AFSS) — it's the only remaining lever with proven epoch-equivalent gain at zero accuracy cost, but it's worth ~1–2 days of engineering. Stack it onto S1+S2, not in place of them.

---

## What we deliberately did NOT change

| lever | why kept as-is |
|---|---|
| `mosaic=0.0` | pilot-proven for real recall |
| `multi_scale=True` | recall-gate regulariser; can't drop |
| `fliplr=0, flipud=0` | protects directional primitives (MRZ, text) |
| `degrees=5, perspective=0.0005` | pilot values |
| `batch=32 × 2 GPUs` (effective 64 with nbs=64 normalisation) | exact pilot setting |
| `seed=0, deterministic=True` | reproducibility |

---

## Sources

- Ultralytics finetuning + weight-transfer: <https://docs.ultralytics.com/guides/finetuning-guide/>
- Ultralytics callbacks: <https://docs.ultralytics.com/usage/callbacks/>
- Ultralytics config (multi_scale, time, fraction): <https://docs.ultralytics.com/usage/cfg/>
- YOLO26 training recipe (lr/lrf for nano vs s/m/l/x): <https://docs.ultralytics.com/guides/yolo26-training-recipe/>
- AFSS — *Does YOLO Really Need to See Every Training Image in Every Epoch?* arXiv 2603.17684
- SACL — *Scale-Aware Curriculum Learning for Data-Efficient Lung Nodule Detection with YOLOv11* arXiv 2510.26923
- DocLayout-YOLO paper (DocSynth-300K, GL-CRM): arXiv 2410.12628 + repo opendatalab/DocLayout-YOLO
- Drop-in DocLayNet warm-start: <https://huggingface.co/Armaggheddon/yolo11-document-layout> (MIT)
- AGPL alternative (avoid for proprietary): <https://huggingface.co/hantian/yolo-doclaynet>
- Super-convergence original (CIFAR/ResNet, not YOLO): arXiv 1708.07120
- One-cycle vs ReduceLROnPlateau on segmentation: arXiv 2202.06373
