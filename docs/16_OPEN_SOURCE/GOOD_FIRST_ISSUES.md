# Good First Issues

**Purpose:** Suggest contributor-friendly tasks that are useful, safe, and do not require access to private documents or heavy models.

---

## 1. Good first issue principles

Good first issues should:

- use synthetic data,
- avoid private documents,
- be small,
- have clear acceptance criteria,
- include tests/docs,
- improve reliability or clarity.

---

## 2. Documentation tasks

### Improve glossary examples

Add examples for:

- DocGraph,
- TemplateGraph,
- evidence,
- field hypothesis,
- validator,
- anchor,
- ROI.

Acceptance:

- examples are synthetic,
- terms remain consistent.

### Add diagrams

Create Mermaid diagrams for:

- unknown-document flow,
- known-template flow,
- correction flow,
- verifier flow.

Acceptance:

- diagrams render in Markdown.

---

## 3. Parser test tasks

### Date parser fixtures

Add tests for:

- ISO dates,
- DD/MM/YYYY,
- MM/DD/YYYY ambiguity,
- invalid dates,
- issue/expiry ordering.

### Amount parser fixtures

Add tests for:

- commas,
- currency symbols,
- negative values,
- Indian numbering,
- decimal separators.

---

## 4. Schema example tasks

Add or improve:

- generic form example,
- receipt example,
- table example,
- conflict example,
- missing field example.

Acceptance:

- JSON validates,
- no real data.

---

## 5. UI accessibility tasks

Improve:

- status badge labels,
- keyboard focus order,
- evidence drawer ARIA labels,
- table editor keyboard navigation,
- high contrast status tokens.

Acceptance:

- tests or story examples added.

---

## 6. Security test tasks

Add tests for:

- malicious QR URL does not auto-open,
- OCR text with `<script>` renders safely,
- import path traversal rejected,
- export warning appears for evidence package.

Use synthetic fixtures only.

---

## 7. Synthetic data tasks

Add generator templates:

- simple invoice,
- generic form,
- receipt,
- fake certificate.

Acceptance:

- generated ground truth,
- no real logos/names/IDs.

---

## 8. Benchmark tasks

Add benchmark manifests for:

- clean passport synthetic,
- invoice table conflict,
- QR mismatch,
- missing required signature,
- blurry field needs_review.

Acceptance:

- expected status documented.

---

## 9. Dev tooling tasks

Add scripts:

- validate all JSON schemas,
- scan docs for forbidden real-data patterns,
- check broken links,
- generate docs manifest,
- check package license metadata.

---

## 10. Issue template text

Every good first issue should include:

```text
Goal
Files to edit
Acceptance criteria
Tests to run
Privacy notes
```

---

## 11. Final rule

Good first issues should make the project safer, clearer, or more testable without needing any real sensitive documents.
