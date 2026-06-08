# Model Loading and Caching — Edge DocGraph Engine

**Purpose:** Define lazy loading, cache strategy, model manifests, OPFS storage, checksums, updates, version pinning, and failure behavior.

---

## 1. Core goal

Models are large and edge devices are limited. The app must load only what it needs, cache safely, verify versions, and avoid blocking first paint.

---

## 2. Model loading principle

Do not load all models at startup.

Load by need:

```text
upload document
  → load detector
  → load OCR when OCR task begins
  → load segmentation only if asset refinement needed
  → load table model only if table bucket enabled
```

---

## 3. Model manifest

All model files must be declared in a manifest.

```ts
type ModelManifest = {
  version: string;
  models: RuntimeModelSpec[];
};

type RuntimeModelSpec = {
  id: string;
  name: string;
  version: string;
  task: string;
  files: Array<{
    path: string;
    sizeBytes?: number;
    sha256?: string;
    required: boolean;
  }>;
  runtime: "onnxruntime-web" | "wasm" | "custom";
  execution: {
    preferred: "webgpu" | "wasm";
    allowed: Array<"webgpu" | "wasm">;
  };
};
```

---

## 4. Cache storage

Recommended:

```text
OPFS:
  /models/{modelId}/{version}/model.onnx
  /models/{modelId}/{version}/metadata.json
  /models/{modelId}/{version}/tokenizer.json
  /models/{modelId}/{version}/dict.txt
```

IndexedDB:

```text
modelManifest
modelCacheIndex
modelUsageStats
```

---

## 5. Why OPFS

OPFS is private to the origin and suited for large local files. It avoids user-visible file prompts and can support worker-side operations.

Use OPFS for:

- ONNX files
- WASM side files
- OCR dictionaries
- model metadata
- descriptors
- temporary model downloads

---

## 6. Loading states

```ts
type ModelLoadState =
  | "not_cached"
  | "downloading"
  | "cached"
  | "validating"
  | "loading_session"
  | "ready"
  | "failed";
```

UI should show clear status if model download/load is visible.

---

## 7. Cache policy

### Required models

Cache after first use:

- detector
- OCR core
- barcode parser WASM if not bundled

### Optional models

Cache only after use:

- segmentation bucket
- table model bucket
- experimental models

### Eviction

Evict:

- old versions
- unused experimental models
- failed partial downloads
- optional models under storage pressure

Never evict active model while session is using it.

---

## 8. Checksums

Each model should have SHA-256.

Flow:

```text
download
  → store temp
  → compute checksum
  → compare manifest
  → move to active cache
```

If checksum fails:

- delete temp
- report model_cache_integrity_failed
- do not load model

---

## 9. Partial downloads

Use temp paths:

```text
/models/.tmp/{modelId}/{version}/...
```

Only promote when complete and validated.

This prevents corrupted cache.

---

## 10. Model version pinning

Evidence must record:

- model ID
- model version
- manifest version
- runtime version
- preprocessing profile
- postprocessor version

This keeps DocGraph audit valid.

---

## 11. Lazy loading flow

```text
Task requests model
  → ModelManager checks session registry
  → if session ready, reuse
  → else check OPFS cache
  → if cached, validate/load
  → else download/bundle read
  → create ONNX session
  → return session
```

---

## 12. Bundled vs remote download

For strict local-first app:

- browser/PWA may download model assets as static app resources,
- Tauri can bundle models with app or install them locally,
- no document data is sent,
- model download should be from trusted project release source only.

If open-source project ships models separately, manifest must pin versions.

---

## 13. Offline behavior

If models cached:

```text
app works offline
```

If model missing and offline:

```text
Required local model is not available offline. Connect once to download it or install the packaged app.
```

Tauri packaging can avoid this by bundling required models.

---

## 14. Storage quota

Browser storage quota can vary and may be cleared.

Handle:

- quota errors
- cache eviction
- user clearing site data
- private browsing mode limitations

Provide UI:

```text
Local model files could not be cached. Processing may be slower next time.
```

---

## 15. Model manager API

```ts
interface ModelManager {
  getModel(modelId: string): Promise<ModelHandle>;
  preload(modelId: string): Promise<void>;
  dispose(modelId: string): Promise<void>;
  getState(modelId: string): ModelLoadState;
  clearUnusedModels(): Promise<void>;
  validateCache(): Promise<ModelCacheReport>;
}
```

---

## 16. Model loading UX

Do not show raw model names unless useful.

Good:

```text
Loading local text recognition model.
```

```text
Loading local document detector.
```

```text
Model cached for offline use.
```

---

## 17. Failure behavior

### Download failed

```text
A local model could not be downloaded. Check connection or use the packaged app.
```

### Cache validation failed

```text
A cached model file is corrupted. It will be downloaded again.
```

### Storage full

```text
Local storage is full. Delete unused templates/models or free device space.
```

### Session load failed

```text
A local model could not be loaded on this device.
```

---

## 18. Security

Rules:

- use HTTPS for model downloads,
- verify checksums,
- pin manifest,
- avoid executing untrusted model metadata,
- do not load arbitrary user-provided models unless separate unsafe/import path exists,
- do not include document data in model requests.

---

## 19. Tests

Test:

- first load
- cached load
- checksum failure
- partial download recovery
- offline cached use
- offline missing model
- storage quota failure
- model version upgrade
- old model eviction
- session reuse
- dispose/reload

---

## 20. Invariants

1. Models are lazy-loaded.
2. Required models have versioned manifest entries.
3. Cache writes are atomic.
4. Checksums are verified.
5. Evidence records model versions.
6. Missing models produce clear errors.
7. Optional models do not block core extraction.
8. Tauri path can bundle models.

---

## 21. Reference

- OPFS: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
- ONNX Runtime: https://onnxruntime.ai/

---

## 22. Final statement

Model loading must be boring and safe. Lazy loading, OPFS caching, checksums, version pinning, and explicit failure handling are what make edge inference usable on real devices.
