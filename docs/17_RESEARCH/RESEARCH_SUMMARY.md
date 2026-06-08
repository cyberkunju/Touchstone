# Research Summary

**Purpose:** Summarize the research reviewed for the Edge DocGraph Engine and explain how it shaped the final architecture.

**Review date:** 2026-06-05

---

## 1. Executive summary

The central research conclusion is that this product should **not** be built as a normal OCR app, a normal VLM app, or a simple “AI form filler.”

The strongest architecture is:

```text
local-first evidence graph engine
  + specialist local evidence producers
  + correction-driven template memory
  + verifier-first field confirmation
  + ROI-first known-template extraction
  + uncertainty-aware UI
```

This means OCR, detection, segmentation, barcode parsing, MRZ parsing, table parsing, template matching, and user corrections do not directly become final answers. They become **evidence**. The DocGraph stores the evidence. The verifier decides whether a field is confirmed, needs review, missing, conflicting, or invalid.

This is the key shift from the original idea.

---

## 2. Initial problem statement

The original problem was:

```text
Normal scanner/OCR apps extract text only.
They do not understand the full document structure.
They do not extract photos, signatures, symbols, flags, seals, stamps, QR codes, MRZ zones, tables, checkboxes, and every important visual/structural element.
```

The requirement evolved into:

```text
Upload any document image/PDF.
The app understands text, layout, visual assets, tables, codes, and structure.
It generates an editable form automatically.
The user corrects mistakes once.
The system learns a reusable template locally.
The next similar document is extracted fast and accurately.
Everything runs locally on edge devices.
No cloud.
```

---

## 3. Major research conclusion

The project must be designed around **evidence**, not “model output.”

Bad architecture:

```text
OCR → AI → form fields
```

Better architecture:

```text
Input
  → page normalization
  → evidence producers
  → DocGraph
  → field hypotheses
  → verifier
  → editable form
  → correction events
  → TemplateGraph
```

This protects against the biggest danger:

```text
wrong data shown as confidently correct
```

The internal rule is:

```text
No hallucinated fields.
No unsupported values.
No silent lies.
Every output must have evidence.
```

---

## 4. What research changed in the plan

The early stack was close, but the research changed the product philosophy.

### Before

```text
Pipeline = YOLO + OCR + SAM + parsers + form filler
```

### After

```text
Pipeline = evidence producers feeding DocGraph, with verifier as trust gate
```

This changed several decisions:

- YOLO is a detector, not source of truth.
- OCR is evidence, not final field truth.
- Segmentation is conditional, not always-on.
- Known-template extraction should be ROI-first and fast.
- Unknown-document extraction should be cautious.
- User corrections should save TemplateGraph, not just field coordinates.
- Template matching should be conservative.
- Export must preserve statuses and uncertainty.
- Silent-error rate is the most important benchmark.

---

## 5. Final current core stack

Current recommended core stack:

| Layer | Current core choice | Why |
|---|---|---|
| App shell | Browser PWA prototype, Tauri serious v1 | Browser is easy to distribute; Tauri gives stronger local runtime and packaging |
| UI | React/Vue/Svelte-compatible architecture | UI framework is less important than state and worker boundaries |
| PDF | PDF.js in browser, PDFium optional in Tauri | PDF.js is natural for browser; PDFium can improve desktop reliability |
| Image processing | OpenCV.js/custom WASM, native OpenCV optional in Tauri | Needed for normalization, deskew, perspective, lines, geometry |
| Runtime | ONNX Runtime Web for browser, native ONNX optional in Tauri | Best practical browser inference abstraction |
| Detector | YOLOv11n fine-tuned on document objects | Lightweight, practical, supports export path and segmentation family |
| OCR | PP-OCRv5 as current core OCR candidate | Strong OCR pipeline candidate; better fit for exact OCR evidence than huge VLMs |
| Visual asset refinement | Detector crop first; YOLOv11n-seg/EfficientSAM/SlimSAM bucket | Segmentation only if it improves crop quality enough |
| Barcode/QR | zxing-wasm/ZXing path | Browser-friendly deterministic decoder |
| MRZ | OCR + checksum-validating MRZ parser | MRZ must be validated, not blindly trusted |
| Tables | Geometric table engine first; SLANet_plus bucket | Geometry is explainable and light; model bucket for complex tables |
| Memory | IndexedDB + OPFS + optional SQLite WASM | Local structured records and large artifacts |
| Security | No-cloud default, strict export/import controls | Documents are highly sensitive |
| Learning | Correction-driven TemplateGraph | One-shot improvement without cloud training |

---

## 6. Current experimental buckets

The following are **not rejected**, but should not become core without benchmark proof.

| Bucket | Why it stays in research |
|---|---|
| GLM-OCR | Very promising multimodal OCR/document parser, but must prove local edge deployment, provenance, box-level evidence, and verifier integration |
| Docling / Granite-Docling | Excellent document conversion ecosystem, but not a direct replacement for local field/asset/template engine |
| LayoutLM/LayoutXLM | Strong document understanding research, but heavy and OCR-dependent; weak fit for browser edge core |
| Donut | OCR-free VDU model, important research idea, but less controllable for evidence/provenance and likely not ideal for edge/browser core |
| RF-DETR | Strong modern detector candidate, but transformer architecture may be heavier and needs browser/ONNX testing |
| PicoDet | Good mobile detector idea, but document-specific training and ONNX/browser integration must prove better than YOLOv11n |
| DocLayout-YOLO | Strong document layout model, but classes are layout-oriented and may not cover product-specific assets without fine-tuning |
| EfficientSAM/SlimSAM/MobileSAM | Useful for asset masks, but segmentation must be conditional and benchmarked |
| SLANet_plus/Table Transformer | Useful table research, but geometry-first remains core for explainability and edge cost |

---

## 7. Why PP-OCRv5 remains core for now

PP-OCRv5 remains the current core OCR candidate because the product needs:

- exact text evidence,
- OCR confidence,
- ROI OCR,
- field-level provenance,
- compatibility with template ROI extraction,
- integration into DocGraph,
- deterministic verifier behavior,
- local edge feasibility.

GLM-OCR is now a serious research bucket, but it is a **multimodal document parser/OCR model** rather than a classical OCR engine. It may output excellent Markdown/structured text, but the product needs field boxes, token provenance, crop evidence, and verifier-controlled confirmation. Until GLM-OCR proves these inside our edge runtime, it should not replace PP-OCRv5 as core.

References:

- PaddleOCR / PP-OCRv5 documentation: https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/algorithm/PP-OCRv5/PP-OCRv5_multi_languages.en.md
- PaddleOCR 3.0 technical report: https://arxiv.org/html/2507.05595v1
- GLM-OCR GitHub: https://github.com/zai-org/GLM-OCR
- GLM-OCR Z.AI docs: https://docs.z.ai/guides/vlm/glm-ocr

---

## 8. Why YOLOv11n remains core detector for now

YOLOv11n remains the current core detector choice because:

- it is lightweight,
- it supports object detection,
- YOLO11 family supports segmentation and other CV tasks,
- it has a clear training/export ecosystem,
- it can be fine-tuned on document object classes,
- it is practical for edge deployment experiments.

However, it must be trained on our document-specific classes. A COCO-pretrained detector is not enough.

Required custom classes include:

```text
document_page
photo
signature
stamp
seal
logo
emblem
flag
symbol
qr_code
barcode
mrz_zone
table
checkbox
text_block
field_label
field_value
line_separator
form_box
```

References:

- Ultralytics YOLO11 docs: https://docs.ultralytics.com/models/yolo11/
- RF-DETR GitHub: https://github.com/roboflow/rf-detr
- PicoDet/PaddleDetection: https://github.com/PaddlePaddle/PaddleDetection
- DocLayout-YOLO: https://github.com/opendatalab/DocLayout-YOLO

---

## 9. Why DocGraph became the core innovation

The strongest product differentiation is not “we use OCR + vision.”

The innovation is:

```text
local evidence graph + correction-driven template memory + verifier-first trust policy
```

The DocGraph lets the system store:

- what was detected,
- what was read,
- where it came from,
- which model/parser produced it,
- what confidence it had,
- which validator checked it,
- which fields conflict,
- what user corrected,
- what template projected it.

This is what makes the system auditable and correctable.

---

## 10. Why “any document” must mean cautious behavior

Research and system design both show that “any document” cannot mean “perfect automatic extraction of everything.”

The correct product behavior is:

| Situation | Correct behavior |
|---|---|
| Known template | Fast ROI-first extraction and strict verification |
| Similar template | Align, verify, ask small corrections |
| Unknown structured document | Build tentative form and mark uncertainty |
| Wild unstructured document | Extract text/assets/tables and generate review-first form |
| Bad scan | Ask for rescan or mark low confidence |
| Layout changed | Create new template version |

The app becomes trustworthy not by pretending to be omniscient, but by refusing to silently lie.

---

## 11. Edge runtime conclusion

The browser is possible but constrained.

Browser path:

- ONNX Runtime Web,
- Web Workers,
- OffscreenCanvas,
- IndexedDB,
- OPFS,
- WebGPU where available,
- WASM as reliable CPU path.

Tauri path:

- same frontend,
- stronger file/model packaging,
- native storage,
- optional native ONNX/OpenCV/PDFium,
- better serious-app path.

References:

- ONNX Runtime Web: https://onnxruntime.ai/docs/tutorials/web/
- WebNN spec: https://www.w3.org/TR/webnn/
- WebGPU MDN: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
- Tauri architecture: https://v2.tauri.app/concept/architecture/

---

## 12. Final research verdict

The current final plan is strong and technically coherent.

The recommended path is:

```text
Core:
  PP-OCRv5 + YOLOv11n-docdet + geometric tables + zxing + MRZ parser
  + DocGraph + TemplateGraph + Verifier + local edge runtime

Experiments:
  GLM-OCR
  Docling/Granite-Docling
  RF-DETR
  DocLayout-YOLO
  EfficientSAM/SlimSAM/MobileSAM
  SLANet_plus/Table Transformer
  heavy document foundation models
```

The system should graduate experiments only through benchmarks.

Final rule:

```text
Nothing becomes core because it sounds smarter.
It becomes core only if it improves local evidence-backed extraction,
reduces correction effort,
does not increase silent error rate,
and runs within edge budgets.
```
