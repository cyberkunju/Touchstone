# Experiment Buckets

**Purpose:** List all current experimental trials, why they exist, what tests they need, and what would make them graduate to core.

**Review date:** 2026-06-05

---

## 1. Experiment policy

An experiment is not a feature.

An experiment becomes core only if it proves:

- better extraction,
- lower correction effort,
- no silent-error regression,
- local runtime feasibility,
- memory/latency within budget,
- clear evidence/provenance,
- safe licensing,
- stable export/import integration.

---

## 2. Current core stack baseline

Experiments are compared against this baseline:

```text
YOLOv11n-docdet
PP-OCRv5
detector-crop assets
zxing-wasm/ZXing
MRZ parser with checksum
geometric table engine
DocGraph
TemplateGraph
Verifier
ONNX Runtime Web / Tauri path
```

No experiment is judged in isolation.

---

## 3. Bucket: GLM-OCR

### Why test

GLM-OCR is a serious new multimodal OCR/document understanding candidate.

Potential benefits:

- complex document OCR,
- Markdown/structured output,
- table/form understanding,
- local desktop parsing,
- semantic document understanding.

### Risks

- 0.9B model still heavy,
- browser runtime uncertain,
- may lack stable boxes/provenance,
- generative output risk,
- slower than ROI OCR,
- verifier integration unclear.

### Tests

- local Tauri inference test,
- browser feasibility test if possible,
- OCR CER/WER vs PP-OCRv5,
- field extraction accuracy,
- table extraction comparison,
- provenance/box recovery test,
- latency/memory test,
- silent-error benchmark.

### Graduation criteria

Can graduate to:

```text
semantic OCR/document parser evidence producer
```

if it:

- reduces correction rate,
- preserves evidence/provenance,
- does not increase silent errors,
- fits at least Tauri edge budget.

Can replace PP-OCRv5 only if it also supports ROI/box-level deterministic extraction or a reliable equivalent.

---

## 4. Bucket: Docling / Granite-Docling

### Why test

Docling is a strong document conversion ecosystem. Granite-Docling is a one-shot document conversion VLM direction.

### Tests

- PDF conversion quality,
- structure preservation,
- table extraction,
- local runtime feasibility,
- integration with DocGraph,
- ability to preserve evidence/source locations,
- latency/memory.

### Graduation criteria

Can become:

- optional import/conversion helper,
- Tauri-side preprocessing pipeline,
- benchmark comparator.

Cannot replace DocGraph/TemplateGraph/verifier unless it supports correction-driven evidence and local edge runtime.

---

## 5. Bucket: RF-DETR

### Why test

Modern real-time transformer detector with strong accuracy/latency claims.

### Tests

- train on document classes,
- compare with YOLOv11n-docdet,
- small object recall,
- ONNX/browser runtime,
- Tauri runtime,
- latency/memory,
- downstream field extraction,
- false positive impact.

### Graduation criteria

Can replace YOLOv11n only if it improves downstream extraction and fits edge runtime.

---

## 6. Bucket: PicoDet

### Why test

Mobile/CPU-oriented detector.

### Tests

- custom document-object training,
- CPU latency on low devices,
- ONNX/browser integration,
- small object recall,
- class confusion,
- downstream extraction.

### Graduation criteria

Can become low-end detector profile if it beats YOLOv11n on weak devices without accuracy/safety regression.

---

## 7. Bucket: DocLayout-YOLO

### Why test

Document-specific layout detector with synthetic document pretraining.

### Tests

- compare layout detection quality,
- evaluate class mismatch,
- fine-tune for project asset classes,
- ONNX/runtime test,
- downstream extraction.

### Graduation criteria

Can become:

- layout-only detector,
- pretraining/reference model,
- or replacement if custom fine-tuned and better than YOLOv11n.

---

## 8. Bucket: Public YOLO DocLayNet models

### Why test

Fast baseline for layout detection.

### Tests

- class coverage,
- layout quality,
- domain mismatch,
- false positives,
- license.

### Graduation criteria

Likely cannot graduate directly. Could be used as:

- baseline,
- pretraining seed,
- demonstration layout detector.

---

## 9. Bucket: YOLOv11n-seg

### Why test

Same ecosystem as detector; practical for document asset masks.

### Tests

- asset mask dataset,
- mask IoU,
- crop correction reduction,
- latency/memory,
- browser ONNX mask postprocess,
- user correction benchmark.

### Graduation criteria

Can become core conditional segmentation if it reduces asset correction rate enough.

---

## 10. Bucket: EfficientSAM

### Why test

Lightweight SAM-like model for promptable asset refinement.

### Tests

- asset prompt segmentation,
- crop quality,
- latency/memory,
- browser/Tauri runtime,
- user-triggered refinement UX.

### Graduation criteria

Can become optional user-triggered refinement if it beats YOLO-seg on difficult assets.

---

## 11. Bucket: SlimSAM

### Why test

Compressed SAM direction.

### Tests

- same as EfficientSAM,
- additionally model size/deployment comparison.

### Graduation criteria

Can become low-resource promptable segmentation if runtime and quality beat alternatives.

---

## 12. Bucket: MobileSAM

### Why test

Mobile/edge promptable SAM direction.

### Tests

- mobile latency,
- browser/Tauri deployment,
- asset refinement quality,
- memory.

### Graduation criteria

Can become optional asset refinement model if it is fast enough and reduces corrections.

---

## 13. Bucket: SLANet_plus / SLANeXt

### Why test

Paddle table recognition models may improve complex/wireless tables.

### Tests

- invoice tables,
- receipts,
- bank statements,
- borderless tables,
- cell structure F1,
- OCR integration,
- arithmetic validation impact,
- browser/Tauri runtime.

### Graduation criteria

Can become table fallback/model path if it improves table correction rate and fits edge budgets.

---

## 14. Bucket: Table Transformer

### Why test

Strong DETR-style table detection/structure research.

### Tests

- table detection/structure,
- runtime feasibility,
- comparison with geometry and SLANet_plus,
- cell/evidence integration.

### Graduation criteria

Can become model fallback if it beats SLANet_plus/geometric engine on complex tables within budget.

---

## 15. Bucket: LayoutLM/LayoutXLM

### Why test

Document understanding research.

### Tests

- field classification/extraction after OCR,
- multilingual forms,
- edge runtime,
- training data requirements.

### Graduation criteria

Unlikely for v1. Could become offline/Tauri semantic classifier if it improves field pairing without heavy runtime cost.

---

## 16. Bucket: Donut

### Why test

OCR-free document understanding.

### Tests

- structured output accuracy,
- hallucination/silent-error behavior,
- provenance recovery,
- edge runtime,
- form extraction benchmarks.

### Graduation criteria

Research only unless it can produce auditable evidence and beat OCR+DocGraph pipeline.

---

## 17. Bucket: WebNN

### Why test

Future browser ML acceleration standard.

### Tests

- ONNX Runtime Web WebNN path,
- browser support,
- model compatibility,
- latency vs WebGPU/WASM.

### Graduation criteria

Can become preferred acceleration path when stable and broadly supported.

---

## 18. Bucket graduation template

Every experiment must produce:

```text
experiment ID
hypothesis
baseline
dataset
metrics
latency/memory
silent-error impact
license review
runtime report
decision
```

Decision options:

```text
graduate_to_core
graduate_to_optional
keep_experimental
reject
```

---

## 19. Final experiment rule

Experiments are welcome, but the core remains conservative.

```text
A model graduates only by proving it improves the local evidence graph engine.
It does not graduate because it is newer, larger, trendier, or better in a demo.
```
