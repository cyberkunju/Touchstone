# ONNX Runtime Web — Edge DocGraph Engine

**Purpose:** Define ONNX Runtime Web usage: session lifecycle, WebGPU/WASM execution modes, tensor handling, batching, errors, and disposal.

---

## 1. Role in the project

ONNX Runtime Web is the primary browser inference runtime for ONNX-exported models.

Target model categories:

- YOLOv11n document detector
- YOLOv11n segmentation if accepted
- PP-OCRv5 components if export works
- orientation classifier if used
- lightweight asset classifiers if needed

---

## 2. Execution providers

Supported runtime modes to design for:

```text
webgpu
wasm
```

### 2.1 WebGPU mode

Use when:

- available,
- stable for target model,
- faster than WASM,
- memory behavior acceptable.

### 2.2 WASM mode

Use when:

- WebGPU unavailable,
- WebGPU model op unsupported,
- browser/device unstable,
- deterministic CPU behavior needed.

Do not call it “fallback” in product architecture if the project wants single chosen model paths; treat it as runtime execution mode selection.

---

## 3. Session lifecycle

```text
register model
  → lazy load model file
  → create InferenceSession
  → warm optional
  → run inference
  → idle
  → dispose on memory pressure/app close
```

State:

```ts
type OrtModelSessionState =
  | "not_loaded"
  | "loading"
  | "ready"
  | "failed"
  | "disposed";
```

---

## 4. Model registry

```ts
type RuntimeModelSpec = {
  id: string;
  name: string;
  version: string;

  path: string;
  checksum?: string;

  task:
    | "document_detection"
    | "segmentation"
    | "ocr_detection"
    | "ocr_recognition"
    | "orientation"
    | "classification";

  input: {
    width: number;
    height: number;
    channels: 1 | 3;
    dtype: "float32" | "uint8";
    layout: "NCHW" | "NHWC";
  };

  output: {
    names: string[];
    postprocess: string;
  };

  execution: {
    preferred: "webgpu" | "wasm";
    allowed: Array<"webgpu" | "wasm">;
  };
};
```

---

## 5. Session creation

Pseudocode:

```ts
const session = await ort.InferenceSession.create(modelPath, {
  executionProviders: ["webgpu", "wasm"],
  graphOptimizationLevel: "all"
});
```

Actual options must be validated with the ONNX Runtime Web version used.

---

## 6. Tensor handling

Tensor flow:

```text
ImageRef
  → preprocess
  → TypedArray
  → ort.Tensor
  → session.run(feeds)
  → output tensors
  → postprocess
  → dispose/release references
```

Rules:

- do preprocessing in worker,
- avoid unnecessary copies,
- reuse buffers when safe,
- dispose references after run,
- do not keep output tensors alive after postprocess.

---

## 7. Input preprocessing

For detector:

```text
resize / letterbox
normalize
channel reorder
batch dimension
```

For OCR recognition:

```text
crop
resize preserving aspect if model requires
normalize
batch crops if supported
```

Record preprocessing metadata in evidence.

---

## 8. Output postprocessing

Model-specific.

YOLO detection:

- decode boxes
- confidence filtering
- class filtering
- NMS
- map boxes back to normalized page coordinates

OCR recognition:

- decode sequence
- confidence per text/candidate
- normalize text only in parser layer

Segmentation:

- decode masks
- crop/mask conversion
- map mask to page coordinates

---

## 9. Batching strategy

Batching improves throughput but increases memory.

Recommended:

- batch OCR recognition crops by device class,
- no huge full-page batches on low devices,
- cap batch size by memory profile,
- reduce batch size after memory warning.

Example:

```ts
type BatchPolicy = {
  low: { ocrBatchSize: 4 };
  medium: { ocrBatchSize: 8 };
  high: { ocrBatchSize: 16 };
};
```

---

## 10. WebGPU memory rules

WebGPU can crash or become unstable if memory is abused.

Rules:

- load only needed models,
- dispose idle sessions where possible,
- avoid parallel heavy sessions,
- limit tensor sizes,
- avoid full-page segmentation by default,
- handle device lost/runtime errors,
- downgrade runtime mode only if allowed by model policy.

---

## 11. WASM threading

WASM threading/SharedArrayBuffer may require cross-origin isolation.

If using threaded WASM:

- serve with COOP/COEP,
- avoid third-party resources without CORP/CORS,
- feature-detect `crossOriginIsolated`,
- provide non-threaded config if needed.

---

## 12. Model warmup

Optional warmup:

```text
create dummy tensor
run once
discard output
```

Use only if:

- improves first real inference,
- memory cost acceptable,
- not blocking initial UI.

Warm per model on demand, not globally at startup.

---

## 13. Error handling

Errors:

- model fetch failed
- checksum mismatch
- session creation failed
- execution provider unavailable
- tensor shape mismatch
- unsupported op
- inference failed
- WebGPU device lost
- out of memory

Each must map to RuntimeError.

Example user message:

```text
A local model could not be loaded. Try refreshing or using a supported browser/device.
```

---

## 14. Version pinning

Pin:

- ONNX Runtime Web package version
- model file version
- opset/export version
- postprocessor version

Evidence must record model version.

---

## 15. Testing

Test per model:

- load session
- run sample input
- output shape valid
- postprocessing correct
- WebGPU mode
- WASM mode
- repeated runs
- disposal
- memory growth
- bad input handling

---

## 16. Runtime abstraction

Application code should use:

```ts
interface InferenceService {
  run<TInput, TOutput>(modelId: string, input: TInput): Promise<TOutput>;
  load(modelId: string): Promise<void>;
  dispose(modelId: string): Promise<void>;
}
```

Do not scatter raw ONNX Runtime calls across pipelines.

---

## 17. ONNX Runtime Web invariants

1. Models are lazy-loaded.
2. Sessions are reused while needed.
3. Tensors are released after use.
4. Model versions are recorded in evidence.
5. WebGPU and WASM modes are feature-detected.
6. Heavy inference runs in workers.
7. Postprocessing maps outputs to DocGraph coordinates.
8. Session errors are structured.

---

## 18. Reference

- ONNX Runtime: https://onnxruntime.ai/
- ONNX: https://onnx.ai/

---

## 19. Final statement

ONNX Runtime Web is the browser inference engine, but reliability depends on strict session lifecycle, tensor discipline, feature detection, model versioning, and careful postprocessing.
