# Contributing

Thank you for contributing to Edge DocGraph Engine.

This project is a local-first document intelligence engine. Contributions must preserve the core promise:

```text
No document upload by default.
Every extracted value has evidence.
Uncertainty is visible.
User corrections are auditable.
Templates are learned safely.
```

---

## 1. Before contributing

Please read:

- `README.md`
- `docs/00_MASTER/MASTER_PRD.md`
- `docs/00_MASTER/MASTER_ARCHITECTURE.md`
- `docs/11_SECURITY_PRIVACY/PRIVACY_MODEL.md`
- `docs/12_TESTING_BENCHMARKS/SILENT_ERROR_RATE.md`
- `docs/13_IMPLEMENTATION/CODING_STANDARDS.md`

---

## 2. Good contribution areas

Contributor-friendly areas:

- documentation improvements,
- synthetic data generators,
- parser tests,
- validator tests,
- UI accessibility improvements,
- schema examples,
- benchmark fixtures using fake data,
- import/export validators,
- issue reproduction with synthetic documents.

Advanced areas:

- model runtime,
- OCR integration,
- template matching,
- verifier architecture,
- security/storage changes,
- Tauri native services.

---

## 3. Privacy rules

Do not upload or commit:

- real passports,
- IDs,
- bank statements,
- invoices with real data,
- real signatures,
- real portrait photos,
- MRZ lines,
- QR/barcode payloads from real documents,
- user correction exports,
- private templates.

Use synthetic or redacted examples only.

---

## 4. Development setup

```bash
pnpm install
pnpm dev
```

Before PR:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm schemas:validate
```

---

## 5. Pull request checklist

Your PR should confirm:

- [ ] no real private documents added
- [ ] no secrets added
- [ ] no document upload path added
- [ ] no raw OCR/PII logs added
- [ ] tests added/updated
- [ ] docs updated if behavior changed
- [ ] schema updated if data shape changed
- [ ] decision log updated for major changes
- [ ] silent error risk considered

---

## 6. Adding a model or dependency

Model/dependency changes require:

- license review,
- benchmark report,
- model manifest update,
- security review,
- decision log entry.

Do not replace the pinned model stack casually.

---

## 7. Adding examples

Examples must be:

- synthetic,
- public-license,
- or reviewed/redacted.

Add a note when data is synthetic.

---

## 8. Reporting bugs

When reporting bugs:

- use synthetic/redacted files,
- include app version,
- include browser/runtime,
- include model version if available,
- describe expected vs actual result,
- never attach real sensitive documents.

---

## 9. Final contribution rule

A contribution is good if it makes the engine more accurate, honest, local, inspectable, private, testable, or maintainable. A contribution that hides uncertainty is not acceptable.
