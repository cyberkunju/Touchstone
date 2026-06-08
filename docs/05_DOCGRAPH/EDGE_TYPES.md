# Edge Types — Edge DocGraph Engine

**Purpose:** Define graph relationships: spatial, semantic, structural, validation, template, conflict, and correction edges.

---

## 1. Edge definition

A graph edge connects two nodes and explains a relationship.

```ts
type GraphEdge = {
  id: string;
  type: GraphEdgeType;
  from: string;
  to: string;
  confidence?: number;
  evidenceIds: string[];
  metadata?: Record<string, unknown>;
  createdAt: number;
};
```

Edges make the DocGraph more than a list of OCR boxes. They let the system reason about layout, fields, tables, assets, validators, conflicts, and templates.

---

## 2. Edge type enum

```ts
type GraphEdgeType =
  | "contains"
  | "near"
  | "above"
  | "below"
  | "left_of"
  | "right_of"
  | "same_row"
  | "same_column"
  | "label_of"
  | "value_of"
  | "inside_table"
  | "table_header_of"
  | "cell_in_row"
  | "cell_in_column"
  | "validated_by"
  | "conflicts_with"
  | "confirms"
  | "derived_from"
  | "corrected_by"
  | "template_projected_from"
  | "anchor_for"
  | "part_of"
  | "alternative_to";
```

---

## 3. Spatial edges

Spatial edges express document layout.

### 3.1 contains

```text
PageNode contains TextLineNode
TableNode contains TableCellNode
TextBlockNode contains TextLineNode
```

Use when one region geometrically contains another.

### 3.2 near

Nodes are close enough to be related.

Metadata:

```ts
{
  distanceNorm: number,
  direction?: "left" | "right" | "above" | "below" | "overlap"
}
```

### 3.3 above / below / left_of / right_of

Directional relationships.

Use for:

- label/value pairing
- reading order
- field grouping
- table interpretation

### 3.4 same_row

Nodes are horizontally aligned.

Use for:

- label and value on same line
- table cells in same row
- checkbox and label

### 3.5 same_column

Nodes are vertically aligned.

Use for:

- stacked fields
- table columns
- repeated labels/values

---

## 4. Semantic field edges

### 4.1 label_of

A text node acts as label for a field or value.

Example:

```text
TextLineNode("Date of Birth") --label_of--> FieldNode("Date of Birth")
```

or:

```text
TextLineNode("Date of Birth") --label_of--> TextLineNode("01/02/1999")
```

### 4.2 value_of

A node supplies value for a field.

Examples:

```text
TextLineNode("01/02/1999") --value_of--> FieldNode("Date of Birth")
VisualAssetNode(signature) --value_of--> FieldNode("Signature")
TableNode --value_of--> FieldNode("Line Items")
```

### 4.3 alternative_to

Two nodes/hypotheses are alternative interpretations.

Example:

```text
TextLineNode("O12345") alternative_to TextLineNode("012345")
```

Useful for OCR alternatives.

---

## 5. Table edges

### 5.1 inside_table

A cell/text node is inside a table.

```text
TableCellNode --inside_table--> TableNode
```

### 5.2 table_header_of

Header cell labels a column.

```text
TableCellNode("Amount") --table_header_of--> TableColumnNode
```

### 5.3 cell_in_row

```text
TableCellNode --cell_in_row--> TableRowNode
```

### 5.4 cell_in_column

```text
TableCellNode --cell_in_column--> TableColumnNode
```

---

## 6. Validation edges

### 6.1 validated_by

A node or field is validated by a validation node/result.

```text
FieldNode("Expiry Date") --validated_by--> ValidationNode("date_range_pass")
```

### 6.2 confirms

Evidence confirms another node/field.

Examples:

```text
MRZNode --confirms--> FieldNode("Passport Number")
QRCodeNode --confirms--> FieldNode("Tax ID")
TableNode --confirms--> FieldNode("Invoice Total")
```

### 6.3 conflicts_with

Evidence conflicts with another node/field.

Examples:

```text
MRZNode --conflicts_with--> FieldNode("DOB")
QRCodeNode --conflicts_with--> FieldNode("Invoice Total")
TableNode --conflicts_with--> FieldNode("Total")
```

Conflict edges must be visible in UI.

---

## 7. Provenance edges

### 7.1 derived_from

Node derived from evidence or another node.

```text
FieldNode --derived_from--> TextLineNode
TextLineNode --derived_from--> OcrEvidence
```

When evidence is not a node, the evidence ID is listed in `evidenceIds`.

### 7.2 corrected_by

A node was corrected by a CorrectionNode.

```text
FieldNode --corrected_by--> CorrectionNode
```

Do not delete original field evidence.

---

## 8. Template edges

### 8.1 template_projected_from

A current document node or ROI came from a saved TemplateGraph element.

```text
FieldNode("Invoice No") --template_projected_from--> TemplateFieldRef
```

Because TemplateGraph may be external, the edge metadata can contain:

```ts
{
  templateId: string,
  templateFieldId: string,
  projectionConfidence: number
}
```

### 8.2 anchor_for

A node serves as an anchor for a template or field.

```text
TextLineNode("PASSPORT") --anchor_for--> TemplateAnchorNode
```

---

## 9. Structural edges

### 9.1 part_of

One node is part of another semantic structure.

Examples:

```text
TextWordNode --part_of--> TextLineNode
TextLineNode --part_of--> TextBlockNode
FieldNode --part_of--> SectionNode
```

SectionNode may be added later if needed.

---

## 10. Edge confidence

Edge confidence expresses confidence in relationship, not node content.

Example:

```json
{
  "type": "label_of",
  "from": "text_dob",
  "to": "field_dob",
  "confidence": 0.87
}
```

Edge confidence may use:

- distance
- alignment
- parser compatibility
- label alias match
- template projection
- user correction

---

## 11. Edge metadata examples

### Label/value metadata

```json
{
  "distanceNorm": 0.028,
  "direction": "right",
  "sameBaseline": true,
  "aliasMatch": "DOB",
  "pattern": "label_colon_value"
}
```

### Conflict metadata

```json
{
  "conflictType": "value_mismatch",
  "field": "dateOfBirth",
  "leftValue": "1999-02-01",
  "rightValue": "1999-03-01",
  "severity": "critical"
}
```

### Template projection metadata

```json
{
  "templateId": "passport_td3_v1",
  "templateFieldId": "field_passport_number",
  "projectionConfidence": 0.93,
  "transformIds": ["homography_1", "local_offset_3"]
}
```

---

## 12. Edge creation rules

Edges can be created by:

- graph builder
- geometry engine
- hypothesis generator
- table engine
- verifier
- template matcher
- correction pipeline

Every edge should cite evidence where possible.

---

## 13. Edge deletion policy

Avoid destructive deletion.

If a relationship is rejected:

- mark edge inactive/rejected in metadata, or
- preserve prior edge and add correction/provenance

For performance, final serialized graph may omit rejected low-value candidate edges, but audit mode should preserve relevant decisions.

---

## 14. Important graph patterns

### 14.1 Label-value field

```text
TextLine("DOB") --label_of--> Field("Date of Birth")
TextLine("01/02/1999") --value_of--> Field("Date of Birth")
Field --validated_by--> DateValidation
```

### 14.2 Photo field

```text
VisualAsset(photo) --value_of--> Field("Portrait Photo")
VisualAsset(photo) --validated_by--> FacePresenceValidation
```

### 14.3 MRZ conflict

```text
MRZNode --confirms--> Field("Passport Number")
MRZNode --conflicts_with--> Field("Date of Birth")
```

### 14.4 Invoice total

```text
TableNode --confirms--> Field("Invoice Total")
Field("Subtotal") --part_of--> InvoiceSummary
Field("Tax") --part_of--> InvoiceSummary
Field("Total") --validated_by--> ArithmeticValidation
```

---

## 15. Edge invariants

1. Edges must connect valid node IDs.
2. Semantic edges must have evidence or algorithm provenance.
3. Conflict edges must not be hidden.
4. Template projection edges must include template metadata.
5. Correction edges must preserve before/after.
6. Table edges must preserve row/column structure.
7. Edge confidence is relationship confidence, not field truth.

---

## 16. Final edge rule

Edges are how the system moves from isolated evidence to document understanding. Without edges, the DocGraph is just a bag of detections. With edges, it becomes a structured, explainable document model.
