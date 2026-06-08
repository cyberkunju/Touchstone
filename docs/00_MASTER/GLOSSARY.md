# Glossary — Edge DocGraph Engine

This glossary defines the language used across the project. Every contributor should use these terms consistently.

---

## A

### Anchor

A stable reference point used for template matching and alignment.

Anchor types include:

- text anchor
- visual anchor
- geometry anchor
- keypoint anchor
- special-zone anchor

Example text anchor:

```json
{
  "type": "text_anchor",
  "text": "Invoice No.",
  "box_norm": [0.12, 0.18, 0.24, 0.21]
}
```

Example visual anchor:

```json
{
  "type": "visual_anchor",
  "assetType": "logo",
  "box_norm": [0.04, 0.03, 0.22, 0.12]
}
```

### Asset

A non-text or visual object extracted from a document.

Examples:

- portrait photo
- signature
- stamp
- seal
- logo
- emblem
- flag
- symbol
- QR code image
- barcode image

An asset can still contain text, but it is treated as a visual object first.

### AssetNode

A DocGraph node representing an extracted visual asset.

---

## B

### Barcode

A machine-readable visual code. In this project, barcode includes common 1D and 2D formats unless specified.

Examples:

- Code 128
- EAN
- QR code
- Data Matrix
- PDF417
- Aztec

### Box

A rectangular coordinate region, always represented as:

```ts
[x1, y1, x2, y2]
```

### BoxNorm

A normalized page-relative box with values between 0 and 1:

```ts
[0.10, 0.20, 0.45, 0.25]
```

Normalized boxes are used for templates because they survive resolution changes.

---

## C

### Canonical Coordinate System

A normalized coordinate system used for all pages after normalization. The typical canonical width is 1000 units, with proportional height.

Purpose:

- template reuse
- alignment
- resolution independence
- consistent overlays
- model-agnostic geometry

### CheckboxNode

A DocGraph node representing a checkbox or radio-like visual control.

States:

- checked
- unchecked
- uncertain
- invalid

### Conflict

A field state where two or more evidence sources disagree.

Example:

- MRZ date of birth says `990201`
- visual DOB field says `01/03/1999`

The field should be marked `conflict`.

### Correction

A user action that changes a field, value, region, type, crop, table, or template decision.

Corrections are high-trust evidence and must be recorded in provenance.

---

## D

### Detector

A model that proposes document object regions.

Current recommended detector:

- YOLOv11n custom-trained

Detector output is evidence, not truth.

### DocGraph

The central data structure of the system. It represents a document as a graph of evidence, objects, relationships, hypotheses, validations, and provenance.

Contains:

- pages
- nodes
- edges
- evidence records
- field hypotheses
- validation results
- provenance records

The DocGraph is the source of truth.

### Document Object

A detected meaningful region in a document.

Examples:

- photo
- signature
- table
- QR code
- MRZ zone
- text block
- checkbox
- stamp
- seal
- logo

### DocumentBoundaryNode

A node representing the detected page or document boundary.

---

## E

### Edge Device

A user device that runs the system locally.

Examples:

- browser on laptop
- browser on desktop
- browser on tablet
- PWA
- Tauri local app
- offline field device

Edge means no cloud inference.

### Evidence

Any observation, output, parser result, validator result, or user correction that supports or disputes a field, asset, table, or relationship.

Evidence sources:

- detector
- OCR
- segmentation
- barcode parser
- MRZ parser
- table engine
- face detector
- template projection
- validator
- user correction

### Evidence Producer

Any module that generates evidence.

Examples:

- YOLOv11n
- PP-OCRv5
- zxing-wasm
- MRZ parser
- table engine
- user correction UI

### Evidence Record

A structured record that stores what was observed, where it came from, model/parser version, confidence, coordinates, and provenance.

### Evidence Viewer

UI panel that shows the user why a field exists.

May display:

- source crop
- OCR text
- detector box
- parser result
- validator result
- template source
- confidence reasons

---

## F

### Field

A logical item in the generated form.

Examples:

- Name
- Passport Number
- Date of Birth
- Invoice Total
- Signature
- Portrait Photo
- QR Payload

A field may be text, number, date, amount, image, table, checkbox, code, or unknown.

### FieldHypothesis

A proposed field created from evidence before or during verification.

A hypothesis includes:

- label
- value
- type
- source nodes
- asset nodes
- box
- confidence
- evidence breakdown
- status

### FieldNode

A DocGraph node representing a logical field.

### Field Status

The trust state assigned by the verifier.

Allowed statuses:

- confirmed
- needs_review
- missing
- conflict
- invalid
- unsupported

### Form Generator

The module that converts verified/reviewable DocGraph hypotheses into an editable UI form.

The form generator must not read raw OCR directly.

---

## G

### Geometry Anchor

An anchor based on layout geometry rather than text or image content.

Examples:

- document boundary
- photo region
- MRZ zone
- table grid
- checkbox cluster
- page corners

### Graph Edge

A relationship between two DocGraph nodes.

Examples:

- contains
- near
- label_of
- value_of
- same_row
- inside_table
- validated_by
- conflicts_with

### Graph Node

An entity inside the DocGraph.

Examples:

- TextLineNode
- FieldNode
- AssetNode
- TableNode
- MRZNode
- BarcodeNode

---

## H

### Homography

A perspective transformation used to align one page to another or align a new document to a saved template.

Used in:

- page normalization
- template alignment
- ROI projection

### Hypothesis

A proposed interpretation of evidence.

Examples:

- this text is a field label
- this nearby text is the value
- this crop is a signature
- this table is line items
- this QR payload confirms tax ID

Hypotheses require verification.

---

## I

### Inference Worker

A Web Worker that runs local ML inference using ONNX Runtime Web.

Should handle:

- detector sessions
- OCR sessions
- segmentation sessions
- table model sessions

### Invalid

A field status meaning the value is present but fails a required validator.

Example:

- MRZ check digit fails
- date format is impossible
- invoice total math fails critically

---

## K

### Keypoint Anchor

An anchor based on visual feature descriptors such as ORB-style keypoints.

Used for template alignment when text and geometry are insufficient.

### Known Template

A document layout already saved as a TemplateGraph.

Known-template extraction should be ROI-first.

---

## L

### Label

Text that describes a value.

Example:

- `Date of Birth`
- `Invoice No.`
- `Total Amount`

### LabelNode

A TextNode or Field-related node used as the label side of a label-value pair.

### Layout Drift

A situation where a document is similar to a known template but fields, assets, tables, or anchors have shifted enough to reduce confidence.

Layout drift may trigger a new template version.

---

## M

### Missing

A field status meaning a required field is expected but no sufficient evidence was found.

### MRZ

Machine Readable Zone. Found on many passports, visas, and identity documents.

The MRZ parser must support:

- TD1
- TD2
- TD3
- check-digit validation
- OCR correction
- cross-checks with visual fields

### MRZNode

A DocGraph node representing detected and parsed MRZ evidence.

---

## N

### Needs Review

A field status meaning the system found a plausible value or asset but confidence or validation is insufficient for confirmation.

### Node

A graph entity representing evidence or structure.

### Normalized Coordinates

Page-relative coordinates from 0 to 1.

Used for:

- templates
- cross-resolution layout
- ROI projection
- consistent overlays

---

## O

### OCR

Optical Character Recognition. In this project, OCR must produce text with coordinates and confidence.

Current OCR model family:

- PP-OCRv5 mobile ONNX

### OCR Evidence

Text observation produced by OCR.

### OPFS

Origin Private File System. Browser storage useful for large local files such as models, rendered pages, masks, crops, and templates.

---

## P

### Page Normalization

The process of producing a clean, canonical page representation.

Includes:

- boundary detection
- orientation correction
- perspective correction
- deskew
- contrast normalization
- quality scoring
- coordinate transform storage

### Parser

A deterministic module that extracts structured meaning from a region.

Examples:

- MRZ parser
- barcode parser
- date parser
- amount parser
- table parser

### PDF417

A stacked barcode format often used in identity documents and licenses.

### Provenance

The history of how an output was produced.

A field should know:

- which evidence created it
- which model/parser found it
- which validator checked it
- whether the user corrected it
- which template projected it

---

## Q

### QRNode

A DocGraph node representing QR code evidence.

### Quality Report

A report describing page/image quality.

Signals:

- blur
- glare
- shadow
- overexposure
- low resolution
- missing corners
- crop completeness
- orientation confidence

---

## R

### ROI

Region of Interest. A bounded area of a page selected for OCR, parsing, cropping, or segmentation.

Known templates should use ROI-first extraction.

### ROI-first Extraction

A fast extraction strategy used for known templates. Instead of rediscovering the whole page, the system projects saved field/asset regions and extracts only those areas first.

### RANSAC

A robust estimation algorithm used with keypoints or anchors to compute alignment while ignoring outliers.

---

## S

### Segmentation

The process of extracting a pixel-level mask for an object.

Used for:

- signatures
- stamps
- seals
- logos
- photos
- symbols

Segmentation must be conditional, not full-page default.

### Silent Error

A wrong output marked as confirmed or accepted without warning.

Silent errors are the most dangerous failure mode.

### Silent Critical Error Rate

The rate of critical fields that are wrong but not flagged for review.

This is the most important quality metric.

### SLANet_plus

A table-structure model kept in the table experiment bucket for difficult, borderless, or complex tables.

### Source Crop

The image crop that supports a field, asset, or parser result.

---

## T

### TableNode

A DocGraph node representing a structured table.

Contains:

- rows
- columns
- cells
- headers
- source region
- structure confidence

### Template

A reusable learned document layout.

In this project, templates are stored as TemplateGraphs, not plain boxes.

### TemplateGraph

A graph-like memory object created after user correction.

Stores:

- anchors
- field regions
- asset regions
- table schemas
- aliases
- validators
- relationships
- fingerprints
- version metadata

### Template Family

A group of related templates.

Example:

- `Indian Passport`
  - version 1
  - version 2
  - version 3

### Template Version

A specific layout variant of a template family.

Created when layout changes but the document remains related.

### Text Anchor

A stable text phrase used for matching or alignment.

Examples:

- `PASSPORT`
- `Invoice No.`
- `Date of Birth`
- `Total`

### TextNode

A DocGraph node representing OCR text.

Types may include:

- word
- line
- block

---

## U

### Unknown Document

A document that does not match any saved template strongly enough.

Unknown documents use full evidence extraction and review-first form generation.

### User Correction Evidence

Evidence created when the user edits or confirms the generated form.

High trust, but still stored with provenance.

---

## V

### Validator

A rule or function that checks evidence or fields.

Examples:

- date format validator
- amount validator
- email validator
- MRZ checksum validator
- barcode payload validator
- invoice total validator
- required field validator
- face presence validator

### Validation Result

A structured result from a validator.

Includes:

- validator ID
- target node/field
- pass/fail/warn
- severity
- reason
- evidence references

### Verifier

The module that combines evidence and validation to assign field statuses.

The verifier prevents silent wrong answers.

### Visual Anchor

A template anchor based on visual asset location or appearance.

Examples:

- logo
- emblem
- seal
- portrait photo region
- stamp area

### Visual Asset

Any meaningful non-text or image-like document element.

---

## W

### WebGPU

Browser GPU API used by ONNX Runtime Web for accelerated local inference.

### Web Worker

Browser background thread used to keep heavy work off the main UI thread.

### WebCrypto

Browser cryptographic API used for local encryption.

---

## Z

### zxing-wasm

ZXing-C++ compiled to WebAssembly. Used for local barcode, QR, PDF417, and related code parsing.

---

## Final glossary rule

If a term affects architecture, schema, verification, UI, or model behavior, define it here before using it loosely. Consistent language is essential because this project depends on clean separation between evidence, hypotheses, verification, forms, and templates.
