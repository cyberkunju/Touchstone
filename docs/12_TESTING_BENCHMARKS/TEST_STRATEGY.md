# Test Strategy — Edge DocGraph Engine

**Purpose:** Define the complete testing strategy for unit tests, integration tests, model tests, UI tests, performance tests, security tests, privacy tests, and release gates.

---

## 1. Testing philosophy

This project must not be tested like a normal OCR app.

It is a local document intelligence engine with:

- local model inference
- OCR
- document object detection
- visual asset extraction
- barcode/MRZ parsing
- table extraction
- DocGraph construction
- TemplateGraph learning
- verifier rules
- correction UI
- local storage
- privacy/security requirements
- edge runtime constraints

The primary testing goal is not just “does it extract something?”

The primary testing goal is:

```text
Does it extract evidence-backed data, expose uncertainty, avoid silent wrong answers, and improve safely after correction?
```

---

## 2. Test pyramid

Recommended layers:

```text
Unit tests
  → schema tests
  → parser/validator tests
  → geometry tests
  → utility tests

Integration tests
  → pipeline tests
  → DocGraph tests
  → template tests
  → verifier tests

Model tests
  → detector
  → OCR
  → segmentation
  → table
  → barcode/MRZ

UI tests
  → viewer
  → form renderer
  → correction UI
  → evidence viewer
  → template save UI

End-to-end tests
  → upload document
  → extract
  → review
  → correct
  → save template
  → process repeated document
  → export

Performance tests
  → latency
  → memory
  → model load
  → worker throughput

Security/privacy tests
  → no-cloud behavior
  → export/import safety
  → XSS
  → encryption
  → storage deletion
```

---

## 3. Critical quality principle

The system must prefer:

```text
needs_review
```

over:

```text
wrong confirmed value
```

Therefore tests must include:

- wrong values,
- conflicts,
- unreadable scans,
- bad OCR,
- wrong template matches,
- invalid MRZ,
- invalid table totals,
- QR payload mismatches.

A test suite with only clean documents is dangerous.

---

## 4. Unit tests

### 4.1 Schema tests

Test:

- DocGraph schema
- TemplateGraph schema
- EvidenceRecord schema
- FieldHypothesis schema
- ValidationResult schema
- Export manifest schema

Assertions:

- valid records pass,
- invalid records fail,
- required fields enforced,
- references valid,
- version fields present.

### 4.2 Geometry tests

Test:

- normalized coordinate conversion
- box intersection/IoU
- polygon transforms
- homography projection
- ROI expansion
- clamp to page bounds
- table cell containment
- local alignment shift

### 4.3 Parser tests

Test:

- date parser
- amount parser
- currency parser
- ID parser
- email/phone parser
- MRZ parser
- barcode payload parser
- table arithmetic parser

### 4.4 Validator tests

Test each validator independently:

- pass
- warning
- fail
- not applicable
- missing evidence
- malformed input

---

## 5. Integration tests

### 5.1 Upload pipeline

Test:

- image upload
- PDF upload
- unsupported file
- corrupt file
- password PDF
- large file rejection/handling

### 5.2 Unknown-document pipeline

Test:

```text
image/PDF
  → normalize
  → detect
  → OCR
  → parse
  → build DocGraph
  → generate form
  → verify
```

Assertions:

- graph valid,
- evidence exists,
- statuses assigned,
- uncertain fields visible.

### 5.3 Known-template pipeline

Test:

```text
template exists
  → match
  → align
  → project ROI
  → extract
  → verify
  → fill form
```

Assertions:

- correct template selected,
- ROI projection valid,
- current values extracted,
- no old template values copied,
- validators run,
- drift handled.

### 5.4 Correction pipeline

Test:

- label edit
- value edit
- type change
- region redraw
- asset crop correction
- table edit
- checkbox edit
- conflict resolution
- field rejection

Assertions:

- CorrectionEvent created,
- DocGraph patched,
- validators rerun,
- UI status updated,
- template save candidate updated.

---

## 6. Model tests

Models need their own acceptance tests.

Model tests must cover:

- accuracy
- false positives
- false negatives
- browser runtime compatibility
- ONNX export compatibility
- latency
- memory
- hard cases

Model output must be tested as evidence, not final truth.

---

## 7. Verifier tests

Verifier tests are release-critical.

Test:

- confirmed field
- needs_review field
- missing required field
- invalid field
- conflict field
- unsupported field
- user override
- template drift
- low-quality scan
- bad OCR confidence

Assertions:

- correct status,
- evidence IDs preserved,
- reasons generated,
- export respects status.

---

## 8. UI tests

Use component and end-to-end tests.

Test:

- document viewer overlays
- field selection
- evidence viewer
- form renderer
- correction controls
- conflict UI
- table editor
- template save UI
- export warning
- accessibility labels
- keyboard navigation

UI tests must verify uncertainty is visible.

---

## 9. Security/privacy tests

Test:

- no network call during extraction
- no OCR text in logs
- no raw PII in debug logs
- export warnings
- template export warning
- import validation
- path traversal rejection
- XSS payload escaping
- encrypted record tamper failure
- deletion removes local records/artifacts

---

## 10. Performance tests

Test:

- startup time
- model load time
- first inference time
- known-template latency
- unknown-document latency
- memory growth
- worker responsiveness
- repeated processing leak tests
- OPFS/IndexedDB operations

Performance must be measured by device class.

---

## 11. Regression tests

Regression tests protect:

- old templates
- parser behavior
- validation logic
- model updates
- export formats
- schema migrations
- template matching decisions

Any model/parser/schema update must run regression suite.

---

## 12. Test data strategy

Use:

- synthetic documents
- public-safe documents
- redacted private documents only in local/private benchmark
- generated hard cases
- deliberate conflict cases
- template versioning samples

Never use real private documents in public tests.

---

## 13. Test naming

Use consistent names:

```text
unit:validator:date:ambiguous_dd_mm
integration:pipeline:known_template:passport_td3
model:detector:qr_small_blur
ui:conflict:mrz_visual_dob
security:export:path_traversal_rejected
perf:known_template:medium_device_invoice
```

---

## 14. CI strategy

Public CI can run:

- unit tests
- schema tests
- parser tests
- validator tests
- synthetic integration tests
- security static checks
- sample UI tests

Private/local CI can run:

- heavy model benchmarks
- device matrix
- private hard benchmarks
- browser GPU tests

---

## 15. Release blocking failures

Block release if:

- silent critical error rate increases,
- confirmed wrong critical field appears,
- no-cloud tests fail,
- export strips statuses,
- template false match rate exceeds gate,
- encryption tamper test fails,
- import path traversal accepted,
- model runtime crashes on supported device,
- old templates break without migration.

---

## 16. Final statement

Testing must prove the engine is accurate, honest, local, safe, correctable, and repeatable. A model that extracts many fields but silently confirms wrong ones is not acceptable.
