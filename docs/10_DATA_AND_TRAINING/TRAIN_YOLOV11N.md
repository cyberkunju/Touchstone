# Train YOLOv11n Document Detector — Edge DocGraph Engine

**Purpose:** Provide exact training instructions for the YOLOv11n document object detector, including dataset format, class config, training command, evaluation, export, and acceptance gates.

---

## 1. Model role

YOLOv11n document detector finds document regions and objects:

- document page
- photo
- signature
- stamp/seal/logo/emblem
- QR/barcode
- MRZ
- table
- checkbox
- text block
- optional field labels/values

It does not read text or confirm fields.

---

## 2. Pinned detector choice

Project-pinned detector:

```text
YOLOv11n document detector
```

Do not replace with newer Ultralytics models unless:

- decision log updated,
- benchmark comparison completed,
- ONNX/browser runtime tested,
- class compatibility reviewed,
- model license/distribution reviewed,
- edge performance acceptable.

---

## 3. Dataset format

Use Ultralytics YOLO detection format.

Directory:

```text
datasets/docdet_v0/
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

YOLO label line:

```text
class_id x_center y_center width height
```

All coordinates normalized.

---

## 4. dataset.yaml

Example for v0 classes:

```yaml
path: datasets/docdet_v0
train: images/train
val: images/val
test: images/test

names:
  0: document_page
  1: photo
  2: signature
  3: stamp
  4: seal
  5: logo
  6: qr_code
  7: barcode
  8: mrz_zone
  9: table
  10: checkbox
  11: text_block
```

---

## 5. Environment setup

Create Python environment:

```bash
python -m venv .venv
source .venv/bin/activate
pip install ultralytics
```

Record exact versions:

```bash
python --version
pip freeze > training_runs/docdet_v0/requirements.lock.txt
```

---

## 6. Smoke test

Before full training:

```bash
yolo detect train \
  model=yolo11n.pt \
  data=datasets/docdet_v0/dataset.yaml \
  epochs=3 \
  imgsz=640 \
  batch=8 \
  project=training_runs \
  name=docdet_v0_smoke
```

Smoke test must verify:

- dataset loads,
- labels parsed,
- class names correct,
- training does not crash,
- validation runs,
- sample predictions visible.

---

## 7. Baseline training command

```bash
yolo detect train \
  model=yolo11n.pt \
  data=datasets/docdet_v0/dataset.yaml \
  epochs=100 \
  imgsz=640 \
  batch=16 \
  patience=20 \
  project=training_runs \
  name=docdet_v0_yolo11n
```

Adjust batch based on GPU memory.

---

## 8. Recommended training iterations

### Run A — baseline

- imgsz 640
- default augmentations
- v0 classes

### Run B — document augment tuning

- moderate blur/perspective/compression in dataset
- compare hard test performance

### Run C — small object focus

- higher imgsz if edge budget allows
- check QR/checkbox/MRZ recall

### Run D — class balancing

- oversample rare classes
- add synthetic rare objects

Do not accept a model based on one run only.

---

## 9. Validation

Run validation:

```bash
yolo detect val \
  model=training_runs/docdet_v0_yolo11n/weights/best.pt \
  data=datasets/docdet_v0/dataset.yaml \
  imgsz=640 \
  project=training_runs \
  name=docdet_v0_val
```

Evaluate:

- mAP50
- mAP50-95
- per-class precision
- per-class recall
- confusion matrix
- failure samples

Critical recall classes:

- mrz_zone
- qr_code
- barcode
- table
- photo
- signature
- checkbox
- stamp/seal/logo

---

## 10. Hard test evaluation

Use a locked hard test set.

```bash
yolo detect val \
  model=training_runs/docdet_v0_yolo11n/weights/best.pt \
  data=datasets/docdet_v0_hard/dataset.yaml \
  imgsz=640 \
  project=training_runs \
  name=docdet_v0_hard_val
```

Hard test must include:

- blur
- glare
- skew
- low resolution
- compression
- partial crops
- shadows
- negative examples

---

## 11. Acceptance gates

Initial gates:

- no class missing from validation output
- critical class recall acceptable
- false positives manageable
- small objects not ignored
- hard test performance understood
- ONNX export succeeds
- browser inference works
- latency within budget
- memory stable

Example minimum targets must be calibrated, not blindly fixed.

High priority:

```text
false negative on required objects is bad
false positive that causes review is less bad
false positive that causes silent wrong field is unacceptable
```

---

## 12. Export to ONNX

```bash
yolo export \
  model=training_runs/docdet_v0_yolo11n/weights/best.pt \
  format=onnx \
  imgsz=640 \
  opset=17 \
  simplify=True
```

Then test in ONNX Runtime Web.

Do not accept export until:

- outputs match PyTorch reasonably,
- postprocessor works,
- NMS handled as designed,
- class order preserved,
- performance acceptable.

---

## 13. Browser inference test

Create a fixed test pack:

```text
runtime_tests/docdet/
  passport_clean.png
  invoice_table_qr.png
  generic_form_signature.png
  bad_scan_glare.png
```

Test:

- WebGPU
- WASM
- output shape
- class mapping
- box mapping to normalized coordinates
- NMS
- memory after repeated runs

---

## 14. Model artifact package

Save:

```text
models/docdet/yolov11n-docdet-v0/
  model.onnx
  classes.json
  metadata.json
  training_config.yaml
  metrics.json
  confusion_matrix.png
  examples/
```

Metadata:

```json
{
  "modelId": "yolov11n-docdet-v0",
  "baseModel": "yolo11n.pt",
  "classVersion": "docdet-v0",
  "imgsz": 640,
  "opset": 17,
  "trainedAt": 0,
  "datasetVersion": "docdet_v0"
}
```

---

## 15. Failure review

For each failed class, collect:

- false negatives
- false positives
- confusion pairs
- hard examples
- annotation errors
- augmentation gaps

Do not only tune training. Fix data first.

---

## 16. References

- YOLO11 model docs: https://docs.ultralytics.com/models/yolo11/
- Ultralytics train mode: https://docs.ultralytics.com/modes/train/
- Ultralytics detection datasets: https://docs.ultralytics.com/datasets/detect/
- Ultralytics export mode: https://docs.ultralytics.com/modes/export/

---

## 17. Final rule

YOLOv11n detector is accepted only when it is accurate enough, exportable, fast enough on edge, and safe inside the verifier architecture. Detector confidence alone never confirms document fields.
