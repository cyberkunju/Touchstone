# Internal Types — API and Schema Reference

**Purpose:** Document the core TypeScript interfaces used by the project. These are implementation-facing and must align with the machine-readable schemas.

---

## 1. ID types

Use branded IDs.

```ts
type Brand<T, Name extends string> = T & { readonly __brand: Name };

type DocumentId = Brand<string, "DocumentId">;
type PageId = Brand<string, "PageId">;
type NodeId = Brand<string, "NodeId">;
type EdgeId = Brand<string, "EdgeId">;
type EvidenceId = Brand<string, "EvidenceId">;
type FieldId = Brand<string, "FieldId">;
type TemplateId = Brand<string, "TemplateId">;
type ValidationId = Brand<string, "ValidationId">;
```

---

## 2. Geometry types

```ts
type NormalizedBox = readonly [number, number, number, number];
type PixelBox = readonly [number, number, number, number];
type Point = readonly [number, number];

type PageTransform = {
  id: string;
  type: "identity" | "affine" | "homography" | "local_correction";
  matrix?: number[];
  confidence: number;
};
```

---

## 3. Status and value types

```ts
type FieldStatus =
  | "confirmed"
  | "needs_review"
  | "missing"
  | "conflict"
  | "invalid"
  | "unsupported"
  | "rejected";

type ValueType =
  | "text"
  | "name"
  | "date"
  | "amount"
  | "id_number"
  | "address"
  | "phone"
  | "email"
  | "country"
  | "photo"
  | "signature"
  | "stamp"
  | "seal"
  | "logo"
  | "emblem"
  | "flag"
  | "symbol"
  | "qr"
  | "barcode"
  | "mrz"
  | "table"
  | "checkbox"
  | "unknown";
```

---

## 4. DocGraph

```ts
type DocGraph = {
  id: string;
  schemaVersion: "docgraph-v1";
  documentId: DocumentId;
  createdAt: number;
  updatedAt: number;

  metadata: DocGraphMetadata;
  pages: PageNode[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  evidence: EvidenceRecord[];
  hypotheses: FieldHypothesis[];
  validations: ValidationResult[];
  conflicts?: ConflictRecord[];
};
```

---

## 5. GraphNode

```ts
type GraphNode = {
  id: NodeId;
  type: GraphNodeType;
  pageId: PageId;
  boxNorm: NormalizedBox;
  confidence?: number;
  evidenceIds: EvidenceId[];
  payload: Record<string, unknown>;
  sensitivity?: DataSensitivity;
};
```

---

## 6. GraphEdge

```ts
type GraphEdge = {
  id: EdgeId;
  type: GraphEdgeType;
  from: NodeId;
  to: NodeId;
  confidence: number;
  evidenceIds: EvidenceId[];
  payload?: Record<string, unknown>;
};
```

---

## 7. EvidenceRecord

```ts
type EvidenceRecord = {
  id: EvidenceId;
  schemaVersion: "evidence-v1";
  documentId: DocumentId;
  pageId?: PageId;
  source: EvidenceSource;
  kind: EvidenceKind;
  createdAt: number;
  model?: ModelRunInfo;
  confidence: number;
  targetRefs: EvidenceTargetRef[];
  pageRef?: PageEvidenceRef;
  payload: Record<string, unknown>;
  sensitivity: DataSensitivity;
};
```

Evidence is immutable. Corrections create new evidence; they do not overwrite old evidence.

---

## 8. FieldHypothesis

```ts
type FieldHypothesis = {
  id: FieldId;
  label: string;
  canonicalLabel?: string;
  value?: unknown;
  displayValue?: string | null;
  normalizedValue?: unknown;
  valueType: ValueType;
  status: FieldStatus;
  confidence: number;

  labelNodeIds: NodeId[];
  valueNodeIds: NodeId[];
  assetNodeIds: NodeId[];

  boxNorm: NormalizedBox;
  evidenceIds: EvidenceId[];
  validationIds?: ValidationId[];
  reasons?: string[];
  required?: boolean;
  sensitivity?: DataSensitivity;
};
```

---

## 9. ValidationResult

```ts
type ValidationResult = {
  id: ValidationId;
  schemaVersion: "validation-v1";
  documentId: DocumentId;
  targetId: string;
  targetType?: string;
  validatorId: string;
  validatorVersion?: string;
  status: "pass" | "warn" | "fail" | "not_applicable";
  severity: "info" | "low" | "medium" | "high" | "critical";
  message: string;
  details?: Record<string, unknown>;
  evidenceIds: EvidenceId[];
  createdAt: number;
};
```

---

## 10. TemplateGraph

```ts
type TemplateGraph = {
  id: TemplateId;
  schemaVersion: "templategraph-v1";
  familyId: string;
  version: number;
  name: string;
  docType?: string | null;
  status: "active" | "draft" | "deprecated" | "archived";
  createdAt: number;
  updatedAt: number;

  pageCount: number;
  canonicalPages: CanonicalPage[];
  anchors: TemplateAnchor[];
  fields: TemplateField[];
  assets: TemplateAsset[];
  tables: TemplateTable[];
  codes?: TemplateCode[];
  validators: TemplateValidator[];
  relationships?: TemplateRelationship[];
  fingerprint: TemplateFingerprint;
};
```

---

## 11. Editable form

```ts
type EditableForm = {
  id: string;
  schemaVersion: "form-v1";
  documentId: DocumentId;
  templateId?: TemplateId;
  createdAt: number;
  updatedAt?: number;
  sections: FormSection[];
  fields: FormField[];
  reviewSummary: ReviewSummary;
};
```

---

## 12. Worker protocol

```ts
type WorkerRequest =
  | { type: "process_document"; input: ProcessDocumentInput }
  | { type: "cancel_job"; input: CancelJobInput }
  | { type: "run_detection"; input: DetectionInput }
  | { type: "run_ocr"; input: OcrInput }
  | { type: "parse_mrz"; input: MrzParseInput }
  | { type: "parse_barcode"; input: BarcodeDecodeInput }
  | { type: "extract_table"; input: TableExtractionInput }
  | { type: "verify_graph"; input: VerifierInput };
```

---

## 13. Result type

```ts
type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

Use `Result` for recoverable domain failures.

---

## 14. Type alignment rule

The TypeScript interfaces and JSON schemas must evolve together. Any schema version change must update:

- `DOCGRAPH_SCHEMA.json`
- `TEMPLATEGRAPH_SCHEMA.json`
- `FORM_SCHEMA.json`
- `EVIDENCE_SCHEMA.json`
- `VALIDATION_SCHEMA.json`
- TypeScript interfaces
- examples
- migration tests
- export/import validation
