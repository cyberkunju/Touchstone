# 03 — Data Model

**Purpose:** The authoritative schema for every persisted/exchanged structure: DocGraph, EvidenceRecord, FieldHypothesis, ValidationResult, TemplateGraph, EditableForm. TypeScript interfaces and JSON Schema must stay in lockstep; this document is the canonical source. Generate `*.schema.json` from these and validate in CI.

---

## 1. Conventions

- **Branded IDs** to prevent mixing: `type DocumentId = string & { readonly __brand: 'DocumentId' }`, similarly `PageId`, `NodeId`, `EdgeId`, `EvidenceId`, `FieldId`, `TemplateId`, `ValidationId`.
- **Schema versions** are constant strings: `docgraph-v1`, `evidence-v1`, `validation-v1`, `templategraph-v1`, `form-v1`. Bumping a version requires a migration ([11_IMPLEMENTATION.md](11_IMPLEMENTATION.md)).
- **Timestamps** are epoch milliseconds (`number`).
- **Coordinates** are always typed by space (below). No raw strings for IDs; no untyped `any`.
- Use a `Result<T,E>` (`{ok:true,value} | {ok:false,error}`) for recoverable domain failures; throw only for programmer errors.

## 2. Coordinate systems

```ts
type NormalizedBox = readonly [number, number, number, number]; // [x1,y1,x2,y2] in 0..1, page space
type PixelBox      = readonly [number, number, number, number]; // raw pixels
type Point         = readonly [number, number];
type Polygon       = Point[];                                    // normalized
```

- **Original pixels** → **normalized page (0–1)** → **canonical (width 1000, proportional height)** → **viewer pixels**.
- DocGraph stores **normalized** coordinates. The viewer converts to/from screen. User edits convert back to normalized. Never store viewer pixels as truth. Coordinate-space confusion is the most common source of template corruption — keep it typed.

```ts
type PageTransform = {
  id: string;
  type: 'identity' | 'rotation' | 'perspective' | 'deskew' | 'scale' | 'local_correction';
  fromSpace: 'original' | 'rendered' | 'normalized' | 'template';
  toSpace:   'original' | 'rendered' | 'normalized' | 'template';
  matrix?: number[];        // 3x3 row-major for homography/affine
  confidence: number;       // 0..1
  createdBy: string;
};
```

## 3. Enumerations

```ts
type FieldStatus = 'confirmed' | 'needs_review' | 'missing' | 'conflict' | 'invalid' | 'unsupported' | 'rejected';

type ValueType =
  | 'text' | 'name' | 'date' | 'amount' | 'number' | 'id_number' | 'address' | 'phone' | 'email' | 'country'
  | 'photo' | 'signature' | 'stamp' | 'seal' | 'logo' | 'emblem' | 'flag' | 'symbol'
  | 'qr' | 'barcode' | 'mrz' | 'table' | 'checkbox' | 'unknown';

type EvidenceSource =
  | 'upload' | 'pdf_parser' | 'image_normalizer' | 'detector' | 'ocr' | 'segmenter'
  | 'barcode_parser' | 'mrz_parser' | 'table_engine' | 'face_detector'
  | 'template_engine' | 'verifier' | 'user_correction' | 'import' | 'system';

type EvidenceKind =
  | 'file_upload' | 'pdf_text' | 'pdf_image' | 'page_normalization' | 'quality_analysis'
  | 'object_detection' | 'ocr_text' | 'segmentation_mask' | 'barcode_decode' | 'mrz_parse'
  | 'table_structure' | 'table_cell' | 'checkbox_state' | 'template_match' | 'template_projection'
  | 'validation' | 'user_correction' | 'export' | 'import';

type GraphNodeType =
  | 'page' | 'document_boundary' | 'text_word' | 'text_line' | 'text_block' | 'field'
  | 'visual_asset' | 'table' | 'table_row' | 'table_column' | 'table_cell' | 'checkbox'
  | 'barcode' | 'qr' | 'mrz' | 'template_anchor' | 'validation' | 'correction'
  | 'quality_region' | 'unknown_region';

type GraphEdgeType =
  | 'contains' | 'near' | 'above' | 'below' | 'left_of' | 'right_of' | 'same_row' | 'same_column'
  | 'label_of' | 'value_of' | 'inside_table' | 'table_header_of' | 'cell_in_row' | 'cell_in_column'
  | 'validated_by' | 'conflicts_with' | 'confirms' | 'derived_from' | 'template_projected_from'
  | 'corrected_by' | 'anchor_for' | 'part_of' | 'alternative_to' | 'reading_order_next';

type Sensitivity = 'public' | 'internal' | 'private' | 'sensitive' | 'highly_sensitive';
```

## 4. DocGraph (root)

```ts
type DocGraph = {
  id: string;
  schemaVersion: 'docgraph-v1';
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
  provenance: ProvenanceRecord[];
  quality: { overall: 'good' | 'usable' | 'poor' | 'unusable'; warnings: string[] };
  templateContext?: TemplateContext;
};

type DocGraphMetadata = {
  documentName?: string;
  sourceType: 'image' | 'pdf' | 'scanned_pdf' | 'digital_pdf' | 'imported';
  pageCount: number;            // >= 1
  processingMode: 'unknown_document' | 'known_template' | 'new_template_version' | 'manual';
  sensitivity: Sensitivity;
  runtime: { appVersion: string; workerVersion?: string; browser?: string; executionProvider?: 'webgpu'|'wasm'|'native'|'unknown' };
};

type PageNode = {
  id: PageId; type: 'page'; documentId: DocumentId; pageIndex: number;
  original: { widthPx: number; heightPx: number; imageId?: string };
  normalized?: { widthPx: number; heightPx: number; canonicalWidth: number; canonicalHeight: number; imageId: string };
  transforms: PageTransform[];
  quality: PageQualityReport;
  evidenceIds: EvidenceId[];
};

type PageQualityReport = {
  blur: QualitySignal; glare: QualitySignal; contrast: QualitySignal; resolution: QualitySignal;
  cropCompleteness: QualitySignal; perspective: QualitySignal; orientation: QualitySignal;
  safeToExtract: boolean; warnings: string[];
};
type QualitySignal = { score: number; level: 'good' | 'warning' | 'bad'; reason?: string };
```

## 5. GraphNode and GraphEdge

```ts
type GraphNode = {
  id: NodeId; type: GraphNodeType; pageId?: PageId;
  boxNorm?: NormalizedBox; polygonNorm?: Polygon;
  evidenceIds: EvidenceId[]; confidence?: number;
  status?: 'candidate' | 'active' | 'confirmed' | 'needs_review' | 'missing' | 'conflicted' | 'invalid' | 'rejected';
  value?: string;                              // for text-bearing nodes
  payload?: Record<string, unknown>;           // type-specific (mrz format, asset type, cell row/col, etc.)
  sensitivity?: Sensitivity;
  createdAt: number; updatedAt?: number;
};

type GraphEdge = {
  id: EdgeId; type: GraphEdgeType; from: NodeId; to: NodeId;
  confidence?: number; evidenceIds: EvidenceId[]; metadata?: Record<string, unknown>; createdAt: number;
};
```

## 6. EvidenceRecord (immutable provenance)

Evidence is **append-only**. Corrections add evidence; they never overwrite.

```ts
type EvidenceRecord = {
  id: EvidenceId; schemaVersion: 'evidence-v1'; documentId: DocumentId; pageId?: PageId;
  source: EvidenceSource; kind: EvidenceKind; createdAt: number;
  model?: { modelId: string; modelVersion: string; runtime: string; executionProvider?: string;
            preprocessorVersion?: string; postprocessorVersion?: string };
  confidence: number;                          // 0..1
  targetRefs: Array<{ targetType: 'node'|'edge'|'hypothesis'|'field'|'table'|'template'|'document'|'page'|'artifact'; targetId: string }>;
  pageRef?: { pageId: PageId; boxNorm?: NormalizedBox; boxPx?: PixelBox; polygonNorm?: Polygon; artifactId?: string };
  payload: Record<string, unknown>;            // source/kind specific; never trusted without validation
  sensitivity: Sensitivity;
  redaction?: { redactionStatus: 'none'|'redacted'|'synthetic'|'not_exportable'; containsPii: boolean; containsDocumentImage: boolean; containsExtractedText: boolean };
};
```

Representative payloads: OCR `{text, normalizedText?, mode, alternatives?}`; detection `{className}`; MRZ `{rawLines, normalizedLines, format, parsed, checkDigits, status}`; barcode `{codeType, payload, decoded}`; user_correction `{correctionKind, targetId, before, after}`.

## 7. FieldHypothesis (proposed field)

```ts
type FieldHypothesis = {
  id: FieldId; documentId: DocumentId; pageId?: PageId;
  label: string; canonicalLabel?: string; aliases?: string[];
  value: unknown; displayValue?: string | null; normalizedValue?: unknown; valueType: ValueType;
  labelNodeIds: NodeId[]; valueNodeIds: NodeId[]; assetNodeIds: NodeId[]; tableNodeIds: NodeId[];
  boxNorm?: NormalizedBox;
  confidence: ExplainableConfidence; status: FieldStatus;
  evidenceIds: EvidenceId[]; validationIds: ValidationId[];
  source: 'ocr_geometry' | 'template_projection' | 'parser' | 'visual_asset' | 'table' | 'checkbox' | 'user_created' | 'hybrid';
  required?: boolean; templateFieldId?: string; userEdited?: boolean; rejected?: boolean;
  reasons: string[]; createdAt: number; updatedAt?: number;
};

type ExplainableConfidence = {
  overall: number;                             // 0..1
  components: { ocr?: number; detector?: number; segmentation?: number; parser?: number;
                template?: number; geometry?: number; validator?: number; quality?: number; userCorrection?: number };
  penalties: Array<{ reason: string; amount: number; severity: 'low'|'medium'|'high'|'critical' }>;
  reasons: string[];
};
```

Confidence is **explainable, never a bare number**. Status (not confidence) is the trust decision.

## 8. ValidationResult and ConflictRecord

```ts
type ValidationResult = {
  id: ValidationId; schemaVersion: 'validation-v1'; documentId: DocumentId;
  targetId: string; targetType?: 'field'|'asset'|'table'|'cell'|'mrz'|'barcode'|'template'|'document'|'page'|'node';
  validatorId: string; validatorVersion?: string;
  status: 'pass' | 'warn' | 'fail' | 'not_applicable';
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  message: string; details?: Record<string, unknown>; evidenceIds: EvidenceId[]; createdAt: number;
  statusImpact?: { suggestedFieldStatus?: FieldStatus; blocksConfirmation?: boolean; createsConflict?: boolean; requiresUserReview?: boolean };
};

type ConflictRecord = {
  id: string; documentId: DocumentId; targetId: string;
  conflictType: 'value_mismatch'|'date_mismatch'|'amount_mismatch'|'id_mismatch'|'name_mismatch'|'table_mismatch'|'template_mismatch';
  left:  { value?: unknown; source: string; evidenceIds: EvidenceId[] };
  right: { value?: unknown; source: string; evidenceIds: EvidenceId[] };
  severity: 'low'|'medium'|'high'|'critical'; message: string;
};
```

## 9. ProvenanceRecord and TemplateContext

```ts
type ProvenanceRecord = {
  id: string; actor: 'system'|'model'|'parser'|'validator'|'template_engine'|'user';
  action: string; sourceId?: string; targetId?: string;
  modelName?: string; modelVersion?: string; parserName?: string; parserVersion?: string;
  timestamp: number; parameters?: Record<string, unknown>;
};

type TemplateContext = {
  templateId: TemplateId; familyId: string; version: number; matchScore: number;
  decision: 'same_template'|'same_family_new_version'|'unknown_template'|'ambiguous_match';
  projectedRoiIds: string[]; alignmentTransformIds: string[];
};
```

## 10. TemplateGraph

Stores **structure, not values**. Full engine behavior in [07_TEMPLATE_ENGINE.md](07_TEMPLATE_ENGINE.md).

```ts
type TemplateGraph = {
  id: TemplateId; schemaVersion: 'templategraph-v1'; familyId: string; version: number;
  name: string; docType?: string | null; status: 'active'|'draft'|'deprecated'|'archived';
  createdAt: number; updatedAt: number;
  pageCount: number;
  canonicalPages: Array<{ pageIndex: number; widthNorm: 1000; heightNorm: number; aspectRatio?: number }>;
  anchors: TemplateAnchor[];
  fields: TemplateField[]; assets: TemplateAsset[]; tables: TemplateTable[]; codes?: TemplateCode[];
  mrzZones?: TemplateMRZ[]; checkboxes?: TemplateCheckbox[];
  validators: TemplateValidator[]; relationships?: TemplateRelationship[];
  aliases?: Record<string, string[]>;
  fingerprint: { layoutHash: string; visualHash?: string; textAnchorHash?: string; specialZoneHash?: string;
                 stableTokens?: string[]; specialZones?: Record<string, boolean> };
  matching: { requiredAnchorIds: string[];
              weights: { textAnchor: number; visualAnchor: number; geometry: number; keypoint: number; specialZone: number; requiredRegion: number };
              thresholds: { sameTemplate: number; sameFamilyNewVersion: number; unknown: number; ambiguousMargin: number } };
  extraction: { defaultRoiExpansion: number; localSearch: { enabled: boolean; maxShiftNorm: number; maxRetries: number };
                ocr: { batchRois: boolean; highResSmallFields: boolean } };
  versioning: { parentTemplateId?: string; previousVersionId?: string; versionReason: string; compatibleWithVersions: string[]; deprecated?: boolean };
  provenance: Array<{ id: string; actor: 'user'|'system'|'template_engine'; action: string; sourceDocGraphId?: string; timestamp: number }>;
  privacy?: { sensitivity: Sensitivity; containsSampleValues: boolean; containsThumbnails: boolean; exportWarningRequired: boolean };
};

type TemplateAnchor = {
  id: string; type: 'text'|'visual'|'geometry'|'keypoint'|'special_zone'|'table_grid'; pageIndex: number;
  boxNorm?: NormalizedBox; value?: string; assetType?: ValueType; descriptorId?: string;
  importance: number; stability: number; requiredForMatch?: boolean; mustNotContainVariableValue?: boolean;
  createdFromNodeIds?: NodeId[]; createdFromEvidenceIds?: EvidenceId[];
};
type TemplateField = {
  id: string; label: string; aliases?: string[]; valueType: ValueType; pageIndex: number;
  labelBoxNorm?: NormalizedBox; valueBoxNorm: NormalizedBox; required: boolean;
  extraction?: { preferredMode: 'roi_ocr'|'parser'|'asset_crop'|'table'|'checkbox'|'manual'; roiExpansion: number; ocrMode?: 'roi'|'roi_high_res'|'mrz'|'table_cell'|'rotated' };
  validatorIds?: string[]; anchorIds?: string[]; sensitivity?: Sensitivity;
};
type TemplateAsset = { id: string; assetType: ValueType; pageIndex: number; boxNorm: NormalizedBox; required: boolean;
  extraction?: { cropExpansion: number; segmentationPolicy: 'never'|'optional'|'preferred'|'required'; preserveRawCrop: boolean }; validatorIds?: string[] };
type TemplateTable = { id: string; pageIndex: number; boxNorm: NormalizedBox; required: boolean;
  columns: Array<{ id: string; label: string; aliases?: string[]; valueType: ValueType; required?: boolean }>;
  headerRows?: number[]; variableRows?: boolean; validatorIds?: string[] };
type TemplateCode = { id: string; codeType: 'qr'|'barcode'|'pdf417'|'data_matrix'|'aztec'|'unknown'; pageIndex: number; boxNorm: NormalizedBox; required: boolean; payloadParsers?: string[]; validatorIds?: string[] };
type TemplateMRZ = { id: string; pageIndex: number; boxNorm: NormalizedBox; formatHint?: 'TD1'|'TD2'|'TD3'|'unknown'; required: boolean; validatorIds?: string[]; crossCheckFieldIds?: string[] };
type TemplateCheckbox = { id: string; label: string; pageIndex: number; boxNorm: NormalizedBox; groupId?: string; required: boolean; statePolicy: 'extract'|'user_review'|'static_expected'; validatorIds?: string[] };
type TemplateValidator = { id: string; validatorId: string; targetIds: string[]; severity: 'info'|'low'|'medium'|'high'|'critical'; config?: Record<string, unknown> };
type TemplateRelationship = { id: string; type: 'cross_check'|'table_total'|'date_order'|'payload_match'|'required_dependency'|'alias_of'; from: string; to: string; validatorId?: string; config?: Record<string, unknown> };
```

## 11. EditableForm (view projection)

```ts
type EditableForm = {
  id: string; schemaVersion: 'form-v1'; documentId: DocumentId; templateId?: TemplateId;
  createdAt: number; updatedAt?: number;
  sections: Array<{ id: string; title: string; description?: string; fieldIds: string[] }>;
  fields: FormField[];
  reviewSummary: { confirmed: number; needsReview: number; missing: number; conflict: number; invalid: number; unsupported: number; criticalUnresolved?: number; exportReady: boolean };
};
type FormField = {
  id: string; hypothesisId: FieldId; label: string; type: ValueType; status: FieldStatus;
  value: unknown; displayValue?: string | null; normalizedValue?: unknown; required: boolean; editable: boolean;
  source: { pageId: PageId; boxNorm?: NormalizedBox; cropArtifactId?: string; sourceKind: 'ocr'|'asset'|'table'|'mrz'|'barcode'|'template_roi'|'manual'|'missing' };
  evidenceIds: EvidenceId[]; validationIds: ValidationId[]; reasons?: string[];
  ui?: { control: 'text'|'textarea'|'date'|'amount'|'asset_crop'|'table'|'checkbox'|'code_payload'|'mrz_panel'|'unsupported'; priority: 'critical'|'high'|'normal'|'low'; showInReviewQueue: boolean };
  sensitivity?: Sensitivity;
};
```

## 12. Schema invariants

1. Every confirmed field cites evidence and has status reasons.
2. Every evidence item has source, kind, and (when spatial) normalized coordinates in 0–1.
3. Relationships use IDs; no cyclic object references; serializable to JSON.
4. User corrections never delete prior evidence; they append `user_correction` evidence + a `corrected_by` edge.
5. Conflicts are represented as ConflictRecords + `conflicts_with` edges, never hidden.
6. Template projections create evidence (`template_projection`) and never confirm a value alone.
7. Exports preserve status and provenance. Sensitive payloads are flagged for redaction.
8. Schema-version changes require a migration and regression fixtures.
