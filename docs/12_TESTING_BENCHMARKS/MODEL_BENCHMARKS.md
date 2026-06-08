# Model Benchmarks — Edge DocGraph Engine

**Purpose:** Define benchmark plans for YOLO detector, OCR, segmentation, table extraction, barcode parsing, MRZ parsing, and model runtime compatibility.

---

## 1. Model benchmark principle

Models are evidence producers, not final decision makers.

Benchmarks must measure:

- raw model quality,
- downstream extraction quality,
- verifier safety,
- edge runtime performance.

A model is not accepted just because it has a high mAP or low CER.

---

## 2. Detector benchmark

Model:

```text
YOLOv11n document detector
```

Classes:

- document_page
- photo
- signature
- stamp
- seal
- logo/emblem/flag/symbol
- qr_code
- barcode
- mrz_zone
- table
- checkbox
- text_block
- optional field_label/field_value/form_box/line_separator

Metrics:

- mAP50
- mAP50-95
- per-class precision
- per-class recall
- confusion matrix
- small object recall
- false positive rate
- latency
- memory
- ONNX browser compatibility

Critical classes:

- mrz_zone
- qr_code
- barcode
- table
- photo
- signature
- checkbox

---

## 3. OCR benchmark

Candidate:

```text
PP-OCRv5
```

Metrics:

- CER
- WER
- field exact match
- normalized field exact match
- MRZ line exact match
- table cell CER/WER
- high-confidence wrong rate
- ROI OCR latency
- full-page OCR latency

Benchmark modes:

- full-page OCR
- ROI OCR
- high-resolution ROI OCR
- MRZ OCR
- table cell OCR

---

## 4. Segmentation benchmark

Candidates:

- YOLOv11n-seg
- EfficientSAM bucket
- SlimSAM bucket

Metrics:

- mask IoU
- crop IoU
- asset recall
- crop completeness
- user correction reduction
- latency per asset
- memory
- browser/Tauri runtime compatibility

Segmentation acceptance depends on product value, not only mask IoU.

---

## 5. Table benchmark

Candidates:

- geometric table engine
- SLANet_plus/table model bucket

Metrics:

- table detection recall
- structure precision/recall
- row/column F1
- cell box IoU
- cell text accuracy
- arithmetic correctness
- correction effort
- latency

Benchmark cases:

- ruled tables
- borderless tables
- invoices
- receipts
- bank statements
- merged cells
- skewed tables
- low-quality scans

---

## 6. Barcode/QR benchmark

Library:

```text
zxing-wasm / ZXing path
```

Metrics:

- decode success rate
- false decode rate
- code type accuracy
- payload preservation
- latency
- hard-case decode rate

Cases:

- QR
- Code128
- PDF417
- Data Matrix if supported
- rotated
- blurred
- low contrast
- partial damage

Security check:

- URL payload never auto-opens.

---

## 7. MRZ benchmark

Components:

- MRZ region detector
- OCR
- normalizer
- MRZ parser
- checksum validator

Metrics:

- MRZ region recall
- raw line CER
- normalized line exact match
- check digit pass accuracy
- parsed field accuracy
- invalid MRZ detection
- visual cross-check conflict detection

Critical:

```text
checksum failure must never be silently confirmed
```

---

## 8. Runtime compatibility benchmark

For every accepted model:

Test:

- ONNX export
- ONNX Runtime Web WebGPU mode
- ONNX Runtime Web WASM mode
- Tauri/native path if used
- output parity with training runtime
- repeated inference stability
- memory growth
- model load time
- checksum validation

---

## 9. Edge latency benchmark

Record:

```json
{
  "modelId": "yolov11n-docdet-v0",
  "runtime": "onnxruntime-web",
  "executionProvider": "webgpu",
  "deviceClass": "medium",
  "inputSize": "640x640",
  "medianMs": 120,
  "p95Ms": 180
}
```

Report median and p95.

---

## 10. Downstream impact benchmark

For each model update, measure downstream:

- field extraction accuracy
- asset crop correction rate
- template match rate
- verifier status distribution
- silent error rate
- latency/memory

A model with better raw metric but worse downstream safety must be rejected.

---

## 11. Model acceptance report

Each model release must include:

```text
model card
dataset version
training config
benchmark report
runtime test report
known failures
decision log entry
```

---

## 12. Model rejection reasons

Reject model if:

- cannot run locally,
- cannot export reliably,
- too slow,
- too memory-heavy,
- high-confidence wrong outputs,
- breaks downstream verifier,
- causes template false matches,
- licensing/distribution incompatible,
- hard cases worse than previous.

---

## 13. Final rule

The accepted model stack is the one that gives the best safe end-to-end local document extraction, not the one with the most impressive isolated benchmark.
