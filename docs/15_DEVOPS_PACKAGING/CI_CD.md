# CI/CD — Edge DocGraph Engine

**Purpose:** Define continuous integration and release automation: lint, tests, schema validation, model checks, packaging, security scans, and release artifacts.

---

## 1. CI goal

CI must prevent unsafe changes from entering the project.

It should catch:

- type errors,
- lint errors,
- schema mismatch,
- broken tests,
- model manifest errors,
- no-cloud violations,
- secrets/PII leaks,
- import/export vulnerabilities,
- package/build failures.

---

## 2. Recommended CI stages

```text
install
  → lint
  → typecheck
  → unit tests
  → schema validation
  → integration tests
  → security/privacy tests
  → build web
  → build Tauri optional
  → package checks
```

Heavy model/device benchmarks may run nightly or manually.

---

## 3. Pull request CI

Required on every PR:

- install from lockfile,
- typecheck,
- lint,
- unit tests,
- schema validation,
- docs link check if feasible,
- secret scan,
- PII fixture scan,
- no forbidden files.

---

## 4. Main branch CI

Additional:

- integration tests,
- E2E synthetic flow,
- export/import tests,
- no-cloud tests,
- PWA build,
- package artifact check.

---

## 5. Nightly CI

Optional heavy jobs:

- model benchmarks,
- performance benchmarks,
- device/browser matrix if infrastructure exists,
- memory leak tests,
- regression suite,
- Tauri builds.

---

## 6. Schema validation

Validate:

- JSON schemas parse,
- examples validate against schemas,
- TypeScript type generation if used,
- export/import schemas align,
- migration fixtures valid.

Command:

```bash
pnpm schemas:validate
```

---

## 7. Model checks

CI should validate metadata, not necessarily run huge models on every PR.

Required:

```bash
pnpm models:manifest-check
```

Checks:

- manifest valid,
- required fields present,
- license metadata present,
- checksums format valid,
- class versions valid.

Nightly can run inference smoke tests.

---

## 8. Security scans

Run:

- secret scan,
- forbidden file scan,
- PII pattern scan,
- dependency audit,
- import package tests,
- XSS tests.

Forbidden paths:

```text
private_data/
user_exports/
debug_exports/
correction_exports/
```

---

## 9. No-cloud test

Automated test should intercept network calls during extraction.

Fail if:

- document image uploaded,
- OCR text sent,
- field values sent,
- DocGraph sent,
- correction data sent.

Allowed:

- model/app asset fetches if configured.

---

## 10. Build artifacts

On release tag:

- build web/PWA,
- build Tauri installers if configured,
- package model manifest,
- generate checksums,
- generate release notes,
- attach benchmark summary,
- attach SBOM if available.

---

## 11. CI secrets

CI secrets must be minimal.

Never store:

- private user data,
- model credentials unnecessary for public build,
- cloud OCR credentials,
- real document samples.

---

## 12. Failure policy

CI failure blocks merge unless explicitly documented and approved.

Never bypass:

- no-cloud test,
- security scan,
- typecheck,
- schema validation,
- critical tests.

---

## 13. Final rule

CI/CD is the project’s guardrail. It must protect local-only privacy, schema integrity, model traceability, and silent-error safety—not just compile the frontend.
