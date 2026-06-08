# Success Metrics — Edge DocGraph Engine

**Purpose:** Define how the project measures quality, trust, performance, template learning, model accuracy, and product readiness.  
**Most important metric:** Silent Critical Error Rate.

---

## 1. Measurement philosophy

This product should not be judged by OCR accuracy alone.

OCR accuracy matters, but the product succeeds only when it produces trustworthy, evidence-backed forms and improves after user correction.

A field extracted incorrectly but marked for review is acceptable.  
A field extracted incorrectly and marked confirmed is dangerous.

Therefore the top-level quality order is:

1. silent critical error rate
2. verification correctness
3. template learning improvement
4. field extraction accuracy
5. visual asset extraction quality
6. table structure accuracy
7. latency and memory
8. UI correction efficiency

Speed matters, but not more than trust.

---

## 2. Core product metrics

### 2.1 Silent Critical Error Rate

Definition:

> Percentage of critical fields that are wrong but marked as confirmed.

Examples of critical fields:

- passport number
- document number
- date of birth
- expiry date
- name
- invoice total
- tax ID
- bank account number
- MRZ parsed value
- barcode/QR payload mapped value

Formula:

```text
silent_critical_error_rate =
  wrong_confirmed_critical_fields / total_critical_fields
```

Target:

- must be tracked from day one
- should trend toward near-zero
- release blocker if high

Why it matters:

A wrong field marked needs_review is not catastrophic.  
A wrong field marked confirmed poisons trust and templates.

---

### 2.2 Field Exact Match

Definition:

> Percentage of extracted field values that exactly match ground truth.

Formula:

```text
field_exact_match =
  exact_matched_fields / total_expected_fields
```

Use for:

- names
- IDs
- dates
- amounts
- codes
- addresses where exact text is expected

Limit:

Exact match can be too strict for formatting differences.

---

### 2.3 Normalized Field Match

Definition:

> Percentage of extracted fields that match after normalization.

Examples:

- `01/02/1999` equals `1999-02-01` if date interpretation is correct
- `$1,200.00` equals `1200.00 USD`
- whitespace differences ignored
- case normalized where appropriate

Formula:

```text
normalized_match =
  normalized_matched_fields / total_expected_fields
```

---

### 2.4 Field F1

Use precision, recall, and F1 for field discovery.

```text
precision = correct_extracted_fields / total_extracted_fields
recall = correct_extracted_fields / total_expected_fields
F1 = 2 * precision * recall / (precision + recall)
```

This matters for unknown documents because the system must discover fields.

---

### 2.5 Field Status Accuracy

Definition:

> Whether the verifier assigned the correct status.

Statuses:

- confirmed
- needs_review
- missing
- conflict
- invalid

Measure with a labeled review set.

Important questions:

- Were bad fields flagged?
- Were good fields confirmed?
- Were missing fields identified?
- Were conflicts caught?

---

## 3. Template learning metrics

### 3.1 Template Hit Rate

Definition:

> Percentage of repeated documents correctly matched to an existing template.

```text
template_hit_rate =
  correct_template_matches / repeated_template_documents
```

Failure types:

- false unknown
- wrong template
- wrong version
- same family but wrong version

---

### 3.2 Template False Match Rate

Definition:

> Percentage of documents incorrectly matched to the wrong template.

```text
template_false_match_rate =
  wrong_template_matches / all_template_match_attempts
```

This is more dangerous than false unknown. A false unknown causes extra review. A false match may cause wrong field extraction.

Priority:

> Minimize false matches even if it increases review.

---

### 3.3 Template Version Decision Accuracy

Definition:

> Accuracy of deciding same_template vs same_family_new_version vs unknown_template.

Confusion matrix:

| Actual / Predicted | same_template | new_version | unknown |
|---|---:|---:|---:|
| same_template | | | |
| new_version | | | |
| unknown | | | |

---

### 3.4 Correction Reduction After Learning

Definition:

> Reduction in user corrections between first corrected document and later similar documents.

```text
correction_reduction =
  1 - (corrections_after_template / corrections_before_template)
```

This metric directly measures product magic.

---

### 3.5 ROI Extraction Success Rate

Definition:

> Percentage of known-template fields successfully extracted from projected ROIs without needing full unknown-document fallback.

```text
roi_success_rate =
  fields_extracted_from_roi / expected_template_fields
```

---

### 3.6 Template Corruption Rate

Definition:

> Percentage of templates that become worse after update or versioning mistake.

Indicators:

- repeated false matches
- required fields drifting
- old fields missing after update
- user repeatedly correcting same template after update

Target:

- extremely low
- updates should be explicit and versioned

---

## 4. OCR metrics

### 4.1 Character Error Rate

```text
CER = edit_distance(predicted_chars, ground_truth_chars) / ground_truth_chars
```

Use for:

- MRZ
- IDs
- serial numbers
- names
- amounts
- small fields

### 4.2 Word Error Rate

```text
WER = edit_distance(predicted_words, ground_truth_words) / ground_truth_words
```

Use for:

- paragraph text
- addresses
- labels

### 4.3 OCR Box Accuracy

Measure whether OCR boxes align with text regions.

Metrics:

- IoU with ground-truth text boxes
- line detection recall
- word grouping accuracy
- reading order accuracy

### 4.4 ROI OCR Improvement

Compare OCR accuracy between:

- full-page OCR
- high-resolution ROI OCR
- template-projected ROI OCR

Known-template extraction should improve accuracy on small fields.

---

## 5. Detector metrics

### 5.1 Object Detection mAP

Use mean Average Precision for classes:

- photo
- signature
- stamp
- seal
- logo
- QR
- barcode
- MRZ
- table
- checkbox
- text_block
- document_page

Measure at IoU thresholds:

- mAP@0.5
- mAP@0.5:0.95

### 5.2 Per-Class Recall

Critical for rare classes.

Example:

```text
signature recall
stamp recall
MRZ recall
QR recall
checkbox recall
```

Missing a critical object is often worse than a slightly inaccurate box.

### 5.3 False Positive Rate

Measure false detections per page per class.

High false positives create bad form fields and user correction burden.

### 5.4 Small Object Recall

Specific metric for:

- checkboxes
- QR codes
- small stamps
- small signatures
- tiny logos
- MRZ zones at low resolution

---

## 6. Visual asset metrics

### 6.1 Crop IoU

Definition:

> Intersection-over-union between extracted crop box and ground-truth asset box.

Used for:

- photo
- signature
- stamp
- seal
- logo

### 6.2 Mask IoU

If segmentation is used:

```text
mask_iou =
  intersection(predicted_mask, ground_truth_mask) /
  union(predicted_mask, ground_truth_mask)
```

### 6.3 Asset Type Accuracy

Whether asset class is correct.

Examples:

- signature vs stamp
- logo vs emblem
- photo vs generic figure

### 6.4 Asset Usability Score

Human-review metric:

- crop complete
- crop too large
- crop cuts off important region
- background too noisy
- mask acceptable
- asset assigned to correct form field

---

## 7. Barcode / QR metrics

### 7.1 Decode Rate

```text
decode_rate =
  successfully_decoded_codes / visible_codes
```

### 7.2 Payload Accuracy

```text
payload_accuracy =
  exact_payload_matches / decoded_codes
```

### 7.3 Code Detection Recall

If codes are detected before parsing:

```text
code_detection_recall =
  detected_visible_codes / visible_codes
```

### 7.4 Cross-Check Success

Percentage of code payloads successfully linked to printed fields.

---

## 8. MRZ metrics

### 8.1 MRZ Detection Recall

```text
mrz_detection_recall =
  detected_mrz_zones / visible_mrz_zones
```

### 8.2 MRZ OCR CER

MRZ-specific character error rate.

### 8.3 MRZ Parse Success

```text
mrz_parse_success =
  parsed_mrz / detected_mrz_zones
```

### 8.4 Checksum Accuracy

How often the parser correctly validates check digits.

### 8.5 MRZ-to-Visual Match Accuracy

Whether MRZ fields correctly cross-check visual fields.

---

## 9. Table metrics

### 9.1 Table Detection Recall

```text
table_recall =
  detected_tables / visible_tables
```

### 9.2 Cell F1

Measures correct cell reconstruction.

```text
cell_precision = correct_cells / predicted_cells
cell_recall = correct_cells / ground_truth_cells
cell_f1 = 2 * precision * recall / (precision + recall)
```

### 9.3 Row/Column Accuracy

- row count accuracy
- column count accuracy
- header row accuracy
- merged cell accuracy

### 9.4 Table Text Accuracy

OCR accuracy inside cells.

### 9.5 Arithmetic Validation Catch Rate

For invoices/bank statements:

```text
arithmetic_catch_rate =
  math_errors_caught / actual_math_errors
```

---

## 10. Verification metrics

### 10.1 Validator Precision

```text
validator_precision =
  true_validator_flags / all_validator_flags
```

### 10.2 Validator Recall

```text
validator_recall =
  true_validator_flags / actual_errors
```

### 10.3 Conflict Detection Rate

Percentage of real evidence conflicts caught.

Examples:

- MRZ vs visual mismatch
- QR payload vs printed value mismatch
- invoice total mismatch
- template-required field missing

### 10.4 Over-Flagging Rate

Percentage of correct fields unnecessarily marked for review.

Over-flagging reduces automation but is safer than silent error. Still, it must be measured.

---

## 11. UX metrics

### 11.1 Correction Count

Number of user corrections per document.

Track by type:

- label correction
- value correction
- field type correction
- crop correction
- missing field add
- false field delete
- table correction

### 11.2 Time to Review

Time from extraction complete to user finalization.

### 11.3 Evidence Click Rate

How often users open evidence before correction.

High evidence usage may show trust needs; low usage with high correction accuracy may indicate good UI.

### 11.4 Repeat Extraction Satisfaction

Measured qualitatively or by correction reduction.

### 11.5 Template Save Rate

Percentage of reviewed documents saved as templates.

---

## 12. Performance metrics

### 12.1 First Unknown Processing Time

Time from upload to reviewable form.

Break down:

- file decode
- PDF render
- normalization
- detector
- OCR
- parsers
- DocGraph
- verifier
- form generation

### 12.2 Known Template Processing Time

Time from upload to filled form for matched template.

Must be significantly faster than unknown flow.

### 12.3 Model Load Time

Track per model:

- YOLOv11n
- PP-OCRv5 detector
- PP-OCRv5 recognizer
- segmentation model
- SLANet_plus trial

### 12.4 Memory Peak

Track:

- JS heap
- WASM memory
- WebGPU memory where possible
- image buffers
- model sessions

### 12.5 UI Responsiveness

Metrics:

- main-thread blocking time
- dropped frames during processing
- interaction latency while workers run

---

## 13. Privacy and security metrics

### 13.1 Cloud Request Audit

Ensure no document/extraction data leaves device.

Metric:

```text
sensitive_network_request_count = 0
```

### 13.2 Local Encryption Coverage

Percentage of sensitive stored records encrypted.

### 13.3 Data Deletion Success

User deletion removes document/template from app-accessible storage.

### 13.4 Sensitive Log Incidents

Number of logs containing raw OCR text, MRZ, financial data, or crops.

Target: zero by default.

---

## 14. Benchmark datasets

The benchmark suite should include:

### Passport/ID

- clean scans
- camera photos
- glare samples
- MRZ visible
- MRZ partially degraded
- multiple layouts
- fake/synthetic data only for public tests

### Invoice/receipt

- clean invoice
- receipt thermal print
- table-heavy invoice
- QR invoice
- stamp/signature invoice
- vendor layout versions

### Generic forms

- labels and values
- checkboxes
- signatures
- stamps
- tables
- repeated labels
- missing fields

### Bad input set

- blur
- glare
- crop cut off
- low DPI
- rotation
- shadows
- compression
- warped page

### Negative set

- random photos
- screenshots
- blank pages
- non-documents
- decorative images

---

## 15. Acceptance thresholds

Initial v1 thresholds should be conservative and evolve with benchmarks.

### Safety

- silent critical error rate must be extremely low
- wrong critical fields must usually be needs_review/conflict/invalid
- template false-match rate must be lower than false-unknown rate

### Template

- known-template extraction should reduce corrections by at least 50% after first correction on supported samples
- template false match should be treated as release-blocking if frequent

### Performance

- UI must remain responsive
- known-template extraction must be measurably faster than unknown extraction
- worker tasks must support cancellation or safe failure

### Evidence

- 100% of generated fields must have evidence references
- 100% of confirmed fields must have validator/status reasons

---

## 16. Dashboard design

The internal benchmark dashboard should show:

- document family
- model versions
- field accuracy
- silent error rate
- verification precision/recall
- template hit/false-match rate
- processing time
- memory peak
- correction count
- table accuracy
- asset crop quality
- MRZ metrics
- barcode metrics

Each benchmark run must be tied to:

- app version
- model versions
- schema version
- browser/runtime
- device profile

---

## 17. Quality hierarchy

When optimizing, use this hierarchy:

1. reduce silent critical errors
2. improve verifier correctness
3. improve template matching safety
4. improve field recall
5. improve crop/table quality
6. improve latency
7. improve visual polish

Do not trade silent-error safety for speed.

---

## 18. Final success definition

The project succeeds when users can trust it because every output is evidence-backed, uncertain fields are clearly marked, corrections are easy, templates learn locally, and repeated documents become fast and accurate without cloud processing.

The best metric is not “how many fields did the model guess?”  
The best metric is:

> How many correct fields were confirmed, how many wrong fields were caught, and how much less work did the user do after template learning?
