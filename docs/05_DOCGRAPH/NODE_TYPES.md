# Node Types — Edge DocGraph Engine

**Purpose:** Define every major node type used in the DocGraph: text, fields, assets, tables, MRZ, barcode, checkbox, validators, corrections, and template anchors.

---

## 1. Node design principle

A node represents an entity in the document or graph process.

Nodes are not raw model outputs. Raw model outputs are EvidenceRecords. Nodes are graph entities created from evidence.

Example:

```text
OcrEvidence("Date of Birth") → TextLineNode
DetectionEvidence(photo) → VisualAssetNode
MrzEvidence(parsed TD3) → MRZNode
```

---

## 2. Base node

```ts
type BaseGraphNode = {
  id: string;
  type: GraphNodeType;

  documentId: string;
  pageId?: string;

  boxNorm?: NormalizedBox;
  polygonNorm?: NormalizedPolygon;

  evidenceIds: string[];
  confidence?: number;
  status?: NodeStatus;

  metadata?: Record<string, unknown>;

  createdAt: number;
  updatedAt?: number;
};
```

---

## 3. Node type enum

```ts
type GraphNodeType =
  | "page"
  | "document_boundary"
  | "text_word"
  | "text_line"
  | "text_block"
  | "field"
  | "visual_asset"
  | "table"
  | "table_row"
  | "table_column"
  | "table_cell"
  | "checkbox"
  | "barcode"
  | "qr_code"
  | "mrz"
  | "validation"
  | "template_anchor"
  | "correction"
  | "quality_warning"
  | "unknown_region";
```

---

## 4. PageNode

Represents one page.

```ts
type PageNode = BaseGraphNode & {
  type: "page";
  pageIndex: number;
  original: {
    widthPx: number;
    heightPx: number;
    imageId?: string;
  };
  normalized?: {
    widthPx: number;
    heightPx: number;
    canonicalWidth: number;
    canonicalHeight: number;
    imageId: string;
  };
  transforms: PageTransform[];
  quality: PageQualityReport;
};
```

Use for:

- page-level evidence
- coordinate transforms
- quality scoring
- page grouping

---

## 5. DocumentBoundaryNode

Represents detected document/page/card boundary.

```ts
type DocumentBoundaryNode = BaseGraphNode & {
  type: "document_boundary";
  cornersNorm?: [Point, Point, Point, Point];
  boundarySource: "opencv" | "detector" | "pdf" | "user";
};
```

Use for:

- page normalization
- template alignment
- crop completeness
- quality warnings

---

## 6. TextWordNode

Represents a recognized word.

```ts
type TextWordNode = BaseGraphNode & {
  type: "text_word";
  text: string;
  normalizedText?: string;
  confidence: number;
  readingOrder?: number;
};
```

Use for:

- fine OCR evidence
- line grouping
- table cell assignment
- exact field extraction

---

## 7. TextLineNode

Represents a line of text.

```ts
type TextLineNode = BaseGraphNode & {
  type: "text_line";
  text: string;
  normalizedText?: string;
  confidence: number;
  wordNodeIds: string[];
  readingOrder?: number;
};
```

Use for:

- label/value discovery
- OCR evidence display
- MRZ lines
- table row text

---

## 8. TextBlockNode

Represents a paragraph/block/region of related text.

```ts
type TextBlockNode = BaseGraphNode & {
  type: "text_block";
  text: string;
  lineNodeIds: string[];
  blockRole?: "header" | "footer" | "body" | "label_group" | "address" | "unknown";
};
```

Use for:

- layout understanding
- address blocks
- headers/footers
- sections

---

## 9. FieldNode

Represents a logical form field after or during hypothesis confirmation.

```ts
type FieldNode = BaseGraphNode & {
  type: "field";
  label: string;
  canonicalLabel?: string;
  value: unknown;
  displayValue?: string;
  valueType: FieldValueType;
  status: FieldStatus;

  labelNodeIds: string[];
  valueNodeIds: string[];
  assetNodeIds: string[];
  tableNodeIds: string[];

  validationIds: string[];
  hypothesisId?: string;
  templateFieldId?: string;
  required?: boolean;
};
```

FieldNode should be created from FieldHypothesis or user-created field.

---

## 10. VisualAssetNode

Represents an extracted image-like document asset.

```ts
type VisualAssetNode = BaseGraphNode & {
  type: "visual_asset";
  assetType:
    | "photo"
    | "signature"
    | "stamp"
    | "seal"
    | "logo"
    | "emblem"
    | "flag"
    | "symbol"
    | "watermark"
    | "unknown";

  rawCropId: string;
  refinedCropId?: string;
  maskId?: string;

  assetStatus: "candidate" | "confirmed" | "needs_review" | "missing" | "rejected";
};
```

Use for:

- portrait photo
- signature
- stamps/seals
- logos/emblems
- exported visual fields
- visual anchors

---

## 11. TableNode

Represents a table.

```ts
type TableNode = BaseGraphNode & {
  type: "table";
  rowNodeIds: string[];
  columnNodeIds: string[];
  cellNodeIds: string[];
  source: "geometry" | "slanet_plus" | "template" | "user_correction";
  structureConfidence: number;
  warnings: string[];
};
```

Use for:

- invoices
- receipts
- bank statements
- forms with grids

---

## 12. TableRowNode

```ts
type TableRowNode = BaseGraphNode & {
  type: "table_row";
  tableId: string;
  rowIndex: number;
  cellNodeIds: string[];
  role?: "header" | "body" | "subtotal" | "total" | "footer" | "unknown";
};
```

---

## 13. TableColumnNode

```ts
type TableColumnNode = BaseGraphNode & {
  type: "table_column";
  tableId: string;
  colIndex: number;
  headerCellId?: string;
  valueType?: FieldValueType;
  aliases?: string[];
};
```

---

## 14. TableCellNode

```ts
type TableCellNode = BaseGraphNode & {
  type: "table_cell";
  tableId: string;
  rowIndex: number;
  colIndex: number;
  rowSpan: number;
  colSpan: number;
  textNodeIds: string[];
  rawText: string;
  parsedValue?: unknown;
  valueType?: FieldValueType;
  confidence: number;
};
```

---

## 15. CheckboxNode

Represents checkbox/radio-like control.

```ts
type CheckboxNode = BaseGraphNode & {
  type: "checkbox";
  state: "checked" | "unchecked" | "uncertain";
  groupId?: string;
  labelNodeIds: string[];
  confidence: number;
};
```

Use for:

- forms
- consent fields
- application checkboxes

---

## 16. BarcodeNode

Represents decoded or detected barcode.

```ts
type BarcodeNode = BaseGraphNode & {
  type: "barcode";
  codeType: "code128" | "ean" | "pdf417" | "data_matrix" | "aztec" | "unknown";
  payload?: string;
  decoded: boolean;
  parserEvidenceId?: string;
};
```

---

## 17. QRCodeNode

```ts
type QRCodeNode = BaseGraphNode & {
  type: "qr_code";
  payload?: string;
  decoded: boolean;
  payloadType?: "url" | "json" | "kv" | "payment" | "unknown";
  parserEvidenceId?: string;
};
```

---

## 18. MRZNode

Represents machine-readable zone.

```ts
type MRZNode = BaseGraphNode & {
  type: "mrz";
  format: "TD1" | "TD2" | "TD3" | "unknown";
  rawLines: string[];
  normalizedLines: string[];
  parsed: Record<string, string | null>;
  checkDigits: Record<string, boolean>;
  mrzStatus: "valid" | "partial" | "invalid";
};
```

Use for:

- passports
- IDs
- visas
- machine-readable documents

---

## 19. ValidationNode

Represents validation result as node when graph linking is useful.

```ts
type ValidationNode = BaseGraphNode & {
  type: "validation";
  validatorId: string;
  targetId: string;
  result: "pass" | "warn" | "fail" | "not_applicable";
  severity: "info" | "low" | "medium" | "high" | "critical";
  message: string;
};
```

ValidationResult may also live in validations array. ValidationNode is useful for visual graph traversal.

---

## 20. TemplateAnchorNode

Represents anchor used for matching/template learning.

```ts
type TemplateAnchorNode = BaseGraphNode & {
  type: "template_anchor";
  anchorType:
    | "text"
    | "visual"
    | "geometry"
    | "keypoint"
    | "special_zone"
    | "table_grid";
  anchorValue?: string;
  importance: number;
  templateAnchorId?: string;
};
```

---

## 21. CorrectionNode

Represents user correction.

```ts
type CorrectionNode = BaseGraphNode & {
  type: "correction";
  correctionKind:
    | "label_edit"
    | "value_edit"
    | "type_change"
    | "region_edit"
    | "asset_crop_edit"
    | "asset_type_change"
    | "table_edit"
    | "checkbox_edit"
    | "template_decision";
  targetId: string;
  before: unknown;
  after: unknown;
};
```

Corrections are graph nodes when they materially affect output.

---

## 22. QualityWarningNode

```ts
type QualityWarningNode = BaseGraphNode & {
  type: "quality_warning";
  warningType:
    | "blur"
    | "glare"
    | "low_resolution"
    | "missing_corner"
    | "overexposure"
    | "underexposure"
    | "perspective"
    | "crop_incomplete";
  severity: "low" | "medium" | "high" | "critical";
  message: string;
};
```

Quality nodes can affect field status.

---

## 23. UnknownRegionNode

Used for meaningful but unclassified regions.

```ts
type UnknownRegionNode = BaseGraphNode & {
  type: "unknown_region";
  reason: string;
  suggestedReview: boolean;
};
```

Useful when the system sees something but cannot classify it yet.

---

## 24. Node creation rules

1. Evidence creates candidate nodes.
2. Nodes must reference evidence IDs.
3. Nodes must not erase evidence.
4. Nodes may be updated by corrections, but provenance must remain.
5. UI selects nodes, not raw evidence only.
6. Templates are built from corrected nodes and hypotheses.

---

## 25. Node status rules

```ts
type NodeStatus =
  | "candidate"
  | "active"
  | "confirmed"
  | "needs_review"
  | "missing"
  | "conflicted"
  | "invalid"
  | "rejected";
```

Node status may differ from field status but should be consistent.

---

## 26. Final node rule

Nodes are the graph-level representation of document entities. They must be evidence-backed, coordinate-aware, status-aware, and correction-safe.
