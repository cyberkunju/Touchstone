# Performance Budgets — Edge DocGraph Engine

**Purpose:** Define target latency, memory budgets, device classes, benchmark stages, and acceptance thresholds for edge devices.

---

## 1. Why performance budgets matter

The product must run on edge devices, not heavy cloud servers.

Without budgets, the system will become too slow and memory-heavy.

Performance budget goals:

- keep UI responsive,
- process known templates fast,
- keep unknown extraction acceptable,
- avoid memory crashes,
- guide model choices,
- guide device support policy.

---

## 2. Device classes

Use practical device classes.

```ts
type DeviceClass = "low" | "medium" | "high";
```

### Low

Examples:

- older laptop
- budget Android
- low-memory browser
- no WebGPU or unstable WebGPU

Policy:

- one page at a time
- low batch size
- no default segmentation
- lower render scale where safe
- known-template ROI-first preferred

### Medium

Examples:

- modern midrange laptop
- modern phone/tablet
- WebGPU maybe available

Policy:

- normal OCR/detection
- moderate batching
- conditional segmentation
- page-by-page processing

### High

Examples:

- modern desktop/laptop
- strong WebGPU
- enough memory

Policy:

- larger batches
- optional parallel page preprocessing
- richer debug overlays
- more aggressive table/asset refinement

---

## 3. Interaction responsiveness budget

UI must remain responsive.

Targets:

| Interaction | Target |
|---|---:|
| click field → highlight source | < 100 ms |
| zoom/pan viewer | 60 FPS target / no visible freeze |
| open evidence drawer | < 200 ms |
| edit text field | immediate |
| save correction | < 300 ms UI update |
| switch page thumbnail | < 300 ms after page cached |

If heavy work is running, UI still must respond.

---

## 4. Known-template extraction budget

Known-template flow should be fast because it uses ROI-first extraction.

Targets for one page:

| Device | Target |
|---|---:|
| high | 1–3 seconds |
| medium | 3–6 seconds |
| low | 6–12 seconds |

These are aspirational. Benchmark actual models before release.

Known template should avoid:

- full-page segmentation
- unnecessary broad detection
- full unknown pipeline unless validation fails

---

## 5. Unknown-document extraction budget

Unknown extraction is heavier.

Targets for one page:

| Device | Target |
|---|---:|
| high | 4–8 seconds |
| medium | 8–15 seconds |
| low | 15–30 seconds |

If low device exceeds this, show progress and allow cancellation.

---

## 6. PDF processing budget

PDFs vary heavily.

Rules:

- render pages lazily,
- process page-by-page,
- do not high-DPI render all pages at once,
- show progress per page.

Targets:

| Task | Target |
|---|---:|
| parse PDF page count | < 1 sec for normal PDFs |
| render preview page | < 1 sec/page ideally |
| render OCR page | device-dependent |

---

## 7. OCR budget

OCR is likely a main bottleneck.

Budgets:

- ROI OCR should be much faster than full-page OCR.
- Known-template OCR should run only on projected ROIs.
- Unknown OCR should avoid repeated full-page passes.

Track:

```text
OCR detection time
OCR recognition time
number of crops
batch size
average text confidence
```

---

## 8. Detection budget

YOLOv11n-doc should be lightweight enough for edge.

Budget:

- single-page detection target under 1–2 sec on medium/high
- low device may be slower
- no repeated detector calls unless needed

Track:

- input resolution
- preprocessing time
- inference time
- NMS time
- detected classes

---

## 9. Segmentation budget

Segmentation is expensive.

Policy:

- never default full-page segmentation,
- run only on selected/detected assets,
- lazy-load model,
- allow user-triggered refinement.

Target:

- asset crop refinement should be acceptable per asset,
- if >2–3 sec on medium device, make it optional/user-triggered.

---

## 10. Table budget

Table extraction can vary.

Budget:

- geometry table extraction should be lightweight,
- table model bucket should be optional/experimental,
- complex tables can be review-first.

Track:

- table detection time
- line detection time
- OCR cell count
- validation time
- correction rate

---

## 11. Memory budgets

Approximate policy:

| Device | Max active models | Max page processing | OCR batch |
|---|---:|---:|---:|
| low | 1 heavy model | 1 page | 2–4 |
| medium | 1–2 heavy models | 1 page | 8 |
| high | 2 heavy models | 1–2 pages | 16 |

Do not treat these as fixed; benchmark.

---

## 12. Startup budget

Initial app load should not download/load all models.

Targets:

- shell loads fast,
- models load after upload or explicit preload,
- show model download/cache state.

Initial load should include:

- UI code
- lightweight metadata
- no giant model unless packaged/Tauri strategy demands.

---

## 13. Storage budget

Track:

- model cache size
- document artifact size
- template store size
- crop artifact size
- temporary file size

Policy:

- clean temp artifacts,
- allow user to delete documents/templates/models,
- avoid duplicate image copies.

---

## 14. Benchmark instrumentation

Record per pipeline stage:

```ts
type RuntimeBenchmarkEvent = {
  documentId: string;
  pageId?: string;
  task: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  deviceClass: string;
  runtimeMode: "webgpu" | "wasm" | "native";
  modelId?: string;
  modelVersion?: string;
  inputSize?: string;
  memoryWarning?: string;
};
```

Do not include sensitive field values in performance logs.

---

## 15. Acceptance gates

Before accepting a model/runtime change:

- field accuracy does not regress,
- silent error rate does not increase,
- known-template latency acceptable,
- memory does not grow unbounded,
- low-device path still works,
- UI remains responsive,
- storage cache stable.

---

## 16. Optimization priority

Optimize in this order:

1. avoid unnecessary work,
2. ROI-first known templates,
3. model quantization/export optimization,
4. batch sizes,
5. worker transfer optimization,
6. memory cleanup,
7. runtime provider tuning,
8. native/Tauri acceleration if needed.

Do not optimize by hiding uncertainty or skipping validation.

---

## 17. Performance tests

Test cases:

- passport image
- invoice image with table/QR
- generic form with signature/checkbox
- multi-page PDF
- bad scan
- repeated known template
- unknown document
- correction + template save

Run on:

- low device
- medium device
- high device
- browser PWA
- Tauri app path later

---

## 18. Performance invariants

1. UI must not freeze.
2. Known-template flow must be faster than unknown flow.
3. Segmentation is conditional.
4. Models load lazily.
5. Memory warnings reduce workload.
6. Benchmarks do not log sensitive values.
7. Speed never justifies silent errors.
8. Low-device behavior must be graceful.

---

## 19. Final statement

Performance budgets turn “edge-only” from wish to engineering constraint. The app must be measured by latency, memory, responsiveness, accuracy, and silent-error safety together.
