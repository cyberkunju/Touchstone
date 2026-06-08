# Visual Asset Pipeline — Edge DocGraph Engine

**Purpose:** Define extraction of photos, signatures, stamps, seals, logos, symbols, and masks as graph-backed visual evidence.

---

## 1. Pipeline goal

The visual asset pipeline extracts meaningful non-text document regions and turns them into evidence and form assets.

Target assets:

- portrait photo
- signature
- stamp
- seal
- logo
- emblem
- flag
- symbol
- watermark/security region where useful

---

## 2. High-level flow

```text
detector asset box
  → raw crop
  → optional segmentation
  → optional asset verification
  → VisualAssetEvidence
  → VisualAssetNode
  → field/asset hypothesis
  → form asset control
  → user crop correction
  → TemplateAsset save
```

---

## 3. Input sources

Asset candidates can come from:

- YOLOv11n detector
- template projected ROI
- user-drawn region
- PDF embedded image
- segmentation refinement
- future asset classifier

---

## 4. Asset evidence structure

```ts
type VisualAssetEvidence = {
  id: string;
  source:
    | "detector"
    | "segmentation"
    | "template_projection"
    | "user_correction"
    | "pdf_embedded_image";
  pageId: string;
  assetType:
    | "photo"
    | "signature"
    | "stamp"
    | "seal"
    | "logo"
    | "emblem"
    | "flag"
    | "symbol"
    | "watermark"
    | "unknown";
  boxNorm: NormalizedBox;
  rawCropId: string;
  maskId?: string;
  refinedCropId?: string;
  confidence: number;
  modelName?: string;
  modelVersion?: string;
};
```

---

## 5. Asset extraction modes

### 5.1 Detector box crop

Default method.

Use when:

- detector confidence is high
- rectangular crop is acceptable
- segmentation is not loaded
- speed matters

### 5.2 Template ROI crop

Used in known-template flow.

Use when:

- template expects asset
- alignment confidence is good
- asset position is stable

### 5.3 Segmentation refined crop

Use when:

- signature/stamp/seal needs clean mask
- asset overlaps text/background
- user exports asset
- crop quality matters

### 5.4 User corrected crop

Highest-trust crop for template learning.

---

## 6. Asset-specific rules

### 6.1 Photo / portrait

Extraction:

- detect photo region
- crop full photo rectangle
- run MediaPipe Face Detector
- mark portrait plausible if face present

Do not:

- perform face recognition
- compare identity
- store biometric embeddings

Status examples:

- face present + crop complete → confirmed/strong asset
- no face detected → needs_review
- crop cuts face → needs_review

### 6.2 Signature

Extraction:

- detector box
- optional segmentation
- preserve raw crop
- user can redraw region

Do not claim legal validity.

### 6.3 Stamp

Extraction:

- detector box
- optional segmentation
- OCR may read internal text separately
- stamp can overlap signature/text

If overlapping, store separate evidence nodes.

### 6.4 Seal

Extraction:

- similar to stamp but classed separately
- faint seals may need review
- avoid authenticity claims

### 6.5 Logo / emblem / flag

Extraction:

- crop visual region
- can become visual anchor
- useful for template matching

### 6.6 Symbol

Use for meaningful non-text symbols, but avoid overusing generic class in v1.

---

## 7. Crop artifacts

Store:

```ts
type CropArtifact = {
  id: string;
  pageId: string;
  sourceImageId: string;
  boxNorm: NormalizedBox;
  kind: "raw_crop" | "refined_crop" | "display_crop";
  blobRef: string;
};
```

If mask exists:

```ts
type MaskArtifact = {
  id: string;
  pageId: string;
  boxNorm: NormalizedBox;
  encoding: "png_alpha" | "rle" | "bitmap";
  blobRef: string;
};
```

---

## 8. Crop expansion rules

Suggested defaults:

- photo: 1–3%
- signature: 5–10%
- stamp: 5–10%
- seal: 5–10%
- logo: 3–5%
- symbol: 3–5%

Expansion should not cross page boundaries.

---

## 9. Segmentation rules

Segmentation is conditional.

Trigger segmentation when:

- asset class benefits from mask
- detector box is too loose
- asset overlaps background/text
- user requests refined crop
- export requires clean asset
- template asset quality is important

Do not segment:

- every page
- every text block
- every detected object
- by default on low-end devices

---

## 10. Asset-to-field mapping

Visual assets may become form fields.

Examples:

```text
photo → Portrait Photo field
signature → Signature field
stamp → Stamp field
seal → Seal field
logo → Organization Logo field
```

Mapping signals:

- asset class
- nearby labels
- template expectation
- document type
- user correction history

---

## 11. User correction

User can:

- redraw crop
- change asset type
- delete false asset
- assign asset to field
- split overlapping assets
- choose raw or refined crop
- save crop to template

Correction creates UserCorrectionEvidence.

---

## 12. TemplateGraph asset learning

TemplateAsset should store:

- asset type
- normalized region
- required/optional
- crop expansion rule
- segmentation preference
- visual anchor importance
- validator requirements

Example:

```json
{
  "id": "asset_signature",
  "assetType": "signature",
  "boxNorm": [0.62, 0.71, 0.84, 0.78],
  "required": false,
  "segmentation": "optional",
  "validator": "asset_present"
}
```

---

## 13. Verification

Asset validators:

- asset present
- crop completeness
- detector confidence
- template region match
- face presence for portrait
- no face expected for non-photo
- user confirmed crop

Statuses:

- confirmed
- needs_review
- missing
- invalid

---

## 14. Failure modes

### False asset

Example: logo detected as seal.

Mitigation:

- user correction
- verifier
- training data

### Missing asset

Example: faint signature missed.

Mitigation:

- user add region
- template memory
- lower threshold for known ROI

### Bad crop

Example: signature cut off.

Mitigation:

- expansion
- segmentation
- user redraw

### Overlap

Example: stamp over signature.

Mitigation:

- multiple nodes
- separate crops
- user correction

---

## 15. Tests

Test assets:

- clear photo
- photo with glare
- signature
- stamp over text
- seal
- logo
- multiple signatures
- missing expected signature
- false-positive logo/seal

Assertions:

- crop artifact exists
- coordinates valid
- evidence source present
- UI can correct crop
- TemplateGraph stores corrected region

---

## 16. Final visual asset rule

Visual assets are first-class document evidence. They are not OCR attachments. Every asset must preserve crop, coordinates, type, evidence source, and correction history.
