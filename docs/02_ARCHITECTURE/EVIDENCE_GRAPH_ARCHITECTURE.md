# Evidence Graph Architecture — Edge DocGraph Engine

**Purpose:** Explain the core philosophy and design of the evidence graph system: all modules produce evidence, DocGraph decides, verifier assigns trust.

---

## 1. Core philosophy

The system must be built around this rule:

> No module owns truth alone.

YOLO does not own truth.  
OCR does not own truth.  
A barcode parser does not own truth.  
An MRZ parser does not own truth.  
A table model does not own truth.  
A user correction does not erase evidence.  
The DocGraph integrates evidence, and the verifier decides trust.

This architecture is what prevents the system from becoming a brittle OCR pipeline.

---

## 2. Why an evidence graph is necessary

Documents are multi-modal. A field may be supported by several types of evidence.

Example: passport number

- visual OCR near label `Passport No.`
- MRZ parsed document number
- template-projected ROI
- expected field type
- document number validator
- user correction history

The correct field value is not merely the OCR string. It is the result of evidence fusion and verification.

Example: invoice total

- OCR text near `Total`
- table arithmetic
- currency parser
- QR payload
- template region
- amount validator

Again, the final value must be graph-backed.

---

## 3. What counts as evidence

Evidence sources include:

| Evidence source | Example |
|---|---|
| OCR | text line, word, confidence, box |
| Detector | photo box, signature box, table box |
| Segmentation | mask, refined crop |
| Barcode parser | decoded QR/PDF417 payload |
| MRZ parser | parsed name, number, dates, checksum |
| Table engine | rows, columns, cells |
| Face detector | face present in portrait crop |
| Template projection | expected ROI from saved template |
| Validator | passed/failed/warn result |
| User correction | edited label, value, crop, type |
| Quality analyzer | blur/glare/low resolution warning |

Evidence is stored, not discarded.

---

## 4. DocGraph layers

The DocGraph has six conceptual layers.

```text
Layer 1: Page layer
Layer 2: Raw evidence layer
Layer 3: Object layer
Layer 4: Relationship layer
Layer 5: Hypothesis layer
Layer 6: Validation/status layer
```

### 4.1 Page layer

Represents pages, images, transforms, and quality.

Nodes:

- PageNode
- DocumentBoundaryNode
- PageQualityNode

### 4.2 Raw evidence layer

Stores model/parser/user outputs.

Nodes or records:

- OcrEvidence
- DetectionEvidence
- AssetEvidence
- CodeEvidence
- MrzEvidence
- TableEvidence
- UserCorrectionEvidence

### 4.3 Object layer

Turns evidence into document objects.

Nodes:

- TextLineNode
- TextWordNode
- TextBlockNode
- VisualAssetNode
- TableNode
- TableCellNode
- BarcodeNode
- MRZNode
- CheckboxNode

### 4.4 Relationship layer

Connects nodes spatially and semantically.

Edges:

- contains
- near
- above
- below
- left_of
- right_of
- same_row
- same_column
- label_of
- value_of
- inside_table

### 4.5 Hypothesis layer

Proposes form-level interpretations.

Nodes/records:

- FieldHypothesis
- AssetHypothesis
- TableHypothesis

### 4.6 Validation/status layer

Records validator outputs and final trust states.

Nodes/records:

- ValidationResult
- FieldStatus
- ConflictRecord

---

## 5. Evidence is append-only by default

The system should prefer append-style evidence updates.

If OCR says:

```text
DOB: 01/02/1999
```

and user corrects to:

```text
Date of Birth: 1999-02-01
```

the original OCR evidence remains. The user correction is added as new high-trust evidence. The final FieldHypothesis points to both.

Do not destroy evidence because it was wrong. Wrong evidence is useful for debugging, verifier tuning, and template safety.

---

## 6. Provenance model

Every final output should answer:

- What evidence created me?
- Which module found it?
- Which model version was used?
- Which parser validated it?
- Which user correction changed it?
- Which template projected it?
- Which validator confirmed or rejected it?

Example:

```json
{
  "field": "Date of Birth",
  "value": "1999-02-01",
  "status": "needs_review",
  "evidence": [
    "ocr_line_123",
    "template_roi_45",
    "validator_date_7",
    "user_correction_2"
  ],
  "reasons": [
    "nearby label matched alias 'DOB'",
    "OCR confidence 0.91",
    "date parser succeeded",
    "format ambiguous"
  ]
}
```

---

## 7. Evidence fusion

The system must combine evidence types.

### 7.1 Text + geometry

Label/value extraction is usually based on spatial relationships.

Examples:

- same row
- label left of value
- value below label
- colon pattern
- table header relationship

### 7.2 Text + parser

Raw OCR becomes stronger when parsed.

Examples:

- date parser
- amount parser
- email parser
- MRZ parser
- barcode payload parser

### 7.3 Text + template

Known templates provide expected regions and labels.

Example:

```text
Template expects passport_number at ROI X.
OCR reads "A1234567" inside ROI.
Validator passes.
Field becomes confirmed.
```

### 7.4 Visual + semantic

A detector may find a photo, but MediaPipe verifies it contains a face. A signature detector may find a region, but user correction may confirm it as signature.

### 7.5 Cross-source conflict

If evidence disagrees, the graph must store conflict.

Example:

```text
MRZ expiry date: 2030-01-01
Visual expiry date: 2031-01-01
Status: conflict
```

---

## 8. Field hypothesis generation

A field hypothesis is not a final value. It is a proposed structured interpretation.

It may include:

- label text
- value text
- type
- source nodes
- evidence scores
- region
- confidence
- status
- validation results

Hypothesis examples:

```text
"Invoice Number" field
"Date of Birth" field
"Portrait Photo" asset field
"Line Items" table field
"Consent Checkbox" boolean field
```

Hypotheses are generated from graph patterns.

---

## 9. Field status model

Allowed statuses:

### confirmed

The value is sufficiently supported and critical validators pass.

### needs_review

The system found a plausible value but confidence or validation is insufficient.

### missing

A required field was expected but not found.

### conflict

Evidence sources disagree.

### invalid

A value is present but fails required validation.

### unsupported

The system cannot interpret the region/type yet.

---

## 10. Confidence is explainable

Do not use a single hidden confidence number.

Use a confidence breakdown:

```ts
type EvidenceBreakdown = {
  ocr?: number;
  detector?: number;
  parser?: number;
  template?: number;
  validator?: number;
  geometry?: number;
  qualityPenalty?: number;
  userCorrection?: boolean;
};
```

Final confidence must be accompanied by reasons.

Bad:

```json
{ "confidence": 0.82 }
```

Good:

```json
{
  "confidence": 0.82,
  "status": "needs_review",
  "reasons": [
    "OCR confidence high",
    "field inside template ROI",
    "date validator passed",
    "scan glare overlaps region"
  ]
}
```

---

## 11. Graph patterns

### 11.1 Label-value pattern

```text
TextNode("Date of Birth") --label_of--> TextNode("01/02/1999")
```

Conditions:

- label-like text
- value-like text
- spatial proximity
- geometry relation
- parser compatibility

### 11.2 Asset-field pattern

```text
VisualAssetNode(photo) --value_of--> FieldNode("Portrait Photo")
```

Conditions:

- asset class
- template expectation
- face check if portrait
- crop quality

### 11.3 Table-field pattern

```text
TableNode --value_of--> FieldNode("Line Items")
TableCellNode --inside_table--> TableNode
```

### 11.4 Parser-validation pattern

```text
MRZNode --validated_by--> ValidationNode(checksum_pass)
MRZNode --confirms--> FieldNode("Passport Number")
```

### 11.5 Conflict pattern

```text
FieldNode(A) --conflicts_with--> EvidenceNode(B)
```

---

## 12. User corrections in graph

Corrections are not outside the graph.

Correction examples:

- label edit
- value edit
- type change
- region redraw
- asset type correction
- table cell correction
- checkbox correction
- template decision

Corrections should create:

- UserCorrectionEvidence
- graph patch
- provenance update
- optional TemplateGraph update

User corrections are high-trust but not magic. They must still be schema-valid.

---

## 13. TemplateGraph relationship to DocGraph

TemplateGraph is learned from a corrected DocGraph.

DocGraph represents one processed document.  
TemplateGraph represents reusable structure across documents.

TemplateGraph stores:

- anchors from graph evidence
- fields from corrected hypotheses
- asset regions from corrected asset nodes
- table schemas from corrected table nodes
- validators from verified field types
- aliases from user labels
- relationships from graph edges

TemplateGraph should never be built from raw UI form values alone.

---

## 14. Error prevention through graph design

Evidence graph architecture prevents:

- raw OCR becoming false truth
- detector false positives becoming form fields
- parser outputs overwriting visual fields silently
- templates learning wrong values
- user corrections losing original evidence
- layout drift corrupting templates
- low-quality scans producing confirmed fields

---

## 15. Implementation rules

1. Every module output must be representable as evidence.
2. Every evidence item must have source and page.
3. Coordinates must be preserved.
4. Every final field must link to evidence.
5. Every correction must create evidence.
6. Every conflict must be stored.
7. The verifier must not be bypassed.
8. The form renderer must not read raw OCR.
9. TemplateGraph must be built from corrected graph state.
10. Export must preserve evidence references.

---

## 16. Final architecture statement

The evidence graph is the heart of the product. It lets the system be local, explainable, correctable, template-learned, and safe against silent errors. Models can improve over time, but the graph architecture is what makes the product trustworthy.
