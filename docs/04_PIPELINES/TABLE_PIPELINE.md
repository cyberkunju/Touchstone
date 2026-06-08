# Table Pipeline — Edge DocGraph Engine

**Purpose:** Define table detection, geometric reconstruction, OCR cell assignment, SLANet_plus trial behavior, validation, correction, and DocGraph integration.

---

## 1. Pipeline goal

The table pipeline turns visible table regions into structured graph data:

- table nodes
- row/column definitions
- cell nodes
- cell text
- header relationships
- validation results
- correction support

Tables must not be flattened into plain text.

---

## 2. High-level flow

```text
table candidate region
  → table ROI extraction
  → geometric line detection
  → row/column reconstruction
  → OCR box assignment
  → cell creation
  → header inference
  → value parsing
  → validation
  → TableNode / TableCellNode
  → form table control
```

If geometry fails:

```text
table ROI
  → SLANet_plus trial
  → normalize output to TableNode schema
  → verifier/user review
```

---

## 3. Table candidate sources

Sources:

- YOLOv11n `table` detection
- TemplateGraph projected table ROI
- OCR layout suggesting rows/columns
- user-drawn table region
- PDF vector lines

---

## 4. Geometric table pipeline

### 4.1 Preprocessing

For table ROI:

- grayscale
- threshold for line detection
- preserve original crop
- optionally enhance lines
- avoid damaging OCR crop

### 4.2 Line detection

Detect:

- horizontal lines
- vertical lines
- intersections
- table border
- cell boundaries

Methods:

- morphological operations
- projection profiles
- Hough-like line detection if needed

### 4.3 Grid reconstruction

Create:

- row boundaries
- column boundaries
- cell boxes
- merged cell candidates

### 4.4 OCR assignment

Assign OCR text boxes to cells by overlap and position.

If a text box overlaps multiple cells:

- split by word if possible
- assign based on center point
- mark ambiguous if unresolved

### 4.5 Header inference

Signals:

- first row text
- bold/position if PDF metadata exists
- column value types
- repeated table patterns
- template schema

### 4.6 Value parsing

Parse cells as:

- text
- date
- amount
- quantity
- currency
- ID
- unknown

---

## 5. Borderless table pipeline

For tables without ruling lines:

```text
OCR boxes
  → cluster by y into rows
  → cluster by x into columns
  → infer column boundaries
  → align numeric columns
  → infer headers
  → create cells
```

Challenges:

- variable spacing
- wrapped descriptions
- multi-line rows
- missing values
- right-aligned amounts

---

## 6. SLANet_plus trial

Use when:

- geometric confidence low
- table is borderless/wireless
- row/column clustering fails
- template expects complex table
- user requests improved table extraction

SLANet_plus output must be converted to same schema:

```text
SLANet output → TableNode/TableCellNode → verifier → UI
```

It must not bypass correction UI.

---

## 7. Table node schema

```ts
type TableNode = {
  id: string;
  pageId: string;
  boxNorm: NormalizedBox;
  source: "geometry" | "slanet_plus" | "template" | "user_correction";
  rows: TableRow[];
  columns: TableColumn[];
  cellIds: string[];
  confidence: number;
  warnings: string[];
};

type TableCellNode = {
  id: string;
  tableId: string;
  rowIndex: number;
  colIndex: number;
  rowSpan: number;
  colSpan: number;
  boxNorm: NormalizedBox;
  textNodeIds: string[];
  rawText: string;
  parsedValue?: unknown;
  valueType?: string;
  confidence: number;
};
```

---

## 8. Table validation

Validators:

- row count sanity
- column count sanity
- empty required header
- amount format
- date format
- subtotal/tax/total
- debit/credit/balance math
- currency consistency
- numeric column consistency
- duplicate header detection

Example invoice validation:

```text
sum(line_item_amounts) + tax - discount = total
```

If mismatch:

- mark table or total field conflict/needs_review

---

## 9. Form integration

Tables become form controls.

UI should allow:

- edit cell
- add row
- delete row
- add column
- delete column
- merge cells
- split cells
- mark header row
- mark total row
- map table to named field
- export table

---

## 10. Correction flow

User table correction creates:

- UserCorrectionEvidence
- patched TableNode/TableCellNodes
- updated validation results
- optional TemplateTable update

Do not discard original table reconstruction evidence.

---

## 11. TemplateGraph table learning

TemplateTable stores:

- table ROI
- expected columns
- column names
- column aliases
- value types
- required columns
- total rules
- header rows
- row extraction strategy

Known-template table extraction uses:

```text
project table ROI
  → reconstruct using saved schema
  → OCR cells
  → validate
```

---

## 12. Error handling

### No table found

If template expects table:

- status missing

If unknown document:

- no table field unless OCR/layout suggests one

### Structure uncertain

- create review-first table
- mark needs_review
- allow correction

### OCR cell low confidence

- retry cell OCR
- mark cell needs_review

### Arithmetic conflict

- mark table/total conflict
- show calculation details

---

## 13. Performance

Table processing can be expensive.

Rules:

- process detected/projected table ROIs only
- avoid full-page table model by default
- batch OCR cells
- cache table crop
- run in worker

---

## 14. Tests

Test tables:

- bordered invoice table
- borderless receipt table
- bank statement table
- table with merged cells
- table with missing values
- skewed table
- low-resolution table
- multi-line description rows

Assertions:

- TableNode created
- cells mapped
- headers inferred where possible
- corrections work
- validators catch arithmetic errors
- table exports correctly

---

## 15. Final table rule

Tables are structured graph data, not OCR text blobs. Start with a deterministic geometric engine, add SLANet_plus only where it improves difficult table extraction, and always support user correction and validation.
