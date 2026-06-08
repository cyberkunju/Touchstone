# Non-Goals — Edge DocGraph Engine

**Purpose:** Prevent scope explosion, unsafe claims, and wrong architecture decisions.  
**Rule:** If something is listed here, do not build it unless the product direction is formally changed.

---

## 1. Why non-goals matter

This project is ambitious. Without clear non-goals, it will become an unstable mix of OCR, VLM prompting, cloud tools, fraud detection, handwriting recognition, legal interpretation, and template hacks. That would destroy the product.

The core product is:

```text
local evidence graph
+ editable form generation
+ correction-driven TemplateGraph learning
+ verified ROI-first repeated extraction
```

Anything that distracts from this loop is out of scope until the core is excellent.

---

## 2. Not an OCR app

The product is not a simple OCR app.

It should not be defined by:

- “extract all text”
- “copy text from image”
- “scan and paste”
- “OCR to JSON only”

OCR is one evidence producer. The product must also handle visual assets, tables, codes, MRZ, checkboxes, relationships, validators, and user corrections.

---

## 3. Not a generic VLM wrapper

The product is not:

```text
upload image → send to vision-language model → ask for JSON
```

Reasons:

- too heavy for edge-only weak devices
- hallucination risk
- weak coordinate guarantees
- poor tiny-text reliability
- poor provenance
- poor template learning
- difficult local deployment

Heavy doc foundation models may be used for research, benchmarking, or offline teacher experiments, but not as the v1 runtime core.

---

## 4. Not cloud document AI

The product must not depend on:

- cloud OCR
- cloud VLMs
- server-side PDF parsing
- remote document storage
- remote template storage
- remote field extraction

Cloud processing violates the central privacy promise.

Future optional cloud sync is not part of the core and must never be required for extraction.

---

## 5. Not a fraud detection or authenticity verification product

The engine may detect conflicts, missing data, invalid checksums, barcode mismatches, or quality issues. It may mark a field as suspicious or requiring review.

It must not claim:

- this passport is genuine
- this ID is authentic
- this signature is legally valid
- this stamp proves authenticity
- this invoice is not fraudulent
- this document is legally verified

Authenticity verification is a separate high-risk domain.

---

## 6. Not a biometric identity system

The product may verify that a portrait crop contains a face.

It must not in v1:

- identify the person
- compare face against another photo
- perform face recognition
- perform liveness detection
- authenticate identity
- build face embeddings for recognition

Face detection is only crop sanity verification.

---

## 7. Not a legal, financial, tax, or medical advisor

The engine may extract fields from legal, financial, tax, or medical documents. It may validate formats and arithmetic.

It must not:

- provide legal advice
- interpret contract obligations with authority
- provide tax advice
- provide medical advice
- certify financial correctness beyond local arithmetic checks
- make compliance decisions automatically

Domain-specific advice is out of scope.

---

## 8. Not perfect arbitrary handwriting recognition

The v1 engine should not promise robust handwriting extraction.

It may:

- detect handwriting regions
- allow user correction
- store handwriting as an asset or uncertain text region
- support review-first workflows

It should not claim high-confidence handwriting OCR across arbitrary documents.

---

## 9. Not universal no-review extraction

The product must not promise:

> Upload any document and get perfect structured data automatically.

The honest promise is:

> Upload any document and get an evidence-backed editable form, with uncertainty and correction when needed. Repeated templates improve dramatically after correction.

Review is part of the product.

---

## 10. Not model fine-tuning after one correction

One-shot learning does not mean fine-tuning YOLO, OCR, or a neural model on the device after one user edit.

One-shot learning means:

- save corrected TemplateGraph
- save anchors
- save normalized ROIs
- save aliases
- save validators
- save relationships
- use ROI-first extraction next time

On-device model fine-tuning is out of scope.

---

## 11. Not a template hack system

Templates must not be implemented as simple hardcoded rectangles only.

A valid template must store:

- anchors
- field regions
- asset regions
- validators
- aliases
- relationships
- fingerprints
- version metadata

A system that only saves boxes will break on resolution, crop, skew, and layout drift.

---

## 12. Not a raw text export tool only

The product must not stop at:

- plain text
- markdown
- raw OCR dump
- unstructured JSON

Exports must preserve:

- field types
- evidence references
- coordinates
- confidence/status
- source crops
- table structure
- asset references
- validation results

---

## 13. Not a universal table understanding engine in v1

The product must support tables well enough for invoices/receipts/generic forms, but it should not promise perfect table extraction across all scientific papers, spreadsheets, bank statements, nested tables, and multi-page tables in v1.

Complex table support should grow through:

- geometric engine
- SLANet_plus trials
- correction UI
- template learning
- validators

---

## 14. Not a PDF editor

The app may render PDFs, extract text, create crops, and export structured data.

It is not:

- a full PDF editor
- a PDF signing tool
- a PDF redaction suite in v1
- a PDF layout authoring tool

Redaction may be a future feature.

---

## 15. Not a document management system

The app may store local documents and templates, but v1 is not:

- a full DMS
- a cloud drive
- a collaborative workspace
- an enterprise records manager
- a document approval workflow

Local storage exists to support extraction, templates, and review.

---

## 16. Not a template marketplace in v1

Template sharing/import may come later.

v1 should not include:

- public marketplace
- remote template registry
- paid template packs
- community template sync
- template ratings

First, local template creation must be excellent.

---

## 17. Not multi-user collaboration in v1

The product is local-first and single-user in v1.

Out of scope:

- live collaborative editing
- organization roles
- shared workspaces
- remote approvals
- multi-user template locking

---

## 18. Not mobile camera optimization first

The app may run in browser/PWA and accept images captured by mobile devices.

But v1 does not need a fully optimized mobile camera capture experience with live edge guidance, autofocus hints, motion detection, and camera overlays.

That can be added later.

---

## 19. Not every browser equally perfect

The system should strive for browser compatibility, but WebGPU, WASM threading, OffscreenCanvas, OPFS, and storage behavior vary.

The serious product path may use Tauri for predictable local execution.

The project should not promise identical performance in every browser.

---

## 20. Not fully automatic template updates

The system must not silently update templates after every document.

Template updates require:

- user intent
- validation
- versioning decision
- drift detection
- provenance

Automatic template mutation risks corrupting future extraction.

---

## 21. Not a black-box confidence system

The system must not show only:

```json
{ "confidence": 0.82 }
```

It must explain confidence:

- OCR confidence
- detector confidence
- template confidence
- validator result
- parser result
- cross-field consistency
- quality issues
- user correction history

Black-box confidence is out of scope.

---

## 22. Not unsafe logging

The system must not log raw OCR text, identity data, financial data, MRZ content, or asset crops in normal logs.

Debug exports must be explicit and user-controlled.

---

## 23. Not a benchmark-only research project

Although the project has research buckets, the main goal is a usable product.

Do not spend months swapping models if the DocGraph, correction UI, verifier, and TemplateGraph engine are not working.

Architecture and product loop matter more than model leaderboard chasing.

---

## 24. Non-goal enforcement

When a proposed feature appears, ask:

1. Does it support local evidence-backed document-to-form extraction?
2. Does it improve correction-driven TemplateGraph learning?
3. Does it reduce silent error?
4. Does it preserve privacy?
5. Does it keep the system edge-feasible?
6. Does it fit MVP scope?

If the answer is mostly no, it is out of scope.

---

## 25. Final non-goal statement

Do not build a magical black box. Do not build a cloud OCR clone. Do not build a fraud detector. Do not build a generic VLM wrapper. Build the local evidence graph engine first, make correction and template learning exceptional, and let document-type coverage expand from a strong core.
