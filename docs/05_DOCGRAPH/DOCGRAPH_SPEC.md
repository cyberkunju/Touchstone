# DocGraph Specification — Edge DocGraph Engine

**Purpose:** Define the complete graph model used to represent a document: pages, nodes, edges, evidence, validators, hypotheses, confidence, provenance, and auditability.

---

## 1. Core definition

A **DocGraph** is the source-of-truth data structure for one processed document.

It represents a document as:

- pages
- visual/text/object nodes
- relationships between nodes
- evidence records
- field hypotheses
- validation results
- provenance records
- quality warnings
- template links
- user corrections

The DocGraph is not only a storage format. It is the central architecture boundary between extraction models, parsers, verification, UI, correction, template learning, and export.

---

## 2. Core philosophy

The DocGraph exists because document understanding cannot be trusted if the system only stores final values.

Bad model:

```text
OCR / model output → JSON field
```

Correct model:

```text
OCR / detector / parser / validator / user correction
  → EvidenceRecord
  → DocGraph node/edge
  → FieldHypothesis
  → Verifier status
  → Editable form
```

Every field, asset, table, MRZ value, barcode payload, checkbox state, and user correction must be traceable back to evidence.

---

## 3. Top-level DocGraph object

```ts
type DocGraph = {
  id: string;
  documentId: string;
  schemaVersion: string;

  metadata: DocGraphMetadata;

  pages: PageNode[];

  nodes: GraphNode[];
  edges: GraphEdge[];

  evidence: EvidenceRecord[];
  hypotheses: FieldHypothesis[];
  validations: ValidationResult[];

  provenance: ProvenanceRecord[];
  quality: DocumentQualitySummary;

  templateContext?: TemplateContext;

  createdAt: number;
  updatedAt: number;
};
```

---

## 4. Metadata

```ts
type DocGraphMetadata = {
  documentName?: string;
  sourceFileType: "image" | "pdf" | "unknown";
  pageCount: number;
  processingMode:
    | "unknown_document"
    | "known_template"
    | "new_template_version"
    | "manual_review";
  runtime: {
    appVersion: string;
    workerVersion?: string;
    browser?: string;
    executionProvider?: "webgpu" | "wasm" | "native" | "unknown";
  };
};
```

The metadata must not contain sensitive extracted values unless necessary.

---

## 5. Page model

Every document page is represented as a PageNode.

```ts
type PageNode = {
  id: string;
  type: "page";
  documentId: string;
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

  evidenceIds: string[];
};
```

PageNode is where coordinate mappings and quality signals begin.

---

## 6. Coordinate systems

The graph must distinguish coordinate spaces.

### 6.1 Original pixel coordinates

Coordinates in the original uploaded/rasterized image.

```ts
type BoxPx = [number, number, number, number];
```

### 6.2 Normalized page coordinates

Coordinates relative to normalized page, from 0 to 1.

```ts
type NormalizedBox = [number, number, number, number];
```

### 6.3 Canonical coordinates

A normalized layout size, usually:

```text
canonical_width = 1000
canonical_height = proportional
```

### 6.4 Viewer coordinates

UI-only coordinate space. Do not store as graph truth.

---

## 7. Graph nodes

Graph nodes are entities in the document.

Major groups:

```text
Page nodes
Text nodes
Visual asset nodes
Structured object nodes
Field nodes
Table nodes
Parser result nodes
Validation nodes
Template anchor nodes
Correction nodes
```

Base node:

```ts
type BaseGraphNode = {
  id: string;
  type: GraphNodeType;
  pageId?: string;
  boxNorm?: NormalizedBox;
  polygonNorm?: NormalizedPolygon;
  evidenceIds: string[];
  confidence?: number;
  status?: NodeStatus;
  createdAt: number;
  updatedAt?: number;
};
```

---

## 8. Graph edges

Edges represent relationships.

Base edge:

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

Common edge types:

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
- validated_by
- conflicts_with
- confirms
- derived_from
- template_projected_from
- corrected_by

---

## 9. Evidence records

Evidence records are raw observations or actions.

Evidence sources:

- detector
- OCR
- segmentation
- barcode parser
- MRZ parser
- table engine
- face detector
- PDF embedded text
- page quality analyzer
- template projection
- validator
- user correction

Base evidence:

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

## 10. Field hypotheses

A FieldHypothesis is a proposed form field.

It may come from:

- label/value OCR geometry
- template projection
- parser output
- visual asset mapping
- table structure
- user correction
- document type rule

```ts
type FieldHypothesis = {
  id: string;
  documentId: string;
  pageId?: string;

  label: string;
  canonicalLabel?: string;
  value: unknown;
  displayValue?: string;
  valueType: FieldValueType;

  labelNodeIds: string[];
  valueNodeIds: string[];
  assetNodeIds: string[];
  tableNodeIds: string[];

  boxNorm?: NormalizedBox;

  confidence: ExplainableConfidence;
  status: FieldStatus;

  evidenceIds: string[];
  validationIds: string[];

  required?: boolean;
  userEdited?: boolean;
  templateFieldId?: string;

  reasons: string[];

  createdAt: number;
  updatedAt?: number;
};
```

---

## 11. Validation results

Validators are graph-aware checks.

```ts
type ValidationResult = {
  id: string;
  documentId: string;
  targetId: string;
  validatorId: string;

  status: "pass" | "warn" | "fail" | "not_applicable";
  severity: "info" | "low" | "medium" | "high" | "critical";

  message: string;
  details?: Record<string, unknown>;

  evidenceIds: string[];
  createdAt: number;
};
```

A validation result does not directly replace the field. It influences verifier status.

---

## 12. Field statuses

Allowed FieldStatus:

```ts
type FieldStatus =
  | "confirmed"
  | "needs_review"
  | "missing"
  | "conflict"
  | "invalid"
  | "unsupported"
  | "rejected";
```

Status meanings:

| Status | Meaning |
|---|---|
| confirmed | Sufficient evidence and validators pass |
| needs_review | Plausible but not safe to confirm |
| missing | Expected/required field not found |
| conflict | Evidence sources disagree |
| invalid | Value exists but fails required validation |
| unsupported | Found but not interpretable yet |
| rejected | User/system rejected false hypothesis |

---

## 13. Confidence model

Confidence must be explainable.

```ts
type ExplainableConfidence = {
  overall: number;
  components: {
    ocr?: number;
    detector?: number;
    parser?: number;
    template?: number;
    geometry?: number;
    validator?: number;
    qualityPenalty?: number;
    userCorrection?: number;
  };
  reasons: string[];
};
```

Do not use confidence as a black-box number. The UI must be able to show why.

---

## 14. Provenance model

Every graph output should know where it came from.

```ts
type ProvenanceRecord = {
  id: string;
  actor:
    | "system"
    | "user"
    | "model"
    | "parser"
    | "validator"
    | "template_engine";
  action: string;
  sourceId?: string;
  modelName?: string;
  modelVersion?: string;
  timestamp: number;
  parameters?: Record<string, unknown>;
};
```

Examples:

- OCR recognized line
- YOLO detected photo
- MRZ parser validated check digit
- verifier downgraded field due to conflict
- user corrected crop
- template projected ROI

---

## 15. Template context

When a document is processed through a known template, DocGraph stores template context.

```ts
type TemplateContext = {
  templateId: string;
  familyId: string;
  version: number;
  matchScore: number;
  decision:
    | "same_template"
    | "same_family_new_version"
    | "unknown_template"
    | "ambiguous_match";
  projectedRoiIds: string[];
  alignmentTransformIds: string[];
};
```

---

## 16. Quality summary

```ts
type DocumentQualitySummary = {
  pageQuality: Record<string, PageQualityReport>;
  warnings: QualityWarning[];
  safeToAutoConfirm: boolean;
};
```

Poor quality should affect verifier decisions.

---

## 17. Node lifecycle

Node states:

```ts
type NodeStatus =
  | "candidate"
  | "active"
  | "confirmed"
  | "needs_review"
  | "invalid"
  | "conflicted"
  | "rejected";
```

Lifecycle:

```text
evidence arrives
  → candidate node
  → graph relationships
  → hypothesis
  → verification
  → confirmed/review/conflict/etc.
  → correction if needed
```

---

## 18. User correction model

User correction does not erase evidence. It creates high-trust evidence and graph patches.

```ts
type CorrectionNode = BaseGraphNode & {
  type: "correction";
  correctionKind: string;
  targetId: string;
  before: unknown;
  after: unknown;
};
```

Edges:

```text
CorrectionNode --corrected_by--> FieldNode
CorrectionNode --derived_from--> UserCorrectionEvidence
```

---

## 19. Graph query requirements

DocGraph implementation should support queries:

- find nodes by page
- find nodes by type
- find nodes in region
- find evidence for node
- find validations for field
- find conflicts
- find labels near value
- find assets near labels
- find table cells
- find template-projected nodes
- find user-corrected nodes
- find exportable fields

---

## 20. Serialization

DocGraph must be serializable to JSON.

Rules:

- no cyclic object references
- use IDs for relationships
- store artifacts by reference IDs
- include schema version
- support migrations
- avoid storing UI-only state
- sensitive values may be encrypted at storage layer

---

## 21. Export behavior

Exports may include:

- full DocGraph
- redacted DocGraph
- form values with evidence references
- validation report
- audit trail
- template learning package

Exports must preserve statuses.

---

## 22. DocGraph invariants

1. DocGraph is the source of truth.
2. Form is a view over DocGraph hypotheses.
3. Every field has evidence or user-created provenance.
4. Every confirmed field must have validation/status reasons.
5. Every evidence item has a source.
6. Coordinates must be explicit and typed.
7. User corrections do not delete original evidence.
8. Conflicts must be represented, not hidden.
9. Template projections create evidence.
10. Export must preserve status and provenance.

---

## 23. Minimal valid DocGraph

A minimal valid graph must have:

- id
- documentId
- schemaVersion
- metadata
- at least one page
- nodes array
- edges array
- evidence array
- hypotheses array
- validations array
- provenance array
- createdAt
- updatedAt

It may have zero hypotheses if extraction failed, but failure evidence/warnings should exist.

---

## 24. Final specification statement

DocGraph is the central operating memory of the engine. It is how local models, parsers, validators, templates, UI, and user corrections communicate. If a result cannot be represented in DocGraph, it should not be part of the core system.
