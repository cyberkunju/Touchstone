# Dataset Strategy — Edge DocGraph Engine

**Purpose:** Define what data is needed, why it is needed, how it is split, how it supports detector/OCR/segmentation/table/template evaluation, and how privacy is preserved.

---

## 1. Dataset goal

The project needs data for one purpose:

```text
make local document extraction reliable without pretending unknown documents are always solved.
```

The dataset must support:

- document object detection
- visual asset extraction
- optional segmentation
- OCR evaluation
- table extraction evaluation
- template matching evaluation
- verifier evaluation
- correction-driven template learning
- performance benchmarking on edge devices

The dataset is not only for training YOLO. It is for validating the entire document intelligence engine.

---

## 2. Required dataset groups

The project needs multiple dataset groups.

```text
datasets/
  detector/
  segmentation/
  ocr_eval/
  table_eval/
  template_matching/
  verifier_eval/
  synthetic/
  correction_exports/
  privacy_redacted/
```

---

## 3. Core document categories

The first serious dataset should cover the v1 focus areas:

1. passport / ID-style documents
2. invoices / receipts
3. generic forms

Secondary categories:

4. certificates
5. bank statements
6. licenses
7. shipping labels
8. product labels
9. handwritten/signature-heavy forms

The first three are mandatory because they cover the core primitives:

| Category | Primitives covered |
|---|---|
| Passport / ID | photo, MRZ, emblem/logo, fixed template, dates, IDs |
| Invoice / receipt | tables, totals, QR/barcode, variable layout |
| Generic form | labels, values, checkboxes, signatures, stamps |

---

## 4. Dataset types and purpose

### 4.1 Detector dataset

Used to train YOLOv11n document object detector.

Labels:

- document_page
- photo
- signature
- stamp
- seal
- logo
- emblem
- flag
- symbol
- qr_code
- barcode
- mrz_zone
- table
- checkbox
- text_block
- field_label
- field_value
- line_separator
- form_box

The initial v1 detector can use a smaller class set. See `DETECTOR_CLASSES.md`.

---

### 4.2 Segmentation dataset

Used only if YOLOv11n-seg or another segmentation candidate passes benchmark gates.

Mask targets:

- photo
- signature
- stamp
- seal
- logo
- emblem
- flag
- symbol

Segmentation is not for all document elements. It is for visual assets where refined crop/mask matters.

---

### 4.3 OCR evaluation dataset

Used to evaluate PP-OCRv5 and preprocessing/ROI strategies.

Ground truth includes:

- word text
- line text
- region text
- reading order
- field value text
- MRZ lines
- table cell text

Metrics:

- CER
- WER
- field exact match
- normalized field exact match
- MRZ line accuracy
- ROI OCR latency

---

### 4.4 Table evaluation dataset

Used to evaluate geometric table extraction and optional SLANet_plus/table model bucket.

Ground truth includes:

- table region
- row/column structure
- cell boxes
- cell text
- header rows
- column types
- totals/arithmetic relationships

Metrics:

- table detection recall
- structure F1
- cell IoU
- cell text CER/WER
- table arithmetic correctness
- correction effort

---

### 4.5 Template matching dataset

Used to test same-template vs same-family-new-version vs unknown.

Ground truth includes:

- template family ID
- template version ID
- page-level layout
- stable anchors
- field ROIs
- version changes
- negative examples

Metrics:

- template hit rate
- false match rate
- false unknown rate
- new-version detection accuracy
- ROI projection IoU
- downstream field accuracy

False match rate is the highest-priority metric.

---

### 4.6 Verifier evaluation dataset

Used to test silent error protection.

Include cases:

- correct extraction
- low OCR confidence
- blur/glare
- missing required field
- MRZ checksum failure
- MRZ vs visual conflict
- QR vs printed conflict
- table total mismatch
- invalid date
- wrong template match candidate

Metrics:

- silent critical error rate
- conflict detection rate
- invalid detection rate
- missing required detection rate
- over-review rate

---

## 5. Data source categories

### 5.1 Synthetic data

Primary safe source.

Use for:

- fake passports
- fake IDs
- fake invoices
- fake receipts
- fake forms
- fake tables
- fake MRZ-like zones
- fake QR/barcode payloads

Synthetic data should contain no real personal data.

---

### 5.2 Public sample documents

Use only when license permits.

Examples:

- public invoice templates
- open form templates
- public sample receipts
- sample ID/passport mockups
- generated government-style fake examples

Always record source/license.

---

### 5.3 User correction exports

Private by default.

User corrections remain local unless user explicitly exports.

Exported correction packages must be:

- opt-in
- redacted where possible
- labeled as synthetic/private/redacted
- stripped of unnecessary private values
- source-controlled only when safe

---

### 5.4 Internal manually created data

Create fake documents manually.

Rules:

- fake names
- fake IDs
- fake addresses
- fake photos or generated avatars only when license-safe
- fake companies
- fake bank statements
- fake QR payloads

---

## 6. Dataset split strategy

Use splits by document family, not random image only.

```text
train/
val/
test/
hard_test/
template_generalization/
privacy_redacted/
```

### Train

Used for model training.

### Validation

Used for hyperparameter/model selection.

### Test

Locked evaluation set.

### Hard test

Contains difficult scans:

- blur
- glare
- folds
- low resolution
- skew
- partial crops
- compression
- poor lighting
- handwritten/signature noise

### Template generalization split

Holds out full template families or versions.

This tests whether the system can handle unseen templates and version drift.

---

## 7. Avoid data leakage

Do not allow near-duplicates across train/val/test.

Leakage examples:

- same synthetic template rendered with tiny changes across train/test
- same invoice layout in both train and test
- same passport mockup with different fake name across splits
- same user-corrected template in training and evaluation

Split by:

- template family
- document generator seed group
- source document family
- issuer/vendor/form type

---

## 8. Minimum dataset milestones

### Milestone D0 — Smoke set

Purpose:

- verify pipeline works

Size:

- 20–50 documents
- 3 categories

### Milestone D1 — MVP dataset

Purpose:

- train first detector and evaluate OCR/table/template basics

Size target:

- 500–1,500 document pages
- balanced across passport/invoice/form
- at least 100 hard examples

### Milestone D2 — Serious detector dataset

Purpose:

- robust detector

Size target:

- 5,000–20,000 pages
- synthetic + public + redacted optional exports
- multiple languages/scripts if supported

### Milestone D3 — Production benchmark dataset

Purpose:

- locked release gating

Size target:

- depends on resources
- must include hard negatives, template versions, bad scans, and conflict cases

---

## 9. Dataset metadata

Every sample should have metadata.

```json
{
  "sampleId": "sample_001",
  "sourceType": "synthetic",
  "docCategory": "invoice",
  "templateFamilyId": "synthetic_invoice_a",
  "templateVersionId": "v1",
  "pageCount": 1,
  "language": ["en"],
  "containsSensitiveRealData": false,
  "license": "project-generated",
  "split": "train",
  "qualityTags": ["clean"],
  "createdAt": 0
}
```

---

## 10. Quality tags

Use tags:

- clean
- blur
- motion_blur
- glare
- shadow
- low_resolution
- jpeg_compression
- skew
- perspective
- partial_crop
- fold
- stain
- watermark
- handwriting
- dense_table
- borderless_table
- multilingual
- vertical_text
- rotated_text

Quality tags enable targeted evaluation.

---

## 11. Data governance

Required:

- dataset manifest
- source/license tracking
- redaction status
- sensitive-data flag
- split assignment
- annotation version
- reviewer status

Never mix unreviewed private exports into public training data.

---

## 12. Dataset acceptance gates

A dataset version can be used for benchmark only if:

- schema valid
- labels pass QA
- split leakage checked
- source/license recorded
- privacy status recorded
- hard cases included
- benchmark scripts reproduce metrics

---

## 13. References

- Ultralytics detection dataset format: https://docs.ultralytics.com/datasets/detect/
- Ultralytics segmentation dataset format: https://docs.ultralytics.com/datasets/segment/
- Label Studio bounding box annotation: https://labelstud.io/templates/image_bbox
- OCR-D evaluation rationale: https://ocr-d.de/en/spec/ocrd_eval.html

---

## 14. Final rule

The dataset is the product’s reality check. It must include clean examples, hard examples, negative examples, template drift, and deliberate conflict cases. If the dataset is weak, the model will look impressive in demos and fail in real documents.
