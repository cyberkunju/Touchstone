# Segmentation Comparison

**Purpose:** Compare YOLO-seg, EfficientSAM, SlimSAM, MobileSAM, and related segmentation options for visual asset extraction.

**Review date:** 2026-06-05

---

## 1. Decision summary

Current recommendation:

```text
Core v1: detector crop first
Segmentation: conditional experimental bucket
Preferred first trial: YOLOv11n-seg
Other buckets: EfficientSAM, SlimSAM, MobileSAM
```

Segmentation is useful only if it improves visual asset extraction enough to justify latency, memory, and implementation cost.

---

## 2. Segmentation role in this product

Segmentation should refine:

- photo,
- signature,
- stamp,
- seal,
- logo,
- emblem,
- flag,
- symbol.

Segmentation should not be used to segment the whole document by default.

Correct flow:

```text
detector finds asset region
  → crop/expand region
  → optional segmentation refinement
  → asset mask/crop evidence
  → user correction if needed
```

---

## 3. Why full-page SAM-like segmentation is rejected

Full-page segmentation is expensive and unfocused.

Problems:

- high memory,
- high latency,
- many irrelevant masks,
- hard to map to field semantics,
- poor low-end edge fit,
- unnecessary for known templates.

Rejected as default.

---

## 4. YOLOv11n-seg

### What it is

YOLO11 family supports instance segmentation in addition to detection.

Reference:

- https://docs.ultralytics.com/models/yolo11/

### Strengths

- Same ecosystem as YOLOv11n detector.
- Can be trained on specific asset classes.
- More deterministic than generic promptable SAM-style models.
- Easier to export alongside detector family.
- Practical first segmentation trial.

### Risks

- Requires mask dataset.
- May struggle with faint signatures/stamps.
- May not generalize like SAM-style models.
- Browser mask postprocessing must be tested.
- License follows Ultralytics licensing.

### Verdict

Best first segmentation trial.

---

## 5. EfficientSAM

### What it is

EfficientSAM is a lightweight Segment Anything direction using masked image pretraining and smaller encoders to reduce complexity.

References:

- https://yformer.github.io/efficient-sam/
- https://github.com/yformer/EfficientSAM
- https://arxiv.org/html/2312.00863v1

### Strengths

- Designed to be lighter than original SAM.
- Promptable segmentation may help user-refined crops.
- Useful for assets with unusual shapes.
- Strong research candidate.

### Risks

- Still may be too heavy for weak browser devices.
- Prompt design needed.
- Output class/type still comes from detector/template/user.
- ONNX/browser path must be tested.
- May be slower than YOLO-seg for fixed asset classes.

### Verdict

Research bucket.

Good for user-triggered refinement experiments.

---

## 6. SlimSAM

### What it is

SlimSAM compresses SAM through pruning/distillation with limited data.

References:

- https://github.com/czg1225/SlimSAM
- https://arxiv.org/html/2312.05284v2

### Strengths

- Compression-focused.
- Could be useful if EfficientSAM too heavy.
- Interesting for edge segmentation.

### Risks

- Deployment/tooling maturity must be checked.
- Browser export path uncertain.
- Still promptable segmentation, not classification.
- Needs benchmark for document assets.

### Verdict

Research bucket.

---

## 7. MobileSAM

### What it is

MobileSAM replaces the heavyweight SAM image encoder with a lightweight encoder for mobile/edge scenarios.

References:

- https://github.com/chaoningzhang/mobilesam
- https://docs.ultralytics.com/models/mobile-sam

### Strengths

- Mobile/edge-oriented.
- More realistic than original SAM.
- Promptable refinement may help asset crops.

### Risks

- Still may be heavy for browser weak devices.
- Prompting and integration complexity.
- Not document-specific.
- Needs asset-mask benchmark.

### Verdict

Research bucket.

---

## 8. Segmentation metrics

A segmentation model can graduate only if it improves:

- crop IoU,
- mask IoU,
- asset recall,
- crop completeness,
- user correction rate,
- template asset stability,
- visual evidence quality,

without harming:

- latency,
- memory,
- battery/thermal behavior,
- silent-error safety.

---

## 9. Asset-specific expectations

### Signature

Need stroke completeness more than perfect background removal.

### Stamp/seal

Need faint/overlapping ink handling.

### Photo

Often bounding box crop is enough; segmentation may not be needed.

### Logo/emblem/flag/symbol

Segmentation useful if asset becomes a visual anchor.

---

## 10. Final segmentation decision

| Candidate | Status | Reason |
|---|---|---|
| Detector crop only | Core baseline | fastest and simplest |
| YOLOv11n-seg | First segmentation trial | same ecosystem, class-specific |
| EfficientSAM | Research bucket | lightweight SAM direction |
| SlimSAM | Research bucket | compressed SAM |
| MobileSAM | Research bucket | mobile promptable segmentation |
| Original SAM/SAM2 full-page | Rejected default | too heavy/unfocused for edge v1 |

Final rule:

```text
Segmentation is not a feature because it is cool.
It is accepted only if it reduces asset correction effort on edge devices.
```
