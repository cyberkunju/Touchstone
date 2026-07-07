import { Box, Polygon } from './geometry';

/* --- NODE AND EDGE ENUMS --- */

export type GraphNodeType =
  | 'page'
  | 'document_boundary'
  | 'text_word'
  | 'text_line'
  | 'text_block'
  | 'field'
  | 'visual_asset'
  | 'table'
  | 'table_row'
  | 'table_column'
  | 'table_cell'
  | 'checkbox'
  | 'template_anchor'
  | 'validation'
  | 'correction';

export type GraphEdgeType =
  | 'contains'
  | 'near'
  | 'above'
  | 'below'
  | 'left_of'
  | 'right_of'
  | 'same_row'
  | 'same_column'
  | 'label_of'
  | 'value_of'
  | 'alternative_to'
  | 'inside_table'
  | 'table_header_of'
  | 'validated_by'
  | 'conflicts_with'
  | 'confirms'
  | 'derived_from'
  | 'template_projected_from'
  | 'corrected_by';

export type NodeStatus =
  | 'candidate'
  | 'active'
  | 'confirmed'
  | 'needs_review'
  | 'invalid'
  | 'conflicted'
  | 'rejected';

export type FieldStatus =
  | 'confirmed'
  | 'needs_review'
  | 'missing'
  | 'conflict'
  | 'invalid'
  | 'unsupported'
  | 'rejected';

export type FieldValueType =
  | 'text'
  | 'date'
  | 'amount'
  | 'id_number'
  | 'phone'
  | 'email'
  | 'currency'
  | 'name'
  | 'country'
  | 'checkbox'
  | 'table'
  | 'visual_asset'
  | 'barcode'
  | 'mrz';

/* --- PAGE QUALITY TYPES --- */

export type QualityLevel = 'good' | 'warning' | 'bad';

export type QualitySignal = {
  score: number;
  level: QualityLevel;
  reason?: string;
};

export type PageQualityReport = {
  blur: QualitySignal;
  glare: QualitySignal;
  contrast: QualitySignal;
  resolution: QualitySignal;
  cropCompleteness: QualitySignal;
  perspective: QualitySignal;
  orientation: QualitySignal;
  safeToExtract: boolean;
  warnings: string[];
};

export type PageTransform = {
  type: 'rotate' | 'deskew' | 'perspective_warp' | 'scale' | 'crop';
  parameters: Record<string, number | number[] | string>;
  timestamp: number;
};

/* --- EVIDENCE TYPES --- */

export type EvidenceSource =
  | 'detector'
  | 'ocr'
  | 'segmentation'
  | 'barcode_parser'
  | 'mrz_parser'
  | 'table_engine'
  | 'face_detector'
  | 'pdf_text'
  | 'quality_analyzer'
  | 'template_projection'
  | 'validator'
  | 'user_correction';

export type EvidenceKind =
  | 'box'
  | 'text'
  | 'mask'
  | 'code_payload'
  | 'mrz_parsed'
  | 'table_structure'
  | 'face_box'
  | 'quality_signals'
  | 'patch';

export type ProvenanceRecord = {
  id: string;
  actor: 'system' | 'user' | 'model' | 'parser' | 'validator' | 'template_engine';
  action: string;
  sourceId?: string;
  modelName?: string;
  modelVersion?: string;
  timestamp: number;
  parameters?: Record<string, unknown>;
};

export type EvidenceRecord = {
  id: string;
  documentId: string;
  pageId?: string;
  source: EvidenceSource;
  kind: EvidenceKind;
  targetNodeIds?: string[];
  boxNorm?: Box;
  polygonNorm?: Polygon;
  confidence?: number;
  payload: Record<string, unknown>;
  provenance: ProvenanceRecord[];
  createdAt: number;
};

/* --- HYPOTHESIS & CONFIDENCE TYPES --- */

export type ExplainableConfidence = {
  overall: number;
  components: {
    ocr?: number;
    detector?: number;
    segmentation?: number;
    parser?: number;
    template?: number;
    geometry?: number;
    validator?: number;
    quality?: number;
    userCorrection?: number;
  };
  penalties: Array<{
    reason: string;
    amount: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }>;
  reasons: string[];
};

export type FieldHypothesis = {
  id: string;
  documentId: string;
  pageId?: string;

  label: string;
  canonicalLabel?: string;
  value: unknown; // can be string, TableData, checkbox state
  displayValue?: string;
  valueType: FieldValueType;

  labelNodeIds: string[];
  valueNodeIds: string[];
  assetNodeIds: string[];
  tableNodeIds: string[];

  boxNorm?: Box;

  confidence: ExplainableConfidence;
  status: FieldStatus;

  evidenceIds: string[];
  validationIds: string[];

  required?: boolean;
  userEdited?: boolean;
  rejected?: boolean;
  /**
   * When set, this hypothesis can never reach `confirmed` status — the
   * verifier downgrades it to `needs_review` with this string as the reason.
   * Used for values whose source cannot PROVE them (N1): MRZ fields without
   * checksum coverage, legacy (non-beam) MRZ decodes, and fields carrying a
   * checksum-invisible ambiguity. User edits override the cap.
   */
  reviewCap?: string;
  templateFieldId?: string;

  reasons: string[];

  createdAt: number;
  updatedAt?: number;
};

/* --- VALIDATION TYPES --- */

export type ValidationResult = {
  id: string;
  documentId: string;
  targetId: string; // targets FieldHypothesis
  validatorId: string;

  status: 'pass' | 'warn' | 'fail' | 'not_applicable';
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';

  message: string;
  details?: Record<string, unknown>;

  evidenceIds: string[];
  createdAt: number;
};

export type ConflictRecord = {
  id: string;
  fieldId: string;
  sourceNodeA: string;
  sourceNodeB: string;
  valueA: string;
  valueB: string;
  severity: 'medium' | 'high' | 'critical';
  resolved: boolean;
};

/* --- DOCGRAPH STRUCTURES --- */

export type PageNode = {
  id: string;
  type: 'page';
  documentId: string;
  pageIndex: number;

  original: {
    widthPx: number;
    heightPx: number;
    imageId?: string; // OPFS raw image file key
  };

  normalized?: {
    widthPx: number;
    heightPx: number;
    canonicalWidth: number;
    canonicalHeight: number;
    imageId: string; // OPFS normalized image file key
  };

  transforms: PageTransform[];
  quality: PageQualityReport;

  evidenceIds: string[];
};

export type BaseGraphNode = {
  id: string;
  type: GraphNodeType;
  pageId?: string;
  boxNorm?: Box;
  polygonNorm?: Polygon;
  evidenceIds: string[];
  confidence?: number;
  status?: NodeStatus;
  createdAt: number;
  updatedAt?: number;
};

// Extends BaseGraphNode for specific variants as required by type checking
export type GraphNode = BaseGraphNode & {
  value?: string;
  metadata?: Record<string, unknown>;
};

export type GraphEdge = {
  id: string;
  type: GraphEdgeType;
  from: string;
  to: string;
  confidence?: number;
  evidenceIds: string[];
  metadata?: Record<string, unknown>;
  createdAt: number;
};

export type TemplateContext = {
  templateId: string;
  familyId: string;
  version: number;
  matchScore: number;
  decision: 'same_template' | 'same_family_new_version' | 'unknown_template' | 'ambiguous_match';
  projectedRoiIds: string[];
  alignmentTransformIds: string[];
};

export type DocumentQualitySummary = {
  pageQuality: Record<string, PageQualityReport>;
  warnings: string[];
  safeToAutoConfirm: boolean;
};

export type DocGraphMetadata = {
  documentName?: string;
  sourceFileType: 'image' | 'pdf' | 'unknown';
  pageCount: number;
  processingMode: 'unknown_document' | 'known_template' | 'new_template_version' | 'manual_review';
  runtime: {
    appVersion: string;
    workerVersion?: string;
    browser?: string;
    executionProvider?: 'webgpu' | 'wasm' | 'native' | 'unknown';
  };
};

export type DocGraph = {
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

/* --- TEMPLATEGRAPH STRUCTURES --- */

export type TemplateDocumentType =
  | 'passport'
  | 'id_card'
  | 'invoice'
  | 'receipt'
  | 'generic_form'
  | 'certificate'
  | 'bank_statement'
  | 'license'
  | 'shipping_label'
  | 'product_label'
  | 'unknown';

export type TemplatePage = {
  id: string;
  pageIndex: number;
  canonicalWidth: number;
  canonicalHeight: number;
  aspectRatio: number;
  pageRole?: 'front' | 'back' | 'main' | 'continuation' | 'attachment' | 'unknown';
  thumbnailId?: string;
};

export type TemplateFingerprint = {
  textSignature: {
    stableTokens: string[];
    tokenHashes: string[];
  };
  layoutSignature: {
    textBlockHistogram: number[];
    objectClassHistogram: Record<string, number>;
  };
  specialZones: {
    hasMRZ: boolean;
    hasQRCode: boolean;
    hasBarcode: boolean;
    hasPhoto: boolean;
    hasTable: boolean;
    hasCheckboxes: boolean;
  };
  pageGeometry: {
    aspectRatio: number;
    pageCount: number;
  };
};

export type TemplateAnchor = {
  id: string;
  pageIndex: number;
  type: 'text' | 'visual' | 'geometry' | 'keypoint' | 'special_zone' | 'table_grid';
  label?: string;
  boxNorm?: Box;
  value?: string;
  descriptorId?: string; // points to keypoint file key in OPFS
  importance: number; // 0.0 to 1.0
  stability: number;  // 0.0 to 1.0
  requiredForMatch: boolean;
  createdFromNodeIds: string[];
  createdFromEvidenceIds: string[];
};

export type TemplateField = {
  id: string;
  pageIndex: number;
  label: string;
  canonicalLabel?: string;
  aliases: string[];
  valueType: FieldValueType;
  valueBoxNorm: Box;
  required: boolean;
  extraction: {
    preferredMode: 'roi_ocr' | 'parser' | 'asset_crop' | 'table' | 'checkbox' | 'manual';
    roiExpansion: number;
    ocrMode?: 'roi' | 'mrz' | 'table_cell' | 'rotated';
  };
  validators: string[];
  relationships: string[];
  anchorIds: string[];
  createdFromHypothesisId?: string;
  createdFromCorrectionIds: string[];
};

export type TemplateAsset = {
  id: string;
  pageIndex: number;
  label: string;
  assetType: 'photo' | 'signature' | 'stamp' | 'seal' | 'logo' | 'emblem' | 'flag' | 'symbol' | 'unknown';
  boxNorm: Box;
  required: boolean;
  extraction: {
    cropExpansion: number;
    segmentationPolicy: 'never' | 'optional' | 'preferred' | 'required';
    preserveRawCrop: boolean;
  };
  validators: string[];
  anchorIds: string[];
  createdFromAssetNodeId?: string;
  createdFromCorrectionIds: string[];
};

export type TemplateTableColumn = {
  id: string;
  label: string;
  aliases: string[];
  valueType: FieldValueType;
  required: boolean;
  expectedXRangeNorm?: [number, number];
  validators: string[];
};

export type TemplateTable = {
  id: string;
  pageIndex: number;
  label: string;
  boxNorm: Box;
  required: boolean;
  columns: TemplateTableColumn[];
  headerRows: number[];
  extraction: {
    strategy: 'geometry' | 'schema_guided_geometry' | 'slanet_plus_trial' | 'manual';
    roiExpansion: number;
    allowVariableRows: boolean;
    allowMergedCells: boolean;
  };
  validators: string[];
  createdFromTableNodeId?: string;
  createdFromCorrectionIds: string[];
};

export type TemplateCode = {
  id: string;
  pageIndex: number;
  label: string;
  codeType: 'qr' | 'barcode' | 'pdf417' | 'data_matrix' | 'aztec' | 'unknown';
  boxNorm: Box;
  required: boolean;
  payloadParsers: string[];
  validators: string[];
  anchorIds: string[];
};

export type TemplateMRZ = {
  id: string;
  pageIndex: number;
  boxNorm: Box;
  formatHint?: 'TD1' | 'TD2' | 'TD3' | 'unknown';
  required: boolean;
  extraction: {
    roiExpansion: number;
    ocrMode: 'mrz';
  };
  validators: string[];
  crossCheckFieldIds: string[];
};

export type TemplateCheckbox = {
  id: string;
  pageIndex: number;
  label: string;
  boxNorm: Box;
  groupId?: string;
  required: boolean;
  statePolicy: 'extract' | 'user_review' | 'static_expected';
  validators: string[];
};

export type TemplateSection = {
  id: string;
  label: string;
  pageIndex?: number;
  fieldIds: string[];
  assetIds: string[];
  tableIds: string[];
  order: number;
};

export type TemplateValidatorSpec = {
  id: string;
  validatorType: string;
  targetIds: string[];
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  config: Record<string, unknown>;
};

export type TemplateRelationship = {
  id: string;
  type: string;
  fromId: string;
  toId: string;
  config?: Record<string, unknown>;
};

export type TemplateMatchingConfig = {
  requiredAnchorIds: string[];
  weights: {
    textAnchor: number;
    visualAnchor: number;
    geometry: number;
    keypoint: number;
    specialZone: number;
    requiredRegion: number;
  };
  thresholds: {
    sameTemplate: number;
    sameFamilyNewVersion: number;
    unknown: number;
    ambiguousMargin: number;
  };
};

export type TemplateExtractionConfig = {
  defaultRoiExpansion: number;
  localSearch: {
    enabled: boolean;
    maxShiftNorm: number;
    maxRetries: number;
  };
  ocr: {
    batchRois: boolean;
    highResSmallFields: boolean;
  };
};

export type TemplateVersioningMetadata = {
  parentTemplateId?: string;
  previousVersionId?: string;
  versionReason: string;
  compatibleWithVersions: string[];
  deprecated?: boolean;
};

export type TemplateProvenance = {
  id: string;
  actor: 'user' | 'system' | 'template_engine';
  action: string;
  sourceDocGraphId?: string;
  sourceDocumentId?: string;
  timestamp: number;
};

export type TemplateGraph = {
  id: string;
  familyId: string;
  version: number;
  schemaVersion: string;
  name: string;
  description?: string;
  docType: TemplateDocumentType;
  pageCount: number;
  canonicalPages: TemplatePage[];
  fingerprint: TemplateFingerprint;
  anchors: TemplateAnchor[];
  fields: TemplateField[];
  assets: TemplateAsset[];
  tables: TemplateTable[];
  codes: TemplateCode[];
  mrzZones: TemplateMRZ[];
  checkboxes: TemplateCheckbox[];
  sections: TemplateSection[];
  aliases: Record<string, string[]>;
  validators: TemplateValidatorSpec[];
  relationships: TemplateRelationship[];
  matching: TemplateMatchingConfig;
  extraction: TemplateExtractionConfig;
  versioning: TemplateVersioningMetadata;
  provenance: TemplateProvenance[];
  createdAt: number;
  updatedAt: number;
};
