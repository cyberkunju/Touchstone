# Table Model Bucket — Edge DocGraph Engine

**Purpose:** Define the table extraction strategy, compare the custom geometric table engine with SLANet_plus and heavier table models, and specify graduation criteria.

---

## 1. Table extraction role

Tables appear in:

- invoices
- receipts
- bank statements
- generic forms
- certificates
- academic transcripts
- medical reports
- product labels

The engine must represent tables as structured data, not plain OCR blobs.

---

## 2. Recommended table strategy

Use a layered approach:

```text
1. Detect table region.
2. Run geometric reconstruction.
3. Assign OCR text to cells.
4. Validate headers/totals.
5. If geometry fails, try SLANet_plus trial.
6. Let user correct structure.
7. Save corrected table schema in TemplateGraph.
```

---

## 3. Core: custom geometric table engine

### Why core

A custom geometric table engine is:

- lightweight
- deterministic
- explainable
- local
- debuggable
- easy to connect to DocGraph
- good for many bordered tables

### Inputs

- table region box
- normalized page image
- OCR boxes
- line detection results
- optional template schema

### Outputs

- TableNode
- TableCellNode[]
- row definitions
- column definitions
- header candidates
- structure confidence
- validation results

---

## 4. Geometric table pipeline

```text
table ROI
  → grayscale/threshold
  → detect horizontal/vertical lines
  → find intersections
  → infer grid
  → map OCR text boxes to cells
  → merge/split heuristic
  → infer headers
  → validate numeric columns
```

For borderless tables:

```text
table ROI
  → OCR boxes
  → cluster by y positions into rows
  → cluster x positions into columns
  → infer headers from first rows
  → align numeric columns
  → validate row/column consistency
```

---

## 5. Table data structures

```ts
type TableNode = {
  id: string;
  pageId: string;
  boxNorm: NormalizedBox;
  rows: TableRow[];
  columns: TableColumn[];
  cells: TableCellNode[];
  source: "geometry" | "slanet_plus" | "user_correction";
  confidence: number;
};

type TableCellNode = {
  id: string;
  rowIndex: number;
  colIndex: number;
  rowSpan?: number;
  colSpan?: number;
  boxNorm: NormalizedBox;
  textNodeIds: string[];
  value?: string;
  confidence: number;
};
```

---

## 6. Table validators

Validators should include:

- row count sanity
- column count sanity
- header detection confidence
- numeric column consistency
- invoice subtotal/tax/total checks
- debit/credit/balance checks
- empty required cell checks
- currency consistency
- date column parsing

---

## 7. SLANet_plus trial

### Why keep in bucket

SLANet_plus is a serious candidate for difficult table structure recognition, especially:

- borderless tables
- wireless tables
- complex merged cells
- visually irregular invoices
- tables where line geometry fails

### When to trigger

Do not run by default on every table.

Trigger when:

- table region detected
- geometric confidence is low
- many OCR boxes cannot be assigned
- row/column structure ambiguous
- user requests “improve table”
- template requires high table accuracy

### Outputs to compare

SLANet_plus output must be normalized into the same TableNode/TableCellNode schema.

---

## 8. Heavy table models

### Table Transformer / TATR

Status:

- rejected as default browser runtime
- research-only

Reasons:

- too heavy for v1 edge flow
- still requires OCR integration
- complexity not justified before geometric + SLANet_plus trials

### Other table foundation models

Keep research-only unless they prove:

- local edge runtime
- strong structure accuracy
- manageable size
- good integration into DocGraph
- better silent-error behavior

---

## 9. Table correction UI impact

Table extraction does not need to be perfect if correction UI is strong.

User must be able to:

- edit cells
- add row/column
- delete row/column
- merge/split cells
- mark header row
- mark total row
- correct table type
- map table to form field
- save table schema to TemplateGraph

Corrections become table evidence.

---

## 10. TemplateGraph table learning

For repeated documents, TemplateGraph should store:

- table ROI
- expected columns
- header aliases
- column value types
- required columns
- total row rules
- row extraction rules
- validators

Known-template table extraction should be ROI-first and schema-guided.

---

## 11. Metrics

### Detection metrics

- table region recall
- table region precision
- table box IoU

### Structure metrics

- row count accuracy
- column count accuracy
- cell F1
- header row accuracy
- merged cell accuracy

### Text metrics

- table-cell OCR accuracy
- numeric/date parsing accuracy

### Product metrics

- table correction count
- table review time
- invoice total validation success
- known-template table reuse accuracy

---

## 12. Failure modes

### Borderless table ambiguity

Mitigation:

- OCR clustering
- SLANet_plus trial
- template schema
- user correction

### Dense small text

Mitigation:

- ROI OCR
- high-resolution table crop
- cell-level OCR

### Multi-page tables

MVP may handle page-local tables only. Multi-page table stitching is later.

### Rotated/skewed tables

Mitigation:

- page normalization
- local deskew
- OCR/table ROI correction

### Mixed layout tables

Mitigation:

- review-first table
- user correction
- save schema

---

## 13. Graduation criteria for SLANet_plus

Promote SLANet_plus from bucket if:

- improves table cell F1 significantly,
- reduces table correction count,
- runtime is acceptable,
- memory is acceptable,
- output maps cleanly to DocGraph,
- does not increase false confirmed table values,
- works on target device class.

---

## 14. Final table decision

The default table system is a custom geometric engine integrated deeply with OCR boxes and DocGraph. SLANet_plus is the serious model trial for difficult tables. Heavy table models remain research-only until edge feasibility and product benefit are proven.
