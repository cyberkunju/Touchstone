# Worker Protocols — Edge DocGraph Engine

**Purpose:** Define typed messages between UI and workers, task queues, progress events, cancellation, errors, transferable payloads, and worker boundaries.

---

## 1. Worker protocol principle

Workers are not random background scripts.

They are typed runtime services with:

- request IDs
- job IDs
- task IDs
- structured inputs
- structured outputs
- progress events
- cancellation
- safe error payloads
- no sensitive logs

---

## 2. Worker types

Recommended workers:

```text
orchestrator.worker
inference.worker
image.worker
pdf.worker
parser.worker
table.worker
storage.worker
```

Start with fewer workers if needed, but keep protocols stable.

---

## 3. Message envelope

Every worker message should use an envelope.

```ts
type WorkerEnvelope<T> = {
  protocolVersion: "worker-protocol-v1";
  requestId: RequestId;
  jobId?: JobId;
  sentAt: number;
  payload: T;
};
```

---

## 4. Request messages

```ts
type WorkerRequest =
  | ProcessDocumentRequest
  | CancelJobRequest
  | NormalizePageRequest
  | RunDetectionRequest
  | RunOcrRequest
  | ParseBarcodeRequest
  | ParseMrzRequest
  | ExtractTableRequest
  | VerifyGraphRequest
  | SaveArtifactRequest
  | LoadArtifactRequest;
```

---

## 5. Response messages

```ts
type WorkerResponse =
  | { type: "success"; requestId: RequestId; result: unknown }
  | { type: "failure"; requestId: RequestId; error: WorkerProtocolError };
```

Prefer typed generic APIs in implementation.

---

## 6. Event messages

Workers can emit events.

```ts
type WorkerEvent =
  | { type: "job_started"; jobId: JobId }
  | { type: "task_started"; jobId: JobId; taskId: TaskId; taskType: TaskType }
  | { type: "task_progress"; jobId: JobId; taskId: TaskId; progress: number; message: string }
  | { type: "task_completed"; jobId: JobId; taskId: TaskId }
  | { type: "task_failed"; jobId: JobId; taskId: TaskId; error: WorkerProtocolError }
  | { type: "job_completed"; jobId: JobId }
  | { type: "job_cancelled"; jobId: JobId }
  | { type: "docgraph_patch"; jobId: JobId; patch: DocGraphPatch }
  | { type: "memory_warning"; jobId?: JobId; warning: MemoryWarning };
```

---

## 7. Process document request

```ts
type ProcessDocumentRequest = {
  type: "process_document";
  input: {
    documentId: DocumentId;
    fileRef: FileRef;
    mode: "unknown_document" | "known_template" | "auto";
    templateId?: TemplateId;
    options: PipelineOptions;
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

Output:

```ts
type DetectionResult = {
  detections: DetectionCandidate[];
  evidence: EvidenceRecord[];
  modelInfo: ModelRunInfo;
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
    mode: "full_page" | "roi" | "table_cells" | "mrz";
    imageRef: ImageRef;
    rois?: OcrRoi[];
    modelId: ModelId;
  };
};
```

---

## 10. Parser requests

Barcode:

```ts
type ParseBarcodeRequest = {
  type: "parse_barcode";
  input: {
    documentId: DocumentId;
    pageId: PageId;
    cropRef: ImageRef;
    expectedType?: string;
  };
};
```

MRZ:

```ts
type ParseMrzRequest = {
  type: "parse_mrz";
  input: {
    documentId: DocumentId;
    pageId: PageId;
    ocrLines: string[];
    sourceEvidenceIds: EvidenceId[];
  };
};
```

---

## 11. Table request

```ts
type ExtractTableRequest = {
  type: "extract_table";
  input: {
    documentId: DocumentId;
    pageId: PageId;
    tableRegion: NormalizedBox;
    imageRef: ImageRef;
    ocrEvidenceIds: EvidenceId[];
    mode: "geometry" | "model_bucket";
  };
};
```

---

## 12. Verification request

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

## 13. Cancellation protocol

```ts
type CancelJobRequest = {
  type: "cancel_job";
  input: {
    jobId: JobId;
    reason?: string;
  };
};
```

Rules:

- stop scheduling new tasks,
- abort if supported,
- mark running tasks cancellation requested,
- ignore stale results,
- emit `job_cancelled`,
- clean temp artifacts.

---

## 14. Transferable payloads

Use transferables for:

- ArrayBuffer
- ImageBitmap
- OffscreenCanvas
- typed arrays

Avoid copying large images between threads.

Prefer references:

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

## 15. Error shape

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

No raw OCR text or sensitive values in errors.

---

## 16. Versioning

Protocol version is required.

When changing message shapes:

- add new version,
- support migration or compatibility,
- update tests,
- update docs.

---

## 17. Stale result handling

Every result must include:

- requestId
- jobId
- graphVersion/inputVersion where relevant

UI/app should ignore stale results when:

- user cancelled job,
- document changed,
- graph version changed,
- template decision changed.

---

## 18. Worker tests

Test:

- each request/response schema
- progress event order
- cancellation
- stale result ignore
- error mapping
- large transferable handling
- worker crash recovery
- no sensitive log output

---

## 19. Final protocol rule

Worker communication must be typed, cancellable, versioned, and safe. A worker should never mutate UI state directly or emit unstructured sensitive debug data.
