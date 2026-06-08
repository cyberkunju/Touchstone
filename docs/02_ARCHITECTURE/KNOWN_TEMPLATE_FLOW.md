# Known Template Flow — Edge DocGraph Engine

**Purpose:** Define the fast, verified extraction path for documents similar to a saved TemplateGraph.

---

## 1. What is a known template?

A document is treated as known-template only when it matches a saved TemplateGraph strongly enough.

A known template is not merely a visual similarity match. It must match across multiple signals:

- page geometry
- text anchors
- visual anchors
- layout fingerprint
- special zones
- keypoint alignment
- required-field expectations
- validator compatibility

---

## 2. Why known-template flow exists

Repeated documents should not be processed as unknown documents every time.

Unknown extraction asks:

```text
What is on this page?
What are the fields?
Where are the assets?
What is the table?
```

Known-template extraction asks:

```text
Does this page match a saved template?
Where did the saved fields land?
Can I extract and verify those known regions?
What changed?
```

This makes known-template extraction faster, more accurate, and easier to verify.

---

## 3. High-level flow

```text
New document
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

## 4. Flow diagram

```text
┌─────────────────────┐
│ Uploaded document   │
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ Page normalization  │
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ Candidate retrieval │
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ Template scoring    │
└──────────┬──────────┘
           │
           ├── high score ───────────────► same_template
           │
           ├── medium score + family cues ► same_family_new_version
           │
           └── low score ────────────────► unknown_document_flow
```

If same_template:

```text
same_template
  → align
  → project ROIs
  → extract
  → verify
  → fill form
```

If same_family_new_version:

```text
new_version_candidate
  → partial projection
  → run targeted discovery
  → ask user correction
  → save new version
```

---

## 5. Candidate template retrieval

Before expensive alignment, retrieve a small candidate set.

Signals:

- document type hint
- page aspect ratio
- page count
- coarse layout histogram
- stable OCR tokens
- detected special zones
- visual asset positions
- template family metadata

Candidate retrieval should be fast and tolerant.

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

## 6. Template scoring

Use a multi-signal score.

Recommended signals:

```ts
templateScore =
  0.25 * textAnchorScore +
  0.20 * geometryScore +
  0.20 * visualAnchorScore +
  0.15 * keypointScore +
  0.10 * specialZoneScore +
  0.10 * requiredRegionScore;
```

Weights should be configurable and later calibrated.

### 6.1 Text anchor score

Checks stable template phrases.

Examples:

- `PASSPORT`
- `Invoice No.`
- `Date of Birth`
- `Total`
- `Tax Invoice`
- `Certificate`

Variable values should not be used as stable anchors unless user explicitly marks them static.

### 6.2 Geometry score

Compares:

- page aspect ratio
- document boundary shape
- text block distribution
- table region location
- photo region location
- checkbox clusters
- line separators

### 6.3 Visual anchor score

Compares:

- logo positions
- emblem positions
- photo block positions
- seal/stamp locations
- visual hashes or descriptors

### 6.4 Keypoint score

Uses ORB/RANSAC or similar features when useful.

Useful for:

- logos
- fixed backgrounds
- forms with lines
- certificates with visual design

Can fail on:

- mostly text documents
- blurry scans
- low texture documents

Therefore it must not be the only signal.

### 6.5 Special-zone score

Checks:

- MRZ at expected region
- QR/barcode at expected region
- photo at expected region
- table grid at expected region
- checkbox group at expected region

### 6.6 Required-region score

Checks whether required template regions are plausible in the new page.

---

## 7. Template decision

Output decision:

```ts
type TemplateDecision =
  | "same_template"
  | "same_family_new_version"
  | "unknown_template";
```

Suggested decision logic:

```text
if score very high and validators likely pass:
  same_template

else if score medium and family anchors match:
  same_family_new_version

else:
  unknown_template
```

Do not use fixed global thresholds forever. Thresholds should be calibrated per template family.

---

## 8. Alignment

Alignment converts saved template coordinates into current page coordinates.

### 8.1 Coarse alignment

Sources:

- page boundary
- orientation correction
- canonical scaling
- aspect ratio normalization

### 8.2 Global alignment

Possible methods:

- homography from keypoints
- homography from document corners
- affine transform from text anchors
- similarity transform from layout anchors

### 8.3 Local alignment correction

Needed because real pages warp.

Method:

1. find nearby observed anchors
2. compare expected vs observed positions
3. compute local offset
4. shift/expand nearby ROIs
5. retry extraction if validators fail

Example:

```text
Expected DOB label at y=0.42
Observed DOB label at y=0.44
Shift DOB value ROI down by 0.02
```

---

## 9. ROI projection

TemplateGraph contains saved normalized regions.

Project:

- field label regions
- field value regions
- asset regions
- table regions
- code regions
- MRZ region
- checkbox regions

Projected ROI:

```ts
type ProjectedRoi = {
  templateFieldId: string;
  pageId: string;
  boxNorm: NormalizedBox;
  expandedBoxNorm: NormalizedBox;
  projectionConfidence: number;
  transformIds: string[];
};
```

Expansion:

- expand small fields by 5–15%
- expand more if alignment uncertainty is high
- avoid overlap with unrelated fields when possible

---

## 10. ROI-first extraction

For each projected field:

```text
1. crop ROI
2. run OCR/parser/asset extraction based on field type
3. parse value
4. validate
5. if fail, search nearby
6. if still fail, mark needs_review/missing/conflict
```

### 10.1 Text field

Use ROI OCR.

### 10.2 Date field

Use ROI OCR + date parser + date validator.

### 10.3 Amount field

Use ROI OCR + amount parser + currency context.

### 10.4 ID field

Use ROI OCR + pattern validator.

### 10.5 Asset field

Use projected crop + optional segmentation + verifier.

### 10.6 Table field

Use projected table region + table engine.

### 10.7 Code field

Use projected code region + zxing-wasm.

### 10.8 MRZ field

Use projected MRZ region + MRZ parser.

---

## 11. Verification in known-template flow

Known-template extraction is not automatically trusted.

Verifier checks:

- OCR confidence
- parser success
- template projection confidence
- required field presence
- expected field type
- cross-field consistency
- scan quality
- drift indicators
- conflicts with visual anchors

Known-template status examples:

```text
confirmed:
  extracted from expected ROI, validator passed, no conflicts

needs_review:
  extracted from expected ROI, but OCR confidence low

missing:
  required ROI contains no plausible value

conflict:
  MRZ value differs from visual field

invalid:
  value fails required format/checksum
```

---

## 12. Template versioning decision

After extraction, evaluate drift.

Create new version if:

- anchor score is medium
- field ROIs systematically shifted
- new fields appear
- required fields disappear
- table structure changes
- logo/emblem changes but family text remains
- validator failures cluster by region
- user corrects many projected fields

Do not overwrite old template automatically.

---

## 13. Known-template output

Output includes:

- matched template ID
- version
- match score
- alignment transform
- projected ROIs
- extracted evidence
- field statuses
- drift report
- version suggestion if needed

Example:

```json
{
  "templateMatch": {
    "templateId": "invoice_vendor_a_v1",
    "score": 0.93,
    "decision": "same_template"
  },
  "drift": {
    "level": "low",
    "reasons": []
  },
  "fields": [
    {
      "id": "invoice_number",
      "status": "confirmed",
      "source": "template_roi"
    },
    {
      "id": "total",
      "status": "needs_review",
      "reason": "amount validator passed but OCR confidence low"
    }
  ]
}
```

---

## 14. Failure handling

### 14.1 Wrong template risk

If match is ambiguous, do not force known-template extraction.

Status:

```text
unknown_template
```

or:

```text
needs_user_template_selection
```

### 14.2 ROI extraction failure

If projected ROI extraction fails:

1. search nearby
2. use text anchor correction
3. run targeted detector/OCR
4. mark review
5. suggest template version if systematic

### 14.3 Validator failure

Do not silently accept. Mark conflict/invalid/needs_review.

---

## 15. Performance goals

Known-template flow should be faster because it avoids:

- full broad discovery
- unnecessary full-page segmentation
- unnecessary table parsing outside expected regions
- unnecessary code scanning outside expected code regions

Optimization rules:

- run OCR only on projected text ROIs first
- run code parser only on projected code regions
- run segmentation only on projected asset regions
- run broader detector only if template confidence is weak
- cache template anchors and thumbnails

---

## 16. UI behavior

When a known template is matched, show:

```text
Matched template: Vendor A Invoice v2
Match confidence: High
Extraction mode: ROI-first
```

Show if needed:

```text
Layout drift detected. Create new version?
```

For each field, show:

- status
- source crop
- template region
- validator result
- confidence reasons

---

## 17. Known-template invariants

1. Never copy old values from the template.
2. Only copy structure, not variable content.
3. Always extract current document evidence.
4. Always verify current values.
5. Always flag missing required fields.
6. Always protect old templates from drift.
7. Always store extraction provenance.

---

## 18. Final summary

Known-template flow is the product’s acceleration engine. It makes the second similar upload fast and accurate by aligning a saved TemplateGraph, projecting known regions, extracting current evidence from those regions, and verifying aggressively. It must be fast, but never blind.
