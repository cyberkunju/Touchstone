# Runtime Architecture — Edge DocGraph Engine

**Purpose:** Define the browser/local runtime architecture for running document intelligence fully on edge devices without cloud OCR or cloud model inference.

---

## 1. Runtime goal

The runtime must run the complete document intelligence pipeline locally:

```text
upload
  → PDF/image decode
  → normalization
  → local model inference
  → OCR
  → visual asset extraction
  → parsers
  → DocGraph
  → verifier
  → editable form
  → correction
  → local template memory
```

No document content should be required to leave the device.

---

## 2. Supported runtime modes

The architecture supports two runtime modes.

### 2.1 Browser/PWA runtime

Runs inside the browser.

Use for:

- prototype
- offline-first web app
- easy distribution
- user testing
- simpler documents
- model/runtime benchmarking

### 2.2 Tauri local app runtime

Runs the same frontend inside a desktop/mobile shell with a local backend.

Use for:

- serious v1
- stronger local file access
- more predictable performance
- native model/runtime options
- native OpenCV/ONNX acceleration later
- better packaging and model distribution

Recommendation:

```text
Prototype: Browser/PWA
Serious v1: Tauri app with same frontend
```

---

## 3. Runtime layers

```text
UI Thread
  ├── React/Vue/Svelte UI
  ├── Document viewer shell
  ├── Form renderer
  ├── Evidence drawer
  └── User interaction

Worker Layer
  ├── upload/PDF worker
  ├── image normalization worker
  ├── inference worker
  ├── OCR worker
  ├── table worker
  ├── parser worker
  └── storage/index worker

Runtime Services
  ├── ONNX Runtime Web
  ├── WASM libraries
  ├── PDF.js
  ├── OpenCV.js/custom image ops
  ├── zxing-wasm
  └── storage APIs

Storage Layer
  ├── IndexedDB
  ├── OPFS
  ├── optional SQLite WASM
  └── model cache

Core Domain
  ├── DocGraph
  ├── TemplateGraph
  ├── Verifier
  ├── Validator Registry
  └── Export pipeline
```

---

## 4. UI thread responsibilities

UI thread should only handle:

- rendering
- user input
- document viewer interactions
- form state display
- progress display
- small orchestration messages

UI thread must not run heavy OCR/model inference/image loops.

Heavy work must be moved to workers.

---

## 5. Worker responsibilities

Workers handle:

- PDF page rendering where supported
- image preprocessing
- model inference
- OCR batch execution
- QR/barcode parsing
- MRZ parsing
- table geometry
- storage I/O
- template matching
- verifier execution when large

Workers communicate through typed task contracts.

---

## 6. Runtime service boundaries

The runtime service layer wraps external libraries.

Examples:

```text
onnxRuntimeService
pdfService
opencvService
barcodeService
storageService
modelCacheService
templateStoreService
```

Application code should not call raw library APIs everywhere. This prevents spaghetti architecture and allows browser/Tauri swapping later.

---

## 7. Inference architecture

```text
Inference Worker
  ├── ModelSessionRegistry
  ├── TensorFactory
  ├── Preprocessor
  ├── Postprocessor
  ├── Scheduler
  └── MemoryManager
```

Model calls should be explicit:

```ts
type InferenceRequest = {
  modelId: string;
  inputImageId?: string;
  tensorInput?: TensorRef;
  options?: Record<string, unknown>;
};
```

---

## 8. Pipeline scheduler

A scheduler coordinates jobs.

```text
DocumentJob
  ├── PageJob
  │   ├── NormalizePageTask
  │   ├── DetectObjectsTask
  │   ├── OcrTask
  │   ├── ParseCodesTask
  │   ├── ParseMrzTask
  │   ├── ExtractTablesTask
  │   └── VerifyTask
  └── BuildFormTask
```

Scheduler requirements:

- cancellation
- progress events
- task priorities
- page-level isolation
- memory limits
- retry only where designed
- error propagation

---

## 9. Runtime event bus

Use structured events:

```ts
type RuntimeEvent =
  | { type: "job_started"; jobId: string }
  | { type: "task_progress"; taskId: string; progress: number; message: string }
  | { type: "task_completed"; taskId: string }
  | { type: "task_failed"; taskId: string; error: RuntimeError }
  | { type: "docgraph_updated"; documentId: string; patchId: string }
  | { type: "memory_warning"; level: "low" | "medium" | "high" };
```

UI subscribes to events and renders progress/status.

---

## 10. Storage architecture

Use:

- IndexedDB for structured records
- OPFS for model files, large blobs, crops, rendered pages
- optional SQLite WASM over OPFS for advanced query/template memory
- Cache API only for app assets, not sensitive documents unless explicitly designed

Recommended:

```text
IndexedDB:
  documents
  pages
  docgraphs
  templates
  validations
  jobs
  indexes

OPFS:
  /models
  /documents/{documentId}/images
  /documents/{documentId}/crops
  /templates/{templateId}/descriptors
```

---

## 11. Model lifecycle

Model states:

```ts
type ModelState =
  | "not_loaded"
  | "loading"
  | "ready"
  | "failed"
  | "disposed";
```

Model lifecycle:

```text
registered
  → lazy load
  → create session
  → warm optional
  → run inference
  → idle
  → dispose under memory pressure
```

Do not load every model at startup.

---

## 12. Device classes

The runtime should classify device capability.

Example:

```ts
type DeviceClass = "low" | "medium" | "high" | "unknown";
```

Signals:

- available memory hints where available
- WebGPU availability
- CPU thread availability
- screen/device type
- benchmark micro-test
- prior runtime performance

Device class influences:

- batch sizes
- model variants
- parallelism
- render resolution
- segmentation use
- cache policy

---

## 13. Browser runtime constraints

Browser limitations:

- memory limits vary
- WebGPU support varies
- model files can be large
- storage quota can be cleared
- Safari behavior may differ
- background tab throttling
- PWA storage persistence not guaranteed everywhere
- SharedArrayBuffer requires isolation

This is why Tauri remains the serious-app path.

---

## 14. Tauri runtime option

Tauri keeps the web UI but allows local backend commands.

Possible native backend responsibilities:

- file system access
- PDFium rendering
- native OpenCV
- native ONNX Runtime
- model storage
- SQLite
- encrypted storage
- OS integration
- better memory/performance control

The frontend architecture should not assume browser-only services.

---

## 15. Security architecture

Security requirements:

- local-only processing
- strict CSP
- COOP/COEP for isolation when needed
- no third-party scripts that can inspect documents
- safe barcode URL handling
- sandboxed PDF handling
- no remote model execution
- sensitive storage design
- explicit exports only

---

## 16. Runtime failure handling

Failures must be structured.

Examples:

- model load failed
- WebGPU unavailable
- WASM init failed
- PDF render failed
- local storage full
- out of memory
- worker crashed
- task cancelled

All should produce user-friendly messages and developer details.

---

## 17. Runtime invariants

1. Heavy work does not block UI thread.
2. Document content is processed locally.
3. Workers communicate through typed contracts.
4. Models are lazy-loaded.
5. Large artifacts are stored in OPFS.
6. Structured records are stored in IndexedDB.
7. Memory is explicitly managed.
8. Runtime services hide library-specific APIs.
9. Browser path and Tauri path share domain logic.
10. Security headers are required for advanced WASM/threading features.

---

## 18. References

- ONNX Runtime Web: https://onnxruntime.ai/
- Web Workers: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API
- OffscreenCanvas: https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas
- OPFS: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
- Tauri: https://v2.tauri.app/start/
- COOP: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy
- COEP: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy

---

## 19. Final statement

The runtime is a local document intelligence operating system. Its job is to keep the UI responsive, run heavy inference safely, preserve privacy, manage memory aggressively, and provide a clean path from browser prototype to serious Tauri app.
