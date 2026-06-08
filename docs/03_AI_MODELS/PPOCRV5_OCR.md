# PP-OCRv5 OCR — Edge DocGraph Engine

**Purpose:** Define how PP-OCRv5 mobile ONNX is used for text evidence extraction, ROI OCR, batching, confidence handling, and integration into DocGraph.

---

## 1. Role in the system

PP-OCRv5 is the core OCR model family. It reads text from documents and returns text evidence with coordinates and confidence.

It is not the entire product. It does not extract photos, signatures, tables as structured tables, MRZ validation, code payloads, or template relationships by itself.

---

## 2. OCR principles

1. OCR output must include geometry.
2. OCR output must include confidence.
3. OCR output must preserve source mode.
4. OCR should run differently for unknown and known templates.
5. OCR evidence must be stored in DocGraph.
6. OCR confidence alone is not final trust.
7. Critical fields require validation.

---

## 3. OCR modes

### 3.1 Full-page OCR

Used for unknown documents to understand global text and relationships.

Pros:

- finds unexpected labels
- helps document type inference
- helps text anchors
- helps field hypothesis generation

Cons:

- slower
- less accurate on tiny text
- may produce noisy reading order

Use strategically.

### 3.2 Text-block OCR

Run OCR on detected text blocks from YOLOv11n.

Pros:

- improves local accuracy
- reduces page noise
- maps text to layout regions

### 3.3 ROI OCR

Used for known templates and user-selected regions.

Pros:

- fast
- focused
- can upscale small fields
- best for repeated extraction

### 3.4 MRZ OCR

Special OCR mode for MRZ region.

Needs:

- high-resolution crop
- OCR-B normalization
- strict line length checking
- parser validation

### 3.5 Table-cell OCR

OCR on table cell crops.

Useful for:

- invoices
- receipts
- bank statements
- forms with grids

### 3.6 Rotated text OCR

If rotation is detected for a region, rotate crop and OCR separately.

---

## 4. OCR engine interface

```ts
interface OcrEngine {
  initialize(config: OcrConfig): Promise<void>;

  recognizePage(input: PageImage, options?: PageOcrOptions): Promise<OcrEvidence[]>;

  recognizeRoi(
    input: PageImage,
    roi: NormalizedBox,
    options?: RoiOcrOptions
  ): Promise<OcrEvidence[]>;

  recognizeBatch(
    input: PageImage,
    rois: NormalizedBox[],
    options?: BatchOcrOptions
  ): Promise<OcrEvidence[][]>;

  dispose(): Promise<void>;

  getInfo(): ModelInfo;
}
```

---

## 5. OCR evidence structure

```ts
type OcrEvidence = {
  id: string;
  source: "ocr";
  documentId: string;
  pageId: string;
  text: string;
  normalizedText?: string;
  boxNorm: NormalizedBox | NormalizedPolygon;
  boxOriginalPx?: Box | Polygon;
  confidence: number;
  mode: "full_page" | "text_block" | "roi" | "mrz" | "table_cell" | "rotated";
  languageHint?: string;
  scriptHint?: string;
  alternatives?: Array<{
    text: string;
    confidence: number;
  }>;
  modelName: "pp-ocrv5-mobile";
  modelVersion: string;
  createdAt: number;
};
```

---

## 6. Text normalization

OCR raw text must be preserved. Normalized text is additional.

Normalization may include:

- trim whitespace
- normalize Unicode
- normalize common OCR confusions in specific contexts
- normalize date separators
- normalize currency spacing
- uppercase MRZ
- remove spaces in ID numbers where appropriate

Rule:

> Never overwrite raw OCR text. Store normalized text separately.

---

## 7. Confidence handling

OCR confidence is one signal, not final status.

### 7.1 Low confidence

Actions:

- try higher-resolution ROI
- try expanded ROI
- try rotated crop if needed
- pass to parser/validator
- mark needs_review if still uncertain

### 7.2 High confidence

High OCR confidence does not guarantee correctness.

Example:

- OCR confidently reads a date, but date format is ambiguous.
- OCR confidently reads a total, but table arithmetic disagrees.

Verifier decides final status.

---

## 8. ROI OCR strategy

### 8.1 Known template

For each TemplateField:

```text
project ROI
expand ROI
crop
upscale if small
OCR
parse
validate
if fail, search nearby
```

### 8.2 Unknown document

Use OCR on:

- full page
- detected text blocks
- detected special zones
- table regions
- small candidates

### 8.3 ROI expansion

Recommended defaults:

- text field: 5–10%
- ID field: 5–15%
- date field: 5–10%
- MRZ: 2–5%
- table cell: 2–5%

Expansion should be configurable.

---

## 9. Batching

OCR recognition should batch crops where possible.

Batching improves performance for:

- known-template fields
- table cells
- multiple text blocks
- repeated small fields

Batching rules:

- group crops by expected size when possible
- avoid huge mixed-size batches if runtime suffers
- preserve mapping from crop to output
- handle failed crop individually

---

## 10. MRZ OCR handling

MRZ has special rules.

### 10.1 Preprocessing

- crop tightly around MRZ zone
- upscale if needed
- increase contrast
- preserve two/three lines
- avoid aggressive denoise that changes characters

### 10.2 Normalization

Common confusions:

- O ↔ 0
- I ↔ 1
- B ↔ 8
- S ↔ 5
- Z ↔ 2
- < recognized as other punctuation

Normalize only in MRZ context and record changes.

### 10.3 Validation

MRZ parser must validate check digits. OCR result should not be trusted without parser result.

---

## 11. Table OCR handling

For table cells:

1. detect/reconstruct table
2. crop cells
3. OCR each cell or row
4. assign text to cell nodes
5. validate numeric/date columns where possible

Avoid flattening table text into one blob.

---

## 12. Reading order

OCR may produce lines in imperfect order.

DocGraph should compute reading order using:

- OCR order
- y-position
- x-position
- column detection
- table structure
- layout regions

Do not rely only on OCR order for form extraction.

---

## 13. Integration with DocGraph

OCR evidence becomes:

- TextWordNode
- TextLineNode
- TextBlockNode

Edges:

- contains
- near
- same_row
- same_column
- maybe_label
- maybe_value

OCR does not directly create final FieldNode without hypothesis and verification.

---

## 14. Integration with TemplateGraph

TemplateGraph may store:

- expected OCR mode
- ROI boxes
- label aliases
- static text anchors
- required field rules
- parser expectations

Important:

Do not learn variable OCR values as anchors by default.

---

## 15. OCR model integration choices

### 15.1 Preferred long-term

Custom ONNX Runtime Web wrapper around PP-OCRv5 mobile models.

Benefits:

- control over sessions
- ROI batching
- evidence formatting
- worker integration
- model cache
- versioning

### 15.2 Trial paths

- official PaddleOCR.js
- ppu-paddle-ocr

Trial criteria:

- accuracy
- latency
- coordinates
- confidence
- memory
- integration complexity
- batch support
- model version transparency

---

## 16. Benchmark metrics

OCR benchmarks:

- CER
- WER
- line detection recall
- box IoU
- ROI OCR accuracy
- MRZ OCR CER
- table-cell OCR accuracy
- latency per page
- latency per ROI
- batch throughput
- memory peak

Most critical:

- small-field accuracy
- ID/date/amount exactness
- MRZ OCR quality
- coordinate reliability

---

## 17. Failure modes

### 17.1 Low-quality scan

Mitigation:

- quality warning
- ROI retry
- mark needs_review

### 17.2 Tiny text

Mitigation:

- high-resolution crop
- upscale
- ROI OCR
- template projection

### 17.3 Decorative fonts

Mitigation:

- review status
- user correction
- template memory

### 17.4 Multi-column text

Mitigation:

- layout region detection
- reading order logic

### 17.5 OCR hallucinated characters

Mitigation:

- validators
- parser constraints
- cross-field checks
- show source crop

---

## 18. Acceptance criteria

OCR integration is acceptable only if:

- returns coordinates and confidence
- supports ROI OCR
- runs locally
- runs in worker
- is benchmarked on target samples
- preserves raw text
- integrates into evidence records
- does not block UI
- handles model errors gracefully
- supports versioning

---

## 19. Final OCR rule

PP-OCRv5 is the text evidence engine. It must be precise, local, coordinate-preserving, ROI-capable, and verifier-controlled. It is not allowed to be the final authority on document fields.
