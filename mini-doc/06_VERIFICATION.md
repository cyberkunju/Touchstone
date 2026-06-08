# 06 — Verification

**Purpose:** Define the Verifier (the trust engine), the validator registry, field-status rules, cross-field checks, and the silent-error policy. This is the most release-critical subsystem: it is what makes the product trustworthy.

---

## 1. Role

The Verifier evaluates evidence and validator results and assigns each hypothesis a **status**. It does not extract evidence and does not own values. It is the single authority for trust. Status matters more than any confidence number.

```
DocGraph (evidence, nodes, hypotheses, template context, quality)
  → Validator Registry → Verifier → statuses + validations + conflicts + reasons → form/export/template
```

## 2. Verifier stages

1. **Evidence completeness** — does the hypothesis have sufficient supporting evidence (value node, asset crop, table cells, decoded payload, projected ROI)?
2. **Source confidence** — read OCR/detector/parser/template/quality confidence from linked nodes.
3. **Validator execution** — run applicable validators (by field type, document type, template rules, cross-field relationships, required status).
4. **Conflict detection** — compare independent sources (MRZ vs visible, QR vs printed, table vs total, OCR alternatives, template label vs observed).
5. **Quality impact** — downgrade/block when a quality warning overlaps the field region.
6. **Status assignment** — apply precedence.
7. **Explanation** — produce user-readable and developer-readable reasons.

## 3. Status precedence

```
rejected > missing > conflict > invalid > needs_review > confirmed
```

Reference logic:

```ts
if (hyp.rejected) return 'rejected';
if (hyp.required && noUsableEvidence) return 'missing';
if (criticalConflict) return 'conflict';
if (criticalValidatorFails) return 'invalid';
if (qualityUnsafeForRegion || confidence < typeThreshold || warningValidator) return 'needs_review';
if (allCriticalValidatorsPass && evidenceStrong) return 'confirmed';
return 'needs_review';
```

`invalid` vs `conflict`: a failed required validator (bad checksum, impossible date) → `invalid`; two valid sources disagreeing → `conflict`.

## 4. Field-status definitions (and export/learning effects)

| Status | Meaning | Export | Learn into active template |
|---|---|---|---|
| confirmed | sufficient evidence, critical validators pass | normal | yes |
| needs_review | plausible but not safe to confirm | with warning | only after user confirms |
| missing | required/expected field has no usable value | null + status | may learn required region |
| conflict | independent sources disagree | with both sources | no (until resolved) |
| invalid | value present but fails required validation | with status; block clean critical export | no |
| unsupported | meaningful but uninterpretable region | as unsupported/manual | user-defined only |
| rejected | user/system rejected a false hypothesis | excluded by default | never |

## 5. Validator registry

```ts
interface Validator<C = unknown> {
  id: string; type: ValidatorType; severity: 'info'|'low'|'medium'|'high'|'critical';
  appliesTo(ctx: ValidatorContext): boolean;
  run(ctx: ValidatorContext, config?: C): ValidationResult;  // pure; cites evidence; never mutates the graph
}
interface ValidatorRegistry {
  register(v: Validator): void; get(id: string): Validator | undefined;
  list(): Validator[]; findApplicable(ctx: ValidatorContext): Validator[];
}
```

Validators are deterministic, versioned, evidence-citing, and never hide failures. They return a `ValidationResult` (see [03_DATA_MODEL.md](03_DATA_MODEL.md)); the Verifier combines results into status. Map: required-fail → missing; critical-format-fail → invalid; cross-source mismatch → conflict; low-confidence/ambiguous warn → needs_review.

Core validators: `required_presence`, `ocr_confidence`, `geometry_plausibility`, `template_projection_confidence`, `quality_overlap`, `date_validity`/`date_range`, `amount_format`/`currency`, `id_pattern`, `email`, `phone`, `country_code`, `mrz_format`, `mrz_checksum`, `mrz_visual_cross_check`, `barcode_decode`, `barcode_payload_cross_check`, `table_structure`, `table_arithmetic`, `asset_present`, `face_present`, `checkbox_group_exclusivity`, plus cross-field validators.

## 6. Scalar validation rules

- **Date:** parse common forms + MRZ `YYMMDD`; ambiguous format (e.g. `01/02/1999` without locale/template hint) → `needs_review`; impossible date or expiry-before-issue → `invalid`/`conflict`. Preserve raw; store normalized candidate.
- **Amount:** parse numeric + currency + separators; locale/template disambiguates; arithmetic ties to table totals; unparsable critical amount → `invalid`.
- **ID number:** regex/length/checksum where known; MRZ/code cross-check; normalize OCR confusions only with context, preserving raw.
- **Email/phone/country:** format checks; country/nationality cross-checked with MRZ; tolerant of unfamiliar but valid inputs.
- **Name:** light validation; normalize for comparison (case, spacing, MRZ separators); mismatch with MRZ → `conflict`/`needs_review`, rarely `invalid`.

## 7. Cross-field validation

Compare independent evidence; never silently pick one side.

- **MRZ vs visible:** document number, DOB, expiry, name, nationality. Valid MRZ matching strengthens; mismatch → `conflict`; invalid MRZ cannot confirm anything.
- **QR/barcode vs printed:** invoice number, tax id, total, tracking, ID fields. Mismatch → `conflict`. Never overwrite printed value with payload silently.
- **Table vs summary:** line-item sum vs subtotal; subtotal+tax−discount vs total; debit/credit/balance progression. Mismatch → `conflict` with details.
- **Date relationships:** expiry after issue; DOB not future; due after invoice; statement period consistency.

Conflicts are stored as ConflictRecords + `conflicts_with` edges and surfaced in the UI showing both sources. User resolution becomes correction evidence.

## 8. Silent-error policy (the prime directive)

A **silent error** = wrong value presented as confirmed/trusted without warning. A **critical silent error** (wrong critical field marked confirmed) is a **release blocker**.

Hard rules:
1. No evidence → no confirmed field (only user-created, marked).
2. Low confidence on a critical field → `needs_review`, never confirmed.
3. Critical validator failure (MRZ checksum, impossible date, table math) blocks confirmation.
4. Conflicts are never hidden.
5. Template projection only locates; it never confirms a value.
6. Never reuse old template values as current values.
7. Bad scans downgrade trust for affected critical fields.
8. User overrides are auditable; original evidence preserved.
9. Exports preserve status; never strip uncertainty.
10. Don't learn unresolved conflicts/uncertain fields into active templates.

Forbidden engineering shortcuts: fabricating/hardcoding values to pass tests; auto-"correcting" OCR without preserving raw; lowering thresholds for demos; hiding `needs_review` fields; stripping statuses from exports; auto-updating templates on mismatch.

## 9. Explainable confidence

Never a bare number. Always components + penalties + reasons (schema in [03_DATA_MODEL.md](03_DATA_MODEL.md)). Thresholds are **per field type / per template**, never a single global constant, and are versioned and benchmarked. UI shows the short reason first, full breakdown on demand.

## 10. Known-template verification

ROI extraction is not auto-trusted. Verify: template match confidence, alignment confidence, ROI extraction success, required-field presence, field-type validators, cross-field consistency, and drift indicators. Clustered validator failures by region → suggest a new template version. Missing required ROI value → `missing` with the expected region highlighted.

## 11. Tests (release-critical)

Every status, every cross-field check, and every discovered silent error needs a test. Mandatory cases: MRZ checksum fail, MRZ-vs-visible mismatch, QR-vs-printed mismatch, table-total mismatch, low-confidence critical OCR, glare over a critical field, wrong/ambiguous template candidate, missing required field, impossible date, user override. The **critical silent-error count must be zero** to release. Detail in [12_TESTING.md](12_TESTING.md).
