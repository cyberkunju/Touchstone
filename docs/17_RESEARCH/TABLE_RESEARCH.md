# Table Research

**Purpose:** Compare geometric table extraction, SLANet_plus/SLANeXt, Table Transformer, and other table recognition options.

**Review date:** 2026-06-05

---

## 1. Decision summary

Current recommendation:

```text
Core: geometric table engine first
Research bucket: SLANet_plus / SLANeXt / Table Transformer
```

The product needs not only table recognition, but table verification:

```text
line items → subtotal → tax → total
transactions → opening balance → closing balance
```

A table model alone is not enough.

---

## 2. Product table requirements

The table system must handle:

- invoices,
- receipts,
- bank statements,
- generic form tables,
- ruled tables,
- borderless tables,
- merged cells,
- totals,
- debit/credit/balance arithmetic,
- OCR cell text,
- user cell correction,
- evidence provenance.

---

## 3. Geometric table engine

### What it is

A deterministic table extractor using:

- table region detection,
- line detection,
- text box grouping,
- row/column clustering,
- cell assignment,
- grid reconstruction.

### Strengths

- Lightweight.
- Explainable.
- Works well on ruled/structured documents.
- Easy to integrate with evidence graph.
- Easy to debug.
- Good for edge devices.
- Does not require heavy model.
- Can preserve source boxes/cells.

### Weaknesses

- Borderless tables are hard.
- Skew/blur can break line detection.
- Complex merged cells need careful logic.
- Receipts may be semi-structured rather than true tables.

### Verdict

Core v1 table path.

---

## 4. SLANet / SLANet_plus / SLANeXt

### What they are

PaddleOCR/PaddleX documentation describes SLANet as a table structure recognition model using a CPU-friendly lightweight backbone. SLANet_plus improves wireless/complex table handling and reduces sensitivity to table positioning accuracy. SLANeXt is a newer generation focusing on wired/wireless table recognition with dedicated weights.

References:

- https://paddlepaddle.github.io/PaddleOCR/main/en/version3.x/module_usage/table_structure_recognition.html
- https://paddlepaddle.github.io/PaddleX/3.4/en/module_usage/tutorials/ocr_modules/table_structure_recognition.html
- https://github.com/PaddlePaddle/PaddleOCR/blob/main/ppstructure/table/README.md

### Strengths

- Purpose-built for table structure recognition.
- Paddle ecosystem alignment.
- SLANet_plus specifically targets complex/wireless tables.
- Potentially useful when geometry fails.

### Risks

- Browser deployment uncertain.
- Model output must map into DocGraph cells.
- Need OCR content integration.
- Need verifier arithmetic layer anyway.
- SLANeXt may be heavier than v1 edge budget.

### Verdict

Research bucket, especially SLANet_plus first.

---

## 5. Table Transformer / TATR

### What it is

Microsoft Table Transformer is a DETR-style model for table detection and table structure recognition. The official repository also includes PubTables-1M and GriTS evaluation metric.

References:

- https://github.com/microsoft/table-transformer
- https://huggingface.co/microsoft/table-transformer-structure-recognition

### Strengths

- Strong table detection/structure research.
- Useful benchmark comparator.
- MIT license on official repo.
- Good for complex table structure experiments.

### Risks

- Transformer model may be heavier.
- Browser runtime must be tested.
- Table output still needs OCR cell text.
- May not outperform geometry on simple invoices.
- Integration complexity.

### Verdict

Research bucket.

---

## 6. Why table validation matters more than table parsing alone

A table parser can output rows/columns, but the product must know whether the table is correct.

Examples:

```text
invoice total = subtotal + tax - discount
bank closing balance = opening balance + credits - debits
receipt total = item sum + tax
```

Therefore table pipeline must include:

- structure extraction,
- cell OCR,
- column type inference,
- arithmetic validation,
- cross-field validation,
- correction UI.

---

## 7. Table pipeline recommendation

```text
detect table region
  → geometric line/text analysis
  → build rows/columns/cells
  → OCR cell text
  → infer headers/column types
  → validate totals
  → if geometry fails, try table model bucket
  → create table nodes/evidence
  → render editable table UI
```

---

## 8. Graduation criteria for model table bucket

A table model graduates only if it improves:

- table structure F1,
- cell assignment,
- borderless table performance,
- correction rate,
- downstream arithmetic validation,

without exceeding:

- latency budget,
- memory budget,
- browser/Tauri deployment limits.

---

## 9. Final table decision

| Approach | Status | Why |
|---|---|---|
| Geometric table engine | Core | explainable, light, edge-friendly |
| SLANet_plus | Research bucket | good complex/wireless table candidate |
| SLANeXt | Later bucket | stronger/newer but may be heavier |
| Table Transformer | Research comparator | strong research, possibly heavier |
| VLM-only table parsing | Rejected core | weak provenance and edge issues |

Final rule:

```text
Tables are not complete until structure, text, arithmetic, evidence, and correction are all handled.
```
