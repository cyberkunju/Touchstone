# ONNX Export Guide — Edge DocGraph Engine

**Purpose:** Define exact rules for exporting and validating models for local browser/Tauri inference through ONNX Runtime Web.

---

## 1. Why ONNX discipline matters

A model that works in Python is not automatically usable in the browser.

Browser/Tauri inference requires:

- supported ONNX operators
- stable input shapes
- manageable model size
- predictable memory use
- WebGPU/WASM compatibility
- clean tensor inputs/outputs
- reproducible preprocessing and postprocessing

This guide prevents model export chaos.

---

## 2. Target runtime

Primary runtime:

- ONNX Runtime Web

Execution providers:

- WebGPU primary
- WASM compatibility mode

All core models should be tested in both paths unless a model is explicitly WebGPU-only.

---

## 3. Export principles

1. Prefer static input shapes.
2. Avoid unsupported/custom operators.
3. Keep preprocessing outside model when practical.
4. Keep postprocessing outside model when ONNX graph becomes fragile.
5. Record opset version.
6. Record preprocessing parameters.
7. Record model class list.
8. Record thresholds and NMS config separately.
9. Benchmark after every export.
10. Never assume Python results equal browser results.

---

## 4. Model artifact structure

Recommended structure:

```text
models/
  yolo11n-doc/
    model.onnx
    config.json
    labels.json
    preprocessing.json
    postprocessing.json
    benchmark.json
    README.md

  ppocrv5-det/
    model.onnx
    config.json
    preprocessing.json
    benchmark.json
    README.md

  ppocrv5-rec/
    model.onnx
    config.json
    charset.txt
    preprocessing.json
    benchmark.json
    README.md
```

Each model directory must be self-describing.

---

## 5. Required metadata

`config.json`:

```json
{
  "modelName": "yolov11n-doc",
  "modelVersion": "0.1.0",
  "task": "object_detection",
  "inputNames": ["images"],
  "outputNames": ["output0"],
  "inputShape": [1, 3, 640, 640],
  "opset": 17,
  "exportedAt": "2026-01-01T00:00:00Z",
  "sourceFramework": "pytorch",
  "license": "project-compatible"
}
```

`preprocessing.json`:

```json
{
  "colorFormat": "RGB",
  "resize": "letterbox",
  "inputWidth": 640,
  "inputHeight": 640,
  "normalize": {
    "mean": [0, 0, 0],
    "std": [255, 255, 255]
  }
}
```

`postprocessing.json`:

```json
{
  "nms": {
    "type": "class_aware",
    "iouThreshold": 0.45,
    "defaultConfidenceThreshold": 0.25,
    "perClassThresholds": {}
  }
}
```

---

## 6. YOLOv11n export rules

### 6.1 Input

Recommended first input size:

- 640x640

Benchmark alternatives:

- 960x960
- tiled 640x640

### 6.2 Preprocessing

Use letterbox resize unless training/export pipeline chooses otherwise. Preserve mapping back to original page coordinates.

Track:

- scale
- padding
- original size
- normalized output mapping

### 6.3 Output

Prefer raw predictions and external NMS if export graph NMS is fragile.

Post-processing in JS/WASM should:

- decode boxes
- apply confidence thresholds
- apply class-aware NMS
- map boxes back to normalized page coordinates
- produce DetectionEvidence

### 6.4 Dynamic shapes

Avoid dynamic shapes unless tested extensively.

### 6.5 NMS in graph

Only keep NMS in ONNX graph if:

- ONNX Runtime Web supports it reliably,
- results match Python,
- performance is acceptable,
- class-specific overlap rules are still possible.

Otherwise use external NMS.

---

## 7. YOLOv11n-seg export rules

Segmentation export must include:

- boxes
- class scores
- mask coefficients/prototypes or final masks depending export
- mask postprocessing documentation

Post-processing must map masks back to page coordinates.

Mask artifacts should be stored separately from evidence metadata.

---

## 8. PP-OCRv5 export rules

OCR often has multiple submodels.

Expected modules:

- text detection model
- text recognition model
- optional text angle/orientation classifier

### 8.1 Text detection model

Input:

- page or ROI image
- normalized dimensions according to model requirements

Output:

- text region maps or polygons depending model

Postprocessing:

- threshold map
- polygon extraction
- box filtering
- coordinate mapping

### 8.2 Text recognition model

Input:

- cropped text line images
- standardized height/width

Output:

- character sequence logits or decoded text depending export

Postprocessing:

- CTC decode or model-specific decode
- confidence calculation
- charset mapping

### 8.3 OCR wrapper requirements

The wrapper must expose:

- recognizePage
- recognizeRoi
- recognizeBatch
- recognizeMrzRegion
- dispose
- getInfo

---

## 9. Quantization

Quantization may be used only after accuracy benchmarking.

Options:

- FP32
- FP16 if supported
- INT8 dynamic/static
- ORT format if beneficial

Quantization must be tested for:

- OCR character accuracy
- small-field accuracy
- detector recall
- mask quality
- latency
- memory
- WebGPU/WASM compatibility

Do not quantize blindly.

---

## 10. Static shape strategy

Static shapes are preferred for browser stability.

Detector:

- fixed square input

OCR detector:

- fixed or limited set of sizes

OCR recognizer:

- fixed height and capped width
- batch fixed width buckets if needed

Segmentation:

- fixed input size for model
- preserve crop mapping

---

## 11. Browser compatibility testing

For each exported model, test:

- Chrome/Edge WebGPU
- Chrome/Edge WASM
- Firefox WASM
- Safari behavior if target
- Tauri webview if used

Record:

- load success
- inference success
- output correctness
- latency
- memory
- errors

---

## 12. Model benchmark checklist

For each model artifact:

- [ ] ONNX loads in ORT Web
- [ ] WebGPU run succeeds
- [ ] WASM run succeeds or documented unsupported
- [ ] output matches Python reference within tolerance
- [ ] preprocessing matches training
- [ ] postprocessing tested
- [ ] memory profile measured
- [ ] latency measured
- [ ] evidence mapping implemented
- [ ] version metadata included
- [ ] license documented

---

## 13. Common export failures

### Unsupported operators

Fix by:

- changing export settings
- simplifying model
- replacing operation
- using different opset
- moving logic to JS postprocessing

### Dynamic shape issues

Fix by:

- static input shapes
- shape bucketing
- fixed batch sizes

### Output mismatch

Fix by:

- verifying preprocessing
- comparing intermediate tensors
- checking channel order
- checking normalization
- checking letterbox mapping

### Memory spikes

Fix by:

- smaller input size
- model quantization
- model unload
- sequential processing
- ROI-first extraction

---

## 14. Evidence mapping after inference

Every model output must convert to evidence records.

Do not pass raw tensors into business logic.

Example:

```text
raw tensor
  → postprocess
  → DetectionEvidence[]
  → DocGraph nodes
```

---

## 15. Versioning rules

Each model artifact must have:

- semantic model version
- class list version
- export date
- opset version
- quantization type
- training dataset version
- benchmark result version

Evidence must include model version. This is necessary for debugging and template migrations.

---

## 16. Final ONNX rule

A model is not accepted because it exports. It is accepted only when it runs locally in the target runtime, produces correct evidence, meets performance budgets, and passes benchmark tests without increasing silent-error risk.
