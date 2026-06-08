# Augmentation Rules — Edge DocGraph Engine

**Purpose:** Define document-specific augmentations: blur, glare, shadow, crop, compression, folds, stains, skew, perspective, rotation, noise, low resolution, and annotation transformation.

---

## 1. Why document-specific augmentation matters

Generic computer vision augmentations are not enough.

Real document scans fail because of:

- blur
- glare
- shadows
- skew
- perspective
- low DPI
- compression
- folds
- stains
- partial crop
- overexposure
- underexposure
- photocopy artifacts
- camera noise

The dataset must teach models and verifiers these failure modes.

---

## 2. Augmentation principles

1. Every augmentation must update boxes/masks when geometry changes.
2. Quality tags must record applied degradation.
3. Augmentations must be realistic.
4. Do not over-augment until text becomes impossible unless generating hard cases.
5. Keep clean validation/test subsets.
6. Hard test augmentations must be separate from training recipes.
7. Augmentation version must be recorded.

---

## 3. Augmentation metadata

```json
{
  "augmentationVersion": "0.1.0",
  "applied": [
    {
      "type": "perspective",
      "params": { "strength": 0.08 }
    },
    {
      "type": "jpeg_compression",
      "params": { "quality": 45 }
    }
  ],
  "qualityTags": ["perspective", "jpeg_compression"]
}
```

---

## 4. Geometric augmentations

### 4.1 Rotation

Range:

- small scan rotation: -5° to +5°
- hard case: -15° to +15°
- orientation test: 90°, 180°, 270°

Update boxes/polygons/masks.

### 4.2 Perspective warp

Simulates camera photo.

Parameters:

- corner displacement
- vertical/horizontal skew
- projective transform

Must update all coordinates.

### 4.3 Crop

Types:

- mild crop
- partial document crop
- background included
- edge cut-off

Quality tags:

- crop_incomplete
- background_visible

### 4.4 Scale / resolution

Generate:

- high DPI
- medium DPI
- low DPI
- tiny text cases

Record effective text height if possible.

---

## 5. Blur augmentations

### 5.1 Gaussian blur

Simulates defocus.

Levels:

- mild
- medium
- severe

### 5.2 Motion blur

Simulates hand motion.

Parameters:

- angle
- length
- intensity

### 5.3 Local blur

Blur only selected regions.

Useful for verifier tests:

- passport number blurred
- expiry date blurred
- table total blurred

Region-level quality tag required.

---

## 6. Lighting augmentations

### 6.1 Shadow

Generate:

- edge shadow
- hand/object shadow
- fold shadow
- uneven illumination

### 6.2 Glare

Generate bright reflective patches.

Important for:

- ID/passport photos
- glossy documents
- laminated cards

Region-level tag if glare overlaps fields.

### 6.3 Overexposure/underexposure

Change brightness/contrast.

Avoid making all text impossible except hard cases.

---

## 7. Noise augmentations

Types:

- Gaussian noise
- sensor noise
- speckle
- scanner noise
- salt/pepper
- photocopy noise

Use carefully; too much noise can teach unrealistic features.

---

## 8. Compression augmentations

### JPEG compression

Quality levels:

- 90 mild
- 70 medium
- 40 hard
- 20 extreme hard

### Resave artifacts

Simulate messaging-app compression.

Track:

- compression quality
- rescale size
- color subsampling if used

---

## 9. Physical document augmentations

### Folds

Simulate:

- fold lines
- brightness discontinuity
- shadow along fold
- slight warp

### Stains

Simulate:

- coffee stains
- watermarks
- dirt marks
- smudges

### Wrinkles

Simulate local warping and shadows.

### Torn/cut edge

Use sparingly for hard tests.

---

## 10. Print/scan augmentations

- photocopy effect
- low contrast print
- faded thermal receipt
- dot matrix noise
- scanner streaks
- paper texture
- bleed-through

Receipts need thermal/fade augmentation.

---

## 11. Text-specific augmentations

Avoid corrupting text labels in a way that ground truth becomes impossible unless hard case.

Useful:

- slight ink spread
- low contrast
- small text downscale
- anti-alias variations
- font variations
- vertical/rotated text cases

---

## 12. Asset-specific augmentations

For signatures/stamps/seals:

- opacity changes
- rotation
- overlap with text
- partial stamp
- faded ink
- blur
- color variation if color allowed

For photos:

- glare
- contrast change
- blur
- crop inside photo region
- print halftone

---

## 13. Table-specific augmentations

- faint lines
- missing ruling lines
- borderless tables
- column spacing variation
- row height variation
- merged cells
- skewed table
- low contrast grid

These are critical for table engine evaluation.

---

## 14. Augmentation severity sets

### Clean

No augmentation or minimal.

### Normal

Realistic mobile scan.

### Hard

Difficult but still usable.

### Extreme

For robustness testing, not default training.

```text
clean
normal
hard
extreme
```

Do not train only on extreme cases.

---

## 15. Annotation transformation

Geometry-changing augmentations must transform:

- bounding boxes
- polygons
- masks
- table cells
- OCR boxes
- field ROIs
- anchors

After transformation:

- clip to image bounds,
- drop boxes with too little visible area only if policy says,
- mark partial if cropped.

---

## 16. Verifier hard cases

Generate targeted augmentations:

- glare over DOB
- blur over passport number
- crop missing signature
- QR code partly damaged
- table total compressed
- MRZ line blurred
- checkbox mark faint

These test uncertainty UI and silent-error policy.

---

## 17. Training vs evaluation augmentations

Training augmentations:

- broad realistic variation

Validation augmentations:

- representative, not too random

Hard test augmentations:

- fixed and reproducible
- not used in training
- designed to expose failures

---

## 18. Tests

Augmentation tests:

- deterministic seed
- boxes remain valid
- masks transformed
- text ground truth preserved
- quality tags added
- local region tags correct
- no split leakage from generated variants

---

## 19. Final rule

Augmentation must model real document failure modes, not random image chaos. It should improve robustness and verifier honesty, not train the system to hallucinate through unreadable scans.
