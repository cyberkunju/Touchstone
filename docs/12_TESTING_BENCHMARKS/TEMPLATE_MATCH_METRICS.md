# Template Match Metrics — Edge DocGraph Engine

**Purpose:** Define template hit rate, false match rate, version decision accuracy, ROI projection accuracy, drift detection metrics, and repeated extraction quality.

---

## 1. Template matching goal

Template matching decides:

```text
same_template
same_family_new_version
unknown_template
ambiguous_match
```

The highest-risk failure is a false match.

A false unknown is annoying.  
A false match can silently extract wrong fields.

---

## 2. Ground truth labels

Each benchmark document should define:

```json
{
  "documentId": "doc_001",
  "expectedDecision": "same_template",
  "expectedTemplateId": "tpl_invoice_v2",
  "expectedFamilyId": "fam_invoice",
  "expectedVersion": 2
}
```

For unknown:

```json
{
  "expectedDecision": "unknown_template"
}
```

---

## 3. Template hit rate

For documents that should match an existing template:

```text
template_hit_rate = correct_template_matches / total_should_match
```

Correct means:

- right template ID for same_template,
- or acceptable compatible version if explicitly allowed.

---

## 4. False match rate

For documents that should not use the selected template:

```text
false_match_rate = wrong_template_matches / total_documents
```

Also track:

```text
false_match_rate_on_unknowns = wrong_template_matches_on_unknowns / total_unknown_documents
```

False match is release-critical.

---

## 5. False unknown rate

For documents that should match:

```text
false_unknown_rate = should_match_but_unknown / total_should_match
```

This hurts usability but is safer than false match.

---

## 6. Version decision accuracy

For same family new version:

```text
version_decision_accuracy = correct_version_decisions / total_version_decision_cases
```

Classes:

- same_template
- same_family_new_version
- unknown_template
- ambiguous_match

Use confusion matrix.

---

## 7. Ambiguous match quality

Ambiguous is acceptable when evidence is genuinely close.

Track:

- ambiguous rate
- correct top candidate included
- user choice needed
- false forced match avoided

---

## 8. ROI projection accuracy

For matched template, measure projected ROI against ground truth.

```text
roi_iou = IoU(projected_roi, ground_truth_roi)
```

Track per element:

- fields
- assets
- table
- MRZ
- QR/barcode
- checkbox

---

## 9. Alignment metrics

Track:

- global transform confidence
- anchor match count
- average anchor error
- average field shift
- max field shift
- local correction count
- alignment failure rate

---

## 10. Drift detection metrics

Ground truth drift levels:

- none
- low
- medium
- high

Measure:

- drift classification accuracy
- new-version trigger precision
- new-version trigger recall
- over-versioning rate
- under-versioning rate

---

## 11. Downstream extraction impact

Template match success must be evaluated by extraction output:

- field normalized exact match
- status accuracy
- required missing detection
- conflict detection
- silent error rate
- correction count

A correct template match that extracts poorly needs alignment/extraction fixes.

---

## 12. Template matching report

```json
{
  "templateMetrics": {
    "templateHitRate": 0.94,
    "falseMatchRate": 0.002,
    "falseUnknownRate": 0.05,
    "versionDecisionAccuracy": 0.90,
    "meanRoiIoU": 0.88,
    "criticalFalseMatches": 0
  },
  "confusionMatrix": {}
}
```

---

## 13. Critical false match

A critical false match is when wrong template causes a wrong critical field to be confirmed.

This is both:

- template failure,
- silent error failure.

Release blocker.

---

## 14. Test cases

Must include:

- exact repeated template
- same template with skew
- same template with crop shift
- same family new version
- similar layout wrong family
- unknown document with common labels
- weak OCR but strong layout
- strong text but shifted fields
- missing required anchors
- template with moved table

---

## 15. Acceptance gates

Initial gates:

- zero critical false matches,
- false match rate extremely low,
- version decision confusion reviewed,
- ROI IoU high enough for extraction,
- old templates preserved,
- ambiguous cases not forced.

---

## 16. Final rule

Template matching must be conservative. The system should rather ask for review or create a new version than project wrong ROIs and silently fill wrong fields.
