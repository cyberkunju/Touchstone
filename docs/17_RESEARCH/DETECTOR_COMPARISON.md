# Detector Comparison

**Purpose:** Compare YOLOv11n, RF-DETR, PicoDet, DocLayout-YOLO, public YOLO DocLayNet models, and related document layout detectors.

**Review date:** 2026-06-05

---

## 1. Decision summary

Current recommendation:

```text
Core detector: YOLOv11n fine-tuned on project-specific document object classes
Research buckets: RF-DETR, PicoDet, DocLayout-YOLO, public YOLO DocLayNet models
```

YOLOv11n remains the best practical starting point because it is lightweight, familiar, exportable, supports the needed training workflow, and belongs to a family that supports detection and segmentation.

---

## 2. Product-specific detector requirements

The detector must find:

```text
document_page
photo
signature
stamp
seal
logo
emblem
flag
symbol
qr_code
barcode
mrz_zone
table
checkbox
text_block
field_label
field_value
line_separator
form_box
```

Generic document layout classes such as title, paragraph, figure, table are not enough.

The product needs document **objects and assets**, not only layout regions.

---

## 3. Detector evaluation criteria

| Criterion | Why it matters |
|---|---|
| Edge speed | Must run locally |
| Browser export | PWA path |
| Tauri/native path | serious app |
| Small object recall | QR, checkbox, MRZ, stamps |
| Asset classes | photo, signature, seal, emblem |
| Fine-tuning ease | custom classes needed |
| ONNX compatibility | runtime path |
| Segmentation family | asset masks optional |
| License | open-source project |
| Downstream silent-error impact | detector mistakes can harm extraction |

---

## 4. YOLOv11n

### What it is

YOLO11 is Ultralytics’ model family supporting computer vision tasks including detection, instance segmentation, classification, pose, and oriented bounding boxes.

Reference:

- https://docs.ultralytics.com/models/yolo11/

### Strengths

- Practical real-time detector.
- Nano variant is lightweight.
- Mature training/export ecosystem.
- Good fit for custom object detection classes.
- Same family can support segmentation experiments.
- Easy to benchmark quickly.
- Suitable for first working detector.

### Risks

- License must be handled carefully: Ultralytics offers AGPL-3.0 or Enterprise licensing.
- Must be fine-tuned; COCO/default classes are insufficient.
- Public layout models do not cover our asset classes.
- Browser ONNX postprocessing and NMS must be tested.
- Small/faint objects need dataset augmentation.

### Verdict

Core detector candidate.

### Required work

- custom dataset,
- document-specific classes,
- ONNX export,
- WebGPU/WASM test,
- hard-case benchmark,
- downstream verifier benchmark.

---

## 5. RF-DETR

### What it is

RF-DETR is Roboflow’s real-time transformer architecture for object detection and instance segmentation, built around a DINOv2-style vision transformer backbone.

References:

- https://github.com/roboflow/rf-detr
- https://rfdetr.roboflow.com/

### Strengths

- Modern transformer detector.
- Strong accuracy/latency claims.
- Supports detection and segmentation direction.
- Apache-2.0 may be easier than AGPL if confirmed for exact artifact.
- Good candidate for future comparison.

### Risks

- Transformer architecture may be heavier for weak edge/browser.
- Browser ONNX Runtime Web path must be proven.
- Custom document object training needed.
- Deployment ecosystem may be less straightforward than YOLO for this stack.
- Needs real benchmark against YOLOv11n-docdet.

### Verdict

Research bucket.

### Graduation criteria

RF-DETR can replace YOLOv11n only if it proves:

- equal/better small object recall,
- lower false match downstream risk,
- acceptable edge latency,
- ONNX/browser/Tauri compatibility,
- stable training/export,
- license clarity.

---

## 6. PicoDet / PP-PicoDet

### What it is

PicoDet is a lightweight object detector from the PaddleDetection ecosystem, designed for mobile/CPU-friendly detection.

References:

- https://github.com/PaddlePaddle/PaddleDetection
- https://paddlepaddle.github.io/PaddleX/3.4/en/pipeline_usage/tutorials/cv_pipelines/object_detection.html
- https://ar5iv.labs.arxiv.org/html/2111.00902

### Strengths

- Mobile-oriented.
- Lightweight.
- Paddle ecosystem might align with PaddleOCR.
- Could be attractive for low-end devices.

### Risks

- Needs custom document-object training.
- Browser ONNX/WebGPU path must be proven.
- Integration with TypeScript/ONNX Runtime Web may be less convenient.
- Less direct ecosystem fit than YOLO for fast iteration.
- Need to compare small object detection.

### Verdict

Research bucket for low-end/mobile optimization.

---

## 7. DocLayout-YOLO

### What it is

DocLayout-YOLO is a document layout analysis model based on YOLOv10 with document-specific pretraining and structural optimization.

References:

- https://github.com/opendatalab/DocLayout-YOLO
- https://arxiv.org/abs/2410.12628

### Strengths

- Document-specific.
- Real-time document layout focus.
- Uses synthetic document pretraining ideas.
- Strong research relevance for layout detection.

### Risks

- Layout classes may not match our required object/asset classes.
- It may detect document layout regions but not passport photo/signature/stamp/flag/MRZ/checkbox as needed.
- Model architecture/export/runtime needs testing.
- May be better as pretraining/reference than direct product detector.

### Verdict

Research bucket.

Potential use:

- compare for layout blocks,
- inspire synthetic dataset generation,
- possible detector backbone for document layout only.

---

## 8. Public YOLO DocLayNet models

### What they are

Community/public models fine-tuned on document layout datasets such as DocLayNet.

### Strengths

- Fast starting point for layout categories.
- Useful baseline.
- Can detect title/text/table/figure-like regions.
- Some may use permissive licenses.

### Risks

- Classes are not enough for our product.
- May not detect signatures/stamps/seals/MRZ/QR/photo.
- Dataset domain may not include passports/forms/receipts.
- Quality and license vary by repo.
- May create false confidence.

### Verdict

Experimental/baseline only.

Do not use as final detector unless retrained/fine-tuned for our classes.

---

## 9. Why detector must be custom-trained

No public detector is expected to perfectly cover:

- passport photos,
- MRZ zones,
- seals,
- stamps,
- signatures,
- flags/emblems,
- checkboxes,
- form boxes,
- QR/barcodes in document layouts,
- table regions across receipts/invoices/forms.

The detector must be trained on project-specific labels.

---

## 10. Final detector decision

| Candidate | Status | Reason |
|---|---|---|
| YOLOv11n | Core | practical, lightweight, train/export ecosystem |
| RF-DETR | Research bucket | strong candidate but needs edge/browser proof |
| PicoDet | Research bucket | mobile/CPU candidate |
| DocLayout-YOLO | Research bucket | document layout focus, class mismatch risk |
| Public YOLO DocLayNet | Experimental/baseline | not enough asset classes |

Final rule:

```text
The detector is accepted only if it improves downstream DocGraph evidence and does not increase silent errors.
mAP alone is not enough.
```
