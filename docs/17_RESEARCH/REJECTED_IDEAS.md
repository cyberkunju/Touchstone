# Rejected Ideas

**Purpose:** List ideas rejected from the core architecture, with reasons, so the project does not revisit weak directions without new evidence.

**Review date:** 2026-06-05

---

## 1. Rejected: “OCR + AI form filler”

### Why rejected

Too shallow.

It extracts text and guesses fields, but does not reliably handle:

- photos,
- signatures,
- stamps,
- seals,
- QR/barcodes,
- MRZ,
- tables,
- checkboxes,
- visual symbols,
- provenance,
- correction learning,
- silent-error prevention.

### Replacement

```text
DocGraph evidence engine
```

---

## 2. Rejected: “Use a big VLM as the whole product”

### Why rejected

Large VLMs can produce impressive demos but are weak for this product because:

- cloud use violates local-only requirement,
- local runtime is too heavy for weak devices,
- output may be generative/hallucinated,
- evidence boxes may be missing,
- deterministic ROI extraction is hard,
- export/status auditing is weak,
- cost/privacy issues.

### Replacement

Use specialist local modules and verifier.

Large VLMs may remain research comparators with synthetic/redacted data.

---

## 3. Rejected: “Full-page SAM segmentation by default”

### Why rejected

Too expensive and unfocused.

Problems:

- high latency,
- high memory,
- many irrelevant masks,
- weak semantics,
- poor edge fit.

### Replacement

Conditional asset refinement:

```text
detector box → crop → optional segmentation only for asset
```

---

## 4. Rejected: “Template = saved field coordinates only”

### Why rejected

Coordinates alone break under:

- crop shifts,
- perspective changes,
- layout drift,
- new versions,
- missing fields,
- changed logos,
- different page size.

### Replacement

TemplateGraph with:

- anchors,
- regions,
- validators,
- aliases,
- relationships,
- versioning,
- corruption prevention.

---

## 5. Rejected: “ORB/RANSAC only for template alignment”

### Why rejected

Can fail on:

- text-heavy documents,
- low-texture pages,
- blur,
- crop changes,
- noise,
- layout changes.

### Replacement

Multi-signal matching:

- text anchors,
- visual anchors,
- layout histogram,
- special zones,
- keypoints,
- geometry,
- local corrections.

---

## 6. Rejected: “Always force best template match”

### Why rejected

False template match can silently extract wrong fields.

### Replacement

Conservative template decision:

```text
same_template
same_family_new_version
unknown_template
ambiguous_match
```

Ambiguous or changed layouts must ask review or create version.

---

## 7. Rejected: “Table model only”

### Why rejected

A table model may output structure, but invoices/statements need arithmetic and evidence.

### Replacement

Geometry-first table engine plus:

- cell OCR,
- table nodes,
- arithmetic validators,
- correction UI,
- model bucket for complex cases.

---

## 8. Rejected: “Tesseract as core OCR”

### Why rejected

Useful baseline, but not best-of-best for this product.

Weaknesses:

- modern document OCR accuracy,
- multilingual/complex layouts,
- small text/field OCR,
- layout integration.

### Replacement

PP-OCRv5 as core OCR candidate; GLM-OCR as experiment.

---

## 9. Rejected: “Native BarcodeDetector API as core”

### Why rejected

Browser support and format behavior can vary.

### Replacement

zxing-wasm/ZXing path with deterministic local decoder and tests.

Native BarcodeDetector can be an optional experiment only if benchmarked.

---

## 10. Rejected: “Cloud OCR as fallback”

### Why rejected

Violates core local-only promise.

The user explicitly wants edge/no cloud.

### Replacement

Local-only runtime. If local model unavailable, show clear error rather than uploading.

---

## 11. Rejected: “Silent auto-learning from every correction”

### Why rejected

Can corrupt templates.

User may:

- type wrong value,
- choose wrong region,
- correct one-off document,
- handle changed version,
- not want learning.

### Replacement

Explicit template save/update/version decision.

---

## 12. Rejected: “Export values without statuses”

### Why rejected

Downstream users may trust uncertain/wrong fields.

### Replacement

Status-preserving export and confirmed-only export with excluded summary.

---

## 13. Rejected: “Public repo with real sample documents”

### Why rejected

Privacy and legal risk.

### Replacement

Synthetic/redacted examples only.

---

## 14. Rejected: “Browser-only serious product”

### Why rejected

Browser is powerful but constrained:

- storage quota,
- model size,
- WebGPU support,
- memory,
- mobile differences.

### Replacement

PWA prototype + Tauri serious v1 path.

---

## 15. Rejected: “Model benchmark only by isolated score”

### Why rejected

mAP/CER can improve while downstream field trust worsens.

### Replacement

End-to-end benchmark:

- field exact match,
- status accuracy,
- silent-error rate,
- correction rate,
- latency,
- memory.

---

## 16. Final rejected-ideas rule

Rejected ideas can be reopened only if new evidence proves they satisfy:

- local edge runtime,
- evidence provenance,
- verifier integration,
- low silent-error rate,
- privacy policy,
- benchmark superiority.
