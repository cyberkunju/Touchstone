# Anchor Types — Edge DocGraph Engine

**Purpose:** Define all anchor types used by TemplateGraph for matching, alignment, versioning, and ROI projection.

---

## 1. What is an anchor?

An anchor is a stable reference signal in a document layout.

Anchors help answer:

```text
Is this the same template?
Where did the page move?
How should saved ROIs be projected?
Did the layout change?
```

A good anchor is stable across documents of the same template and does not contain private variable data.

---

## 2. Anchor categories

TemplateGraph supports:

1. text anchors
2. visual anchors
3. geometry anchors
4. keypoint anchors
5. special-zone anchors
6. table-grid anchors

Each anchor has strengths and failure modes.

---

## 3. Base anchor schema

```ts
type TemplateAnchor = {
  id: string;
  pageIndex: number;

  type:
    | "text"
    | "visual"
    | "geometry"
    | "keypoint"
    | "special_zone"
    | "table_grid";

  label?: string;
  boxNorm?: NormalizedBox;
  polygonNorm?: NormalizedPolygon;

  value?: string;
  descriptorId?: string;

  importance: number;
  stability: number;

  requiredForMatch: boolean;

  createdFromNodeIds: string[];
  createdFromEvidenceIds: string[];
};
```

---

## 4. Text anchors

Text anchors are stable labels or fixed text.

Examples:

- `PASSPORT`
- `INVOICE`
- `Date of Birth`
- `Invoice No`
- `Total`
- `Tax Invoice`
- `GSTIN`
- `Machine Readable Zone`

Schema:

```ts
type TextAnchor = TemplateAnchor & {
  type: "text";
  value: string;
  normalizedValue: string;
  matchPolicy: "exact" | "case_insensitive" | "alias" | "fuzzy";
  languageHint?: string;
};
```

### Good text anchors

- document titles
- field labels
- section headings
- table headers
- fixed legal text if short/stable
- issuer/vendor names if template-specific

### Bad text anchors

- names
- ID numbers
- dates
- totals
- addresses if customer-specific
- QR payloads
- MRZ parsed values
- invoice line item values

### Text anchor matching

Use:

- normalized string match
- alias match
- fuzzy match for OCR noise
- position tolerance
- reading-order context

---

## 5. Visual anchors

Visual anchors are stable visual regions.

Examples:

- logo
- emblem
- flag
- form header mark
- fixed seal graphic
- recurring design element

Schema:

```ts
type VisualAnchor = TemplateAnchor & {
  type: "visual";
  assetType: "logo" | "emblem" | "flag" | "symbol" | "seal" | "watermark" | "unknown";
  descriptorId: string;
  descriptorType: "phash" | "orb" | "embedding" | "hash";
};
```

### Good visual anchors

- vendor logo
- passport emblem
- government symbol
- fixed header graphic
- fixed form seal

### Bad visual anchors

- portrait photo
- handwritten signature
- user-specific stamp if variable
- random scanned noise
- glare/hologram reflection

---

## 6. Geometry anchors

Geometry anchors are stable layout structures.

Examples:

- document boundary
- field boxes
- horizontal lines
- vertical separators
- header/footer positions
- photo rectangle
- table boundary

Schema:

```ts
type GeometryAnchor = TemplateAnchor & {
  type: "geometry";
  geometryType:
    | "document_boundary"
    | "line_separator"
    | "form_box"
    | "photo_region"
    | "table_region"
    | "section_boundary"
    | "checkbox_group";
};
```

Strengths:

- works even when OCR is weak
- useful for forms
- useful for table templates

Weaknesses:

- can shift with scans
- can be missing in borderless documents
- can be distorted by perspective

---

## 7. Keypoint anchors

Keypoint anchors use local visual features such as ORB descriptors.

Schema:

```ts
type KeypointAnchor = TemplateAnchor & {
  type: "keypoint";
  descriptorId: string;
  keypointCount: number;
  regionBoxNorm?: NormalizedBox;
};
```

Use for:

- logos
- fixed background patterns
- forms with line textures
- certificates

Do not rely only on keypoints because:

- text-only documents may have weak keypoints
- blur hurts features
- photocopy noise can create false matches
- low texture documents fail

---

## 8. Special-zone anchors

Special zones are high-value structural regions.

Examples:

- MRZ zone at bottom
- QR code at top-right
- barcode at bottom
- portrait photo location
- signature field
- table region
- checkbox cluster

Schema:

```ts
type SpecialZoneAnchor = TemplateAnchor & {
  type: "special_zone";
  zoneType:
    | "mrz"
    | "qr_code"
    | "barcode"
    | "photo"
    | "signature"
    | "stamp"
    | "seal"
    | "table"
    | "checkbox_group";
};
```

Special-zone anchors are very useful for document family detection.

---

## 9. Table-grid anchors

Table-grid anchors represent stable table structure.

Schema:

```ts
type TableGridAnchor = TemplateAnchor & {
  type: "table_grid";
  tableId: string;
  rowCountPolicy: "fixed" | "variable";
  columnCount: number;
  headerLabels: string[];
  gridDescriptorId?: string;
};
```

Use for:

- invoices
- receipts
- bank statements
- forms with structured grids

---

## 10. Anchor importance

Importance indicates how valuable the anchor is for matching.

Suggested range:

```text
0.0 = useless
1.0 = critical
```

Examples:

- passport title: 0.9
- MRZ zone: 0.95
- photo region: 0.8
- invoice logo: 0.75
- table header: 0.8
- generic label “Date”: 0.3

---

## 11. Anchor stability

Stability indicates how consistent anchor is across same-template documents.

Examples:

- fixed label: high
- logo: high
- portrait photo: low as visual content, medium as region
- signature content: low
- table rows: variable
- header labels: high

---

## 12. Required anchors

Some anchors can be required for match.

Examples:

- MRZ zone for passport template
- specific vendor logo for vendor invoice template
- fixed title for form template
- table header set for invoice template

Be careful: too many required anchors cause false unknown. Too few cause false match.

---

## 13. Anchor selection from corrected DocGraph

When saving template:

1. collect candidate anchors
2. remove variable values
3. score stability
4. score uniqueness
5. score importance
6. select required anchors
7. select supporting anchors
8. store provenance

---

## 14. Anchor matching tolerance

Anchor matching should tolerate:

- OCR errors
- small shifts
- scale changes
- crop differences
- mild perspective correction errors
- language/script variations if supported

But it must reject:

- wrong document families
- visually similar but semantically different templates
- variable user-specific values as anchors

---

## 15. Anchor failure modes

### Variable value used as anchor

Fix:

- classify stable vs variable
- require explicit static marking
- corruption prevention rules

### Weak generic anchor

Example:

- `Date`
- `Name`
- `Total`

Fix:

- use with low importance
- combine with layout and other anchors

### Visual anchor changes

Example:

- company logo changes

Fix:

- same-family new-version decision

### OCR anchor missing

Fix:

- use visual/geometry/special anchors
- run ROI OCR around expected area
- mark match uncertain

---

## 16. Anchor examples

### Passport

```json
{
  "type": "text",
  "value": "PASSPORT",
  "importance": 0.95,
  "stability": 0.95,
  "requiredForMatch": true
}
```

```json
{
  "type": "special_zone",
  "zoneType": "mrz",
  "boxNorm": [0.08, 0.78, 0.92, 0.90],
  "importance": 0.95,
  "stability": 0.9
}
```

### Invoice

```json
{
  "type": "visual",
  "assetType": "logo",
  "boxNorm": [0.06, 0.04, 0.22, 0.12],
  "importance": 0.8,
  "stability": 0.9
}
```

### Generic form

```json
{
  "type": "geometry",
  "geometryType": "checkbox_group",
  "boxNorm": [0.10, 0.52, 0.44, 0.63],
  "importance": 0.65,
  "stability": 0.8
}
```

---

## 17. Final anchor rule

Use multiple anchor types together. Text anchors alone are brittle. Visual anchors alone are unsafe. Geometry alone is ambiguous. Strong template matching comes from combined evidence: text + visual + geometry + keypoints + special zones + validators.
