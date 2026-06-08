# Release Checklist — Edge DocGraph Engine

**Purpose:** Define what must be checked before every release across product, models, schemas, tests, security, privacy, packaging, and documentation.

---

## 1. Release principle

A release is acceptable only if it is:

- local-only by default,
- evidence-backed,
- verifier-safe,
- template-safe,
- privacy-safe,
- tested on target devices,
- documented,
- reproducible.

---

## 2. Version readiness

- [ ] App version updated
- [ ] Schema versions reviewed
- [ ] Model manifest version updated
- [ ] Model versions pinned
- [ ] Template schema compatibility checked
- [ ] Changelog updated
- [ ] Decision log updated for major changes

---

## 3. Build checks

- [ ] Clean install from lockfile
- [ ] TypeScript typecheck passes
- [ ] Lint passes
- [ ] Formatting passes
- [ ] Web build passes
- [ ] PWA build passes if releasing web
- [ ] Tauri build passes if releasing desktop
- [ ] Assets copied correctly
- [ ] Source maps policy reviewed

---

## 4. Test checks

- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] E2E tests pass
- [ ] Schema validation tests pass
- [ ] Export/import tests pass
- [ ] Migration tests pass
- [ ] Regression tests pass
- [ ] Security/privacy tests pass

---

## 5. Model checks

- [ ] Model manifest valid
- [ ] Checksums valid
- [ ] ONNX smoke tests pass
- [ ] Browser runtime tests pass
- [ ] Tauri/native tests pass if used
- [ ] Benchmark report generated
- [ ] Silent error report reviewed
- [ ] Model license reviewed
- [ ] Model card updated

---

## 6. Extraction and verifier checks

- [ ] Critical silent error count is zero
- [ ] Conflicts visible
- [ ] Missing required fields visible
- [ ] Invalid fields visible
- [ ] MRZ checksum failures blocked
- [ ] QR/barcode conflicts shown
- [ ] Table total conflicts shown
- [ ] Export preserves statuses
- [ ] Evidence viewer works

---

## 7. Template checks

- [ ] Known-template fast path works
- [ ] Unknown-document path works
- [ ] Similar-template new version path works
- [ ] False match benchmark reviewed
- [ ] Old templates migrate
- [ ] Template save is explicit
- [ ] Variable values not saved as anchors
- [ ] Imported templates draft by default

---

## 8. Performance checks

- [ ] Known-template latency measured
- [ ] Unknown extraction latency measured
- [ ] Model load time measured
- [ ] Memory leak stress test passes
- [ ] Worker cancellation works
- [ ] UI remains responsive
- [ ] Low-device degradation works

---

## 9. Security/privacy checks

- [ ] No-cloud network test passes
- [ ] No raw OCR/PII logs
- [ ] Export warnings show
- [ ] Import path traversal rejected
- [ ] XSS payload escaped
- [ ] CSP configured
- [ ] COOP/COEP configured where needed
- [ ] Encrypted record tamper test passes if encryption enabled
- [ ] Delete local data works
- [ ] No third-party script added

---

## 10. Open-source hygiene

- [ ] No secrets committed
- [ ] No real private documents committed
- [ ] No unredacted user exports
- [ ] Synthetic examples only
- [ ] LICENSE present
- [ ] THIRD_PARTY_NOTICES present if needed
- [ ] SECURITY.md present
- [ ] CONTRIBUTING.md updated
- [ ] Model/license docs updated

---

## 11. Packaging checks

PWA:

- [ ] Offline shell works
- [ ] Service worker does not cache user docs
- [ ] Model cache works
- [ ] Update flow works

Tauri:

- [ ] Installers generated
- [ ] App starts on target OS
- [ ] Models packaged or downloaded safely
- [ ] App data path correct
- [ ] Signing/notarization done if required

---

## 12. Release artifact checks

- [ ] Release ZIP/tarball generated
- [ ] Checksums generated
- [ ] SBOM generated if supported
- [ ] Release notes written
- [ ] Known limitations listed
- [ ] Rollback plan available

---

## 13. Final release rule

Do not release because the demo looks good. Release only when tests, benchmarks, security checks, privacy rules, and documentation all confirm that the app is safe and honest.
