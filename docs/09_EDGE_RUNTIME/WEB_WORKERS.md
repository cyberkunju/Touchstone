# Web Workers — Edge DocGraph Engine

**Purpose:** Define worker design, Comlink-style contracts, task queues, message types, cancellation, progress, and error handling.

---

## 1. Why workers are mandatory

Document intelligence workloads are heavy:

- PDF rendering
- image normalization
- OCR
- object detection
- segmentation
- table reconstruction
- parsing
- verification
- storage writes

Running these on the UI thread will freeze the app.

Workers allow heavy work to run separately from the main execution thread so the UI can remain responsive.

---

## 2. Worker architecture

Recommended worker split:

```text
main thread
  ├── UI
  ├── viewer
  ├── form renderer
  └── worker client

workers
  ├── orchestrator.worker
  ├── pdf.worker
  ├── image.worker
  ├── inference.worker
  ├── ocr.worker
  ├── parser.worker
  ├── table.worker
  └── storage.worker
```

Start with fewer workers if complexity is high:

```text
orchestrator.worker
inference.worker
storage.worker
```

Then split by bottleneck.

---

## 3. Worker roles

### 3.1 Orchestrator worker

Owns:

- document jobs
- page tasks
- task dependencies
- progress aggregation
- cancellation
- retry policies

### 3.2 PDF worker

Owns:

- PDF.js loading/rendering if worker-compatible
- page metadata
- embedded text extraction
- page raster artifact creation

### 3.3 Image worker

Owns:

- decode/resize
- boundary detection
- deskew
- perspective correction
- quality analysis
- crop generation

### 3.4 Inference worker

Owns:

- ONNX Runtime Web sessions
- model loading
- tensor creation
- inference
- tensor disposal
- WebGPU/WASM execution provider selection

### 3.5 OCR worker

Can be same as inference worker if OCR uses ONNX models.

Owns:

- OCR detection/recognition calls
- OCR crop batching
- OCR reading order normalization

### 3.6 Parser worker

Owns:

- zxing-wasm
- MRZ parser
- date/amount/ID parsers
- payload parser

### 3.7 Table worker

Owns:

- line detection
- grid reconstruction
- cell assignment
- table validation support

### 3.8 Storage worker

Owns:

- OPFS file writes
- IndexedDB bulk operations
- model cache
- artifact cleanup

---

## 4. Comlink-style contracts

Use a typed API between main thread and workers.

Example:

```ts
interface RuntimeWorkerApi {
  processDocument(input: ProcessDocumentInput): Promise<ProcessDocumentResult>;
  cancelJob(jobId: string): Promise<void>;
  getJobStatus(jobId: string): Promise<JobStatus>;
}
```

If using Comlink, keep exposed functions stable and typed.

Do not pass huge objects through structured clone unnecessarily. Use Transferable objects or storage references.

---

## 5. Task model

```ts
type RuntimeTask = {
  id: string;
  jobId: string;
  type:
    | "pdf_render"
    | "normalize_image"
    | "detect_objects"
    | "ocr"
    | "parse_codes"
    | "parse_mrz"
    | "extract_table"
    | "verify"
    | "build_form"
    | "save_template";

  pageId?: string;

  priority: "low" | "normal" | "high" | "critical";

  dependencies: string[];

  status: "queued" | "running" | "completed" | "failed" | "cancelled";

  createdAt: number;
};
```

---

## 6. Queue design

Use task queues:

- high-priority UI-triggered tasks
- normal extraction tasks
- low-priority cache/template/index tasks

Rules:

- process one heavy inference at a time on low devices
- allow parallel image/preprocessing tasks if memory allows
- avoid simultaneous large model sessions
- throttle table/OCR batches
- page jobs should be cancellable

---

## 7. Progress events

```ts
type TaskProgressEvent = {
  type: "task_progress";
  jobId: string;
  taskId: string;
  stage: string;
  progress: number;
  message: string;
};
```

Example stages:

- loading model
- rendering page
- normalizing image
- detecting regions
- reading text
- verifying fields

---

## 8. Cancellation

Cancellation must be supported.

```ts
interface CancellableTask {
  signal: AbortSignal;
}
```

For libraries that do not support AbortSignal:

- stop scheduling new work,
- ignore stale results,
- dispose resources after current call,
- mark task cancelled.

---

## 9. Transferable objects

Use transferables for:

- ArrayBuffer
- ImageBitmap
- OffscreenCanvas
- typed arrays

Avoid copying:

- page image buffers
- model tensors
- crop arrays
- large JSON with raw pixels

Store large artifacts in OPFS and pass references.

---

## 10. Message payload design

Prefer:

```ts
type ImageRef = {
  id: string;
  storage: "memory" | "opfs" | "indexeddb";
  width: number;
  height: number;
  mimeType?: string;
};
```

over passing raw image bytes in every message.

---

## 11. Worker memory management

Workers should track:

- loaded models
- active tensors
- image buffers
- crop buffers
- open OPFS handles
- task-specific allocations

After each task:

- dispose tensors
- release ImageBitmap
- clear temporary buffers
- close file handles
- report memory warning if needed

---

## 12. Error model

```ts
type WorkerError = {
  code:
    | "model_load_failed"
    | "inference_failed"
    | "pdf_render_failed"
    | "image_decode_failed"
    | "storage_failed"
    | "out_of_memory"
    | "cancelled"
    | "unknown";

  message: string;
  userMessage: string;
  details?: Record<string, unknown>;
  recoverable: boolean;
};
```

Main thread shows `userMessage`.

Developer mode can show `details`.

---

## 13. Worker crash recovery

If worker crashes:

1. mark active task failed,
2. dispose worker,
3. recreate worker,
4. reload required lightweight state,
5. let user retry.

Do not lose corrected form state.

---

## 14. Main-thread safety rules

Main thread must not:

- run OCR loops,
- run model inference,
- rasterize large PDFs synchronously,
- parse huge images synchronously,
- block on storage writes,
- process huge DocGraph diffs synchronously.

---

## 15. Shared worker vs dedicated worker

Use dedicated workers initially.

Shared workers may be useful later for:

- shared model cache across tabs,
- multi-document queue,
- persistent background index.

But shared workers add complexity and browser differences.

---

## 16. Worker packaging

With Vite/modern bundlers:

```ts
new Worker(new URL("./inference.worker.ts", import.meta.url), { type: "module" });
```

Ensure:

- worker assets resolved,
- WASM assets copied,
- model paths available,
- CSP allows worker loading.

---

## 17. Worker testing

Unit test:

- task queue ordering
- cancellation
- error mapping
- progress events
- transfer payload shape
- stale result handling

Integration test:

- upload image
- run worker pipeline
- cancel mid-extraction
- worker crash recovery
- memory cleanup after repeated documents

---

## 18. Worker invariants

1. Heavy processing runs in workers.
2. Worker APIs are typed.
3. Progress is reported.
4. Cancellation is supported.
5. Large buffers are transferred or stored by reference.
6. Errors are structured.
7. Workers clean up resources.
8. Main UI remains responsive.

---

## 19. Reference

- Web Workers API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API

---

## 20. Final statement

Workers are the runtime backbone. Without a disciplined worker architecture, the app will freeze, leak memory, and fail on edge devices. The worker layer must be typed, cancellable, memory-aware, and UI-safe.
