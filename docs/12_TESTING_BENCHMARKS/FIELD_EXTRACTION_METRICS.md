# Field Extraction Metrics — Edge DocGraph Engine

**Purpose:** Define exact match, normalized match, field F1, label accuracy, type accuracy, region accuracy, asset accuracy, table field accuracy, and review-aware metrics.

---

## 1. Why field metrics matter

OCR metrics alone are not enough.

The product must know:

- did it find the field?
- did it use the correct label?
- did it extract the correct value?
- did it assign correct type?
- did it show the right status?
- did it point to correct evidence?
- did it avoid silent wrong confirmation?

---

## 2. Field ground truth

Each benchmark field should define:

```json
{
  "fieldId": "dob",
  "canonicalLabel": "Date of Birth",
  "aliases": ["DOB"],
  "value": "1999-02-01",
  "rawDisplayValue": "01/02/1999",
  "valueType": "date",
  "boxNorm": [0.4, 0.3, 0.6, 0.34],
  "required": true
}
```

---

## 3. Field detection

A predicted field matches ground truth if:

- label/type compatible,
- value region overlaps or value text matches,
- document/page correct.

Use matching algorithm to avoid double-counting.

---

## 4. Exact match

Raw exact match:

```text
predicted_value == ground_truth_raw_value
```

Useful for:

- MRZ lines
- ID numbers
- exact codes
- table cells
- OCR raw evaluation

---

## 5. Normalized exact match

Normalize before comparison.

Examples:

- dates to ISO
- amounts to decimal numeric value
- trim whitespace
- normalize repeated spaces
- uppercase IDs
- remove allowed separators

Metric:

```text
normalized_predicted_value == normalized_ground_truth_value
```

Important for:

- dates
- amounts
- phone numbers
- IDs
- names with spacing differences

---

## 6. Field F1

Definitions:

```text
TP = predicted field matched correct ground truth field
FP = predicted field that should not exist or matched wrong field
FN = ground truth field missing
```

```text
precision = TP / (TP + FP)
recall = TP / (TP + FN)
F1 = 2 * precision * recall / (precision + recall)
```

Compute per field type and overall.

---

## 7. Label accuracy

Measures whether field label/canonical label is correct.

Levels:

- exact canonical match
- alias match
- semantic equivalent
- wrong label
- missing label

Example:

```text
DOB → Date of Birth = correct alias
```

---

## 8. Value accuracy

Measure:

- raw exact
- normalized exact
- partial text similarity
- parser success
- critical field correctness

Critical field normalized exact is most important.

---

## 9. Type accuracy

Predicted type must match ground truth.

Types:

- text
- name
- date
- amount
- id_number
- address
- phone
- email
- country
- photo
- signature
- stamp
- qr
- barcode
- mrz
- table
- checkbox

Wrong type can break validators and UI.

---

## 10. Region accuracy

Measure source region IoU.

```text
region_iou = IoU(predicted_box, ground_truth_box)
```

Use for:

- field value ROI
- asset crop
- table region
- MRZ region
- code region

For known templates, ROI projection IoU is critical.

---

## 11. Evidence accuracy

A field is not fully correct unless evidence is correct.

Measure:

- correct source page
- correct source region
- correct node/evidence link
- no unsupported source
- field value derived from current document, not old template value

Evidence mismatch can create silent audit failure.

---

## 12. Status accuracy

Predicted status must match expected status.

Statuses:

- confirmed
- needs_review
- missing
- conflict
- invalid
- unsupported
- rejected

Field value may be correct but status wrong.

Examples:

- correct value but low confidence should be needs_review
- wrong value confirmed is severe failure
- missing field hidden is failure

---

## 13. Review-aware accuracy

Define review-aware success:

```text
A field is acceptable if:
  correct and confirmed
  OR uncertain and needs_review
  OR missing/conflict/invalid correctly flagged
```

Wrong confirmed value is unacceptable.

---

## 14. Asset field metrics

For assets:

- asset detected
- asset type correct
- crop IoU
- crop completeness
- status correct
- correction needed or not

---

## 15. Table field metrics

For table-derived fields:

- table detected
- structure correct
- cell values correct
- linked total correct
- arithmetic validation correct
- status correct

---

## 16. Metric report schema

```json
{
  "fieldMetrics": {
    "fieldF1": 0.91,
    "labelAccuracy": 0.94,
    "typeAccuracy": 0.96,
    "rawExactMatch": 0.88,
    "normalizedExactMatch": 0.93,
    "statusAccuracy": 0.90,
    "criticalWrongConfirmed": 0
  },
  "byFieldType": {}
}
```

---

## 17. Failure buckets

Classify failures:

- field missing
- false field
- wrong label
- wrong value
- wrong type
- wrong source region
- wrong status
- conflict not detected
- invalid not detected
- template copied old value
- OCR wrong
- parser wrong
- validator wrong

---

## 18. Final rule

A field is not successful just because text was read. It is successful only when value, label, type, source evidence, status, and validation behavior are all correct for the product context.
