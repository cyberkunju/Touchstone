# Benchmark Datasets — Edge DocGraph Engine

**Purpose:** Define the benchmark datasets used for testing models, extraction, templates, verification, performance, security, and regression.

---

## 1. Benchmark dataset philosophy

Benchmark data must represent the real product promise:

```text
any document → cautious extraction
similar document → template extraction
bad scan → visible uncertainty
conflicting evidence → visible conflict
```

Therefore benchmarks must include both clean and hard samples.

---

## 2. Dataset categories

```text
benchmarks/
  model_detector/
  model_ocr/
  model_segmentation/
  model_table/
  extraction_fields/
  template_matching/
  verifier_silent_error/
  performance/
  ui_e2e/
  security_privacy/
  regression/
```

---

## 3. Required document categories

Mandatory:

1. passport/ID-style documents
2. invoices/receipts
3. generic forms

Extended:

4. certificates
5. bank statements
6. licenses
7. shipping labels
8. product labels
9. mixed unknown documents

---

## 4. Clean benchmark set

Purpose:

- verify baseline functionality

Contains:

- clean passport/ID mockups
- clean invoices
- clean forms
- clear QR/barcode
- clear MRZ
- clear tables
- clear signatures/stamps

Used for:

- smoke tests
- pipeline validation
- known-template happy path

---

## 5. Hard benchmark set

Purpose:

- test robustness and uncertainty handling

Includes:

- blur
- motion blur
- glare
- shadows
- skew
- perspective
- compression
- low resolution
- partial crop
- folds
- stains
- low contrast
- faded receipt text
- dense tables
- borderless tables
- overlapping stamps/text

Used for:

- model robustness
- verifier downgrade behavior
- silent error testing

---

## 6. Conflict benchmark set

Purpose:

- verify conflicts are detected and shown

Examples:

- MRZ DOB differs from visual DOB
- QR invoice number differs from printed invoice number
- table total differs from printed total
- barcode tracking number differs from printed tracking number
- issue date after expiry date
- bank statement closing balance mismatch

Expected result:

```text
status = conflict or invalid, never confirmed
```

---

## 7. Missing-field benchmark set

Purpose:

- verify required missing fields are represented.

Examples:

- known passport template with missing passport number
- invoice missing total
- form missing required signature
- table missing required column
- MRZ expected but cropped out
- QR expected but absent

Expected result:

```text
status = missing
```

---

## 8. Template matching benchmark set

Structure:

```text
template_family_A/
  v1/
    sample_001
    sample_002
  v2/
    sample_003
    sample_004
template_family_B/
unknown_families/
negative_similar_layouts/
```

Ground truth:

- same_template
- same_family_new_version
- unknown_template
- ambiguous_match where applicable

---

## 9. Performance benchmark set

Use fixed sample documents:

- one-page passport
- one-page invoice with table + QR
- one-page generic form with signature + checkboxes
- multi-page PDF
- hard scan
- known-template repeated document

Each sample must have:

- expected pipeline mode
- page count
- image size
- quality tags
- expected model usage

---

## 10. Security/privacy benchmark set

Includes synthetic malicious cases:

- OCR text containing HTML/script-like payload
- QR containing malicious URL
- import ZIP with path traversal
- oversized import package
- corrupted model file
- encrypted record tamper
- filename with suspicious characters
- PDF with unusual structure

No real sensitive data needed.

---

## 11. Regression benchmark set

Contains locked examples that must not change unexpectedly.

Covers:

- old TemplateGraphs
- old DocGraphs
- parser examples
- validators
- template matching decisions
- export snapshots
- schema migrations

---

## 12. Dataset manifest

Every benchmark set needs manifest.

```json
{
  "benchmarkId": "verifier_conflicts_v1",
  "version": "1.0.0",
  "purpose": "silent error and conflict detection",
  "samples": [
    {
      "sampleId": "conflict_mrz_dob_001",
      "docCategory": "passport",
      "qualityTags": ["clean"],
      "groundTruth": {
        "expectedStatus": "conflict"
      },
      "sensitivity": "synthetic"
    }
  ]
}
```

---

## 13. Ground truth requirements

Depending on benchmark:

- detector boxes
- OCR text
- field values
- field statuses
- table structure
- MRZ parsed values
- QR/barcode payloads
- template family/version
- expected performance mode
- expected security outcome

---

## 14. Synthetic-first rule

Public benchmark datasets must be:

- synthetic,
- public-license,
- or reviewed/redacted.

Private real-world benchmarks can exist locally but must not be committed.

---

## 15. Split leakage prevention

Hold out by:

- template family
- generator seed family
- document source family
- version group

Do not put near-identical layouts in train and benchmark unless the benchmark specifically tests repeated templates.

---

## 16. Benchmark versioning

Datasets must be immutable once released.

If changed:

```text
new benchmark version
```

Do not silently edit benchmark ground truth.

---

## 17. Benchmark quality gates

A benchmark set is valid if:

- manifest exists,
- sample files exist,
- ground truth validates,
- no private data included,
- split leakage checked,
- expected outputs defined,
- tests can run reproducibly.

---

## 18. Final rule

Benchmarks are not demo samples. They are adversarial truth sets designed to prove the system can extract, verify, reject, and ask for review correctly.
