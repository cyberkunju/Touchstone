# Open Source Security — Edge DocGraph Engine

**Purpose:** Define how to open-source the project without exposing unsafe examples, secrets, private documents, real PII, vulnerable configurations, or risky training artifacts.

---

## 1. Open-source principle

The project can be open-source without exposing private data.

Rules:

- code can be public,
- synthetic examples can be public,
- redacted examples can be public after review,
- private documents must never be committed,
- secrets must never be committed,
- unsafe debug artifacts must never be committed.

---

## 2. Repository data rules

Allowed:

- synthetic documents
- fake passports/forms/invoices
- public-license samples
- redacted examples after review
- model cards
- docs
- benchmark scripts
- schema files
- test fixtures with fake values

Forbidden:

- real passports/IDs
- real invoices/bank statements
- real signatures/photos
- real MRZ/QR payloads
- user correction exports
- private templates
- raw debug packages
- local encryption keys
- API keys/tokens
- production secrets
- real user logs

---

## 3. Directory structure

Recommended:

```text
examples/
  synthetic/
  redacted_reviewed/
  public_license/

private_data/          # gitignored
user_exports/          # gitignored
private_benchmarks/    # gitignored
local_templates/       # gitignored
local_models/          # maybe gitignored if large/private
```

---

## 4. .gitignore requirements

Include:

```gitignore
private_data/
user_exports/
private_benchmarks/
local_templates/
*.key
*.pem
*.p12
*.env
.env*
*.sqlite
*.db
*.log
debug_exports/
correction_exports/
```

Do not rely only on `.gitignore`; use pre-commit checks too.

---

## 5. Secret scanning

Use secret scanning in CI/pre-commit where possible.

Check for:

- API keys
- private keys
- tokens
- cloud credentials
- `.env`
- signed URLs
- model registry credentials
- package publishing tokens

Even if no cloud policy exists, developers may have tooling secrets.

---

## 6. PII scanning

Use simple checks to catch accidental data:

- emails
- phone numbers
- MRZ-like patterns
- passport/ID-like patterns
- dates of birth near labels
- account numbers
- real domain names
- OCR logs

Automated PII scanning is imperfect. Human review still required.

---

## 7. Public examples

Public examples must be:

- synthetic, or
- public-license, or
- fully redacted and reviewed.

Synthetic examples should use:

- fake names
- fake IDs
- fake companies
- fake addresses
- fake QR payloads
- fake MRZ
- synthetic signatures/photos

Mark examples clearly:

```text
Synthetic sample. Not a real document.
```

---

## 8. Model release security

Model releases should include:

- model file
- checksum
- model card
- training dataset summary
- class version
- license
- benchmark metrics
- privacy statement

Do not release models trained on private unredacted user data.

---

## 9. Dependency security

Open-source project should use:

- lockfiles
- dependency review
- minimum necessary dependencies
- no unexplained postinstall scripts
- trusted WASM packages
- pinned model checksums
- reproducible training instructions where possible

---

## 10. Issue tracker policy

Users may upload sensitive docs in issues.

Issue template should warn:

```text
Do not upload real passports, IDs, invoices, signatures, bank statements, or other sensitive documents. Use synthetic or redacted examples only.
```

Maintainers should delete/redact sensitive attachments if posted.

---

## 11. Pull request policy

PR checklist:

- [ ] no real documents
- [ ] no secrets
- [ ] no sensitive logs
- [ ] no unredacted correction exports
- [ ] no raw OCR from real docs
- [ ] no cloud upload path added
- [ ] security/privacy docs updated if relevant
- [ ] tests added for security-sensitive changes

---

## 12. Documentation safety

Docs should not include:

- real passport numbers
- real MRZ
- real personal addresses
- real financial examples
- real signatures/photos
- real private templates

Use placeholders:

```text
A1234567
JOHN SAMPLE
1990-01-01
example.test
```

---

## 13. Demo safety

Demos must use:

- synthetic documents,
- fake data,
- redacted screenshots,
- no real user docs.

If screen recording, ensure:

- no local file paths with private names,
- no real templates,
- no browser bookmarks/secrets,
- no terminal secrets.

---

## 14. Build/release security

Release process:

- build from clean repo,
- run secret scan,
- run PII/data scan,
- verify model checksums,
- verify no private files included,
- sign release if possible,
- publish model manifest.

---

## 15. Vulnerability disclosure

Add `SECURITY.md` with:

- supported versions,
- how to report vulnerabilities,
- no public exploit details before fix,
- contact method,
- expected response policy if possible.

---

## 16. License/security note

Open-source license should not imply:

- compliance with all legal/privacy requirements,
- suitability for official identity verification,
- authenticity checking,
- fraud detection.

Docs should state:

```text
This project extracts and verifies document evidence locally. It does not prove document authenticity.
```

---

## 17. Open-source security tests

CI should include:

- secret scan
- forbidden file path scan
- PII pattern scan
- lint/test
- dependency audit where feasible
- package contents check
- model checksum check

---

## 18. Final rule

Open source the engine, not private data. The repository must be safe to clone, inspect, run, and contribute to without exposing real documents, secrets, or unsafe cloud-by-default behavior.
