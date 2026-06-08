# OCR Pipeline — Edge DocGraph Engine

**Purpose:** Define how OCR is run in full-page, text-block, ROI, MRZ, and table-cell modes, and how OCR output becomes evidence.

---

## 1. OCR role

OCR reads text. It does not create final fields by itself.

OCR output must include:

- text
- coordinates
- confidence
- mode
- model version
- source page/ROI

---

## 2. OCR modes

| Mode | Use |
|---|---|
| `full_page` | unknown-document global context |
| `text_block` | OCR detected text blocks |
| `roi` | known-template projected fields |
| `mrz` | MRZ region OCR |
| `table_cell` | table cell reading |
| `rotated` | rotated local text |

---

## 3. Full-page OCR

Use when:

- document is unknown
- template match failed
- global text anchors needed
- document type unknown
- label/value discovery needed

Benefits:

- finds unexpected labels
- helps layout reasoning
- helps template matching
- helps document type classification

Risks:

- slower
- noisy reading order
- lower accuracy on tiny fields
- more evidence to process

Rule:

> Full-page OCR is for discovery, not final trust.

---

## 4. ROI OCR

Use when:

- template field region is known
- user selects a region
- detector finds a text block
- table cell needs reading
- small field needs high-res OCR

Benefits:

- faster for known templates
- better on small fields
- easier to validate
- easier to link to field evidence

Known-template flow must prioritize ROI OCR.

---

## 5. OCR preprocessing

For OCR crops:

- preserve original crop
- optionally upscale small regions
- normalize contrast carefully
- avoid destructive thresholding
- handle rotation if needed
- record preprocessing profile

Preprocessing profile:

```ts
type OcrPreprocessProfile = {
  upscale?: number;
  grayscale?: boolean;
  contrast?: "none" | "mild" | "clahe";
  denoise?: "none" | "mild";
  rotationDegrees?: number;
};
```

---

## 6. OCR evidence output

```ts
type OcrEvidence = {
  id: string;
  source: "ocr";
  documentId: string;
  pageId: string;
  text: string;
  normalizedText?: string;
  boxNorm: NormalizedBox | NormalizedPolygon;
  confidence: number;
  mode: "full_page" | "text_block" | "roi" | "mrz" | "table_cell" | "rotated";
  roiId?: string;
  cropId?: string;
  preprocessing?: OcrPreprocessProfile;
  modelName: "pp-ocrv5-mobile";
  modelVersion: string;
  createdAt: number;
};
```

---

## 7. Sorting and reading order

OCR order is not always reliable. Reading order should be computed using:

- y coordinate
- x coordinate
- text block grouping
- table structure
- columns
- page layout
- OCR model order

Sorting examples:

### Single column

Sort by y, then x.

### Two columns

Detect columns, then sort within columns.

### Tables

Use table cell assignment, not normal reading order.

### Forms

Use label/value geometry, not reading order only.

---

## 8. Text box grouping

OCR may return words or lines. The pipeline should support:

- word nodes
- line nodes
- block nodes

Grouping logic:

```text
words → lines → text blocks
```

Signals:

- vertical overlap
- horizontal spacing
- font/height similarity
- detector text_block regions
- reading order

---

## 9. Confidence handling

OCR confidence categories:

| Range | Meaning |
|---|---|
| high | likely readable, still validate |
| medium | plausible, review depending field |
| low | needs review or retry |

Confidence thresholds must be configurable per context.

Example:

- MRZ requires stricter confidence and checksum validation.
- invoice description text can tolerate lower confidence.
- critical ID numbers need high confidence and validators.

---

## 10. OCR retries

Retry when:

- critical field has low confidence
- template ROI extraction fails
- MRZ checksum fails due to likely OCR error
- table cell is unreadable
- user requests retry

Retry methods:

- expand ROI
- upscale crop
- adjust contrast
- rotate crop
- search nearby
- run text-block OCR instead of full-page

Record retries as evidence/provenance.

---

## 11. OCR alternatives

If recognizer provides alternatives, store them.

Useful for:

- MRZ correction
- ID numbers
- ambiguous dates
- amounts
- low-confidence fields

Alternative format:

```ts
type OcrAlternative = {
  text: string;
  confidence: number;
};
```

---

## 12. Special handling: dates

Dates are ambiguous.

OCR pipeline should preserve raw text.

Date parser/verifier handles interpretation.

Examples:

- `01/02/1999`
- `1999-02-01`
- `02 JAN 1999`

Do not normalize date to final ISO without recording ambiguity.

---

## 13. Special handling: amounts

Amounts require parser/validator.

Preserve:

- raw OCR
- currency symbol
- separators
- decimal digits
- surrounding labels

Verifier checks amount format and table math.

---

## 14. Special handling: IDs

IDs often contain confusing characters.

Keep raw OCR and normalized candidate.

Examples:

- O/0
- I/1
- S/5
- B/8

Only normalize with validator context.

---

## 15. OCR-to-DocGraph mapping

OCR evidence becomes:

- TextWordNode
- TextLineNode
- TextBlockNode

Edges:

- contains
- same_row
- same_column
- near
- inside_table
- maybe_label
- maybe_value

Field hypotheses are generated after graph construction.

---

## 16. Known-template OCR flow

```text
project ROI
  → crop
  → preprocess
  → OCR
  → parse by expected type
  → validate
  → if fail search nearby
  → create field evidence
```

Do not use old template values. Always read current document.

---

## 17. Unknown-document OCR flow

```text
full-page OCR
  → text block grouping
  → detector-guided OCR
  → special-zone OCR
  → DocGraph text nodes
  → label/value hypotheses
```

---

## 18. OCR performance

Optimization:

- batch recognition crops
- reuse OCR sessions
- run in worker
- avoid excessive full-page OCR
- use ROI-first for known templates
- cache preprocessing artifacts when safe

---

## 19. Tests

Test OCR on:

- clean text
- small ID number
- date fields
- amount fields
- MRZ
- table cells
- rotated text
- low contrast
- noisy scan

Assertions:

- coordinates valid
- raw text preserved
- confidence present
- mode recorded
- OCR errors become review, not confirmed truth

---

## 20. Final OCR rule

OCR is the text sensor. It provides text evidence with geometry. The DocGraph, parsers, and verifier turn that evidence into trustworthy fields.
