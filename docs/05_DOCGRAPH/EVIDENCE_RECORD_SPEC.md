# Evidence Record Specification — Edge DocGraph Engine

**Purpose:** Define how every model, parser, validator, template projection, and user action records evidence in a consistent, audit-ready format.

---

## 1. What is an EvidenceRecord?

An EvidenceRecord is a structured observation or action that supports, disputes, or modifies the interpretation of a document.

Evidence is produced by:

- OCR
- detector
- segmentation
- barcode parser
- MRZ parser
- table engine
- face detector
- PDF embedded text extractor
- quality analyzer
- template projector
- validator
- user correction

Evidence records are the raw truth trail of the system.

---

## 2. Evidence principle

Every final output must be able to answer:

```text
What evidence supports this?
Where is the evidence on the page?
Which component produced it?
When was it produced?
What confidence did it have?
Was it corrected?
Which validator checked it?
```

If it cannot answer these questions, it is not acceptable.

---

## 3. Base EvidenceRecord

```ts
type EvidenceRecord = {
  id: string;
  documentId: string;
  pageId?: string;

  source: EvidenceSource;
  kind: EvidenceKind;

  targetNodeIds?: string[];

  boxNorm?: NormalizedBox;
  polygonNorm?: NormalizedPolygon;

  confidence?: number;

  payload: Record<string, unknown>;

  provenance: ProvenanceRecord[];

  createdAt: number;
};
```

---

## 4. EvidenceSource

```ts
type EvidenceSource =
  | "pdf_embedded_text"
  | "page_quality"
  | "detector"
  | "ocr"
  | "segmentation"
  | "barcode_parser"
  | "mrz_parser"
  | "table_engine"
  | "face_detector"
  | "template_projection"
  | "validator"
  | "user_correction"
  | "manual_import";
```

---

## 5. EvidenceKind

```ts
type EvidenceKind =
  | "text"
  | "object_detection"
  | "visual_asset"
  | "mask"
  | "code_payload"
  | "mrz_parse"
  | "table_structure"
  | "table_cell"
  | "checkbox_state"
  | "validation"
  | "quality_warning"
  | "template_roi"
  | "correction"
  | "unknown";
```

---

## 6. OCR evidence

```ts
type OcrEvidencePayload = {
  text: string;
  normalizedText?: string;
  mode: "full_page" | "text_block" | "roi" | "mrz" | "table_cell" | "rotated";
  alternatives?: Array<{
    text: string;
    confidence: number;
  }>;
  languageHint?: string;
  preprocessing?: Record<string, unknown>;
  modelName: string;
  modelVersion: string;
};
```

Example:

```json
{
  "source": "ocr",
  "kind": "text",
  "pageId": "page_1",
  "boxNorm": [0.12, 0.18, 0.26, 0.21],
  "confidence": 0.94,
  "payload": {
    "text": "Invoice No.",
    "mode": "roi",
    "modelName": "pp-ocrv5-mobile",
    "modelVersion": "0.1.0"
  }
}
```

---

## 7. Detector evidence

```ts
type DetectionEvidencePayload = {
  className: string;
  modelName: string;
  modelVersion: string;
  inputSize: [number, number];
  thresholdConfigId?: string;
  nmsConfigId?: string;
};
```

---

## 8. Segmentation evidence

```ts
type SegmentationEvidencePayload = {
  assetType: string;
  maskId: string;
  rawCropId?: string;
  refinedCropId?: string;
  modelName: string;
  modelVersion: string;
};
```

---

## 9. Barcode / QR evidence

```ts
type CodeEvidencePayload = {
  codeType: "qr" | "barcode" | "pdf417" | "data_matrix" | "aztec" | "unknown";
  payload?: string;
  decoded: boolean;
  parser: "zxing-wasm";
  failureReason?: string;
};
```

Rules:

- never auto-open URL payloads
- store undecodable code regions as evidence if visible
- payloads are sensitive data

---

## 10. MRZ evidence

```ts
type MrzEvidencePayload = {
  rawLines: string[];
  normalizedLines: string[];
  format: "TD1" | "TD2" | "TD3" | "unknown";
  parsed: Record<string, string | null>;
  checkDigits: Record<string, boolean>;
  status: "valid" | "partial" | "invalid";
  normalizationChanges?: Array<{
    position: number;
    from: string;
    to: string;
    reason: string;
  }>;
};
```

MRZ evidence must never hide failed check digits.

---

## 11. Table evidence

```ts
type TableEvidencePayload = {
  source: "geometry" | "slanet_plus" | "template" | "user_correction";
  rowCount?: number;
  columnCount?: number;
  cellIds?: string[];
  structureConfidence: number;
  warnings?: string[];
};
```

Cell evidence:

```ts
type TableCellEvidencePayload = {
  tableId: string;
  rowIndex: number;
  colIndex: number;
  rowSpan?: number;
  colSpan?: number;
  rawText?: string;
  parsedValue?: unknown;
};
```

---

## 12. Face detector evidence

```ts
type FaceEvidencePayload = {
  faceDetected: boolean;
  faceBoxNorm?: NormalizedBox;
  confidence?: number;
  modelName: "mediapipe-face-detector";
  modelVersion: string;
};
```

Allowed only for portrait crop sanity. Not identity.

---

## 13. Template projection evidence

```ts
type TemplateProjectionEvidencePayload = {
  templateId: string;
  familyId: string;
  version: number;
  templateElementId: string;
  projectionType: "field" | "asset" | "table" | "code" | "mrz" | "checkbox";
  projectionConfidence: number;
  transformIds: string[];
};
```

Template projection evidence supports known-template extraction but does not confirm value by itself.

---

## 14. Validation evidence

```ts
type ValidationEvidencePayload = {
  validatorId: string;
  targetId: string;
  status: "pass" | "warn" | "fail" | "not_applicable";
  severity: "info" | "low" | "medium" | "high" | "critical";
  message: string;
  details?: Record<string, unknown>;
};
```

---

## 15. User correction evidence

```ts
type UserCorrectionEvidencePayload = {
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

User corrections are high-trust evidence but must preserve prior evidence.

---

## 16. Quality warning evidence

```ts
type QualityWarningEvidencePayload = {
  warningType:
    | "blur"
    | "glare"
    | "low_resolution"
    | "missing_corner"
    | "perspective"
    | "overexposure"
    | "underexposure"
    | "crop_incomplete";
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  affectedRegionNorm?: NormalizedBox;
};
```

Quality evidence affects verification.

---

## 17. Provenance inside evidence

Every EvidenceRecord contains provenance.

```ts
type ProvenanceRecord = {
  id: string;
  actor: "system" | "model" | "parser" | "validator" | "user" | "template_engine";
  action: string;
  timestamp: number;
  modelName?: string;
  modelVersion?: string;
  parameters?: Record<string, unknown>;
};
```

---

## 18. Evidence confidence

Confidence meaning depends on source.

Examples:

- OCR confidence: text recognition certainty
- detector confidence: class/box likelihood
- parser confidence: parse quality
- template confidence: projection/match quality
- validator confidence: usually pass/fail, not probability
- user correction: high trust but not numeric certainty

Do not compare all confidence scores blindly.

---

## 19. Evidence retention

Do not delete evidence just because it was wrong.

If evidence is rejected:

- keep record if relevant
- add correction or rejection evidence
- mark hypothesis rejected
- preserve audit trail

---

## 20. Evidence and sensitive data

Evidence may contain sensitive data:

- identity fields
- MRZ
- barcode payloads
- names
- addresses
- financial values
- image crops

Storage/export must respect privacy rules.

---

## 21. Evidence validation

Evidence records must validate:

- required IDs
- source enum
- kind enum
- coordinate ranges
- confidence range 0–1 if present
- payload shape according to source/kind
- provenance present

---

## 22. Evidence examples

### OCR

```json
{
  "id": "ev_ocr_1",
  "documentId": "doc_1",
  "pageId": "page_1",
  "source": "ocr",
  "kind": "text",
  "boxNorm": [0.1, 0.2, 0.3, 0.23],
  "confidence": 0.93,
  "payload": {
    "text": "Date of Birth",
    "mode": "full_page",
    "modelName": "pp-ocrv5-mobile",
    "modelVersion": "0.1.0"
  },
  "provenance": []
}
```

### User correction

```json
{
  "id": "ev_corr_1",
  "documentId": "doc_1",
  "source": "user_correction",
  "kind": "correction",
  "payload": {
    "correctionKind": "label_edit",
    "targetId": "field_1",
    "before": "DOB",
    "after": "Date of Birth"
  },
  "provenance": []
}
```

---

## 23. Invariants

1. Evidence records are the source trail.
2. Evidence must not be overwritten destructively.
3. Evidence must include source and kind.
4. Evidence with geometry must use normalized coordinates.
5. Evidence must be linked to nodes/hypotheses where used.
6. Sensitive evidence must be handled carefully.
7. Every confirmed field must cite evidence.

---

## 24. Final statement

EvidenceRecord is the atomic trust unit of the system. The project’s reliability depends on recording every observation, parser result, validation, projection, and correction in a consistent, auditable form.
