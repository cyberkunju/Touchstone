# Data Flow — Edge DocGraph Engine

**Purpose:** Define the exact flow of data from file upload to final form, TemplateGraph learning, and known-template repeated extraction.

---

## 1. Data flow principle

Data must not collapse into plain text early.

The system must preserve:

- original file identity
- page identity
- coordinates
- transforms
- evidence source
- model/parser version
- confidence
- provenance
- validation results
- user corrections

Every output should be traceable back to evidence.

---

## 2. Primary data objects

```text
RawFile
  → DocumentRecord
  → PageRecord
  → NormalizedPage
  → EvidenceRecord[]
  → DocGraph
  → FieldHypothesis[]
  → ValidationResult[]
  → FormSchema
  → FormValues
  → UserCorrectionEvidence[]
  → TemplateGraph
```

---

## 3. Upload-to-page data flow

```text
User file
  → Upload UI
  → Input Manager
  → File Type Detector
  → DocumentRecord
  → PageRecord[]
```

### 3.1 Raw file

Data captured:

```ts
type RawFileInfo = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  lastModified?: number;
};
```

Rules:

- do not upload file
- do not parse on main thread if heavy
- do not persist raw file unless user or workflow allows

### 3.2 DocumentRecord

```ts
type DocumentRecord = {
  id: string;
  name: string;
  fileType: "image" | "pdf";
  status: "new" | "processing" | "review" | "complete" | "error";
  pages: string[];
  createdAt: number;
};
```

### 3.3 PageRecord

```ts
type PageRecord = {
  id: string;
  documentId: string;
  pageIndex: number;
  originalWidthPx: number;
  originalHeightPx: number;
  originalImageId?: string;
  renderedImageId?: string;
  normalizedImageId?: string;
  canonicalWidth: number;
  canonicalHeight: number;
};
```

---

## 4. PDF data flow

### 4.1 Digital PDF

```text
PDF file
  → PDF.js parse
  → page dimensions
  → embedded text content
  → text coordinate evidence
  → page render for visual/model tasks
```

Output evidence:

- embedded text nodes
- font/position metadata where available
- rendered page image

Important:

Embedded PDF text is evidence, not final truth. It still must enter DocGraph and be validated.

### 4.2 Scanned PDF

```text
PDF file
  → page raster render
  → image pipeline
  → OCR/detection/parsing
```

### 4.3 PDFium quality bucket

If PDF.js render quality is insufficient:

```text
PDF file
  → PDFium WASM high-DPI render
  → normalized page image
```

PDF.js may still be used for logical text.

---

## 5. Image normalization data flow

```text
Page image
  → quality analyzer
  → boundary detector
  → orientation corrector
  → perspective/deskew transform
  → normalized page image
  → coordinate transform records
```

Output:

```ts
type PageQualityReport = {
  blur: QualitySignal;
  glare: QualitySignal;
  contrast: QualitySignal;
  resolution: QualitySignal;
  cropCompleteness: QualitySignal;
  perspectiveSeverity: QualitySignal;
  orientationConfidence: number;
  safeToExtract: boolean;
  warnings: string[];
};
```

Transform record:

```ts
type PageTransform = {
  id: string;
  type: "rotation" | "perspective" | "deskew" | "scale" | "local_offset";
  fromSpace: "original" | "rendered" | "normalized" | "template";
  toSpace: "original" | "rendered" | "normalized" | "template";
  matrix?: number[];
  createdBy: string;
};
```

---

## 6. Evidence extraction data flow

```text
NormalizedPage
  → detector evidence
  → OCR evidence
  → asset crop evidence
  → code evidence
  → MRZ evidence
  → table evidence
  → face check evidence
  → evidence store
```

### 6.1 Detector evidence

```ts
type DetectionEvidence = {
  id: string;
  source: "detector";
  pageId: string;
  className: string;
  boxNorm: NormalizedBox;
  boxOriginalPx?: Box;
  confidence: number;
  modelName: string;
  modelVersion: string;
};
```

### 6.2 OCR evidence

```ts
type OcrEvidence = {
  id: string;
  source: "ocr";
  pageId: string;
  text: string;
  boxNorm: NormalizedBox | NormalizedPolygon;
  confidence: number;
  mode: "full_page" | "roi" | "text_block" | "mrz" | "table_cell";
  modelName: string;
  modelVersion: string;
};
```

### 6.3 Asset evidence

```ts
type AssetEvidence = {
  id: string;
  source: "detector" | "segmentation" | "template_projection" | "user_correction";
  pageId: string;
  assetType: string;
  boxNorm: NormalizedBox;
  cropId: string;
  maskId?: string;
  confidence: number;
};
```

### 6.4 Parser evidence

Parser evidence includes:

- CodeEvidence
- MrzEvidence
- TableEvidence
- DateParseEvidence
- AmountParseEvidence

Parser evidence must link to source OCR or image region.

---

## 7. Evidence-to-DocGraph data flow

```text
EvidenceRecord[]
  → Evidence Store
  → Node creation
  → Edge creation
  → Provenance links
  → DocGraph
```

### 7.1 Node creation

Evidence becomes graph nodes.

Examples:

```text
OCR line evidence → TextLineNode
Detector photo evidence → VisualAssetNode
MRZ parser evidence → MRZNode
Table engine evidence → TableNode + TableCellNode
Barcode parser evidence → BarcodeNode
```

### 7.2 Edge creation

Edges are created from:

- geometry
- containment
- spatial proximity
- OCR reading order
- parser relationships
- table structure
- template projection
- user corrections
- validator links

Example:

```text
TextLineNode("Date of Birth") --label_of--> TextLineNode("01/02/1999")
FieldNode("Date of Birth") --validated_by--> ValidationNode("date_format_pass")
MRZNode --conflicts_with--> FieldNode("DOB") if mismatch
```

---

## 8. DocGraph-to-hypothesis data flow

```text
DocGraph
  → candidate labels
  → candidate values
  → label/value pairing
  → asset mapping
  → table mapping
  → field hypotheses
```

Signals:

- label-value distance
- same row/column
- colon patterns
- template aliases
- parser outputs
- table headers
- special zones
- document type hints
- user correction history

Output:

```ts
type FieldHypothesis = {
  id: string;
  label: string;
  value: string | null;
  valueType: string;
  labelNodeIds: string[];
  valueNodeIds: string[];
  assetNodeIds: string[];
  boxNorm: NormalizedBox;
  confidence: number;
  evidenceBreakdown: Record<string, number | boolean>;
  status: "unverified" | "confirmed" | "needs_review" | "missing" | "conflict" | "invalid";
};
```

---

## 9. Hypothesis-to-verification data flow

```text
FieldHypothesis[]
  → validator registry
  → validation results
  → verifier
  → final statuses
```

Validators produce:

```ts
type ValidationResult = {
  id: string;
  targetId: string;
  validatorId: string;
  status: "pass" | "warn" | "fail" | "not_applicable";
  severity: "info" | "low" | "medium" | "high" | "critical";
  reason: string;
  evidenceIds: string[];
};
```

Verifier combines:

- OCR confidence
- detector confidence
- parser status
- template score
- quality report
- validators
- conflicts
- missing required fields

Output statuses:

- confirmed
- needs_review
- missing
- conflict
- invalid

---

## 10. Verified graph-to-form data flow

```text
DocGraph + FieldHypothesis[] + ValidationResult[]
  → FormGenerator
  → FormSchema
  → FormValues
  → UI
```

Form schema:

```ts
type FormField = {
  id: string;
  label: string;
  type: "text" | "date" | "amount" | "id_number" | "image" | "table" | "checkbox" | "code" | "unknown";
  required: boolean;
  hypothesisId: string;
  sourceNodeIds: string[];
  status: FieldStatus;
};
```

Form value:

```ts
type FormValue = {
  fieldId: string;
  value: unknown;
  displayValue?: string;
  confidence: number;
  status: FieldStatus;
  evidenceIds: string[];
};
```

Rule:

> The form must never be the only place where data exists. The DocGraph remains source of truth.

---

## 11. Correction data flow

```text
User action
  → Correction UI
  → UserCorrectionEvidence
  → DocGraph patch
  → re-verify affected nodes
  → update form
  → optional TemplateGraph update/save
```

Correction example:

```ts
type UserCorrectionEvidence = {
  id: string;
  source: "user_correction";
  correctionKind: "label_edit" | "value_edit" | "type_change" | "region_edit" | "asset_type_change" | "table_edit";
  targetId: string;
  before: unknown;
  after: unknown;
  createdAt: number;
};
```

Rules:

- preserve original evidence
- corrections do not erase OCR/detector output
- corrections must be auditable
- template learning must distinguish static anchors from variable values

---

## 12. TemplateGraph data flow

```text
Corrected DocGraph
  → TemplateGraph Builder
  → anchors
  → normalized ROIs
  → validators
  → aliases
  → table schemas
  → version metadata
  → encrypted local storage
```

TemplateGraph contains:

- text anchors
- visual anchors
- geometry anchors
- keypoint anchors
- special-zone anchors
- fields
- assets
- tables
- aliases
- validators
- relationships
- fingerprint
- version

---

## 13. Known-template data flow

```text
New document
  → normalize
  → candidate template retrieval
  → template match score
  → alignment transform
  → ROI projection
  → local correction
  → ROI OCR / parser / asset crop
  → DocGraph evidence
  → verification
  → form fill
```

Template matching uses:

- text anchors
- visual anchors
- layout histogram
- keypoints
- special zones
- required-field presence
- geometry

If match fails:

```text
known-template flow → unknown-document flow
```

If partial match:

```text
known-template flow → new version suggestion
```

---

## 14. Export data flow

```text
DocGraph + FormValues + Assets
  → Export Service
  → JSON / CSV / assets / template package
```

Export types:

- form JSON
- flat CSV
- table CSV
- DocGraph JSON
- TemplateGraph JSON
- asset ZIP
- evidence debug package

Export rules:

- warn before exporting sensitive evidence
- preserve schema version
- include model/parser versions when useful
- allow redacted exports later

---

## 15. Storage data flow

```text
Structured data → IndexedDB
Large binary artifacts → OPFS
Sensitive content → WebCrypto encryption
Model files → model cache
```

Structured records:

- DocumentRecord
- PageRecord
- DocGraph metadata
- TemplateGraph metadata
- FormSchema
- FormValues
- ValidationResults

Binary artifacts:

- page images
- normalized pages
- crops
- masks
- thumbnails
- model files

---

## 16. Error data flow

Errors must become structured results, not crashes.

```text
module error
  → Error Router
  → job status
  → graph warning if relevant
  → UI message
  → recovery option
```

Example errors:

- PDF render failed
- OCR model load failed
- detector timeout
- barcode parse failed
- MRZ checksum failed
- template match ambiguous
- OPFS write failed

Critical difference:

- parser validation failure is not necessarily system error
- model crash is system error
- low OCR confidence is evidence uncertainty

---

## 17. Data flow invariants

1. Raw OCR text does not become final form directly.
2. Every output field has evidence IDs.
3. Every evidence item has source and page.
4. Every coordinate is typed as original, normalized, or viewer.
5. User correction never deletes provenance.
6. TemplateGraph is built from corrected DocGraph.
7. Known-template extraction creates new evidence, not blind copied values.
8. Validation results are first-class data.
9. Storage and export use schemas.
10. Sensitive data never leaves device without explicit export.

---

## 18. Final data flow summary

The system flows from raw documents to normalized pages, to evidence, to DocGraph, to hypotheses, to verification, to forms, to corrections, to TemplateGraphs. Every stage preserves traceability. This is what makes the system debuggable, trustworthy, and learnable.
