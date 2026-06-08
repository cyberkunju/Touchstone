# Acceptance Criteria — Edge DocGraph Engine

**Purpose:** Define what must pass before release: product, extraction, verifier, template, model, performance, security, privacy, UI, accessibility, storage, and open-source gates.

---

## 1. Release principle

A release is acceptable only if it is:

- accurate enough,
- honest about uncertainty,
- safe against silent errors,
- local-only by default,
- stable on supported edge devices,
- correctable,
- template-safe,
- privacy-safe,
- export-safe.

---

## 2. Absolute release blockers

Block release if any occur:

- critical silent error discovered,
- wrong critical field marked confirmed,
- no-cloud policy violated,
- document data uploaded without explicit action,
- export strips unresolved statuses,
- template false match causes wrong confirmed field,
- unresolved critical conflict hidden,
- XSS test fails,
- malicious import path traversal accepted,
- encrypted record tamper not detected,
- storage deletion broken for sensitive records,
- app crashes on primary supported runtime.

---

## 3. Field extraction gates

Must pass:

- critical fields have high normalized exact match on benchmark,
- missing required fields shown,
- conflicts shown,
- invalid fields shown,
- field status accuracy acceptable,
- evidence links exist,
- no old template values reused.

---

## 4. Silent error gate

Required:

```text
S0 critical silent errors = 0
```

S1 non-critical silent errors:

- must be reviewed,
- must have issue/decision,
- should be fixed before release unless explicitly accepted.

---

## 5. Verifier gates

Must pass:

- MRZ checksum failures become invalid,
- MRZ visual mismatch becomes conflict,
- QR printed mismatch becomes conflict,
- table total mismatch becomes conflict,
- ambiguous date becomes needs_review,
- low-confidence critical OCR becomes needs_review,
- missing template field becomes missing.

---

## 6. Template gates

Must pass:

- correct known-template match,
- false match rate below threshold,
- zero critical false matches,
- new version detected when layout drift is significant,
- old templates preserved,
- no silent template update,
- variable values not saved as anchors.

---

## 7. Model gates

Must pass:

- model benchmark report exists,
- ONNX/browser runtime tested,
- latency/memory acceptable,
- hard cases reviewed,
- downstream extraction not regressed,
- model versions recorded,
- decision log updated.

---

## 8. Performance gates

Must pass:

- UI responsive during processing,
- known-template faster than unknown,
- cancellation works,
- memory does not grow unbounded,
- low device degrades gracefully,
- model load errors handled,
- storage quota errors handled.

---

## 9. Security/privacy gates

Must pass:

- no-cloud network test,
- no raw sensitive logs,
- export warnings,
- import validation,
- path traversal rejection,
- XSS escaping,
- CSP/security headers configured where needed,
- local encryption tests if feature enabled,
- deletion tests.

---

## 10. UI/UX gates

Must pass:

- field statuses visible,
- evidence viewer works,
- conflict UI compares both sources,
- correction UI creates evidence,
- template save UI shows warnings,
- export summary shows unresolved statuses,
- accessibility baseline passes.

---

## 11. Storage gates

Must pass:

- save/load DocGraph,
- save/load TemplateGraph,
- delete document artifacts,
- delete templates,
- model cache validation,
- migration tests,
- temp cleanup.

---

## 12. Open-source gates

Before public release:

- no secrets,
- no real private documents,
- no unredacted correction exports,
- no unsafe examples,
- synthetic demo data only,
- license files present,
- SECURITY.md present,
- README privacy statement accurate.

---

## 13. Release report

Every release should include:

```text
version
model versions
dataset versions
benchmark summary
silent error report
template match report
performance report
security/privacy checklist
known limitations
```

---

## 14. Known limitations

Release may include known limitations only if:

- documented,
- not silent-error-critical,
- UI exposes uncertainty,
- user has safe workaround,
- roadmap issue exists.

---

## 15. Final acceptance rule

The release is not judged by how many fields it extracts. It is judged by how many fields it extracts correctly, how honestly it handles uncertainty, and whether it keeps user data local and safe.
