# 12 — Testing & Benchmarks

**Purpose:** Define the test strategy, the silent-error benchmark (the defining metric), field/template/model/performance metrics, benchmark datasets, regression tests, the device matrix, and release acceptance gates.

Primary goal: not "does it extract something?" but **"does it extract evidence-backed data, expose uncertainty, avoid silent wrong answers, and improve safely after correction?"** A suite with only clean documents is dangerous.

---

## 1. Test pyramid

- **Unit:** schemas, geometry (IoU/normalize/homography/ROI expansion/clamp), parsers (date/amount/id/email/phone/MRZ/barcode/table arithmetic), validators (pass/warn/fail/n-a/malformed), confidence calculators.
- **Integration:** upload pipeline; unknown-document pipeline; known-template pipeline; correction pipeline; DocGraph build/patch.
- **Model:** detector, OCR, segmentation, table, barcode, MRZ — accuracy + runtime + export + downstream impact.
- **UI/component + E2E:** viewer overlays, form, evidence drawer, correction, conflict UI, template save, export; full loop upload → extract → review → correct → save template → re-extract → export.
- **Performance:** latency, memory, model load, worker throughput, leak tests.
- **Security/privacy:** no-cloud, export/import safety, XSS, encryption, deletion.

## 2. Silent-error benchmark (defining metric)

```
silent_error_rate          = wrong_confirmed_fields / total_evaluated_fields
critical_silent_error_rate = wrong_confirmed_critical_fields / total_evaluated_critical_fields
```

Counts as silent error: wrong value confirmed; wrong label/value pairing confirmed; old template value reused; invalid MRZ confirmed; table mismatch confirmed; ignored conflict confirmed; missing required field omitted; wrong asset/checkbox confirmed. **Not** a silent error: anything correctly flagged `needs_review/missing/conflict/invalid/unsupported`, or an audited user override.

Severity: **S0** wrong critical field confirmed (release blocker, must be **0**); S1 wrong non-critical confirmed (review/fix); S2 over-review (correct field flagged — safer, still measured); S3 missed non-required extraction. Every discovered silent error → a permanent regression fixture with assigned root cause (ocr/parser/validator/template_match/alignment/table/barcode/mrz/ui_export). Track `over_review_rate` to reduce unnecessary review **only after** zero critical silent errors — never by confirming weak evidence.

## 3. Field extraction metrics

Per field: detection match, raw exact match, normalized exact match, label accuracy (exact/alias/wrong/missing), value accuracy, type accuracy, region IoU, evidence accuracy (correct source/page, derived from current doc not old template), **status accuracy**. Field F1 (precision/recall over discovered fields). **Review-aware success:** a field is acceptable if (correct & confirmed) OR (uncertain & needs_review) OR (missing/conflict/invalid correctly flagged); a wrong confirmed value is never acceptable.

## 4. Template match metrics

`template_hit_rate`, `false_match_rate` (release-critical; **zero critical false matches**), `false_unknown_rate` (safer than false match), version-decision accuracy (confusion matrix over the four decisions), ROI projection IoU per element, alignment error, drift-classification accuracy, over/under-versioning rate, and downstream extraction impact. A critical false match (wrong template → wrong critical field confirmed) is both a template failure and a silent error → release blocker.

## 5. Model & performance metrics

- **OCR:** CER, WER, field exact/normalized match, MRZ line exact + check-digit pass, table-cell accuracy, **high-confidence-wrong rate**, ROI/full-page latency.
- **Detector:** mAP@0.5 / @0.5:0.95, per-class precision/recall, small-object recall, false positives/page, latency, memory; critical-class recall prioritized.
- **Segmentation:** mask/crop IoU, asset recall/precision, correction-reduction, latency.
- **Barcode/MRZ:** decode rate, payload accuracy, check-digit accuracy, conflict-detection rate.
- **Performance:** per-stage timings, known vs unknown latency, model cold/warm/cached load, memory peak + leak tests, UI responsiveness, worker queue/cancellation. Report median and p95 by device class; never log sensitive values in performance data.

## 6. Benchmark datasets

Synthetic-first, by category (passport/ID, invoice/receipt, generic form, + extended). Required sets: **clean** (baseline/happy path), **hard** (blur/glare/skew/perspective/low-res/compression/fold/stain/borderless/overlap), **conflict** (MRZ↔visible, QR↔printed, table↔total, date-order — expected status `conflict`/`invalid`, never confirmed), **missing-field** (expected status `missing`), **template-matching** (families + versions + similar-but-different + unknowns), **security** (HTML-in-OCR, malicious QR URL, path-traversal import, oversized import, corrupted model, tamper), **regression** (locked). Each set has a manifest with ground truth + sensitivity. Split by family/generator/version to prevent leakage; datasets immutable once released (changes → new version); synthetic/public/redacted only — never real private data committed.

## 7. Regression & device matrix

Every fixed bug and accepted behavior becomes a locked snapshot test (form fields, statuses, validations, template decision, export structure — exclude timestamps/random IDs). Model/parser/schema updates must pass the regression suite; expected-output changes require a decision-log entry, never a silent update. Test the device matrix: low/medium/high × Chrome/Edge/Firefox/Safari/Android × WebGPU/WASM/Tauri. Low-end must be **safe** (slower OK; no freeze-without-recovery, no crash-without-message, no wrong confirmed values, no corruption).

## 8. Release acceptance gates (all must pass)

Absolute blockers: any critical silent error (S0); no-cloud violation / document upload without consent; export strips unresolved statuses; template false match causing a wrong confirmed field; hidden critical conflict; XSS test fails; import path traversal accepted; encrypted-record tamper undetected; deletion broken for sensitive records; crash on the primary supported runtime.

Required: critical-field normalized exact match meets target; missing/conflict/invalid surfaced; MRZ checksum fail → `invalid`; cross-source mismatches → `conflict`; known-template faster than unknown; memory stable; build/typecheck/lint/unit/integration/E2E/schema/migration/security tests pass; model manifest + checksums valid; benchmark + silent-error reports generated and reviewed; docs and decision log updated; open-source hygiene (no secrets/real data) clean. Each release ships a report: versions, benchmark summary, silent-error report, template-match report, performance report, security/privacy checklist, known limitations.
