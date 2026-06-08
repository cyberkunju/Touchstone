# Evaluate Asset Masks — Edge DocGraph Engine

**Purpose:** Define evaluation for visual asset detection/crops/masks: crop accuracy, mask IoU, asset recall, refinement value, latency, and user correction reduction.

---

## 1. Evaluation goal

The app must extract visual assets accurately:

- photos
- signatures
- stamps
- seals
- logos
- emblems
- flags
- symbols

Evaluation must measure whether detector crops and optional segmentation masks are good enough for forms and templates.

---

## 2. Asset extraction outputs

Possible outputs:

- bounding box crop
- expanded crop
- refined segmentation mask
- masked crop
- asset type
- confidence
- source region
- template asset field

---

## 3. Ground truth

Each asset sample should include:

```json
{
  "assetId": "asset_001",
  "assetType": "signature",
  "boxNorm": [0.5, 0.7, 0.8, 0.78],
  "maskPolygonNorm": [],
  "required": false,
  "qualityTags": ["faded_ink"]
}
```

For photo regions, decide policy:

- full photo rectangle mask, or
- visible person/photo content mask.

The policy must be consistent.

---

## 4. Metrics

### 4.1 Detection recall

Did the system find the asset?

```text
asset_recall = found_assets / ground_truth_assets
```

Critical for required assets.

### 4.2 Detection precision

How many detections are true assets?

False positives cause review burden and possible template corruption.

### 4.3 Box IoU

Compare predicted box to ground-truth box.

### 4.4 Crop completeness

Measures whether full asset is included.

A crop can have decent IoU but cut off important strokes.

### 4.5 Mask IoU

For segmentation masks.

```text
mask_iou = intersection(mask_pred, mask_gt) / union(mask_pred, mask_gt)
```

### 4.6 Asset type accuracy

Correct class:

- signature vs stamp
- logo vs emblem
- seal vs stamp
- QR/barcode not confused with symbol

### 4.7 User correction rate

Most important product metric.

```text
asset_correction_rate = assets_user_corrected / assets_extracted
```

### 4.8 Latency and memory

Measure:

- detector time
- segmentation time per asset
- crop generation time
- memory impact

---

## 5. Evaluation modes

### Detector-only

Uses bounding boxes and crop expansion.

### Detector + segmentation

Uses detector box then segmentation refinement.

### Template projected asset

Uses known TemplateAsset ROI.

### User corrected crop

Ground truth for template learning.

Compare all modes.

---

## 6. Asset-specific evaluation

### Photo

Metrics:

- photo region recall
- crop completeness
- face presence if portrait validator used
- glare/crop issues flagged

Do not use face recognition.

### Signature

Metrics:

- stroke recall
- crop completeness
- false positives on decorative lines
- partial signature detection

### Stamp/seal

Metrics:

- low-opacity mark recall
- overlap with text
- crop/mask accuracy
- stamp vs seal confusion

### Logo/emblem/flag/symbol

Metrics:

- correct type
- stable visual anchor usefulness
- false positives from decorative graphics

---

## 7. Hard cases

Include:

- faded signatures
- stamps over text
- seals with low contrast
- logos near header text
- portrait glare
- partial crops
- small flags
- compressed images
- blurred stamps
- overlapping assets

---

## 8. Acceptance gates

Asset extraction acceptable if:

- required asset recall high enough,
- crop completeness high,
- correction rate acceptable,
- false positives do not corrupt templates,
- segmentation improves crop quality enough to justify runtime,
- latency fits edge budget.

Segmentation is rejected if it does not reduce user corrections or improve crops materially.

---

## 9. Evaluation report

```json
{
  "runId": "asset_eval_001",
  "mode": "detector_plus_segmentation",
  "datasetVersion": "asset_eval_v1",
  "metrics": {
    "assetRecall": 0.93,
    "assetPrecision": 0.89,
    "meanBoxIoU": 0.81,
    "meanMaskIoU": 0.76,
    "correctionRate": 0.12,
    "medianLatencyMs": 180
  },
  "byClass": {}
}
```

---

## 10. Visual review

Always produce review sheets:

- image
- ground truth box/mask
- predicted box/mask
- crop preview
- error type

Human review is essential for masks.

---

## 11. Error buckets

- missed asset
- wrong class
- crop too tight
- crop too loose
- mask misses strokes
- mask includes background
- false positive
- duplicate detection
- template ROI shifted
- glare/blur caused failure

---

## 12. Template impact

Asset extraction affects TemplateGraph.

Do not allow uncertain assets into active template unless reviewed.

Metrics:

- asset region stability
- template asset projection IoU
- repeated extraction correction rate
- false asset learned rate

---

## 13. Final rule

Asset masks are valuable only if they improve real form extraction and reduce correction effort. A beautiful mask benchmark is useless if it is slow, memory-heavy, or causes template mistakes.
