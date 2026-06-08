# Memory Management — Edge DocGraph Engine

**Purpose:** Define rules for disposing sessions, releasing tensors, controlling image buffers, avoiding WebGPU memory crashes, and surviving weak edge devices.

---

## 1. Why memory management is critical

This project processes:

- high-resolution page images
- PDF render buffers
- OCR crops
- model tensors
- ONNX sessions
- WebGPU resources
- table/crop artifacts
- DocGraph JSON
- local storage blobs

Weak devices can crash quickly without strict memory discipline.

---

## 2. Main memory risks

Risks:

- loading all models at once
- rendering large PDFs at high DPI
- keeping full-resolution page buffers alive
- batching too many OCR crops
- running detector and OCR sessions simultaneously
- WebGPU memory not released quickly
- keeping tensor references after inference
- copying buffers between workers
- storing huge DocGraphs in UI state
- full-page segmentation

---

## 3. Memory ownership model

Every large object must have an owner.

Examples:

| Object | Owner |
|---|---|
| page image blob | storage service |
| decoded ImageBitmap | image worker task |
| tensor input | inference task |
| ONNX session | model manager |
| OCR crop | OCR task/storage artifact |
| DocGraph | graph store |
| template descriptors | template store |

Owners must release resources.

---

## 4. Image memory rules

### 4.1 Page rendering

Do not render all pages at high resolution.

Rules:

- render current/next page first,
- process pages sequentially on low devices,
- use preview resolution for thumbnails,
- use OCR resolution only when needed,
- store rendered page and release raw buffer.

### 4.2 Crops

Crops should be:

- generated on demand,
- stored as compressed artifacts if reused,
- released after OCR/inference,
- referenced by ID, not copied everywhere.

### 4.3 ImageBitmap

Call release/close where supported:

```ts
imageBitmap.close();
```

---

## 5. Tensor memory rules

For every inference:

```text
create input tensor
  → run session
  → read outputs
  → postprocess
  → release references
```

Rules:

- do not store tensors in DocGraph,
- store only postprocessed results,
- avoid keeping outputs alive,
- batch carefully,
- reuse typed arrays only if safe.

---

## 6. ONNX session memory

Sessions can be large.

Rules:

- lazy-load sessions,
- keep only active/core sessions ready,
- dispose optional idle sessions,
- do not load segmentation unless needed,
- do not load heavy table model unless table bucket enabled,
- unload models under memory pressure.

Session states:

```text
ready → idle → disposed
```

---

## 7. WebGPU memory discipline

WebGPU resources can persist if references remain.

Rules:

- avoid parallel heavy WebGPU inference,
- keep tensor/object references scoped,
- dispose sessions when not needed,
- catch device lost/errors,
- reduce input size/batch if memory warning,
- avoid full-page segmentation,
- provide WASM mode where allowed.

---

## 8. Batch sizing

Batch size must depend on device class.

Example:

```ts
const batchPolicy = {
  low: {
    ocrRecognitionBatch: 2,
    maxParallelPages: 1,
    segmentationEnabledByDefault: false
  },
  medium: {
    ocrRecognitionBatch: 8,
    maxParallelPages: 1
  },
  high: {
    ocrRecognitionBatch: 16,
    maxParallelPages: 2
  }
};
```

---

## 9. DocGraph memory

DocGraph can grow large.

Rules:

- store artifacts by reference,
- avoid raw pixels in graph,
- keep UI state as selected IDs/patches,
- avoid cloning full graph on every edit,
- use incremental patches,
- archive old low-level candidate evidence if user does not need full debug mode.

---

## 10. Storage memory

Writing large blobs:

- stream where possible,
- avoid loading full file into memory repeatedly,
- use OPFS for large artifacts,
- use IndexedDB for metadata,
- clean temporary files.

---

## 11. Memory warning system

Implement internal warnings:

```ts
type MemoryWarning = {
  level: "low" | "medium" | "high" | "critical";
  reason: string;
  suggestedAction: string;
};
```

Actions:

- reduce batch size,
- process one page at a time,
- dispose optional models,
- clear temp images,
- stop segmentation,
- ask user to process fewer pages.

---

## 12. Cleanup points

Run cleanup after:

- page processing complete,
- document processing complete,
- user closes document,
- task cancelled,
- worker error,
- model idle timeout,
- export complete.

---

## 13. Cancellation cleanup

When user cancels:

- stop scheduling new tasks,
- abort supported operations,
- ignore stale results,
- release temporary buffers,
- close ImageBitmap,
- dispose task tensors,
- keep already saved user corrections.

---

## 14. Memory leak tests

Run repeated processing:

```text
same image processed 50 times
multi-page PDF processed repeatedly
OCR batches repeated
model load/dispose cycle
segmentation task repeated
```

Measure:

- JS heap growth
- GPU memory if possible
- worker memory
- OPFS temp files
- session counts

---

## 15. Performance vs memory tradeoffs

High speed often uses more memory.

Examples:

- large batch OCR faster but memory-heavy
- preloading models faster but memory-heavy
- high-DPI render better OCR but memory-heavy
- keeping all page images loaded improves navigation but memory-heavy

Choose based on device class.

---

## 16. User-facing memory messages

Low memory:

```text
This device is low on memory. Processing will continue one page at a time.
```

Critical:

```text
This document needs more memory than this device can provide. Try fewer pages or a smaller image.
```

Model memory failure:

```text
A local model could not run on this device. Try a smaller document or the desktop app.
```

---

## 17. Invariants

1. No raw pixels in DocGraph.
2. No full high-resolution PDF render for all pages by default.
3. No all-model preload.
4. Tensors are scoped and released.
5. ImageBitmap objects are closed.
6. Optional models are disposable.
7. Segmentation is conditional.
8. Memory warnings adjust scheduler behavior.
9. Cancellation cleans resources.
10. Repeated processing must not grow memory unbounded.

---

## 18. Final statement

Memory management is not an optimization phase. It is a core product requirement. Edge-only document intelligence will fail unless every model, tensor, image buffer, crop, worker, and artifact has a clear lifecycle.
