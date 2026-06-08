# Detector Classes — Edge DocGraph Engine

**Purpose:** Define the YOLO document detector class list, phased class strategy, versioning rules, naming rules, and class-change policy.

---

## 1. Detector role

The detector finds document objects and regions.

It does not read text and does not decide final field truth.

Detector output becomes evidence in DocGraph.

---

## 2. Class strategy

Do not start with too many classes.

Recommended:

```text
v0 = core objects only
v1 = add document-specific structures
v2 = add field/line/form refinements
```

A small clean class set beats a large inconsistent one.

---

## 3. Class naming rules

Use:

- lowercase
- snake_case
- singular names
- no spaces
- stable IDs
- no renaming without migration

Good:

```text
qr_code
mrz_zone
line_separator
```

Bad:

```text
QRCode
MRZ
line
```

---

## 4. v0 core detector classes

Recommended first training set:

| ID | Class | Purpose |
|---:|---|---|
| 0 | document_page | visible page/card/document boundary |
| 1 | photo | portrait/photo image region |
| 2 | signature | handwritten signature region |
| 3 | stamp | ink stamp/mark |
| 4 | seal | seal/official mark |
| 5 | logo | company/organization logo |
| 6 | qr_code | QR code |
| 7 | barcode | 1D/2D barcode except QR if not split |
| 8 | mrz_zone | machine-readable zone |
| 9 | table | table region |
| 10 | checkbox | checkbox/radio control |
| 11 | text_block | coherent text block |

This is the safest v1 detector foundation.

---

## 5. v1 expanded classes

Add after v0 stabilizes:

| Class | Reason |
|---|---|
| emblem | passport/government crest-like asset |
| flag | national/regional flag |
| symbol | meaningful visual icon |
| field_label | label text region |
| field_value | value text region |
| line_separator | visual separator line |
| form_box | printed input box/field boundary |

Expanded class list:

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

---

## 6. v2 possible classes

Only add if benchmark proves need:

- table_cell
- table_header
- table_row
- table_column
- address_block
- paragraph
- header
- footer
- watermark
- handwritten_text
- printed_text

Do not add classes just because they are visually possible.

---

## 7. Class definitions

### document_page

Visible page/card/document boundary.

Use for:

- page normalization
- crop completeness
- document boundary evidence

### photo

Document photo region, usually portrait/photo image. Box the full photo area.

### signature

Handwritten signature strokes. Do not label empty signature line as signature.

### stamp

Ink stamp/mark, usually applied after printing.

### seal

Official seal, embossed/round/crest mark. If ambiguity with stamp is high, label policy must be consistent.

### logo

Organization/company/brand logo.

### emblem

Official/government/crest-like symbol.

### flag

National/regional flag visible on document.

### symbol

Meaningful icon not covered by logo/emblem/flag.

### qr_code

QR code region.

### barcode

Barcode region, including PDF417/DataMatrix/Aztec until separate classes are needed.

### mrz_zone

Full MRZ block.

### table

Full table region.

### checkbox

Checkbox/radio-like control region only, not label text.

### text_block

Coherent block of text.

### field_label

Text label such as `Name`, `DOB`, `Total`.

### field_value

The value corresponding to a label.

### line_separator

Horizontal/vertical line separator.

### form_box

Input rectangle/box/underlined field area.

---

## 8. Class ambiguity rules

### Stamp vs seal

Use seal if:

- official circular/crest-like mark
- embossed/official certificate mark
- symbolic official seal

Use stamp if:

- ink office stamp
- rectangular/round rubber stamp
- dated/received stamp

### Logo vs emblem

Use emblem if official/state/crest-like.  
Use logo for company/brand/organization identity.

### QR vs barcode

Use QR for QR only.  
Use barcode for all non-QR codes initially.

### Signature vs handwritten text

Use signature only for signature mark/strokes.  
Do not label general handwritten paragraph as signature.

---

## 9. Class versioning

Class set must be versioned.

```ts
type DetectorClassVersion = {
  version: "docdet-v0";
  classes: string[];
  createdAt: number;
  notes: string;
};
```

Example:

```text
docdet-v0 = core 12 classes
docdet-v1 = expanded 19 classes
```

Model evidence must record class version.

---

## 10. Class change policy

Adding class:

- update class list
- update annotation guide
- migrate labels if needed
- train new model version
- benchmark old vs new
- update decision log

Removing class:

- deprecate first
- migrate dataset
- preserve old model compatibility
- document reason

Renaming class:

- avoid
- if needed, migration required

---

## 11. Negative examples

Include negatives:

- photos not in documents
- random logos
- decorative icons
- blank boxes
- table-like layouts that are not tables
- lines not meaningful separators
- fake signatures vs text scribbles
- QR-like patterns that do not decode

Negative examples reduce false positives.

---

## 12. Class imbalance

Expected imbalance:

- text_block/table/common classes frequent
- seal/stamp/signature less frequent
- MRZ only in passport/ID samples
- QR/barcode only in some documents

Mitigation:

- targeted synthetic generation
- balanced sampling
- class-aware evaluation
- hard negative mining

---

## 13. Evaluation per class

Track:

- AP50
- AP50-95
- recall
- precision
- false positives
- false negatives
- small-object performance
- class confusion matrix

Critical classes:

- mrz_zone
- qr_code
- barcode
- photo
- signature
- table
- checkbox
- stamp/seal/logo/emblem

---

## 14. Detection-to-DocGraph mapping

Each detection creates:

```text
EvidenceRecord(source=detector, kind=object_detection)
  → GraphNode candidate
```

Do not directly create confirmed field from detection alone.

---

## 15. Reference

- Ultralytics YOLO11 model tasks: https://docs.ultralytics.com/models/yolo11/
- Ultralytics detection dataset format: https://docs.ultralytics.com/datasets/detect/

---

## 16. Final rule

The detector class list must be stable, small enough to annotate consistently, and directly useful to the extraction engine. Every new class must earn its place through benchmark improvement.
