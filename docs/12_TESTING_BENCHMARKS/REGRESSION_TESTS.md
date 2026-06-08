# Regression Tests — Edge DocGraph Engine

**Purpose:** Define regression tests that prevent model, parser, verifier, template, runtime, storage, and UI updates from breaking old behavior.

---

## 1. Regression goal

Every bug fixed and every accepted behavior should become a test.

Regression tests protect:

- known templates
- field extraction
- verifier statuses
- parser outputs
- model postprocessing
- export formats
- storage migrations
- UI correction flows
- no-cloud behavior

---

## 2. Regression test sources

Regression tests come from:

- discovered bugs
- silent errors
- user correction patterns
- benchmark failures
- model update failures
- template corruption incidents
- import/export issues
- security findings

---

## 3. Golden fixtures

Use locked fixtures:

```text
regression/
  docs/
  templates/
  expected_outputs/
  expected_statuses/
  exports/
```

Each fixture includes:

- input document
- optional TemplateGraph
- expected DocGraph subset
- expected form output
- expected statuses
- expected warnings
- expected export snapshot

---

## 4. Snapshot strategy

Snapshot stable outputs:

- form fields
- statuses
- validation results
- template decision
- export structure

Avoid snapshotting unstable fields:

- timestamps
- random IDs
- non-deterministic confidence decimals unless rounded
- model raw internal output if not stable

---

## 5. Model regression tests

For model updates:

- run fixed inference samples,
- compare postprocessed outputs,
- compare downstream extraction,
- compare silent error rate,
- compare latency/memory.

A model update must not break old accepted templates.

---

## 6. Parser regression tests

For parsers:

- dates
- amounts
- MRZ
- barcode payloads
- IDs
- tables

Every parser bug gets example input and expected output.

---

## 7. Verifier regression tests

Required for every discovered silent error.

Example:

```text
MRZ DOB differs from visual DOB
Expected: conflict
```

Do not allow future verifier changes to confirm it.

---

## 8. Template regression tests

For each important template:

- match decision
- alignment
- ROI projection
- extraction
- validators
- versioning decision

Test:

- same template
- slight scan drift
- new version
- wrong similar template

---

## 9. Storage/schema migration regression

When schema changes:

- load old DocGraph
- load old TemplateGraph
- migrate
- run extraction
- save
- reload

Old templates must not be silently corrupted.

---

## 10. UI regression tests

Test:

- evidence visible
- conflict UI shows both sides
- correction creates evidence
- template save warnings
- export warnings
- accessibility labels

---

## 11. Security regression tests

For every security issue:

- XSS payload test
- import path traversal
- encrypted record tamper
- model checksum failure
- no-cloud network check
- export warning

---

## 12. Regression failure policy

If regression fails:

1. identify intentional vs bug,
2. if intentional, update expected output with decision log entry,
3. if bug, fix before merge,
4. if model change, benchmark before accepting.

No silent expected-output updates.

---

## 13. Regression metadata

```json
{
  "regressionId": "silent_error_mrz_dob_conflict_001",
  "source": "bug",
  "expected": "conflict",
  "severity": "critical",
  "createdAt": 0,
  "linkedIssue": "optional"
}
```

---

## 14. Final rule

Regression tests are institutional memory. Every serious failure must become a permanent test so the system never relearns the same dangerous mistake.
