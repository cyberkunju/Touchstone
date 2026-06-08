# Annotation Guide — Edge DocGraph Engine

**Purpose:** Define exactly how annotators label fields, assets, tables, masks, anchors, text regions, and difficult cases.

---

## 1. Annotation goal

Annotations must support:

- YOLO detector training
- segmentation training
- OCR evaluation
- table extraction evaluation
- TemplateGraph creation
- verifier benchmarks
- correction learning

Labels must be consistent. Inconsistent labels are worse than fewer labels.

---

## 2. Annotation artifacts

Each sample may include:

```text
image file
page metadata
detection labels
segmentation masks
OCR ground truth
table structure JSON
field ground truth JSON
template metadata
quality tags
review status
```

---

## 3. Coordinate rules

Use normalized coordinates when stored in JSON:

```text
x1, y1, x2, y2 in [0, 1]
```

For YOLO training labels, use YOLO normalized format:

```text
class_id x_center y_center width height
```

For segmentation labels, use polygon points in normalized coordinates if using YOLO segmentation format.

---

## 4. Labeling priority

Annotate in this order:

1. document boundary/page
2. major visual assets
3. code/MRZ/table/checkbox regions
4. text blocks
5. field labels and values
6. table cells
7. masks for visual assets
8. anchors/template fields if applicable

---

## 5. Bounding box rules

### Tight boxes

Boxes should tightly include the visible object.

Include:

- full object boundary
- visible ink/strokes
- full QR/barcode
- full photo rectangle
- full stamp/seal extent
- full table outer boundary

Do not include:

- excessive background
- nearby unrelated text
- whole page unless class is document_page

---

## 6. Document page/boundary

Class:

```text
document_page
```

Label:

- visible document/card/page area
- not the full camera image if background visible
- include full page if partly cut off, with box around visible region

If corners visible, store polygon in metadata.

---

## 7. Visual asset labeling

Classes:

- photo
- signature
- stamp
- seal
- logo
- emblem
- flag
- symbol
- watermark

### Photo

Label portrait/photo area, not the face only.

### Signature

Label visible handwritten signature stroke group.

If signature line exists but no signature is present, do not label signature. Label line_separator/form_box if relevant.

### Stamp/seal

- stamp: ink stamp or official marking
- seal: official seal, embossed/round mark, ceremonial seal

If ambiguous, use label policy from `DETECTOR_CLASSES.md`.

### Logo/emblem/flag/symbol

- logo: organization/company logo
- emblem: official/government/crest-like symbol
- flag: visible national/region flag
- symbol: meaningful icon not covered above

---

## 8. Code labels

Classes:

- qr_code
- barcode

Label full code region.

For PDF417/Data Matrix/Aztec, use barcode unless a specific class is introduced later.

Store subtype metadata if known:

```json
{ "codeSubtype": "pdf417" }
```

---

## 9. MRZ labeling

Class:

```text
mrz_zone
```

Label the full MRZ block, including all MRZ lines.

Do not label each line separately for detector unless a separate OCR dataset requires it.

OCR ground truth must preserve raw MRZ line text.

---

## 10. Table labeling

Class:

```text
table
```

Label full table region.

For table evaluation, additionally annotate:

```json
{
  "rows": [],
  "columns": [],
  "cells": [],
  "headerRows": [],
  "relationships": []
}
```

### Table cell boxes

Cells should include the visible cell region, not just text.

For borderless tables, infer cell boundaries consistently based on row/column alignment.

---

## 11. Checkbox labeling

Class:

```text
checkbox
```

Label the square/circle control, not the label text.

Metadata:

```json
{
  "state": "checked" | "unchecked" | "uncertain",
  "groupId": "optional_group_id"
}
```

Radio buttons can use checkbox class initially with metadata.

---

## 12. Text block labeling

Class:

```text
text_block
```

Use for coherent blocks:

- paragraph
- address block
- header block
- body text block
- dense OCR region

Do not label every word as text_block.

OCR dataset separately stores line/word ground truth.

---

## 13. Field label and field value

Classes:

- field_label
- field_value

Field label:

- visible label text such as `DOB`, `Name`, `Total`
- include colon if visually attached

Field value:

- corresponding value region
- include only the value, not label

Example:

```text
DOB: 01/02/1999
```

Either:

- label box: `DOB:`
- value box: `01/02/1999`

Do not label the entire line as field_value.

---

## 14. Form boxes and separators

Classes:

- form_box
- line_separator

Use:

- form_box for input rectangles/underlined boxes
- line_separator for horizontal/vertical separator lines

Do not over-label every printed line if it does not help extraction.

---

## 15. Anchor annotation

Anchors are not detector classes by default.

Anchor metadata should mark stable template signals:

```json
{
  "anchorType": "text",
  "value": "PASSPORT",
  "boxNorm": [0.3, 0.05, 0.7, 0.09],
  "importance": 0.95,
  "stability": 0.95
}
```

Do not mark variable values as anchors unless explicitly static.

Bad anchors:

- names
- invoice numbers
- dates
- totals
- QR payloads
- MRZ parsed values

---

## 16. Segmentation masks

Mask targets:

- photo
- signature
- stamp
- seal
- logo
- emblem
- flag
- symbol

Rules:

- mask visible foreground/object area
- for photo, mask photo rectangle unless the task specifically requires person mask
- for signature, mask stroke pixels as closely as practical
- for stamps/seals, include visible ink/mark
- do not include large blank background

---

## 17. OCR ground truth

OCR GT should include:

```json
{
  "text": "Date of Birth",
  "boxNorm": [0.1, 0.2, 0.3, 0.23],
  "level": "line",
  "readingOrder": 12
}
```

For tables:

- store per cell raw text
- preserve punctuation/currency
- preserve MRZ filler characters
- do not normalize away meaningful characters

---

## 18. Quality tags

Annotators must tag quality issues:

- blur
- glare
- shadow
- low_resolution
- skew
- perspective
- crop_incomplete
- fold
- stain
- compression
- overexposed
- underexposed

If issue affects a region, store region-level quality tag.

---

## 19. Ambiguous cases

When unsure:

- use `uncertain` metadata
- flag for reviewer
- do not force a class
- add note

Example:

```json
{
  "uncertain": true,
  "note": "Could be emblem or logo"
}
```

Ambiguous labels must not enter final training set until reviewed.

---

## 20. Review workflow

Annotation status:

```text
draft
review_needed
approved
rejected
fixed
```

Every training sample must be approved.

Use double review for:

- segmentation masks
- table structure
- MRZ ground truth
- verifier conflict cases
- template matching benchmark samples

---

## 21. QA checks

Automated checks:

- boxes inside image
- no negative width/height
- class IDs valid
- YOLO labels valid
- required metadata present
- duplicate IDs absent
- OCR text not empty where required
- cells inside table
- masks valid polygons
- split leakage checked

Manual checks:

- class consistency
- tight boxes
- table structure
- hard-case tags
- privacy redaction

---

## 22. Annotation tool

Recommended tools:

- Label Studio for boxes/polygons
- CVAT if preferred for advanced video/image workflows
- custom internal table/template annotator for table/TemplateGraph labels

Tool choice is less important than schema consistency.

---

## 23. References

- Label Studio bounding box template: https://labelstud.io/templates/image_bbox
- Label Studio computer vision labeling: https://labelstud.io/learn/computer-vision-image-labeling/
- Ultralytics detection dataset format: https://docs.ultralytics.com/datasets/detect/
- Ultralytics segmentation dataset format: https://docs.ultralytics.com/datasets/segment/

---

## 24. Final rule

Annotate what the engine must understand, not what looks visually interesting. Labels must support extraction, verification, and template learning.
