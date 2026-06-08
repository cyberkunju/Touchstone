# Rejected Models and Approaches — Edge DocGraph Engine

**Purpose:** Document what is rejected, why it is rejected, and what conditions might change the decision.

---

## 1. Rejection philosophy

A model or approach is rejected when it conflicts with core product constraints:

- local-only processing
- edge feasibility
- coordinate evidence
- low silent-error risk
- template learning
- verifier-driven trust
- maintainable open-source architecture

A rejected model may still be useful for research, but it must not become runtime core unless the decision is reopened with benchmarks.

---

## 2. Rejected as runtime core

### 2.1 Single giant VLM

**Status:** Rejected as runtime core.

**Why:**

- too heavy for weak edge devices
- hallucination risk
- weak coordinate guarantees
- hard to extract precise visual assets
- slow repeated extraction
- not aligned with ROI-first templates
- harder to audit

**Allowed use:**

- research
- teacher labels
- optional future desktop mode

---

### 2.2 Cloud OCR / cloud document AI

**Status:** Fully rejected for core product.

**Why:**

- violates no-cloud requirement
- sensitive documents leave device
- privacy promise breaks
- user trust reduced
- offline use impossible

---

### 2.3 Tesseract.js

**Status:** Rejected.

**Why:**

- redundant with PP-OCRv5
- weaker fit for modern dense documents
- adds output inconsistency
- not needed as fallback

**Note:** The project avoids redundant fallback OCR engines.

---

### 2.4 Native BarcodeDetector

**Status:** Rejected as primary.

**Why:**

- inconsistent browser support
- runtime behavior differs by platform
- product needs predictable local code parsing

**Chosen instead:**

- zxing-wasm / ZXing-C++ WASM

---

### 2.5 Old ZXing JS wrapper

**Status:** Rejected as main path.

**Why:**

- prefer modern ZXing-C++ WASM wrapper
- better aligned with cross-runtime local use

---

### 2.6 Full-page SAM by default

**Status:** Rejected.

**Why:**

- too expensive
- unnecessary for most pages
- not edge-friendly
- visual assets can be segmented conditionally
- user correction can handle remaining cases

**Allowed:**

- asset-specific segmentation
- user-triggered refinement
- experiment bucket models

---

### 2.7 MobileSAM as always-on segmentation

**Status:** Rejected.

**Why:**

- not always-on
- segmentation should be conditional
- other candidates may be better for our workflow

**Allowed:**

- benchmark comparison only

---

### 2.8 EdgeSAM

**Status:** Rejected.

**Why:**

- license/use restrictions or uncertainty are not worth it
- alternatives exist

---

### 2.9 Table Transformer / TATR as default browser table model

**Status:** Rejected as default.

**Why:**

- too heavy for v1 edge runtime
- still needs OCR integration
- custom geometric engine + SLANet_plus trial is better path

**Allowed:**

- research comparison

---

### 2.10 Docling as runtime core

**Status:** Rejected.

**Why:**

- useful reference/framework, but not our browser-edge core
- does not replace DocGraph/TemplateGraph/verifier
- not designed as our local interactive form-learning engine

---

### 2.11 GLM-OCR / DeepSeek-OCR as runtime core

**Status:** Rejected.

**Why:**

- heavy
- generative variability
- weak browser-edge fit
- less direct coordinate/crop evidence
- not needed for ROI-first extraction

**Allowed:**

- teacher/benchmark/research

---

### 2.12 Neural model fine-tuning after one correction

**Status:** Rejected.

**Why:**

- slow
- unstable
- not feasible on weak devices
- unnecessary
- may overfit
- hard to audit

**Chosen instead:**

- TemplateGraph learning

---

### 2.13 SVD-only template matching

**Status:** Rejected.

**Why:**

- too brittle
- fails on visually similar but semantically different documents
- fails under lighting/crop changes
- not enough for template safety

**Chosen instead:**

- multi-signal scoring: text anchors, visual anchors, geometry, keypoints, special zones, validators

---

### 2.14 Fixed global confidence threshold

**Status:** Rejected.

**Why:**

- confidence meaning differs by field type, template, model, parser, and document quality
- global thresholds cause both over-review and silent errors

**Chosen instead:**

- calibrated verifier rules per field/template/validator

---

## 3. Rejected product claims

### 3.1 “Perfect extraction of any document”

Rejected because “any document” requires uncertainty.

Correct claim:

> Any document can be converted into an evidence-backed editable form, with uncertainty and correction when needed.

### 3.2 “Authenticity verification”

Rejected.

The system extracts and validates visible evidence. It does not certify authenticity.

### 3.3 “Face identity verification”

Rejected.

The system may verify face presence in a crop, not identity.

### 3.4 “Legal/medical/financial advice”

Rejected.

The system extracts data; it does not give domain advice.

---

## 4. Rejected architecture patterns

### 4.1 Raw OCR to form

Rejected pattern:

```text
OCR result → form
```

Correct pattern:

```text
OCR result → evidence → DocGraph → hypothesis → verifier → form
```

### 4.2 Detector to final asset truth

Rejected pattern:

```text
detector says signature → confirmed signature
```

Correct pattern:

```text
detector says signature candidate → DocGraph asset node → verifier/user review
```

### 4.3 Parser overwrites visual field

Rejected pattern:

```text
MRZ parsed DOB replaces visual DOB silently
```

Correct pattern:

```text
MRZ parsed DOB and visual DOB become evidence.
Verifier confirms or flags conflict.
```

### 4.4 Template auto-overwrite

Rejected pattern:

```text
new document differs → update template automatically
```

Correct pattern:

```text
detect drift → suggest new version → user confirms
```

---

## 5. Reopen criteria

A rejected model/approach can be reconsidered only if:

1. it runs locally,
2. it improves metrics,
3. it preserves evidence,
4. it provides coordinates or can be mapped to coordinates,
5. it does not increase silent errors,
6. it fits edge performance,
7. it integrates with DocGraph,
8. it does not violate privacy,
9. it has a clear maintenance story.

---

## 6. Final rejection summary

The rejected items are mostly rejected because they bypass evidence, trust, edge constraints, or template learning. The product should not chase flashy model demos at the cost of reliability. The safest path is local specialist evidence producers feeding a DocGraph and verifier.
