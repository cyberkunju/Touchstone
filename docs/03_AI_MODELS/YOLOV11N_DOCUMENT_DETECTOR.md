# YOLOv11n Document Detector — Edge DocGraph Engine

**Purpose:** Define the primary document object detector: classes, training plan, ONNX export, input/output handling, NMS logic, evidence mapping, and acceptance metrics.

---

## 1. Role in the system

YOLOv11n is the primary object detector for document elements.

It detects candidate regions such as:

- document page
- photo
- signature
- stamp
- seal
- logo
- QR/barcode
- MRZ zone
- table
- checkbox
- text block

The detector does not create final fields. It produces detection evidence that the DocGraph and verifier use.

---

## 2. Detector philosophy

The detector answers:

> “Where are meaningful document objects likely located?”

It does not answer:

> “What is the final value of this field?”
> “Is this document authentic?”
> “Should this field be confirmed?”
> “What should the form export?”

Those are handled by DocGraph, parsers, validators, and verifier.

---

## 3. Initial class set

Use a focused class set first. Too many classes early will reduce annotation quality and detector reliability.

### Required v1 classes

| Class | Description |
|---|---|
| `document_page` | Full document/page/card boundary |
| `photo` | Portrait/photo/image field |
| `signature` | Handwritten or printed signature region |
| `stamp` | Ink stamp or document stamp |
| `seal` | Official seal, embossed/printed seal |
| `logo` | Organization/vendor/logo region |
| `qr_code` | QR code visual region |
| `barcode` | 1D barcode region |
| `mrz_zone` | Machine-readable zone region |
| `table` | Table region |
| `checkbox` | Checkbox/radio-style visual control |
| `text_block` | Meaningful text block region |

### Expanded classes

Add after v1 detector stabilizes:

| Class | Description |
|---|---|
| `field_label` | Region likely containing field label |
| `field_value` | Region likely containing field value |
| `emblem` | National/official emblem |
| `flag` | Flag symbol |
| `symbol` | Generic meaningful symbol |
| `line_separator` | Horizontal/vertical separating lines |
| `form_box` | Empty box or form field boundary |
| `table_cell` | Table cell region |
| `handwriting` | Handwritten region |
| `watermark` | Watermark/background mark |
| `hologram_region` | Hologram-like reflective/security region |

### Class rule

Do not add classes unless:

- enough examples can be annotated,
- class boundaries are visually definable,
- class contributes to extraction,
- class can be evaluated.

---

## 4. Annotation guidelines

### 4.1 General box rules

- Boxes should tightly cover the visible object.
- Do not include large unrelated background.
- For overlapping objects, annotate both if visually separable.
- If a stamp overlaps signature, label both boxes if possible.
- Use consistent boundaries across annotators.

### 4.2 Photo

- Cover the full photo/portrait rectangle.
- Include the image border if it is part of the photo field.
- Do not annotate face only; annotate photo region.

### 4.3 Signature

- Cover full visible signature strokes.
- Include signature box if the box is part of the signature field only when useful.
- Avoid including unrelated printed text.

### 4.4 Stamp

- Cover visible stamp boundary.
- If stamp text is inside, still label as stamp; OCR can read internal text separately.

### 4.5 Seal

- Cover official seal mark.
- Distinguish seal from logo when possible.
- If unclear, use `stamp` or `symbol` according to annotation policy.

### 4.6 Logo

- Cover organization/vendor logo.
- Do not include full letterhead unless logo and text are inseparable.

### 4.7 QR / barcode

- Tight box around code.
- If label appears beside code, do not include label.

### 4.8 MRZ

- Box all MRZ lines together.
- Do not include visual field area above MRZ.

### 4.9 Table

- Box the full table region including headers and all rows.
- For split tables across pages, each page gets its own table box.

### 4.10 Checkbox

- Box the checkbox square/circle.
- Later, checkbox state may be determined by a separate classifier or visual rule.

### 4.11 Text block

- Use for meaningful blocks, not every line.
- OCR handles lines/words; detector text_block helps broad layout.

---

## 5. Dataset strategy

### 5.1 Data categories

Train with:

- synthetic passports/IDs with fake data
- synthetic invoices/receipts
- synthetic generic forms
- public sample invoices/forms where license permits
- manually created fake certificates/licenses
- low-quality augmented scans
- user-exported training packages only with explicit consent

### 5.2 Minimum examples per class

Initial target:

| Class | Minimum annotated examples |
|---|---:|
| document_page | 2,000 |
| photo | 1,000 |
| signature | 1,000 |
| stamp | 800 |
| seal | 500 |
| logo | 1,000 |
| qr_code | 800 |
| barcode | 800 |
| mrz_zone | 800 |
| table | 1,000 |
| checkbox | 1,500 |
| text_block | 2,000 |

These are not final requirements but starting targets. More data is better, especially for rare visual assets.

### 5.3 Augmentations

Use document-specific augmentations:

- perspective warp
- rotation
- motion blur
- Gaussian blur
- JPEG compression
- shadows
- glare
- low contrast
- overexposure
- underexposure
- partial crop
- scanner noise
- phone camera noise
- folds
- stains
- photocopy effect
- low DPI
- thermal receipt fading

---

## 6. Training plan

### 6.1 Training phases

1. **Bootstrap detector**
   - train on synthetic + public safe samples
   - focus on initial classes

2. **Real-world refinement**
   - add manually annotated real-like samples
   - add hard negatives

3. **Failure mining**
   - collect false positives and false negatives
   - retrain with targeted examples

4. **Template-driven refinement**
   - use corrected user templates as optional consented training packages

### 6.2 Split

Recommended splits:

- 70% train
- 15% validation
- 15% test

Ensure splits are document-family separated where possible to test generalization.

---

## 7. Hard negatives

Include:

- random photos
- screenshots
- blank pages
- decorative images
- text-only pages
- documents without assets
- logos that are not official seals
- stamps that look like signatures
- tables without borders
- checkboxes in icons/UI screenshots

Hard negatives reduce false positives.

---

## 8. ONNX export

### 8.1 Export goals

The exported model must:

- run in ONNX Runtime Web
- support WebGPU where possible
- support WASM compatibility mode
- use static input size if needed
- avoid unsupported operators
- expose raw predictions or integrated NMS according to chosen pipeline

### 8.2 Recommended input

Common input options:

- `640x640` for speed
- `960x960` or tiled detection for small objects if needed

Decision must be benchmarked.

### 8.3 Output

Preferred output:

```ts
type YoloRawOutput = {
  boxes: Float32Array;
  classScores: Float32Array;
  masks?: Float32Array;
};
```

Post-processing should convert to:

```ts
type DetectionEvidence = {
  id: string;
  pageId: string;
  className: DocumentObjectClass;
  boxNorm: NormalizedBox;
  confidence: number;
  modelName: "yolov11n-doc";
  modelVersion: string;
};
```

---

## 9. NMS logic

### 9.1 Why JS/WASM NMS

It is often safer to export raw predictions and run NMS in JS/WASM because browser ONNX operator support and model export variants can vary.

### 9.2 Class-aware NMS

Use class-aware NMS:

```text
for each class:
  filter predictions by confidence
  sort by score
  suppress overlapping boxes by IoU threshold
```

### 9.3 Per-class thresholds

Different classes need different thresholds.

Examples:

- `document_page`: high threshold
- `text_block`: moderate threshold
- `signature`: lower threshold may be needed
- `checkbox`: small-object tuned threshold
- `qr_code`: high confidence but small box sensitivity

Thresholds must be configurable.

### 9.4 Overlap rules

Some classes may overlap legitimately:

- stamp over signature
- logo near text block
- QR inside label section
- table containing text blocks

Do not globally suppress across unrelated classes.

---

## 10. Tiling strategy

If small objects are missed, test tiled detection.

Use cases:

- checkboxes
- small QR codes
- small signatures
- tiny stamps
- small MRZ in high-resolution page

Tiling flow:

```text
full-page detection
  → if small-object confidence low
  → run tiled detector on selected regions
  → merge detections
  → NMS
```

Tiling should be optional due to performance cost.

---

## 11. Evidence mapping

Every detection becomes evidence.

Example:

```json
{
  "id": "det_001",
  "source": "detector",
  "modelName": "yolov11n-doc",
  "modelVersion": "0.1.0",
  "pageId": "page_1",
  "className": "signature",
  "boxNorm": [0.62, 0.71, 0.84, 0.78],
  "confidence": 0.89
}
```

This evidence may become:

- VisualAssetNode
- TableNode
- CheckboxNode
- MRZNode
- CodeNode
- TextBlockNode

But only after DocGraph processing.

---

## 12. Acceptance metrics

Measure:

- mAP@0.5
- mAP@0.5:0.95
- per-class precision
- per-class recall
- false positives per page
- small-object recall
- edge latency
- memory use
- WebGPU/WASM compatibility
- impact on downstream field accuracy
- impact on silent error rate

### Critical class recall

High priority classes:

- `mrz_zone`
- `qr_code`
- `barcode`
- `photo`
- `signature`
- `table`
- `checkbox`

Missing these can harm product value.

---

## 13. Failure modes

### False positives

Examples:

- decorative mark detected as seal
- random line detected as signature
- UI checkbox in screenshot detected as form checkbox
- text logo detected as stamp

Mitigation:

- hard negatives
- verifier
- user correction
- template validation

### False negatives

Examples:

- faint signature missed
- small QR missed
- MRZ missed due to blur
- table missed because borderless

Mitigation:

- class-specific data
- ROI/tiled detection
- OCR/layout fallback
- user correction
- template memory

### Poor localization

Problem:

- crop cuts off signature/photo/code

Mitigation:

- box expansion rules
- segmentation refinement
- user crop correction
- template learning

---

## 14. Integration with verifier

Detector confidence alone cannot confirm fields.

Examples:

- detector says photo, but face check fails → needs_review
- detector says MRZ, but checksum fails → invalid/conflict
- detector says table, but table engine fails → needs_review
- detector says signature, but user marks it as stamp → correction evidence

---

## 15. Versioning

Every detector output must include:

- model name
- model version
- class list version
- input size
- threshold config version
- NMS config version

Model versioning matters because templates and benchmark results depend on it.

---

## 16. Final detector rule

The detector is the visual discovery engine. It finds candidate objects. It does not decide truth. It must be custom-trained, benchmarked per class, exported cleanly to ONNX, and integrated through evidence records into the DocGraph.
