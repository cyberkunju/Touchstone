# Segmentation Bucket — Edge DocGraph Engine

**Purpose:** Compare YOLOv11n-seg, EfficientSAM, SlimSAM-77, and MobileSAM for visual asset mask/crop refinement.

---

## 1. Why segmentation is in a bucket

Segmentation is useful but potentially expensive. It should not be overused.

The product needs clean visual asset extraction for:

- photos
- signatures
- stamps
- seals
- logos
- emblems
- flags
- symbols

But many use cases can work with detector boxes and user crop correction. Therefore, segmentation models must be benchmarked before becoming default.

---

## 2. Candidate summary

| Candidate | Role | Status |
|---|---|---|
| YOLOv11n-seg | class-specific masks if custom training works | primary candidate |
| EfficientSAM | promptable refinement for difficult assets | experiment |
| SlimSAM-77 | lightweight SAM-style refinement | experiment |
| MobileSAM | comparison/benchmark only | benchmark only |

---

## 3. Use cases to test

### 3.1 Signature extraction

Questions:

- Does the mask include all strokes?
- Does it exclude nearby printed text?
- Does it handle overlap with stamp?
- Is region crop more useful than stroke-only mask?

### 3.2 Stamp extraction

Questions:

- Does the mask capture full stamp?
- Does it handle low opacity?
- Does it handle overlap with text/signature?
- Does it preserve enough context?

### 3.3 Seal extraction

Questions:

- Does the model detect faint/embossed seals?
- Does mask improve export quality?
- Does it confuse seal and logo?

### 3.4 Photo extraction

Questions:

- Is detector box enough?
- Does mask help only for irregular photos?
- Does face detector validate crop?

### 3.5 Logo/emblem extraction

Questions:

- Does mask isolate graphic?
- Does it wrongly include surrounding text?
- Is raw crop better for evidence?

---

## 4. Benchmark datasets

Create a segmentation test set with:

- 100+ photos
- 100+ signatures
- 100+ stamps
- 100+ logos
- 50+ seals
- 50+ emblems/symbols
- overlapping stamp/signature cases
- low-quality scans
- camera photos
- photocopies
- synthetic documents

Each sample should have:

- ground-truth box
- ground-truth mask where practical
- asset type
- quality labels
- document family

---

## 5. Metrics

### 5.1 Mask IoU

Measures pixel-level mask quality.

### 5.2 Crop IoU

Measures crop box quality.

### 5.3 Asset usability score

Human review score:

- complete
- not cut off
- not too much background
- export usable
- evidence context preserved

### 5.4 Runtime

Measure:

- model load time
- inference time per asset
- memory peak
- WebGPU vs WASM behavior

### 5.5 Correction reduction

Does segmentation reduce manual crop corrections?

---

## 6. Candidate: YOLOv11n-seg

### Strengths

- same family as detector
- can output boxes and masks
- potentially fast
- class-specific
- trainable on our classes

### Risks

- needs mask annotations
- mask quality may be weak for fine signatures
- segmentation model may be slower than detector-only
- class-specific masks may struggle with unusual assets

### Best use

- known asset classes
- fast crop refinement
- documents with repeated template assets

### Graduation criteria

Promote if:

- mask quality is acceptable for signatures/stamps/photos
- latency is acceptable
- model size is acceptable
- integration is simpler than SAM-style refiners
- user crop corrections decrease

---

## 7. Candidate: EfficientSAM

### Strengths

- promptable segmentation
- useful for box-to-mask refinement
- may work on unusual assets
- good for user correction mode

### Risks

- runtime may be higher than YOLO-seg
- integration complexity
- prompt handling needed
- may require more memory

### Best use

- difficult assets
- user-selected crop refinement
- uncertain detector boxes
- rare asset types

### Graduation criteria

Promote to refinement tool if:

- improves mask quality significantly
- works on edge runtime
- does not hurt UX latency
- is stable under ONNX Runtime Web/Tauri

---

## 8. Candidate: SlimSAM-77

### Strengths

- lightweight SAM-style candidate
- potentially suitable for edge refinement
- useful for prompt-based masks

### Risks

- must benchmark actual browser/Tauri behavior
- mask quality unknown on document assets
- integration overhead

### Best use

- refinement trial
- compare against EfficientSAM
- edge mask quality testing

### Graduation criteria

Promote if it beats EfficientSAM or YOLO-seg on quality/runtime tradeoff.

---

## 9. Candidate: MobileSAM

### Status

Benchmark only.

### Why not primary

- not always-on
- prior concerns around browser stability/version behavior
- EfficientSAM/SlimSAM/YOLO-seg are more aligned with current plan

### Use

Run only as a reference comparison if needed.

---

## 10. Segmentation decision process

For each asset class, choose the simplest working method.

Example decision:

```text
photo:
  detector box + face verifier may be enough

signature:
  YOLO-seg if good
  else EfficientSAM/SlimSAM refinement
  else user crop correction

stamp:
  segmentation likely useful

logo:
  detector crop may be enough

seal:
  segmentation useful if seal is faint/irregular
```

Do not require one segmentation method for all asset types.

---

## 11. Runtime strategy

Segmentation should be lazy-loaded only when needed.

Trigger conditions:

- user requests clean crop
- detector confidence moderate
- asset overlaps other content
- export requires clean asset
- template field requires mask
- verifier says crop ambiguous

Avoid:

- loading segmentation model on simple OCR-only documents
- segmenting every detector box
- full-page mask generation

---

## 12. Integration with DocGraph

Segmentation output creates or updates:

- VisualAssetNode
- AssetEvidence
- MaskArtifact
- CropArtifact

It must preserve:

- raw detector crop
- refined mask crop
- source model version
- confidence
- user correction if any

---

## 13. Final segmentation bucket decision

Use YOLOv11n-seg as the first custom segmentation candidate. Keep EfficientSAM and SlimSAM-77 as serious trials for refinement. Do not use full-page segmentation by default. Promote a segmentation method only if benchmarks show better asset quality and lower correction burden without unacceptable edge cost.
