# Performance Benchmarks — Edge DocGraph Engine

**Purpose:** Define latency, memory, model load time, worker time, storage time, and responsiveness benchmarks across browser and Tauri paths.

---

## 1. Performance goal

The product must work on edge devices.

Performance testing must measure:

- startup time
- model loading
- extraction latency
- known-template latency
- unknown-document latency
- UI responsiveness
- memory usage
- worker throughput
- storage operations
- repeated processing leaks

---

## 2. Benchmark dimensions

Record:

- device class
- OS
- browser/app runtime
- WebGPU/WASM/native mode
- model versions
- input document
- page count
- image resolution
- pipeline mode
- timing per task
- memory warnings
- failures

---

## 3. Timing stages

Measure:

```text
file_decode
pdf_parse
pdf_render
image_normalization
detector_load
detector_inference
ocr_load
ocr_full_page
ocr_roi
asset_extraction
barcode_parse
mrz_parse
table_extract
docgraph_build
verification
form_generation
template_match
alignment
roi_projection
export
```

---

## 4. Known-template latency

Known-template path should be fastest.

Target for one page:

| Device class | Target |
|---|---:|
| high | 1–3 sec |
| medium | 3–6 sec |
| low | 6–12 sec |

Measure:

- template retrieval
- matching
- alignment
- ROI OCR
- validators
- form update

---

## 5. Unknown-document latency

Unknown extraction is heavier.

Target for one page:

| Device class | Target |
|---|---:|
| high | 4–8 sec |
| medium | 8–15 sec |
| low | 15–30 sec |

Show progress and allow cancellation.

---

## 6. Model load benchmark

Measure:

- model file read/download
- cache validation
- session creation
- warmup if used
- first inference
- subsequent inference

Report:

```text
cold load
warm load
cached load
```

---

## 7. Memory benchmark

Measure if possible:

- JS heap
- worker memory
- GPU/WebGPU failure/warnings
- number of loaded sessions
- active image buffers
- OPFS temp size

Stress tests:

- repeated document processing
- multi-page PDF
- load/dispose models
- repeated OCR batches
- cancel mid-run
- process known template repeatedly

---

## 8. UI responsiveness benchmark

Measure:

- field click to overlay highlight
- evidence drawer open
- zoom/pan responsiveness
- correction save UI update
- page switch
- review queue filter

Heavy processing must not freeze UI.

---

## 9. Worker benchmark

Track:

- task queue wait time
- task execution time
- transfer overhead
- cancellation latency
- worker crash/restart
- stale result handling

---

## 10. Storage benchmark

Measure:

- OPFS model read
- OPFS crop write
- IndexedDB DocGraph write
- TemplateGraph save
- export package creation
- delete cleanup

---

## 11. Report schema

```json
{
  "performanceRun": {
    "runId": "perf_001",
    "deviceClass": "medium",
    "runtime": "browser",
    "browser": "Chrome",
    "executionProvider": "webgpu",
    "documentId": "bench_invoice_001",
    "pipelineMode": "known_template",
    "totalMs": 4200,
    "stages": {
      "template_match": 120,
      "alignment": 180,
      "ocr_roi": 2100,
      "verification": 90
    },
    "memoryWarnings": []
  }
}
```

---

## 12. Acceptance criteria

Performance acceptable if:

- UI remains responsive,
- known-template faster than unknown,
- low devices degrade gracefully,
- memory does not grow unbounded,
- no model crash on supported path,
- cancellation works,
- storage failures are handled,
- performance gains do not increase silent errors.

---

## 13. Final rule

Performance is measured end-to-end, not by model inference alone. The best runtime is the one that is fast, memory-safe, honest, and usable on real edge devices.
