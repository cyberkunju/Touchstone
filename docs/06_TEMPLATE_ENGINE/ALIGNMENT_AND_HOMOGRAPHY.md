# Alignment and Homography — Edge DocGraph Engine

**Purpose:** Define how a new document page is aligned to a saved TemplateGraph using page normalization, ORB/RANSAC, text anchors, geometry anchors, and local correction.

---

## 1. Alignment goal

Alignment maps template coordinates to the current document page.

It enables:

- ROI projection
- template field extraction
- asset crop extraction
- table region extraction
- template drift measurement

Alignment must be robust to:

- scale changes
- crop differences
- rotation
- perspective
- mild warping
- scan skew
- local shifts

---

## 2. Alignment flow

```text
normalized page
  → coarse alignment
  → global transform
  → alignment validation
  → local correction
  → ROI projection
  → drift report
```

---

## 3. Coordinate spaces

Alignment maps between:

```text
template canonical coordinates
  → current normalized page coordinates
  → current pixel coordinates
```

TemplateGraph stores normalized coordinates. New page extraction uses normalized coordinates.

---

## 4. Coarse alignment

Coarse alignment uses:

- page boundary
- orientation
- canonical scaling
- aspect ratio
- page index

If page normalization is strong, coarse alignment may be enough for simple scanned PDFs.

---

## 5. Global alignment methods

Use multiple possible methods.

### 5.1 Homography from document corners

Best when:

- document boundary is reliable
- photographed page has perspective distortion
- template and page boundaries correspond

Weakness:

- not enough for internal layout drift

### 5.2 ORB/RANSAC keypoint alignment

Best when:

- visual texture exists
- logos/form lines/background patterns exist
- page is not too blurry

Weakness:

- fails on plain text documents
- false matches possible
- low texture documents produce few keypoints

### 5.3 Text-anchor alignment

Best when:

- stable text anchors are detected
- OCR quality is acceptable
- document has labels/headers

Method:

```text
template text anchor positions
  ↔ observed text anchor positions
  → estimate affine/similarity transform
```

### 5.4 Geometry-anchor alignment

Best when:

- form lines/boxes/tables are stable
- OCR is weak
- document has structured layout

### 5.5 Hybrid alignment

Recommended:

```text
try page boundary
try text anchors
try geometry anchors
try keypoints
combine or select best validated transform
```

---

## 6. ORB/RANSAC flow

```text
template anchor image/thumbnail
  → detect ORB keypoints
current normalized page
  → detect ORB keypoints
match descriptors
  → ratio test
  → RANSAC homography
  → validate transform
```

Validation checks:

- enough inliers
- reasonable scale
- reasonable rotation
- corners map inside page
- known anchors land near expected positions
- ROIs are not distorted unrealistically

---

## 7. Text-anchor alignment flow

```text
template text anchors
  → OCR current page
  → match anchor strings/aliases
  → collect point pairs
  → estimate transform
  → validate using held-out anchors
```

Anchor matching should tolerate OCR noise.

Example:

```text
Template anchor: "Date of Birth"
Observed: "Date of Binh"
Fuzzy match if confidence acceptable and position plausible.
```

---

## 8. Local correction

A single global transform may not be enough.

Reasons:

- page curl
- camera perspective not perfectly corrected
- paper warping
- local scan distortions
- template version drift

Local correction uses nearby anchors.

Flow:

```text
for each projected ROI:
  find nearby observed anchors
  compute local shift
  adjust ROI
  expand ROI based on uncertainty
```

Example:

```text
Expected "DOB" anchor at [0.30, 0.42]
Observed "DOB" anchor at [0.31, 0.44]
Shift nearby DOB value ROI by [+0.01, +0.02]
```

---

## 9. Alignment result schema

```ts
type AlignmentResult = {
  templateId: string;
  pageId: string;

  globalTransform: {
    type: "homography" | "affine" | "similarity" | "identity";
    matrix: number[];
    confidence: number;
    source: "boundary" | "orb_ransac" | "text_anchor" | "geometry_anchor" | "hybrid";
  };

  localCorrections: Array<{
    regionId: string;
    shiftNorm: [number, number];
    confidence: number;
    anchorIds: string[];
  }>;

  validation: {
    passed: boolean;
    score: number;
    warnings: string[];
  };

  drift: AlignmentDriftSummary;
};
```

---

## 10. Alignment validation

Before ROI extraction, validate alignment.

Checks:

- anchors land near observed positions
- required regions remain inside page
- projected MRZ/photo/table locations plausible
- transform scale not extreme
- transform rotation not extreme
- local corrections not too large

If validation fails:

- downgrade template decision
- run unknown flow or new-version flow

---

## 11. Drift measurement

Drift indicates layout changes.

```ts
type AlignmentDriftSummary = {
  level: "none" | "low" | "medium" | "high";
  averageShiftNorm: number;
  maxShiftNorm: number;
  affectedRegions: string[];
  reasons: string[];
};
```

Drift informs versioning.

---

## 12. ROI projection

Projection uses:

1. global transform
2. local correction
3. ROI expansion
4. clamp to page bounds

Output:

```ts
type ProjectedRoi = {
  templateElementId: string;
  pageId: string;
  originalBoxNorm: NormalizedBox;
  projectedBoxNorm: NormalizedBox;
  expandedBoxNorm: NormalizedBox;
  projectionConfidence: number;
  transformIds: string[];
};
```

---

## 13. Alignment failure modes

### Low texture

ORB fails.

Mitigation:

- text anchors
- geometry anchors
- special zones

### OCR poor

Text anchors fail.

Mitigation:

- visual/geometry/keypoint anchors
- lower reliance on text
- run ROI OCR for anchors

### Wrong template

Alignment may produce bad transform.

Mitigation:

- validation checks
- required anchors
- verifier feedback

### Local warping

Global transform works but ROIs shifted.

Mitigation:

- local correction
- ROI expansion
- search nearby

---

## 14. Performance

Alignment should be cheaper than full unknown extraction.

Rules:

- use cheap candidate retrieval first
- only run keypoint matching on top candidates
- cache template descriptors
- use resized images for keypoints
- run expensive alignment in worker

---

## 15. Tests

Test:

- same template clean scan
- rotated image
- perspective photo
- cropped page
- skewed page
- low-texture form
- text-heavy invoice
- wrong template
- same family new version
- local shifted fields

Assertions:

- transform valid
- ROIs project correctly
- false alignments rejected
- drift reported

---

## 16. Final alignment rule

Alignment is not just ORB/RANSAC. It is a progressive, validated mapping using page geometry, text anchors, visual anchors, keypoints, and local correction. A transform is accepted only if it makes template extraction safer.
