# Module Interfaces — Edge DocGraph Engine

**Purpose:** Define interfaces for OCR, detector, segmenter, parser, verifier, graph builder, template matcher, storage, runtime, and form generation.

---

## 1. Interface principle

Pipelines should depend on interfaces, not concrete libraries.

This allows:

- browser runtime
- Tauri runtime
- model swaps through benchmark gates
- unit tests with mocks
- deterministic integration tests
- clean module boundaries

---

## 2. DetectorService

```ts
interface DetectorService {
  detect(input: DetectionInput): Promise<Result<DetectionOutput, DetectorError>>;
}

type DetectionInput = {
  documentId: DocumentId;
  pageId: PageId;
  imageRef: ImageRef;
  modelId: ModelId;
  thresholds: DetectionThresholds;
};

type DetectionOutput = {
  detections: DetectionCandidate[];
  evidence: EvidenceRecord[];
  modelRun: ModelRunInfo;
};
```

Rules:

- returns candidates/evidence,
- does not mutate DocGraph directly,
- records model version.

---

## 3. OcrService

```ts
interface OcrService {
  read(input: OcrInput): Promise<Result<OcrOutput, OcrError>>;
}

type OcrInput = {
  documentId: DocumentId;
  pageId: PageId;
  imageRef: ImageRef;
  mode: "full_page" | "roi" | "table_cells" | "mrz";
  rois?: OcrRoi[];
  modelId: ModelId;
};

type OcrOutput = {
  textLines: TextLineCandidate[];
  words?: TextWordCandidate[];
  evidence: EvidenceRecord[];
  modelRun: ModelRunInfo;
};
```

Rules:

- raw OCR preserved,
- confidence included,
- no final field confirmation.

---

## 4. SegmenterService

```ts
interface SegmenterService {
  segment(input: SegmentationInput): Promise<Result<SegmentationOutput, SegmenterError>>;
}

type SegmentationInput = {
  documentId: DocumentId;
  pageId: PageId;
  imageRef: ImageRef;
  regions: AssetRegionCandidate[];
  modelId: ModelId;
};

type SegmentationOutput = {
  masks: AssetMaskCandidate[];
  evidence: EvidenceRecord[];
  modelRun: ModelRunInfo;
};
```

Segmentation is conditional and asset-focused.

---

## 5. BarcodeParserService

```ts
interface BarcodeParserService {
  decode(input: BarcodeDecodeInput): Promise<Result<BarcodeDecodeOutput, BarcodeError>>;
}

type BarcodeDecodeOutput = {
  decoded: DecodedCode[];
  evidence: EvidenceRecord[];
};
```

Rules:

- never auto-open URLs,
- raw payload preserved,
- parsed payload separate.

---

## 6. MrzParserService

```ts
interface MrzParserService {
  parse(input: MrzParseInput): Result<MrzParseOutput, MrzParseError>;
}

type MrzParseInput = {
  rawLines: string[];
  sourceEvidenceIds: EvidenceId[];
};

type MrzParseOutput = {
  format: "TD1" | "TD2" | "TD3" | "unknown";
  normalizedLines: string[];
  parsedFields: Record<string, unknown>;
  checkDigits: MrzCheckDigitResult[];
  evidence: EvidenceRecord[];
};
```

---

## 7. TableExtractionService

```ts
interface TableExtractionService {
  extract(input: TableExtractionInput): Promise<Result<TableExtractionOutput, TableError>>;
}

type TableExtractionOutput = {
  tables: TableCandidate[];
  cells: TableCellCandidate[];
  evidence: EvidenceRecord[];
};
```

Table service should support geometry-first mode and optional model bucket mode.

---

## 8. GraphBuilder

```ts
interface GraphBuilder {
  buildInitialGraph(input: GraphBuildInput): Result<DocGraph, GraphBuildError>;
  applyPatch(graph: DocGraph, patch: DocGraphPatch): Result<DocGraph, GraphPatchError>;
  addEvidence(graph: DocGraph, evidence: EvidenceRecord[]): Result<DocGraph, GraphPatchError>;
}
```

GraphBuilder owns graph construction consistency.

---

## 9. FieldHypothesisGenerator

```ts
interface FieldHypothesisGenerator {
  generate(input: HypothesisGenerationInput): Result<FieldHypothesis[], HypothesisError>;
}
```

Inputs:

- text nodes
- detector nodes
- parser nodes
- template context
- layout geometry

Outputs are hypotheses, not confirmed truth.

---

## 10. VerifierService

```ts
interface VerifierService {
  verify(input: VerifierInput): Promise<Result<VerifierOutput, VerifierError>>;
}
```

Verifier assigns:

- statuses
- validations
- conflicts
- confidence reasons
- missing fields

---

## 11. TemplateMatcher

```ts
interface TemplateMatcher {
  findCandidates(input: TemplateCandidateInput): Promise<Result<TemplateCandidate[], TemplateError>>;
  decide(input: TemplateDecisionInput): Result<TemplateDecision, TemplateError>;
}
```

Must return conservative decisions.

---

## 12. AlignmentService

```ts
interface AlignmentService {
  align(input: AlignmentInput): Promise<Result<AlignmentOutput, AlignmentError>>;
}

type AlignmentOutput = {
  transform: PageTransform;
  confidence: number;
  anchorMatches: AnchorMatch[];
  localCorrections: LocalAlignmentCorrection[];
};
```

---

## 13. RoiExtractionService

```ts
interface RoiExtractionService {
  projectFields(input: RoiProjectionInput): Result<ProjectedRoi[], RoiError>;
  extractRois(input: RoiExtractionInput): Promise<Result<RoiExtractionOutput, RoiError>>;
}
```

Known-template fast path depends on this.

---

## 14. StorageService

```ts
interface StorageService {
  saveDocGraph(graph: DocGraph): Promise<Result<void, StorageError>>;
  loadDocGraph(documentId: DocumentId): Promise<Result<DocGraph, StorageError>>;
  saveTemplate(template: TemplateGraph): Promise<Result<void, StorageError>>;
  loadTemplate(templateId: TemplateId): Promise<Result<TemplateGraph, StorageError>>;
  saveArtifact(artifact: Artifact): Promise<Result<ArtifactRef, StorageError>>;
  deleteDocument(documentId: DocumentId): Promise<Result<void, StorageError>>;
}
```

---

## 15. FormProjectionService

```ts
interface FormProjectionService {
  project(input: FormProjectionInput): Result<FormProjectionOutput, FormProjectionError>;
}
```

Converts graph/hypotheses/statuses into UI form schema and values.

---

## 16. CorrectionService

```ts
interface CorrectionService {
  applyCorrection(input: CorrectionInput): Promise<Result<CorrectionOutput, CorrectionError>>;
}
```

Must create:

- CorrectionEvent
- DocGraphPatch
- affected validator scope
- template save eligibility update

---

## 17. ExportService

```ts
interface ExportService {
  createExport(input: ExportInput): Promise<Result<ExportPackage, ExportError>>;
}
```

Must preserve statuses and warn on sensitive data.

---

## 18. Interface testing

Every interface needs:

- mock implementation for tests,
- contract tests,
- error behavior tests,
- no sensitive logging tests where relevant.

---

## 19. Final interface rule

Every module should do one job, return typed evidence/results, and avoid mutating unrelated state. Interfaces are how the project remains testable and swappable without becoming chaotic.
