# Model Benchmark Plan — Edge DocGraph Engine

**Purpose:** Define how models are tested before acceptance into the core stack.

---

## 1. Benchmark philosophy

Models are not selected by hype. They are selected by measured product impact.

A model must improve:

- evidence quality
- field accuracy
- asset extraction
- table structure
- template extraction
- latency
- memory
- silent-error reduction

If it improves a leaderboard metric but increases product risk, it fails.

---

## 2. Benchmark categories

The benchmark suite must test:

1. OCR
2. detector
3. segmentation
4. barcode/QR parsing
5. MRZ parsing
6. table extraction
7. orientation correction
8. template matching
9. verifier impact
10. end-to-end product flow
11. edge performance

---

## 3. Benchmark datasets

Create document-family test sets.

### 3.1 Passport / ID set

Include:

- clean scans
- camera photos
- glare
- blur
- MRZ visible
- MRZ degraded
- photo region
- signature
- logo/emblem
- multiple layouts
- synthetic fake data for public tests

### 3.2 Invoice / receipt set

Include:

- clean invoice
- table-heavy invoice
- receipt
- QR invoice
- stamp/signature invoice
- vendor layout changes
- borderless table
- low-quality receipt

### 3.3 Generic form set

Include:

- label/value forms
- checkboxes
- signatures
- stamps
- tables
- repeated labels
- missing fields
- unclear values

### 3.4 Negative set

Include:

- blank pages
- random photos
- screenshots
- non-document images
- decorative documents
- partial pages

### 3.5 Bad scan set

Include:

- blur
- motion blur
- glare
- low resolution
- underexposure
- overexposure
- partial crop
- perspective warp
- compression artifacts

---

## 4. Device test matrix

Test on multiple device classes.

| Device class | Example |
|---|---|
| Low-end laptop | integrated GPU / limited RAM |
| Mid laptop | common developer laptop |
| Desktop | strong CPU/GPU |
| Low-end Android | limited memory browser |
| Tablet | touch/camera workflow |
| Tauri desktop | local app runtime |

Runtime paths:

- WebGPU
- WASM compatibility mode
- Tauri webview

---

## 5. OCR benchmarks

### Metrics

- CER
- WER
- line detection recall
- text box IoU
- ROI OCR exact match
- MRZ OCR CER
- table-cell OCR accuracy
- latency per page
- latency per ROI
- batch throughput
- memory peak

### Test scenarios

- full-page OCR
- text-block OCR
- ROI OCR
- high-resolution ROI OCR
- MRZ region OCR
- table cell OCR
- rotated text OCR

### Acceptance

OCR must:

- return coordinates
- return confidence
- run locally
- support ROI mode
- produce evidence records
- not block UI

---

## 6. Detector benchmarks

### Metrics

- mAP@0.5
- mAP@0.5:0.95
- per-class precision
- per-class recall
- small-object recall
- false positives per page
- inference latency
- memory peak

### Critical classes

- photo
- signature
- stamp
- seal
- logo
- qr_code
- barcode
- mrz_zone
- table
- checkbox
- text_block
- document_page

### Acceptance

Detector must:

- detect critical classes reliably,
- run in local runtime,
- produce normalized boxes,
- preserve model version,
- not create final fields directly.

---

## 7. Segmentation benchmarks

### Candidates

- YOLOv11n-seg
- EfficientSAM
- SlimSAM-77
- MobileSAM benchmark only

### Metrics

- mask IoU
- crop IoU
- asset usability score
- runtime per asset
- memory peak
- correction reduction

### Asset classes

- photo
- signature
- stamp
- seal
- logo
- emblem/symbol

### Acceptance

A segmentation model becomes core only if it improves asset quality or correction burden enough to justify runtime cost.

---

## 8. Barcode/QR benchmarks

### Metrics

- code detection recall
- decode rate
- payload exactness
- rotation robustness
- low-contrast robustness
- PDF417 success rate
- latency

### Acceptance

zxing-wasm must decode visible supported codes locally and create payload evidence.

---

## 9. MRZ benchmarks

### Metrics

- MRZ zone detection recall
- MRZ OCR CER
- parse success rate
- checksum validation correctness
- visual cross-check accuracy
- false valid rate

### Acceptance

The MRZ parser must never silently accept invalid check digits as confirmed.

---

## 10. Table benchmarks

### Metrics

- table detection recall
- table box IoU
- row count accuracy
- column count accuracy
- cell F1
- header accuracy
- table-cell OCR accuracy
- arithmetic validation success
- correction count

### Candidates

- geometric engine
- SLANet_plus
- other research models only if needed

### Acceptance

The table solution must produce graph-structured tables and allow correction.

---

## 11. Template matching benchmarks

### Metrics

- template hit rate
- false match rate
- same/new/unknown decision accuracy
- alignment error
- ROI extraction success
- required field miss rate
- versioning decision accuracy

### Scenarios

- same template clean
- same template bad scan
- same family new version
- visually similar but different template
- unknown document
- cropped/rotated input

### Acceptance

False template matches must be extremely low. A false unknown is safer than a wrong match.

---

## 12. End-to-end benchmarks

Measure the full product loop.

### Unknown-document flow

Metrics:

- useful form generation rate
- field F1
- asset extraction quality
- table extraction quality
- review-needed rate
- correction count
- silent critical error rate
- processing time

### Known-template flow

Metrics:

- template match accuracy
- ROI extraction success
- field exact match
- correction reduction
- processing time
- verifier catch rate

---

## 13. Silent-error benchmark

This is the most important benchmark.

A silent critical error occurs when:

```text
critical field is wrong
AND field status is confirmed
```

Critical fields include:

- ID/passport number
- DOB
- expiry date
- invoice total
- tax ID
- account number
- MRZ-derived fields
- barcode payload mapped fields

Target:

- near zero
- regressions are release blockers

---

## 14. Benchmark output format

Each run should produce:

```json
{
  "runId": "bench_001",
  "appVersion": "0.1.0",
  "modelVersions": {
    "detector": "yolov11n-doc-0.1.0",
    "ocr": "ppocrv5-mobile-0.1.0"
  },
  "device": "chrome-webgpu-mid-laptop",
  "dataset": "invoice_v1",
  "metrics": {},
  "failures": []
}
```

---

## 15. Model acceptance checklist

A model can graduate only if:

- [ ] benchmark dataset includes target cases
- [ ] metrics improve or justify use
- [ ] edge runtime tested
- [ ] memory acceptable
- [ ] latency acceptable
- [ ] output maps to evidence records
- [ ] does not bypass verifier
- [ ] does not increase silent critical error rate
- [ ] versioning complete
- [ ] failure cases documented

---

## 16. Regression testing

Every model update must rerun:

- OCR regression
- detector regression
- template extraction regression
- verifier regression
- silent-error regression
- latency/memory regression

Old templates must still work or migrate safely.

---

## 17. Benchmark governance

Do not change model stack based on one demo. Require:

1. representative dataset,
2. repeated runs,
3. device matrix,
4. error analysis,
5. downstream impact,
6. update to decision log.

---

## 18. Final benchmark rule

A model is accepted only when it improves the product, not just a model metric. The product metric is evidence-backed, verified, local document-to-form extraction with low silent-error risk and improved repeated-template performance.
