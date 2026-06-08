# Evaluate OCR — Edge DocGraph Engine

**Purpose:** Define OCR benchmark methodology for PP-OCRv5 and preprocessing/ROI strategies using CER, WER, field accuracy, MRZ accuracy, table cell accuracy, and latency.

---

## 1. OCR evaluation goal

OCR must be evaluated for this product, not generic OCR demos.

The product needs OCR that works for:

- full page text
- small fields
- projected template ROIs
- MRZ zones
- tables
- invoices/receipts
- IDs/passports
- low-quality scans
- edge runtime latency

---

## 2. OCR candidate

Project recommended OCR candidate:

```text
PP-OCRv5
```

Evaluation must confirm:

- accuracy on project documents,
- model export/runtime feasibility,
- browser/Tauri deployment feasibility,
- latency,
- memory,
- ROI behavior.

---

## 3. Evaluation datasets

Create:

```text
datasets/ocr_eval/
  full_page/
  roi_fields/
  mrz/
  tables/
  hard_cases/
```

Each sample should include:

- image/crop
- ground truth text
- region box
- text type
- language/script
- quality tags
- expected reading order

---

## 4. Ground truth levels

### Line level

```json
{
  "level": "line",
  "text": "Date of Birth",
  "boxNorm": [0.1, 0.2, 0.3, 0.23]
}
```

### Word level

Useful for overlay/reading order evaluation.

### Field level

```json
{
  "fieldId": "dob",
  "label": "Date of Birth",
  "value": "01/02/1999",
  "valueType": "date"
}
```

### Table cell level

```json
{
  "tableId": "items",
  "row": 2,
  "col": 3,
  "text": "1200.00"
}
```

### MRZ level

Raw MRZ lines must be exact.

---

## 5. Metrics

### 5.1 CER

Character Error Rate.

Use for:

- IDs
- MRZ
- amounts
- dates
- small fields
- multilingual text

### 5.2 WER

Word Error Rate.

Use for:

- paragraphs
- addresses
- names
- line text

### 5.3 Exact match

Use for critical fields after normalization.

Examples:

- passport number exact match
- invoice number exact match
- amount exact normalized match
- date normalized match

### 5.4 Field F1

For unknown field extraction:

- field label detected
- value paired correctly
- type correct

### 5.5 MRZ metrics

- line exact match
- normalized line match
- check digit pass after OCR
- parsed field exact match

### 5.6 Table OCR metrics

- cell text CER
- cell exact match
- amount cell normalized exact match

### 5.7 Latency

Measure:

- full page OCR time
- ROI OCR time
- batch ROI time
- MRZ OCR time
- table cell OCR time

---

## 6. Normalization policy

Evaluate both raw and normalized.

Raw comparison:

```text
what OCR literally read
```

Normalized comparison:

```text
after safe parser normalization
```

Do not hide OCR errors by over-normalizing.

Examples:

- trim whitespace
- normalize repeated spaces
- case-insensitive for labels
- preserve MRZ `<`
- preserve currency symbols where relevant

---

## 7. Benchmark modes

### Full-page OCR

Input: whole normalized page.

Measures:

- global text detection
- reading order
- large-scale layout OCR

### ROI OCR

Input: projected or detected field crops.

Measures:

- known-template extraction accuracy
- small field accuracy
- speed

### High-res ROI OCR

Input: upscaled crop.

Measures:

- tiny IDs/dates
- MRZ characters
- small receipt text

### Table cell OCR

Input: table cells.

Measures:

- amount/text cell recognition

---

## 8. Hard cases

Include:

- blur
- glare
- low resolution
- compression
- skew
- small fonts
- rotated text
- vertical text if supported
- receipts
- MRZ
- dense tables
- handwriting if scope includes

---

## 9. OCR benchmark script output

```json
{
  "runId": "ocr_eval_001",
  "ocrEngine": "pp-ocrv5",
  "modelVersion": "0.1.0",
  "datasetVersion": "ocr_eval_v1",
  "metrics": {
    "cer": 0.032,
    "wer": 0.081,
    "fieldExactMatch": 0.91,
    "mrzLineExactMatch": 0.86,
    "medianLatencyMs": 420
  },
  "byCategory": {}
}
```

---

## 10. Error buckets

Classify failures:

- missed text
- wrong character
- merged lines
- split words
- reading order wrong
- O/0 confusion
- I/1 confusion
- amount separator confusion
- date ambiguity
- MRZ filler mistake
- low confidence correctly flagged
- high confidence wrong

High-confidence wrong OCR is most dangerous.

---

## 11. Acceptance gates

OCR is acceptable only if:

- critical field exact match meets benchmark target,
- high-confidence wrong rate is low,
- MRZ OCR plus checksum behavior safe,
- ROI OCR is fast enough,
- table cell OCR acceptable,
- hard cases become needs_review rather than silent confirmed errors,
- browser/Tauri runtime feasible.

---

## 12. OCR and verifier

OCR does not decide final status.

Verifier uses:

- OCR confidence,
- parser result,
- quality warnings,
- validators,
- cross-field checks.

OCR benchmark should include how often wrong OCR becomes confirmed. That is a verifier failure if status is confirmed.

---

## 13. Privacy

OCR datasets may contain text. For public/open training:

- use synthetic or redacted data,
- avoid real names/IDs,
- avoid raw private user exports,
- encrypt/store sensitive eval sets locally.

---

## 14. References

- PP-OCRv5 documentation: https://paddlepaddle.github.io/PaddleOCR/main/en/version3.x/algorithm/PP-OCRv5/PP-OCRv5.html
- PaddleOCR GitHub: https://github.com/PaddlePaddle/PaddleOCR
- OCR-D evaluation rationale: https://ocr-d.de/en/spec/ocrd_eval.html

---

## 15. Final rule

OCR quality must be measured at the field and verifier level, not only by generic text accuracy. The real question is: did the system extract the right value, flag uncertainty, and avoid silent wrong confirmations?
