# 08 — Edge Runtime

**Purpose:** Define the local runtime: worker architecture and protocol, ONNX Runtime Web, model loading/caching, memory management, performance budgets, browser support, security headers, and the Tauri path.

Core principle: keep the UI responsive, run heavy work in workers, manage memory explicitly, and never require cloud processing.

---

## 1. Thread model

- **Main thread:** React, viewer, form, evidence drawer, progress, light orchestration. Never runs OCR/detection/segmentation, large PDF rasterization, OpenCV loops, table reconstruction on large pages, or barcode scanning on large images.
- **Workers** (start with 3, split by bottleneck later): `inference` (ONNX sessions), `parser` (zxing/MRZ/table geometry/validators), `preprocess` (PDF render/OpenCV/quality/crops). Optional `orchestrator`/`storage` workers as the app grows.

## 2. Worker protocol

Typed, versioned, cancellable, privacy-safe. Use Comlink or a typed message bus. Envelope:

```ts
type WorkerEnvelope<T> = { protocolVersion: 'worker-protocol-v1'; requestId: string; jobId?: string; sentAt: number; payload: T };
type WorkerResponse<T> = { type: 'success'; requestId: string; result: T } | { type: 'failure'; requestId: string; error: WorkerProtocolError };
type WorkerEvent = // job_started | task_started | task_progress | task_completed | task_failed | job_completed | job_cancelled | docgraph_patch | memory_warning
  { type: string; jobId?: string; taskId?: string; progress?: number; message?: string; /* ... */ };
type WorkerProtocolError = { code: string; severity: 'info'|'warning'|'error'|'critical'; recoverable: boolean; userMessage: string; developerMessage: string; safeDetails?: Record<string, unknown> };
```

Rules: progress `message` and `safeDetails` must contain **no raw document values** ("Reading text from page 1", not "Read A1234567"). Pass large data by **reference** (`ImageRef { id, storage: 'memory'|'opfs'|'indexeddb', width, height }`) or **transferable** (`ArrayBuffer`, `ImageBitmap`, `OffscreenCanvas`, typed arrays) — never structured-clone big buffers per message. Every result carries `requestId`/`jobId`/graph version; **ignore stale results** after cancellation, document change, or graph-version change. Workers never mutate UI state; they emit results/patches/events.

## 3. ONNX Runtime Web

- Execution providers: **WebGPU primary**, **WASM compatibility** required. Feature-detect; record runtime mode in evidence. Configure `ort.env.wasm.wasmPaths`.
- Session lifecycle: `register → lazy load file → create session → (optional warm) → run → idle → dispose under pressure`. Reuse sessions; create input tensor → run → read outputs → postprocess → **release tensor references**. Never store tensors in the DocGraph.
- Preprocess in the worker (resize/letterbox/normalize/channel order). Postprocess to evidence (decode, threshold, NMS, map to normalized coordinates). Batch OCR crops by device class. Catch WebGPU device-lost; fall back to WASM where the model policy allows.

## 4. Model loading & caching

- Lazy-load by need; OPFS cache at `/models/{id}/{version}/`; **atomic write** via `/.tmp/` + size + sha256 verification before promotion; never load an unverified model.
- Manifest-driven, version-pinned, checksum-verified (see [05_AI_MODELS.md](05_AI_MODELS.md)). Offline works once cached/packaged; if a required model is missing offline, show a clear message — never upload anything to compensate.
- Show honest load states: downloading → validating → loading session → ready. Handle quota/eviction/private-mode gracefully.

## 5. Memory management

Weak devices crash without discipline. Every large object has an owner that releases it.

- No raw pixels in the DocGraph; store artifacts by reference. Close `ImageBitmap` (`.close()`); release crop/tensor buffers after use.
- Don't preload all models; don't high-DPI-render all PDF pages; process pages sequentially on low devices; avoid parallel heavy WebGPU sessions; no full-page segmentation by default.
- Batch policy by device class: low `{ocrBatch:2, parallelPages:1, segmentation:off}`, medium `{ocrBatch:8, parallelPages:1}`, high `{ocrBatch:16, parallelPages:2}`.
- Emit `memory_warning` (low/medium/high/critical) → reduce batch, dispose optional models, stop segmentation, process one page at a time. Clean up after each page/document, on close, on cancel, on worker error. Run repeated-processing leak tests.

## 6. Performance budgets (aspirational; benchmark per device)

Device classes: **low** (budget Android/old laptop, no stable WebGPU), **medium** (modern midrange + maybe WebGPU), **high** (modern desktop/strong WebGPU/Tauri).

| Flow (1 page) | high | medium | low |
|---|---|---|---|
| Known-template (ROI-first) | 1–3 s | 3–6 s | 6–12 s |
| Unknown-document | 4–8 s | 8–15 s | 15–30 s |

UI responsiveness: field click→highlight <100 ms; evidence drawer <200 ms; correction save UI <300 ms; viewer zoom/pan ~60 fps and never frozen during processing. Known-template **must** be faster than unknown. Startup must not load all models. Optimize by avoiding work, then ROI-first, then export/quantization, then batching, then memory — never by hiding uncertainty.

## 7. OffscreenCanvas

Use in workers for resize, crop generation, thumbnails, and model-input buffers. Feature-detect (`typeof OffscreenCanvas !== 'undefined'`); fall back to limited main-thread canvas only for light ops. Keep interactive overlays as accessible DOM/SVG over the canvas (not canvas-only) for accessibility. Avoid repeated `getImageData`; release buffers.

## 8. Browser support & security headers

Capability-test, don't assume. Detect: workers, module workers, OffscreenCanvas, ImageBitmap, OPFS, WebGPU, WASM, SharedArrayBuffer, `crossOriginIsolated`, IndexedDB.

- Tiers: Chromium (strongest) → Firefox/Safari (capability-dependent) → unsupported (missing critical APIs).
- For threaded WASM/SharedArrayBuffer set isolation headers (also in dev): `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`; check `crossOriginIsolated`.
- Strict CSP: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`. No third-party scripts. Serve app and models same-origin (or trusted, checksummed, explicitly listed). Show honest capability warnings when features are missing.

## 9. Tauri path (serious v1)

Same frontend and domain packages; only runtime adapters differ (implement `StorageService`/`PdfService`/`InferenceService`/`FileSystemService` for both browser and Tauri). Tauri gains: native file access, bundled+checksummed models, SQLite/filesystem storage, optional native ONNX/OpenCV/PDFium, OS-keychain-backed encryption. Security: minimal, typed, path-validated commands; no arbitrary shell/filesystem; no document upload; preserve all privacy controls; migrations preserve user templates/corrections.
