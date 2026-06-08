# Contributing Engineering — Edge DocGraph Engine

**Purpose:** Define how contributors add modules, models, parsers, validators, UI, templates, storage, security features, and experiments safely.

---

## 1. Contribution principle

Every contribution must preserve:

- local-only privacy
- evidence-backed extraction
- strict uncertainty handling
- no silent wrong confirmations
- strict TypeScript
- clear module boundaries
- test coverage
- open-source data safety

---

## 2. Before starting

Contributor should read:

- MASTER_PRD
- MASTER_ARCHITECTURE
- DECISION_LOG
- MODEL_STACK
- SILENT_ERROR_POLICY
- PRIVACY_MODEL
- TEST_STRATEGY
- CODING_STANDARDS
- MODULE_INTERFACES

---

## 3. Contribution types

Common contribution categories:

- parser
- validator
- detector/model update
- OCR runtime update
- segmentation experiment
- table extraction improvement
- UI component
- worker task
- storage adapter
- export/import format
- synthetic data generator
- benchmark
- docs

Each has different acceptance rules.

---

## 4. Adding a parser

Requirements:

- pure function where possible
- typed input/output
- no UI dependency
- no storage dependency
- unit tests
- malformed input tests
- privacy-safe logs
- documentation update

Parser output must not confirm fields by itself.

---

## 5. Adding a validator

Requirements:

- register in ValidatorRegistry
- typed config
- pass/warn/fail/not_applicable behavior
- severity defined
- evidence IDs preserved
- status mapping documented
- unit tests
- integration test if cross-field

Critical validators require benchmark cases.

---

## 6. Adding a model

Requirements:

- decision log entry
- model card
- dataset version
- benchmark report
- runtime compatibility test
- ONNX/export test if browser model
- model manifest
- checksum
- latency/memory report
- downstream silent error report

No model replaces pinned stack silently.

---

## 7. Adding detector classes

Requirements:

- class definition
- annotation guide update
- dataset migration
- class version bump
- training config update
- benchmark comparison
- model export test
- downstream extraction review

Do not add classes without proven product need.

---

## 8. Adding UI components

Requirements:

- accessible labels
- keyboard behavior
- status text visible
- no color-only meaning
- no raw HTML from document text
- component tests
- story/demo with synthetic data

UI must not call raw model/runtime directly.

---

## 9. Adding worker tasks

Requirements:

- typed request/response
- progress events
- cancellation behavior
- error mapping
- transfer/ref handling for large data
- tests for stale results
- no sensitive logs

---

## 10. Adding storage features

Requirements:

- data classification
- retention policy
- encryption consideration
- deletion behavior
- migration strategy
- quota/error handling
- tests

Storage changes must not silently persist sensitive data without policy.

---

## 11. Adding export/import features

Requirements:

- manifest schema
- sensitivity warning
- redaction option where relevant
- import validation
- path traversal tests
- oversized package test
- no code execution
- status preservation

---

## 12. Adding experiments

Experiments require:

- feature flag
- owner
- purpose
- benchmark plan
- expiry/review date
- safe default off
- decision log entry

Experiments must not silently run in stable release.

---

## 13. Pull request checklist

Every PR:

- [ ] typecheck passes
- [ ] lint passes
- [ ] tests pass
- [ ] no secrets
- [ ] no real private documents
- [ ] no raw sensitive logs
- [ ] module boundaries respected
- [ ] docs updated if behavior changed
- [ ] benchmark added if model/extraction behavior changed
- [ ] silent error risk considered
- [ ] privacy/no-cloud policy preserved

---

## 14. Review checklist

Reviewer should ask:

- Does this create unverified fields?
- Does it hide uncertainty?
- Does it log sensitive values?
- Does it upload anything?
- Does it bypass verifier?
- Does it mutate templates unsafely?
- Does it break old templates?
- Does it run on edge devices?
- Does it have tests?
- Is the data synthetic/redacted?

---

## 15. Decision log requirement

Update DECISION_LOG for:

- model changes
- major library changes
- threshold changes
- security/privacy policy changes
- architecture changes
- rejected alternatives
- experiment promotion/rejection

---

## 16. Security disclosure

Security issues should follow `SECURITY.md`.

Do not disclose exploit details publicly before maintainers can review/fix.

---

## 17. Final contribution rule

Every contribution must make the engine more accurate, more honest, more local, more inspectable, or more maintainable. Anything that makes demos look better by hiding uncertainty is a regression.
