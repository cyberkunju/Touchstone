# Model Asset Packaging — Edge DocGraph Engine

**Purpose:** Define how ONNX/model files, dictionaries, metadata, manifests, checksums, cache layout, and release packages are handled.

---

## 1. Model packaging goal

Models must be:

- versioned,
- checksummed,
- cacheable,
- locally runnable,
- reproducible,
- traceable in evidence,
- easy to update safely,
- compatible with browser/PWA and Tauri paths.

---

## 2. Model asset types

Model assets may include:

- `.onnx` files,
- OCR dictionaries,
- tokenizer files,
- metadata JSON,
- class labels,
- preprocessing config,
- postprocessing config,
- license files,
- model cards,
- benchmark reports.

---

## 3. Model manifest

Every build must include a model manifest.

```json
{
  "manifestVersion": "model-manifest-v1",
  "createdAt": 1780000000000,
  "models": [
    {
      "id": "yolov11n-docdet-v0",
      "version": "0.1.0",
      "task": "document_detection",
      "runtime": "onnxruntime-web",
      "files": [
        {
          "path": "docdet/yolov11n-docdet-v0/model.onnx",
          "sha256": "required",
          "sizeBytes": 12345678,
          "required": true
        }
      ],
      "license": "AGPL-3.0-or-enterprise",
      "classVersion": "docdet-v0"
    }
  ]
}
```

---

## 4. Required model metadata

Each model package should include:

```text
metadata.json
model.onnx
classes.json if applicable
preprocessing.json
postprocessing.json
LICENSE or LICENSE_REF
MODEL_CARD.md
metrics.json
```

---

## 5. Model cache layout

Browser/PWA OPFS:

```text
/models/
  {modelId}/
    {version}/
      model.onnx
      metadata.json
      checksum.json
```

Tauri app data:

```text
app_data/models/{modelId}/{version}/
```

---

## 6. Atomic cache writes

Never write directly to active model path.

Flow:

```text
download/copy to temp
  → verify size
  → verify sha256
  → validate metadata
  → promote to active path
```

Temp path:

```text
/models/.tmp/{modelId}/{version}/
```

---

## 7. Checksums

SHA-256 required for release models.

Rules:

- verify before loading,
- delete corrupted files,
- never load unchecked remote model,
- evidence records model ID/version/checksum or manifest reference.

---

## 8. Browser packaging

PWA options:

### lazy download

- smaller app shell,
- first use requires network,
- cache in OPFS.

### pre-cache core models

- larger install,
- better offline readiness.

Recommended:

```text
lazy load for PWA; bundle for Tauri.
```

---

## 9. Tauri packaging

Tauri can bundle required models with release.

Benefits:

- offline from install,
- no first-use model download,
- stable checksums,
- easier enterprise/offline use.

---

## 10. Model evidence tracking

Every model-produced evidence record must include:

- model ID,
- model version,
- runtime,
- execution provider,
- preprocessing version,
- postprocessing version,
- threshold config version.

---

## 11. Model updates

A model update requires:

- new version,
- benchmark report,
- silent error report,
- runtime compatibility report,
- license review,
- decision log update,
- migration notes if output classes changed.

---

## 12. Model rollback

Keep previous model metadata and allow rollback where feasible.

Rollback needed if:

- new model causes silent errors,
- browser runtime fails,
- performance regresses,
- class mapping breaks.

---

## 13. Licensing

Every model package must include license metadata.

Examples:

- YOLOv11n/Ultralytics: AGPL-3.0 or Enterprise licensing path.
- PaddleOCR: Apache-2.0 for project code/model artifacts where confirmed.
- MediaPipe: Apache-2.0.
- ZXing/zxing-wasm: verify exact package license at lockfile time.

License metadata must be reviewed before public release.

---

## 14. Model package validation

Command:

```bash
pnpm models:validate
```

Checks:

- manifest valid,
- files exist,
- checksums valid,
- metadata present,
- license metadata present,
- class labels match model config,
- ONNX smoke inference passes.

---

## 15. Final rule

A model file without manifest, checksum, metadata, license, and benchmark trace is not a release model. It is an experiment.
