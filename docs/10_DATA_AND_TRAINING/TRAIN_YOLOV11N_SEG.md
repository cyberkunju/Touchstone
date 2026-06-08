# Train YOLOv11n Segmentation — Edge DocGraph Engine

**Purpose:** Provide training instructions for YOLOv11n-seg if selected after segmentation bucket trials.

---

## 1. Segmentation role

Segmentation refines visual assets.

Targets:

- photo
- signature
- stamp
- seal
- logo
- emblem
- flag
- symbol

Segmentation should not run full-page by default. It should refine detected/proposed asset regions.

---

## 2. Selection status

YOLOv11n-seg is in the project bucket as the recommended practical segmentation candidate unless benchmarks prove another candidate better.

Alternatives in bucket:

- EfficientSAM
- SlimSAM
- YOLOv11n-seg

Selection criteria:

- edge latency
- ONNX/browser compatibility
- mask IoU
- crop quality
- memory use
- asset recall
- correction effort reduction

---

## 3. Dataset format

Use Ultralytics YOLO segmentation format.

Directory:

```text
datasets/docseg_v0/
  dataset.yaml
  images/
    train/
    val/
    test/
  labels/
    train/
    val/
    test/
```

Label line format is class ID plus polygon points.

Conceptually:

```text
class_id x1 y1 x2 y2 x3 y3 ...
```

Coordinates normalized.

---

## 4. dataset.yaml

Example:

```yaml
path: datasets/docseg_v0
train: images/train
val: images/val
test: images/test

names:
  0: photo
  1: signature
  2: stamp
  3: seal
  4: logo
  5: emblem
  6: flag
  7: symbol
```

Keep segmentation class list smaller than detector class list.

---

## 5. Mask annotation rules

See `ANNOTATION_GUIDE.md`.

Quick rules:

- photo: full photo region or actual visual image region, depending policy
- signature: visible stroke pixels
- stamp/seal: visible ink/mark
- logo/emblem/flag/symbol: visible graphic area
- do not mask unrelated text/background
- uncertain masks require review

---

## 6. Smoke training

```bash
yolo segment train \
  model=yolo11n-seg.pt \
  data=datasets/docseg_v0/dataset.yaml \
  epochs=3 \
  imgsz=640 \
  batch=8 \
  project=training_runs \
  name=docseg_v0_smoke
```

Smoke test checks:

- labels load,
- polygons valid,
- masks render,
- classes correct,
- validation runs.

---

## 7. Baseline training

```bash
yolo segment train \
  model=yolo11n-seg.pt \
  data=datasets/docseg_v0/dataset.yaml \
  epochs=100 \
  imgsz=640 \
  batch=16 \
  patience=20 \
  project=training_runs \
  name=docseg_v0_yolo11nseg
```

Adjust batch size based on GPU memory.

---

## 8. Validation

```bash
yolo segment val \
  model=training_runs/docseg_v0_yolo11nseg/weights/best.pt \
  data=datasets/docseg_v0/dataset.yaml \
  imgsz=640 \
  project=training_runs \
  name=docseg_v0_val
```

Track:

- mask mAP
- box mAP
- per-class recall
- per-class precision
- mask IoU on asset crops
- failure examples

---

## 9. Asset-specific metrics

The project cares about extraction quality more than pure segmentation leaderboard metrics.

Measure:

- mask IoU
- crop IoU
- asset recall
- crop completeness
- false crop inclusion
- user crop correction rate
- latency per asset
- memory per asset

A mask is useful only if it improves the form/asset extraction experience.

---

## 10. Hard cases

Include:

- faded signatures
- stamps over text
- low-opacity seals
- logo near text
- portrait with glare
- partial crop
- compression artifacts
- overlapping assets
- handwritten noise

---

## 11. Export to ONNX

```bash
yolo export \
  model=training_runs/docseg_v0_yolo11nseg/weights/best.pt \
  format=onnx \
  imgsz=640 \
  opset=17 \
  simplify=True
```

Then test:

- output mask shape
- mask postprocessing
- crop coordinate mapping
- browser/WebGPU/WASM performance
- memory stability

---

## 12. Runtime policy

Segmentation runtime policy:

```text
detector finds asset
  → crop around asset
  → segmentation refines crop if needed
```

Do not:

- run full-page segmentation by default,
- segment every text block,
- load segmentation model on startup.

---

## 13. Acceptance gates

Accept YOLOv11n-seg only if:

- masks improve asset extraction,
- latency acceptable,
- memory acceptable,
- ONNX export works,
- browser runtime works,
- user correction effort decreases,
- false masks do not harm template learning.

If not, use detector crop only and keep segmentation experimental.

---

## 14. Model package

```text
models/docseg/yolov11n-docseg-v0/
  model.onnx
  classes.json
  metadata.json
  metrics.json
  mask_examples/
```

---

## 15. References

- Ultralytics segmentation tasks: https://docs.ultralytics.com/tasks/segment/
- Ultralytics segmentation dataset format: https://docs.ultralytics.com/datasets/segment/
- Ultralytics export mode: https://docs.ultralytics.com/modes/export/

---

## 16. Final rule

Segmentation is accepted only if it materially improves asset extraction on edge devices. It must be conditional, auditable, and never allowed to dominate runtime memory.
