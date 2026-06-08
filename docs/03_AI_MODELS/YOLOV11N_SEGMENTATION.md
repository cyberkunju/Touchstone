# YOLOv11n Segmentation — Edge DocGraph Engine

**Purpose:** Define how YOLOv11n-seg may be used for visual asset masks, crop refinement, and document asset isolation.

---

## 1. Role in the system

YOLOv11n-seg is the first segmentation candidate for known document visual asset classes.

It should produce masks for:

- photos
- signatures
- stamps
- seals
- logos
- emblems
- flags
- symbols

Segmentation is not required for every document object. It is used when exact asset isolation improves the product.

---

## 2. Segmentation philosophy

Segmentation answers:

> “Which pixels belong to this detected visual asset?”

It does not answer:

> “What is the final semantic field?”
> “Is this stamp authentic?”
> “Is this signature valid?”
> “Should this field be confirmed?”

Segmentation output is visual evidence.

---

## 3. When to use segmentation

Use segmentation for:

- user-visible asset crops
- signatures with irregular boundaries
- stamps/seals with circular or irregular shapes
- logos on noisy backgrounds
- overlapping visual assets
- crop refinement after detector box
- user correction mode

Do not use segmentation for:

- every text block
- every page by default
- all fields on unknown documents
- full-page SAM-like exploration

---

## 4. Candidate classes for masks

### v1 mask classes

| Class | Need |
|---|---|
| `photo` | portrait/photo crop refinement |
| `signature` | isolate signature strokes or signature region |
| `stamp` | isolate stamp mark from background |
| `seal` | isolate official seal |
| `logo` | cleaner logo crop |

### v2 mask classes

| Class | Need |
|---|---|
| `emblem` | country/issuer emblem crop |
| `flag` | country/flag symbol crop |
| `symbol` | generic symbol extraction |
| `watermark` | optional background mark extraction |

---

## 5. Detection + segmentation relationship

Two possible designs:

### 5.1 Unified YOLOv11n-seg

One model outputs boxes and masks.

Pros:

- simpler stack
- one inference session
- consistent classes
- faster if model is small enough

Cons:

- may be slower than detection-only
- mask quality may be insufficient for fine signatures
- training data requires masks

### 5.2 Detector first, segmentation refinement second

YOLOv11n detects boxes. A segmentation model refines selected boxes.

Pros:

- detection remains fast
- masks only computed when needed
- can use EfficientSAM/SlimSAM for difficult assets

Cons:

- more components
- more orchestration complexity

Recommended approach:

```text
Start with detector boxes.
Trial YOLOv11n-seg for assets.
Keep EfficientSAM/SlimSAM for refinement comparison.
```

---

## 6. Mask annotation guidelines

Mask annotation is expensive. Use it where it matters.

### 6.1 Photo

Mask can be rectangular if the photo is rectangular. If the photo has rounded corners or background clipping, mask visible photo area.

### 6.2 Signature

Mask either:

- signature stroke pixels, or
- full signature region

Choose one policy and stay consistent. For form extraction, full signature region may be more useful than stroke-only.

### 6.3 Stamp

Mask visible stamp ink/mark area. If stamp overlaps text/signature, annotate stamp region as best as possible.

### 6.4 Seal

Mask visible seal boundary. Include embossed/printed visible mark.

### 6.5 Logo

Mask logo graphic. Avoid including surrounding address text unless inseparable.

---

## 7. Output structure

Segmentation output should become:

```ts
type SegmentationEvidence = {
  id: string;
  pageId: string;
  assetType: string;
  boxNorm: NormalizedBox;
  maskId: string;
  cropId: string;
  confidence: number;
  modelName: "yolov11n-seg-doc";
  modelVersion: string;
};
```

The mask should be stored as:

- compressed bitmap
- polygon approximation
- RLE
- alpha PNG
- implementation-defined mask artifact

But it must map back to page coordinates.

---

## 8. Crop rules

### 8.1 Box crop

Use detector box when:

- mask unavailable
- asset is rectangular
- segmentation confidence is low
- speed is more important than pixel-level mask

### 8.2 Mask crop

Use segmentation mask when:

- asset overlaps background
- signature/stamp needs clean extraction
- user will export asset
- template requires exact visual crop

### 8.3 Crop expansion

Expand boxes slightly to avoid cutting off edges.

Suggested:

- photo: 1–3%
- signature: 5–10%
- stamp/seal: 5–10%
- logo: 3–5%

Clamp to page boundaries.

---

## 9. Asset isolation rules

Do not over-clean assets in a way that loses evidence.

For legal/document review, sometimes background context matters. Store both:

- raw crop
- refined mask crop

Example:

```ts
type AssetCropSet = {
  rawCropId: string;
  maskCropId?: string;
  displayCropId: string;
};
```

---

## 10. User correction integration

If user adjusts a crop:

1. create UserCorrectionEvidence
2. update VisualAssetNode
3. store corrected crop
4. if saved, update TemplateAsset region
5. do not discard original detected/masked crop

User-corrected crop has high trust for template learning.

---

## 11. Benchmarking

Measure:

- mask IoU
- crop IoU
- asset recall
- asset precision
- user crop correction rate
- runtime
- memory
- export usability
- downstream template extraction improvement

Benchmark per asset class.

### Important metrics

- signature mask usability
- stamp/seal mask usability
- portrait crop completeness
- logo crop cleanliness
- false asset masks per page

---

## 12. Failure modes

### Over-segmentation

Mask includes background or unrelated text.

Mitigation:

- better mask labels
- crop expansion + raw crop
- verifier/user review

### Under-segmentation

Mask cuts off part of signature/stamp/logo.

Mitigation:

- expansion
- user correction
- class-specific training

### Wrong class mask

Example:

- stamp classified as seal
- logo classified as emblem

Mitigation:

- class data
- UI correction
- TemplateGraph aliases

### Runtime too slow

Mitigation:

- run only on selected assets
- use detection-only crop by default
- model lazy loading
- benchmark EfficientSAM/SlimSAM alternatives

---

## 13. Relationship to verifier

Segmentation quality affects asset status.

Examples:

- mask confidence high + detector confidence high → confirmed asset candidate
- mask cuts off signature → needs_review
- photo crop has no face → needs_review/invalid
- user corrects crop → user_confirmed asset

---

## 14. When not to segment

Avoid segmentation when:

- asset box is already clean
- asset is only for internal evidence
- page is low-memory device
- user has not requested asset export
- known template region is stable
- processing time is critical

---

## 15. Final segmentation rule

Segmentation is a precision tool, not the main extraction engine. Use it conditionally to improve visual asset quality. The DocGraph must store raw crop, mask crop, source coordinates, and evidence provenance.
