# Model Comparison

**Purpose:** Compare PaddleOCR, GLM-OCR, Docling, LayoutLM/LayoutXLM, Donut, and related document models for this project.

**Review date:** 2026-06-05

---

## 1. Decision summary

Current recommendation:

```text
Core OCR: PP-OCRv5
Research bucket: GLM-OCR, Docling/Granite-Docling, Donut, LayoutLM/LayoutXLM, heavy VLMs
```

This is not because PP-OCRv5 is “perfect.” It is because the product needs exact OCR evidence, boxes, ROI execution, verifier control, and edge feasibility.

GLM-OCR is the most important new research bucket and should be tested seriously.

---

## 2. Product-specific evaluation criteria

A model is valuable only if it helps this product.

Criteria:

| Criterion | Why it matters |
|---|---|
| Local edge runtime | No cloud, weak devices |
| Browser deployability | PWA path |
| Tauri deployability | serious app path |
| Exact text accuracy | fields, IDs, dates, MRZ |
| Token/line boxes | evidence and source highlighting |
| ROI OCR | known-template fast path |
| Confidence/provenance | verifier and audit |
| Structure extraction | tables, headings, sections |
| Visual asset awareness | photos, stamps, signatures |
| Determinism | repeatable extraction |
| Low silent-error risk | trust |
| License | open-source release |
| Model size | edge feasibility |

---

## 3. Quick ranking for this project

| Model/system | Best role | Core now? |
|---|---|---|
| PP-OCRv5 | exact OCR evidence and ROI OCR | Yes |
| GLM-OCR | multimodal OCR/document parser experiment | Not yet; high-priority bucket |
| Docling | document conversion/reference architecture | No; useful bucket/tooling |
| Granite-Docling | one-shot document conversion VLM bucket | No; evaluate later |
| Donut | OCR-free document understanding research | No; research only |
| LayoutLM/LayoutXLM | document understanding with layout/text | No; heavy/research |
| Large VLMs | reasoning over documents | No; not edge/browser core |
| Tesseract | baseline/fallback benchmark only | No core |

---

## 4. PP-OCRv5

### What it is

PP-OCRv5 is a newer generation in the PaddleOCR family. PaddleOCR documentation describes PP-OCRv5 as focused on multi-scenario and multilingual text recognition. The PaddleOCR 3.0 technical report describes PP-OCRv5 as a lightweight OCR system with server/mobile variants and multi-script support.

References:

- https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/algorithm/PP-OCRv5/PP-OCRv5_multi_languages.en.md
- https://arxiv.org/html/2507.05595v1
- https://github.com/PaddlePaddle/PaddleOCR

### Strengths for this project

- OCR-specific architecture.
- Better fit for exact text extraction than general VLMs.
- Supports ROI OCR design.
- Can produce text evidence tied to regions.
- Good match for template-projected field boxes.
- PaddleOCR ecosystem includes document/table/layout modules.
- More likely to be made lightweight than VLM-scale alternatives.

### Risks

- Browser deployment/conversion must be proven.
- Paddle/PaddleOCR runtime stack may not map cleanly to ONNX Runtime Web.
- English/Latin/Indian-language performance must be benchmarked.
- OCR confidence calibration must be tested.
- Handwriting and tiny ID text may remain hard.
- Exact text boxes/recognition pipeline must be integrated carefully.

### Verdict

Keep as current core OCR candidate.

### Graduation requirement

Already core candidate, but still must pass:

- ONNX/browser runtime test,
- ROI OCR benchmark,
- MRZ/tiny-ID benchmark,
- table-cell OCR benchmark,
- silent-error benchmark,
- latency/memory budgets.

---

## 5. GLM-OCR

### What it is

GLM-OCR is a multimodal OCR/document understanding model from Z.AI. Official materials describe it as a lightweight professional OCR model with parameters as small as 0.9B and a GLM-V encoder-decoder style architecture.

References:

- https://github.com/zai-org/GLM-OCR
- https://huggingface.co/zai-org/GLM-OCR
- https://docs.z.ai/guides/vlm/glm-ocr
- https://docs.vllm.ai/projects/recipes/en/latest/GLM/GLM-OCR.html

### Why it matters

GLM-OCR directly challenges the assumption that PP-OCRv5 should remain unchallenged.

It may be strong for:

- complex documents,
- Markdown-style output,
- table/form structure,
- dense pages,
- semantic document parsing,
- local Tauri/laptop usage.

### Strengths

- Purpose-built for complex OCR/document understanding.
- More semantic than classical OCR.
- Can potentially parse documents into Markdown/structured outputs.
- Smaller than giant VLMs, but still far larger than lightweight OCR.
- Serious research bucket for Tauri/local desktop path.

### Risks for this project

- 0.9B parameters is still large for weak edge/browser.
- Browser ONNX Runtime Web feasibility is uncertain.
- It may not naturally produce stable field-level bounding boxes.
- It may produce text/Markdown without exact evidence provenance.
- It may be generative, which raises hallucination/format drift risks.
- It may be slower than ROI OCR for known templates.
- It must be integrated into verifier, not trusted directly.
- It may need GPU/VRAM, making low-end devices difficult.

### Correct role

High-priority experimental bucket:

```text
GLM-OCR as semantic OCR/document parser evidence producer
```

Not:

```text
GLM-OCR directly fills final form fields
```

### Graduation tests

GLM-OCR can graduate toward core only if it proves:

- local runtime within target devices,
- Tauri packaging path,
- browser path or acceptable desktop-only path,
- deterministic enough output,
- field/value provenance,
- region/box mapping or recoverable evidence,
- lower correction rate than PP-OCRv5 pipeline,
- no increase in silent-error rate,
- exportable evidence structure.

### Verdict

Do not reject. Do not make core yet. Test seriously.

---

## 6. Docling

### What it is

Docling is an open-source document conversion toolkit started by IBM Research and hosted under LF AI & Data. It focuses on converting documents into structured formats for downstream AI/document processing.

References:

- https://docling-project.github.io/docling/
- https://github.com/docling-project/docling
- https://arxiv.org/html/2408.09869v1
- https://www.docling.ai/

### Strengths

- Strong document conversion orientation.
- Handles PDFs and structured document outputs.
- Useful reference architecture.
- Useful for ingestion and benchmark comparison.
- Good ecosystem for document conversion.

### Risks for this project

- It is not directly a local edge form-learning engine.
- It may not satisfy browser-only runtime constraints.
- It is more conversion pipeline than correction-driven template memory.
- It does not replace custom DocGraph/TemplateGraph/verifier architecture.
- It may be heavy depending pipeline/model choices.

### Verdict

Keep in research bucket as:

- benchmark comparator,
- possible PDF/document conversion helper,
- reference architecture,
- potential Tauri-side optional importer.

Do not make it the core extraction engine.

---

## 7. Granite-Docling

### What it is

IBM announced Granite-Docling as a one-shot document conversion VLM related to the Docling ecosystem.

Reference:

- https://www.ibm.com/new/announcements/granite-docling-end-to-end-document-conversion

### Strengths

- Interesting one-shot document conversion direction.
- May simplify document-to-structured-output workflows.
- Could be strong for semantic document conversion.

### Risks

- 258M parameter VLM still must be tested for edge/browser.
- One-shot conversion does not automatically provide verifier-grade evidence.
- May not extract visual assets exactly.
- May not fit one-shot local template learning.
- Licensing/model packaging must be reviewed.

### Verdict

Research bucket only.

---

## 8. LayoutLM/LayoutXLM

### What they are

LayoutLM-style models combine text, layout, and sometimes image features for document understanding. They are important research models for forms and document classification.

### Strengths

- Good for document understanding tasks.
- Layout-aware.
- Useful for classification/semantic field extraction research.
- LayoutXLM targets multilingual document understanding.

### Risks

- Usually OCR-dependent.
- Heavy for browser edge.
- Requires token boxes and training data.
- Not ideal for visual asset extraction.
- Not naturally enough for photos/stamps/signatures/masks.
- Adds complexity without replacing detector/OCR/verifier.

### Verdict

Heavy research bucket only.

Use for offline experiments, not core v1.

---

## 9. Donut

### What it is

Donut is an OCR-free Document Understanding Transformer introduced by NAVER CLOVA. It maps document images directly to structured output without a separate OCR engine.

References:

- https://arxiv.org/abs/2111.15664
- https://github.com/clovaai/donut
- https://huggingface.co/docs/transformers/en/model_doc/donut

### Strengths

- Important OCR-free direction.
- Avoids OCR error propagation.
- Can produce structured outputs.
- Strong research value.

### Risks for this project

- Generative output can be hard to audit.
- Field/box evidence is weaker than OCR+layout.
- Edge/browser runtime may be heavy.
- Needs task-specific fine-tuning.
- Not ideal for exact asset extraction.
- Not ideal for ROI-first known-template extraction.

### Verdict

Research only. Not core.

---

## 10. Large VLMs

Examples:

- GLM-4.5V,
- Qwen-VL-like models,
- Gemini/Claude/GPT-style cloud VLMs,
- other large document VLMs.

### Strengths

- Semantic reasoning,
- complex visual understanding,
- good demos,
- can parse messy pages,
- may interpret layouts and charts.

### Rejection for core

Core product is local edge/no cloud.

Large VLMs fail one or more:

- too heavy,
- cloud-dependent,
- expensive,
- not deterministic enough,
- provenance weak,
- may hallucinate,
- privacy conflict,
- browser edge impossible.

### Verdict

Not core.

Can be used only in offline research comparisons with synthetic/redacted data.

---

## 11. Tesseract

### Strengths

- mature,
- open-source,
- runs locally,
- easy baseline.

### Weaknesses

- weaker on complex documents,
- weaker layout handling,
- less ideal for modern multilingual/document OCR,
- not the best current core.

### Verdict

Rejected as core. Keep as baseline benchmark only if useful.

---

## 12. Final recommendation

| Decision | Status |
|---|---|
| PP-OCRv5 as core OCR candidate | Accepted |
| GLM-OCR as high-priority experiment | Accepted |
| Docling as architecture/tooling/reference bucket | Accepted |
| Donut/LayoutLM/LayoutXLM as heavy research buckets | Accepted |
| Large cloud VLMs as core | Rejected |
| Tesseract as core | Rejected |

Final rule:

```text
The best OCR model for this project is not the one with the most impressive demo.
It is the one that produces local, fast, box-level, auditable evidence that reduces corrections without increasing silent errors.
```
