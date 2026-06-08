# Criticism Responses

**Purpose:** Record major critiques received during planning, what we agreed with, what changed, and what we deliberately rejected.

**Review date:** 2026-06-05

---

## 1. Criticism: “Do not build OCR + AI form filler.”

### Critique

The strongest critique was:

```text
Do not build it as OCR + AI form filler.
Build it as a local evidence graph engine.
```

### Response

Accepted.

This criticism fundamentally improved the project.

The architecture changed from:

```text
OCR/detector outputs → form fields
```

to:

```text
OCR/detector/parser/template/user outputs → EvidenceRecords → DocGraph → verifier → form
```

### What changed

- DocGraph became central.
- EvidenceRecord became required.
- FieldHypothesis became separate from confirmed field.
- Verifier became release-critical.
- UI became evidence-first and correction-first.
- Template memory saves corrected graph structure, not just coordinates.
- Silent-error rate became the most important benchmark.

### Why it matters

Without this change, the app would look impressive but fail dangerously when OCR or a model guesses wrong.

---

## 2. Criticism: “Any document is impossible without uncertainty.”

### Critique

The product cannot honestly promise perfect extraction from every document.

### Response

Accepted.

The product promise changed from:

```text
extract every document perfectly
```

to:

```text
extract cautiously, show evidence, ask review when needed, learn templates locally
```

### What changed

The app now defines separate behavior for:

- known template,
- similar template,
- unknown structured document,
- wild unstructured document,
- bad scan,
- layout changed.

### Rule added

```text
Never silently lie.
```

---

## 3. Criticism: “YOLO/OCR/SAM should not be source of truth.”

### Critique

Models are useful but fallible. They should not directly own final extracted fields.

### Response

Accepted.

### What changed

Models are now **evidence producers**.

| Component | Old role | New role |
|---|---|---|
| YOLO | decides layout/asset fields | proposes detected regions |
| OCR | gives field values | proposes text evidence |
| Segmenter | extracts final assets | refines visual asset candidates |
| Barcode/MRZ parser | fills fields | creates parsed evidence and validation signals |
| Template engine | fills fields | projects ROIs and creates template evidence |
| User correction | edits form only | creates authoritative correction evidence |

---

## 4. Criticism: “Known-template flow must be different from unknown flow.”

### Critique

Repeated documents should not re-run full unknown extraction every time.

### Response

Accepted.

### What changed

Known-template flow became:

```text
candidate template retrieval
  → anchor/template match
  → alignment
  → ROI projection
  → ROI-first OCR/asset extraction
  → verification
  → form fill
```

Unknown-document flow remains:

```text
normalize page
  → detect regions
  → full-page OCR
  → asset/code/MRZ/table parsing
  → field hypothesis generation
  → verifier
```

### Why it matters

Known-template extraction is faster, more stable, and more edge-friendly.

---

## 5. Criticism: “Do not rely only on ORB/RANSAC.”

### Critique

ORB/RANSAC can fail on low-texture, blurry, text-heavy, cropped, or changed documents.

### Response

Accepted.

### What changed

Template matching now combines:

- text anchors,
- visual anchors,
- layout histogram,
- geometry,
- keypoints,
- special zones,
- perceptual hash,
- validator pass rate.

Alignment now includes:

- page normalization,
- global transform,
- text-anchor alignment,
- local correction around fields.

---

## 6. Criticism: “Template learning can corrupt itself.”

### Critique

If user corrections are wrong or uncertain, the template can learn bad regions, wrong labels, or variable values.

### Response

Accepted.

### What changed

Template corruption prevention rules were added:

- template save is explicit,
- variable values cannot become anchors,
- uncertain corrections require review,
- imported templates become draft,
- template updates are versioned,
- template save eligibility is computed,
- old template versions are preserved.

---

## 7. Criticism: “Segmentation should not run always.”

### Critique

SAM-like segmentation is expensive and unnecessary for every page.

### Response

Accepted.

### What changed

Segmentation became conditional:

```text
detector box → crop
detector box → segmentation refinement only if needed
user redraw → saved corrected crop
```

Segmentation is not default full-page processing.

This protects memory and latency on edge devices.

---

## 8. Criticism: “Tables should not be only neural.”

### Critique

Table models can be useful, but table structure can often be extracted with geometry, and geometry is lighter/explainable.

### Response

Accepted.

### What changed

Core table strategy became:

```text
geometric table engine first
  → OCR cell assignment
  → arithmetic validation
  → SLANet_plus/Table Transformer only as bucket
```

### Why it matters

Invoices and bank statements need arithmetic validation, not just table image-to-HTML conversion.

---

## 9. Criticism: “Browser-only may be too weak.”

### Critique

Pure browser app may face memory, WebGPU, model size, and storage limitations.

### Response

Accepted.

### What changed

The architecture now has two runtime paths:

```text
Prototype/lightweight mode: Browser PWA
Serious v1: Tauri app with same frontend
```

This preserves distribution ease while giving a stronger local app path.

---

## 10. Criticism: “Model selection must be benchmark-driven.”

### Critique

Choosing a model by popularity is dangerous.

### Response

Accepted.

### What changed

All model alternatives now go through benchmark gates:

- accuracy,
- latency,
- memory,
- ONNX/browser compatibility,
- Tauri compatibility,
- downstream field accuracy,
- silent-error rate,
- correction reduction,
- license/distribution review.

No model becomes core without passing these gates.

---

## 11. Criticism: “PP-OCRv5 may not be enough; check GLM-OCR/Docling/foundation models.”

### Critique

Classical OCR may miss complex document structure. Newer document parsers/VLMs may be better.

### Response

Partially accepted.

### What changed

GLM-OCR, Docling/Granite-Docling, Donut, LayoutLM/LayoutXLM, and other document foundation models were added to research buckets.

### Why not replace core immediately

The product needs:

- token/line/field boxes,
- field-level provenance,
- deterministic ROI OCR,
- verifier integration,
- weak-device edge runtime,
- low silent-error rate,
- template ROI extraction.

Many VLM/document parser approaches are excellent for document conversion or semantic parsing, but they may not provide enough box-level, evidence-level, locally fast, verifier-friendly outputs.

---

## 12. Criticism: “Exports can destroy uncertainty.”

### Critique

If CSV/JSON export omits field statuses, downstream users may trust bad fields.

### Response

Accepted.

### What changed

Export format must include:

- status,
- confidence,
- evidence IDs,
- validation IDs,
- reasons,
- unresolved summary.

Confirmed-only export must list excluded fields.

---

## 13. Criticism: “Open source project must not leak real documents.”

### Critique

Document AI projects often accidentally leak sample private data.

### Response

Accepted.

### What changed

Docs now require:

- synthetic examples,
- no real passports/IDs/signatures/MRZ,
- PII scans,
- secret scans,
- public issue warning,
- training export redaction,
- open-source security docs.

---

## 14. Criticism: “Flawless is impossible; honesty is the product.”

### Critique

The user wants flawless extraction, but the real high-quality behavior is trustworthy uncertainty.

### Response

Accepted.

### Final product interpretation

The app should feel exceptional because:

- it extracts more than text,
- it extracts visual assets,
- it learns after correction,
- it is fast on repeated templates,
- it shows evidence,
- it avoids silent lies,
- it stays local.

Not because it pretends every unknown/bad document is solved.

---

## 15. Summary of accepted changes

Accepted changes:

- evidence graph architecture,
- verifier-first trust model,
- uncertainty-aware UI,
- correction-driven TemplateGraph,
- ROI-first known-template extraction,
- conservative template versioning,
- conditional segmentation,
- geometry-first tables,
- browser + Tauri runtime split,
- strict no-cloud policy,
- benchmark-driven model graduation,
- silent-error rate as top metric.

---

## 16. Final rule

The criticisms that mattered all pointed in one direction:

```text
Do not maximize automatic output.
Maximize trustworthy, evidence-backed, locally verifiable output.
```

That is now the core architecture.
