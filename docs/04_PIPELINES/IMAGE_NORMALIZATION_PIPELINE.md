# Image Normalization Pipeline — Edge DocGraph Engine

**Purpose:** Define boundary detection, deskew, perspective correction, contrast normalization, orientation handling, quality analysis, and coordinate mapping.

---

## 1. Pipeline goal

The image normalization pipeline turns raw page images into canonical, quality-scored, coordinate-mapped pages ready for evidence extraction.

It must produce:

- normalized page image
- quality report
- page transforms
- coordinate mapping functions
- warnings when extraction is unsafe

---

## 2. High-level flow

```text
raw page image
  → decode / load bitmap
  → quality pre-check
  → orientation detection
  → document boundary detection
  → perspective correction
  → deskew
  → contrast/shadow normalization
  → final quality report
  → normalized page artifact
  → coordinate transforms
```

---

## 3. Input

Input can come from:

- uploaded image
- rendered PDF page
- camera capture later

Input artifact:

```ts
type PageImageInput = {
  pageId: string;
  imageId: string;
  widthPx: number;
  heightPx: number;
  source: "uploaded_image" | "pdf_render";
};
```

---

## 4. Output

```ts
type NormalizedPageOutput = {
  pageId: string;
  normalizedImageId: string;
  originalWidthPx: number;
  originalHeightPx: number;
  normalizedWidthPx: number;
  normalizedHeightPx: number;
  canonicalWidth: 1000;
  canonicalHeight: number;
  transforms: PageTransform[];
  quality: PageQualityReport;
};
```

---

## 5. Quality pre-check

Before expensive work, check:

- image dimensions
- total pixels
- aspect ratio
- extreme darkness/brightness
- obvious corruption
- alpha/transparent issues

If image is too large:

- downscale for preview
- use tiled or staged processing
- warn user if memory risk

---

## 6. Orientation detection

Orientation sources:

1. EXIF orientation where available
2. PDF page rotation
3. OCR orientation cues
4. layout geometry
5. PP-LCNet orientation classifier trial

Orientation output:

```ts
type OrientationResult = {
  angle: 0 | 90 | 180 | 270;
  confidence: number;
  source: "exif" | "pdf" | "ocr" | "geometry" | "pp_lcnet" | "user";
};
```

Rule:

If orientation confidence is low, do not confirm critical fields without review.

---

## 7. Document boundary detection

Boundary detection attempts to find the visible document/page/card.

Methods:

- edge detection
- contour detection
- quadrilateral approximation
- largest page-like region
- white/contrast boundary detection
- document_page detector evidence if available

Output:

```ts
type BoundaryResult = {
  corners?: [Point, Point, Point, Point];
  box?: Box;
  confidence: number;
  source: "opencv" | "detector" | "pdf_page" | "none";
  warnings: string[];
};
```

For PDF-rendered pages, the page boundary may be known and no correction is needed.

---

## 8. Perspective correction

If reliable corners exist:

```text
corners → homography → warped normalized page
```

If corners are unreliable:

- keep original rectangular image
- store warning
- run extraction cautiously

Do not aggressively warp if confidence is poor. Bad warping can destroy OCR accuracy.

---

## 9. Deskew

Deskew sources:

- detected text line angle
- Hough line detection
- table lines
- document boundary
- OCR orientation

Deskew output:

```ts
type DeskewResult = {
  angleDegrees: number;
  confidence: number;
};
```

---

## 10. Contrast and shadow normalization

Use careful preprocessing. Overprocessing can damage text and visual evidence.

Possible operations:

- grayscale conversion for analysis
- adaptive threshold for geometry only
- CLAHE for OCR crops
- mild denoise
- shadow estimation
- brightness/contrast normalization

Rule:

Store original/normalized artifacts separately. Do not destroy original evidence.

---

## 11. Blur detection

Measure:

- Laplacian variance
- local sharpness
- text-region sharpness later

Output:

```ts
type QualitySignal = {
  score: number;
  level: "good" | "warning" | "bad";
  reason?: string;
};
```

Blur affects verification.

---

## 12. Glare and exposure detection

Detect:

- overexposed regions
- saturated highlights
- dark shadows
- low contrast zones

If glare overlaps a critical field region later, verifier should mark needs_review.

---

## 13. Resolution and DPI estimation

Estimate effective resolution:

- pixels per page width
- text height estimates after OCR
- PDF render scale

Warnings:

- low DPI
- tiny text likely unreadable
- high-resolution image may require downscale

---

## 14. Canonical coordinate system

Every normalized page must use canonical coordinates.

Recommended:

```text
canonical_width = 1000
canonical_height = proportional
```

Store mappings:

```text
original pixels ↔ normalized pixels ↔ normalized [0,1] ↔ viewer
```

Coordinates must be typed.

---

## 15. PageQualityReport

```ts
type PageQualityReport = {
  blur: QualitySignal;
  glare: QualitySignal;
  contrast: QualitySignal;
  resolution: QualitySignal;
  cropCompleteness: QualitySignal;
  perspective: QualitySignal;
  orientation: QualitySignal;
  safeToExtract: boolean;
  warnings: string[];
};
```

---

## 16. Normalization profiles

Use different profiles depending on source.

### 16.1 PDF-rendered page

- no boundary correction unless needed
- use page dimensions
- maybe deskew not needed
- focus on render quality

### 16.2 Scanned flatbed page

- deskew
- contrast
- line preservation

### 16.3 Phone camera photo

- boundary detection
- perspective correction
- glare/shadow
- crop completeness

### 16.4 ID/passport card photo

- document boundary
- perspective correction
- small-text preservation
- photo glare warning

---

## 17. Error handling

If normalization fails:

- keep original page image
- mark quality warning
- allow review-first extraction
- do not stop unless image unusable

If page is unusable:

- show rescan message
- do not produce confirmed critical fields

---

## 18. Integration with evidence extraction

Evidence extraction receives:

- normalized page image
- quality report
- transform records
- coordinate mapper

Detector/OCR outputs must be mapped back into normalized coordinates and optionally original pixel coordinates.

---

## 19. Tests

Test images:

- clean scan
- rotated image
- skewed scan
- perspective photo
- dark image
- glare image
- blurry image
- partial crop
- low resolution
- PDF rendered page

Assertions:

- normalized artifact created
- transform stored
- warnings created
- coordinates map correctly
- no crashes on bad images

---

## 20. Pipeline invariants

1. Preserve original image.
2. Store normalized image separately.
3. Store transforms.
4. Never confirm fields solely because normalization succeeded.
5. Bad quality affects verifier.
6. Coordinate mapping must be deterministic.
7. Do not overprocess images destructively.

---

## 21. Final summary

Image normalization prepares documents for extraction while preserving trust. It improves OCR/detection quality, records page quality, creates canonical coordinates, and ensures every later evidence item can be mapped back to the original document.
