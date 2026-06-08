# Worker Messages — API and Schema Reference

**Purpose:** Define request/response protocols for communication between UI, orchestrator workers, inference workers, image workers, parser workers, table workers, and storage workers.

---

## 1. Protocol rule

All worker messages must be:

- typed,
- versioned,
- cancellable,
- safe to log in redacted form,
- linked to `requestId`,
- linked to `jobId` where applicable,
- free of raw document values in errors/logs.

Workers must not mutate UI state directly. They emit results, patches, or progress events.

---

## 2. Message envelope

```ts
type WorkerEnvelope<TPayload> = {
  protocolVersion: "worker-protocol-v1";
  requestId: RequestId;
  jobId?: JobId;
  sentAt: number;
  payload: TPayload;
};
```

Every message crossing the worker boundary uses this envelope.

---

## 3. Request union

```ts
type WorkerRequest =
  | ProcessDocumentRequest
  | CancelJobRequest
  | NormalizePageRequest
  | RunDetectionRequest
  | RunOcrRequest
  | RunSegmentationRequest
  | ParseBarcodeRequest
  | ParseMrzRequest
  | ExtractTableRequest
  | VerifyGraphRequest
  | SaveArtifactRequest
  | LoadArtifactRequest
  | SaveDocGraphRequest
  | LoadDocGraphRequest;
```

---

## 4. Response union

```ts
type WorkerResponse<T = unknown> =
  | WorkerSuccessResponse<T>
  | WorkerFailureResponse;

type WorkerSuccessResponse<T> = {
  type: "success";
  requestId: RequestId;
  jobId?: JobId;
  result: T;
};

type WorkerFailureResponse = {
  type: "failure";
  requestId: RequestId;
  jobId?: JobId;
  error: WorkerProtocolError;
};
```

---

## 5. Event union

```ts
type WorkerEvent =
  | JobStartedEvent
  | TaskStartedEvent
  | TaskProgressEvent
  | TaskCompletedEvent
  | TaskFailedEvent
  | JobCompletedEvent
  | JobCancelledEvent
  | DocGraphPatchEvent
  | MemoryWarningEvent;
```

---

## 6. Progress event

```ts
type TaskProgressEvent = {
  type: "task_progress";
  jobId: JobId;
  taskId: TaskId;
  taskType: TaskType;
  progress: number;
  message: string;
};
```

`progress` is from `0` to `1`.

Do not include sensitive extracted values in `message`.

Good:

```text
Reading text from page 1.
```

Bad:

```text
Read passport number A1234567.
```

---

## 7. Process document request

```ts
type ProcessDocumentRequest = {
  type: "process_document";
  input: {
    documentId: DocumentId;
    fileRef: FileRef;
    mode: "auto" | "unknown_document" | "known_template" | "manual";
    templateId?: TemplateId;
    options: PipelineOptions;
  };
};
```

### Output

```ts
type ProcessDocumentResult = {
  documentId: DocumentId;
  docGraphId: DocGraphId;
  formId: FormId;
  summary: {
    confirmed: number;
    needsReview: number;
    missing: number;
    conflict: number;
    invalid: number;
  };
};
```

---

## 8. Detection request

```ts
type RunDetectionRequest = {
  type: "run_detection";
  input: {
    documentId: DocumentId;
    pageId: PageId;
    imageRef: ImageRef;
    modelId: ModelId;
    thresholds: DetectionThresholds;
  };
};
```

### Output

```ts
type DetectionResult = {
  detections: DetectionCandidate[];
  evidence: EvidenceRecord[];
  modelRun: ModelRunInfo;
};
```

---

## 9. OCR request

```ts
type RunOcrRequest = {
  type: "run_ocr";
  input: {
    documentId: DocumentId;
    pageId: PageId;
    imageRef: ImageRef;
    mode: "full_page" | "roi" | "table_cells" | "mrz";
    rois?: OcrRoi[];
    modelId: ModelId;
  };
};
```

### Output

```ts
type OcrResult = {
  lines: TextLineCandidate[];
  words?: TextWordCandidate[];
  evidence: EvidenceRecord[];
  modelRun: ModelRunInfo;
};
```

---

## 10. Segmentation request

```ts
type RunSegmentationRequest = {
  type: "run_segmentation";
  input: {
    documentId: DocumentId;
    pageId: PageId;
    imageRef: ImageRef;
    regions: AssetRegionCandidate[];
    modelId: ModelId;
  };
};
```

Segmentation is conditional and must not run full-page by default.

---

## 11. Barcode request

```ts
type ParseBarcodeRequest = {
  type: "parse_barcode";
  input: {
    documentId: DocumentId;
    pageId: PageId;
    cropRef: ImageRef;
    expectedType?: "qr" | "barcode" | "pdf417" | "data_matrix" | "aztec";
  };
};
```

Decoded URLs are returned as escaped payload values. They are never auto-opened.

---

## 12. MRZ request

```ts
type ParseMrzRequest = {
  type: "parse_mrz";
  input: {
    documentId: DocumentId;
    pageId: PageId;
    rawOcrLines: string[];
    sourceEvidenceIds: EvidenceId[];
  };
};
```

Output includes raw lines, normalized lines, parsed fields, and check digit results.

---

## 13. Table extraction request

```ts
type ExtractTableRequest = {
  type: "extract_table";
  input: {
    documentId: DocumentId;
    pageId: PageId;
    imageRef: ImageRef;
    tableRegion: NormalizedBox;
    mode: "geometry" | "model_bucket";
    ocrEvidenceIds: EvidenceId[];
  };
};
```

---

## 14. Verify graph request

```ts
type VerifyGraphRequest = {
  type: "verify_graph";
  input: {
    documentId: DocumentId;
    graphRef?: GraphRef;
    graphPatch?: DocGraphPatch;
    scope: "full_document" | "affected_fields";
    affectedIds?: string[];
  };
};
```

---

## 15. Cancellation

```ts
type CancelJobRequest = {
  type: "cancel_job";
  input: {
    jobId: JobId;
    reason?: string;
  };
};
```

Cancellation rules:

1. stop scheduling new tasks,
2. abort supported operations,
3. ignore stale results,
4. clean temporary artifacts,
5. preserve user corrections already applied.

---

## 16. Worker error type

```ts
type WorkerProtocolError = {
  code: string;
  severity: "info" | "warning" | "error" | "critical";
  recoverable: boolean;
  userMessage: string;
  developerMessage: string;
  safeDetails?: Record<string, unknown>;
};
```

`safeDetails` must not include raw OCR text, MRZ, barcode payload, images, crops, or private values.

---

## 17. Transferable objects

Use transferables for:

- `ArrayBuffer`
- `ImageBitmap`
- `OffscreenCanvas`
- typed arrays

Prefer artifact refs for large data:

```ts
type ImageRef = {
  id: string;
  storage: "memory" | "opfs" | "indexeddb";
  width: number;
  height: number;
  mimeType?: string;
};
```

---

## 18. Stale result rule

Every result must be checked against:

- active `documentId`,
- active `jobId`,
- current graph version,
- cancellation status.

Stale results must be ignored.

---

## 19. Final rule

The worker protocol is a safety boundary. It keeps heavy processing off the UI thread while preserving strict typing, cancellation, progress reporting, and privacy-safe error handling.
