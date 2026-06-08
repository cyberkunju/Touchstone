# Module Boundaries — Edge DocGraph Engine

**Purpose:** Define what each module is allowed and not allowed to do. This prevents spaghetti architecture, hidden truth sources, and untestable side effects.

---

## 1. Boundary philosophy

Each module must have:

- clear responsibility
- typed inputs
- typed outputs
- no hidden side effects
- no direct writes to unrelated layers
- explicit error behavior
- integration through DocGraph or defined interfaces

The most important boundary:

> Evidence producers produce evidence. They do not decide final truth.

---

## 2. Layer boundaries

```text
UI Layer
  ↕ typed actions/events
Orchestration Layer
  ↕ jobs/results
Input/Page Layer
  ↕ PageRecords/NormalizedPages
Evidence Producer Layer
  ↕ EvidenceRecords
DocGraph Layer
  ↕ Graph nodes/edges/hypotheses
Verification Layer
  ↕ statuses/validation results
Form Layer
  ↕ form schema/values/corrections
Template Layer
  ↕ TemplateGraph/match/alignment
Storage Layer
  ↕ persisted records/blobs
```

No layer should skip the layers that preserve evidence and provenance.

---

## 3. UI boundary

### UI may

- display documents
- display overlays
- display fields
- display evidence
- collect user corrections
- request actions
- show progress
- show errors
- trigger exports

### UI must not

- run heavy inference
- create final extracted fields from raw OCR
- decide field confirmation
- directly mutate TemplateGraph internals
- bypass correction evidence
- upload documents
- log sensitive OCR text unnecessarily

### UI output

- user action events
- correction requests
- template save/update/version decisions
- export requests

---

## 4. Orchestration boundary

### Orchestration may

- schedule jobs
- route work to workers
- load/unload models
- track progress
- cancel tasks
- coordinate pipeline stages
- handle worker errors

### Orchestration must not

- interpret document semantics
- create final field values
- silently swallow critical errors
- mutate DocGraph outside defined graph APIs
- decide template truth

### Orchestration output

- job results
- progress events
- structured errors
- worker status

---

## 5. Input Manager boundary

### Input Manager may

- accept file references
- detect file type
- create DocumentRecord
- create initial PageRecords
- route PDF/image work

### Input Manager must not

- run OCR
- run detector
- create fields
- save templates
- send files to server

---

## 6. PDF Processor boundary

### PDF Processor may

- render pages
- extract embedded text
- extract page dimensions
- create PDF text evidence
- create page image artifacts

### PDF Processor must not

- decide form fields
- overwrite OCR evidence
- treat embedded text as final truth
- send PDF to remote service

---

## 7. Page Normalizer boundary

### Page Normalizer may

- detect document boundary
- correct orientation
- deskew
- correct perspective
- normalize contrast
- produce quality report
- map coordinates

### Page Normalizer must not

- create semantic fields
- delete page evidence
- hide poor-quality warnings
- confirm values

---

## 8. Detector boundary

### Detector may

- detect document object candidates
- return classes, boxes, confidence
- provide model version
- create DetectionEvidence

### Detector must not

- create final form fields
- decide a field label/value relationship alone
- decide a signature is legally valid
- decide a document type with final certainty
- overwrite user corrections

Detector output is object evidence.

---

## 9. OCR boundary

### OCR engine may

- detect text
- recognize text
- return coordinates
- return confidence
- return alternatives
- run full-page or ROI OCR

### OCR engine must not

- create final fields directly
- decide that nearby text is definitely a label/value pair alone
- silently normalize critical values without recording raw text
- overwrite parser results

OCR output is text evidence.

---

## 10. Segmentation boundary

### Segmentation engine may

- refine asset masks
- create alpha crops
- produce mask evidence
- improve user-selected crops

### Segmentation engine must not

- run by default over every full page
- decide field semantics
- replace detector evidence without provenance
- make authenticity claims

---

## 11. Barcode parser boundary

### Barcode parser may

- decode QR/barcode/PDF417 payloads
- create CodeEvidence
- report parse success/failure
- link payload to code region

### Barcode parser must not

- overwrite printed fields automatically
- decide payload is trustworthy without verifier
- send payload to cloud

---

## 12. MRZ parser boundary

### MRZ parser may

- parse TD1/TD2/TD3
- normalize OCR-B confusions
- compute check digits
- produce parsed fields
- produce validation results

### MRZ parser must not

- confirm visual field values alone
- hide checksum failures
- replace user-corrected values silently
- authenticate document genuineness

---

## 13. Table engine boundary

### Table engine may

- detect/reconstruct table structure
- create rows/columns/cells
- assign OCR text to cells
- infer headers
- run arithmetic checks

### Table engine must not

- decide business meaning beyond structured table evidence
- silently discard ambiguous cells
- flatten tables without preserving structure
- bypass correction UI

---

## 14. Face verifier boundary

### Face verifier may

- detect face presence in a photo crop
- provide face box/keypoint evidence
- mark portrait crop as plausible

### Face verifier must not

- identify person
- compare faces
- authenticate identity
- store face embeddings for recognition

---

## 15. DocGraph boundary

### DocGraph may

- store evidence
- create nodes
- create edges
- store hypotheses
- store validation results
- store provenance
- support graph queries

### DocGraph must not

- run model inference
- render UI directly
- persist sensitive data without storage layer
- discard evidence because it is wrong

DocGraph is source of truth but not the UI or storage engine.

---

## 16. Hypothesis Generator boundary

### Hypothesis Generator may

- propose fields
- propose asset mappings
- propose tables
- propose label/value relations
- assign preliminary confidence

### Hypothesis Generator must not

- mark final confirmed status alone
- ignore conflicting evidence
- bypass validators
- create fields without evidence

---

## 17. Verifier boundary

### Verifier may

- run validators
- combine evidence
- assign statuses
- create reasons
- detect conflicts
- downgrade confidence

### Verifier must not

- mutate raw evidence
- edit user values
- save templates
- hide uncertainty

Verifier status controls form trust.

---

## 18. Form Generator boundary

### Form Generator may

- create form schema from hypotheses
- map values to controls
- group sections
- expose statuses
- link evidence

### Form Generator must not

- create fields from raw OCR outside hypotheses
- confirm fields
- decide template learning
- discard unresolved fields without trace

---

## 19. Correction Capture boundary

### Correction Capture may

- record user edits
- generate correction evidence
- patch DocGraph through graph APIs
- trigger re-verification
- request template save/update/version

### Correction Capture must not

- delete original evidence
- silently update templates
- bypass provenance
- learn variable values as anchors by default

---

## 20. TemplateGraph boundary

### TemplateGraph Engine may

- build templates from corrected DocGraphs
- store anchors
- store ROIs
- store aliases
- store validators
- match templates
- align pages
- project ROIs
- version templates

### TemplateGraph Engine must not

- store old document values as new values
- overwrite templates automatically
- create final field statuses without verifier
- ignore layout drift

---

## 21. Storage boundary

### Storage may

- persist records
- persist blobs
- encrypt sensitive data
- retrieve documents/templates/assets
- manage migrations

### Storage must not

- interpret document semantics
- create fields
- run validators
- expose sensitive data to logs
- mix model cache and private user data

---

## 22. Export boundary

### Export service may

- export form JSON
- export tables
- export assets
- export DocGraph
- export TemplateGraph
- create debug packages

### Export service must not

- hide field statuses
- strip evidence references silently
- export sensitive data without user action
- change values during export

---

## 23. Worker boundary

Workers may run heavy tasks.

Workers must:

- communicate through typed messages
- support cancellation where possible
- return structured errors
- avoid holding stale huge buffers
- transfer buffers when possible
- not access UI state directly

---

## 24. Model boundary

Models must be treated as replaceable.

A model module must expose:

```ts
initialize()
run()
dispose()
getVersion()
```

Model outputs must become EvidenceRecords.

Models must not:

- write directly to form
- assume global app state
- hide preprocessing assumptions
- skip version recording

---

## 25. Configuration boundary

Thresholds and feature flags must be centralized.

Examples:

- OCR confidence thresholds
- detector thresholds
- template match thresholds
- validator severity rules
- model paths
- runtime mode
- feature bucket toggles

Do not scatter thresholds in UI components.

---

## 26. Anti-patterns

Forbidden patterns:

### 26.1 Raw OCR to form

```text
OCR result → form field
```

Must instead be:

```text
OCR result → evidence → DocGraph → hypothesis → verifier → form
```

### 26.2 Detector truth

```text
Detector says signature → confirmed signature field
```

Must instead be:

```text
Detector says signature candidate → asset node → optional crop/mask → verifier/user review
```

### 26.3 Silent template overwrite

```text
User edits field → template auto-updates
```

Must instead be:

```text
User edits field → correction evidence → user chooses save/update/version
```

### 26.4 Lost provenance

```text
User corrects value → old OCR deleted
```

Must instead be:

```text
User correction added; original OCR preserved
```

### 26.5 Model-specific graph

The graph must not depend on one model’s output format. Normalize model output into evidence records.

---

## 27. Module acceptance checklist

Before a module is merged, verify:

- [ ] clear responsibility
- [ ] typed input/output
- [ ] no hidden final-truth writes
- [ ] evidence output where applicable
- [ ] provenance included
- [ ] error behavior documented
- [ ] tests exist
- [ ] privacy impact considered
- [ ] performance impact considered
- [ ] integration path through DocGraph

---

## 28. Final boundary rule

If a module cannot explain what evidence it produced, what data it consumed, and what layer is allowed to interpret its output, it does not belong in the architecture.
