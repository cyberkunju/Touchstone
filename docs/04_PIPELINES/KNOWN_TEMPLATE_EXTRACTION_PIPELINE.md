# Known Template Extraction Pipeline — Edge DocGraph Engine

**Purpose:** Define template matching, alignment, ROI projection, ROI-first extraction, verification, and versioning for repeated documents.

> Note: The requested filename was `KCNOWN_TEMPLATE_EXTRACTION_PIPELINE.md`. This document is also duplicated as `KNOWN_TEMPLATE_EXTRACTION_PIPELINE.md` for typo-free navigation.

---

## 1. Pipeline goal

Known-template extraction is the fast path. It uses a saved TemplateGraph to process similar documents quickly and safely.

The pipeline must:

- match candidate templates conservatively
- align the new page to the saved template
- project saved field/asset/table/code/MRZ regions
- extract current document evidence from those ROIs
- verify all extracted values
- flag missing/conflicting/invalid fields
- create new template versions when layout drift is detected

It must never copy old values from the template.

---

## 2. High-level flow

```text
new document
  → page normalization
  → candidate template retrieval
  → template scoring
  → template decision
  → alignment
  → local correction
  → ROI projection
  → ROI-first extraction
  → verification
  → form fill
  → review / version decision
```

---

## 3. Template decision states

```ts
type TemplateDecision =
  | "same_template"
  | "same_family_new_version"
  | "unknown_template"
  | "ambiguous_match";
```

Actions:

| Decision | Action |
|---|---|
| same_template | run ROI-first extraction |
| same_family_new_version | run cautious projected extraction + ask version save |
| unknown_template | run unknown document flow |
| ambiguous_match | ask user or run unknown flow |

---

## 4. Candidate retrieval

Fast retrieval before expensive alignment.

Signals:

- page count
- aspect ratio
- document type hint
- text anchor rough match
- visual asset positions
- special zones
- layout histogram
- recent templates

Output:

```ts
type CandidateTemplate = {
  templateId: string;
  familyId: string;
  version: number;
  roughScore: number;
  reasons: string[];
};
```

---

## 5. Template scoring

Use multi-signal scoring.

```ts
type TemplateScoreBreakdown = {
  textAnchorScore: number;
  geometryScore: number;
  visualAnchorScore: number;
  keypointScore: number;
  specialZoneScore: number;
  requiredRegionScore: number;
  overall: number;
};
```

Suggested initial weighting:

```text
overall =
  0.25 * textAnchorScore +
  0.20 * geometryScore +
  0.20 * visualAnchorScore +
  0.15 * keypointScore +
  0.10 * specialZoneScore +
  0.10 * requiredRegionScore
```

Weights should be calibrated per template family over time.

---

## 6. Avoid false matches

False template match is worse than false unknown.

Rules:

- if two templates are close, mark ambiguous
- if required anchors missing, do not force match
- if geometry and text disagree, downgrade
- if special zones conflict, downgrade
- if validator expectations fail early, downgrade

---

## 7. Alignment

### 7.1 Coarse alignment

Use:

- page boundary
- orientation
- scale
- canonical coordinate system

### 7.2 Global alignment

Use one or more:

- homography from keypoints
- text-anchor transform
- document corners
- layout anchor transform

### 7.3 Local alignment correction

Documents warp locally. Use nearby anchors to adjust ROIs.

Flow:

```text
expected anchor
  → observed anchor
  → local offset
  → adjust nearby ROI
```

Example:

```text
expected "DOB" at y=0.42
observed "DOB" at y=0.44
shift DOB value ROI down by 0.02
```

---

## 8. ROI projection

Project TemplateGraph elements:

- TemplateField
- TemplateAsset
- TemplateTable
- TemplateCode
- TemplateMRZ
- TemplateCheckbox

Output:

```ts
type ProjectedRoi = {
  templateElementId: string;
  pageId: string;
  boxNorm: NormalizedBox;
  expandedBoxNorm: NormalizedBox;
  projectionConfidence: number;
  transformIds: string[];
};
```

---

## 9. ROI expansion

Expansion depends on field type and alignment uncertainty.

Suggested defaults:

| ROI type | Expansion |
|---|---:|
| date | 5–10% |
| ID number | 5–15% |
| amount | 5–10% |
| name/text | 5–15% |
| MRZ | 2–5% |
| table | 2–5% |
| signature/stamp | 5–10% |
| photo | 1–3% |

Increase expansion if local alignment confidence is low.

---

## 10. ROI-first extraction by field type

### 10.1 Text field

```text
project ROI
  → OCR
  → parse expected type
  → validate
```

### 10.2 Date field

```text
ROI OCR
  → date parser
  → ambiguity check
  → validator
```

### 10.3 Amount field

```text
ROI OCR
  → amount parser
  → currency context
  → arithmetic validation if related
```

### 10.4 ID field

```text
ROI OCR
  → normalization
  → pattern validator
  → cross-field validation if available
```

### 10.5 Asset field

```text
project ROI
  → crop
  → optional segmentation
  → asset validator
```

### 10.6 Table field

```text
project table ROI
  → table engine
  → schema-guided reconstruction
  → validators
```

### 10.7 Code field

```text
project code ROI
  → zxing-wasm decode
  → payload validation
```

### 10.8 MRZ field

```text
project MRZ ROI
  → OCR
  → MRZ parser
  → checksum validation
```

---

## 11. Search-nearby fallback inside same chosen template

This is not a model fallback. It is local ROI repair.

If ROI extraction fails:

1. search around projected region
2. use nearby text anchor
3. expand crop
4. retry OCR/parser
5. if still fails, mark review/missing

Do not jump to old template value.

---

## 12. Verification

Each extracted template field must be verified.

Verification uses:

- OCR confidence
- parser result
- template projection confidence
- validator result
- quality report
- required field rules
- cross-field consistency
- drift report

Status examples:

```text
confirmed:
  expected ROI, strong OCR, validator passed

needs_review:
  ROI extracted but OCR confidence low

missing:
  required ROI had no value

conflict:
  MRZ and visual value disagree

invalid:
  checksum/pattern/date failed
```

---

## 13. Drift detection

Detect layout drift after extraction.

Signals:

- many ROIs shifted
- anchors mismatched
- new fields appear
- old required fields missing
- table structure changed
- visual asset moved
- validator failures cluster
- user corrects many fields

Output:

```ts
type DriftReport = {
  level: "none" | "low" | "medium" | "high";
  reasons: string[];
  suggestedAction: "use_existing" | "create_new_version" | "unknown_flow";
};
```

---

## 14. Template versioning

If drift is medium/high but family match is clear:

- suggest new version
- do not overwrite existing template
- preserve family ID
- create version number
- store new anchors/ROIs after correction

---

## 15. UI behavior

When template matches:

```text
Matched template: Vendor Invoice v2
Mode: ROI-first extraction
Status: 18 confirmed, 2 need review
```

When drift:

```text
This looks like the same document family but layout has changed. Create a new template version?
```

For each field:

- show projected ROI
- show extraction crop
- show status
- show validator reasons

---

## 16. Performance rules

Known-template flow should be fast.

Rules:

- avoid broad detector if match is strong and ROIs sufficient
- run OCR only on projected fields first
- run code parser only on expected code regions
- run table engine only on expected table regions
- run segmentation only for expected assets requiring it
- run broader unknown flow only if match/extraction fails

---

## 17. Output contract

```ts
type KnownTemplateExtractionResult = {
  documentId: string;
  templateMatch: {
    templateId: string;
    familyId: string;
    version: number;
    decision: TemplateDecision;
    score: TemplateScoreBreakdown;
  };
  alignment: {
    transformIds: string[];
    confidence: number;
  };
  projectedRois: ProjectedRoi[];
  evidenceIds: string[];
  validationIds: string[];
  driftReport: DriftReport;
  formSchemaId: string;
  formValueSetId: string;
};
```

---

## 18. Tests

Test cases:

- exact same template
- same template with rotation
- same template with scale change
- same template with perspective warp
- same family new version
- wrong but visually similar template
- missing required field
- MRZ conflict
- table changed
- asset moved

Assertions:

- correct template decision
- false match avoided
- ROI extraction works
- validators run
- drift detected
- old template not overwritten

---

## 19. Invariants

1. Never copy old field values.
2. Templates store structure, not current values.
3. Always extract current evidence.
4. Always verify current evidence.
5. False unknown is safer than false match.
6. Drift creates version, not corruption.
7. Known-template flow must be faster than unknown flow.
8. Missing required fields must be visible.

---

## 20. Final summary

Known-template extraction is the acceleration and learning payoff of the product. It uses TemplateGraph structure to extract current document evidence quickly, but it remains verifier-controlled and uncertainty-aware. The result is speed without blind trust.
