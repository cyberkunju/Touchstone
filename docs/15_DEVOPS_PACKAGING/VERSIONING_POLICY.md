# Versioning Policy — Edge DocGraph Engine

**Purpose:** Define versioning for app, schemas, models, templates, datasets, benchmarks, exports, and migrations.

---

## 1. Versioning principle

Everything that can affect extraction or trust must be versioned.

This includes:

- application code,
- DocGraph schema,
- TemplateGraph schema,
- form schema,
- evidence schema,
- validation schema,
- model files,
- preprocessing,
- postprocessing,
- thresholds,
- validators,
- datasets,
- benchmarks,
- export formats.

---

## 2. App version

Use semantic versioning:

```text
MAJOR.MINOR.PATCH
```

Example:

```text
0.4.2
```

Meaning:

- MAJOR: breaking changes
- MINOR: new features/backward-compatible changes
- PATCH: bug fixes

Before 1.0, breaking changes may happen, but must still be documented.

---

## 3. Schema versioning

Schema strings:

```text
docgraph-v1
templategraph-v1
form-v1
evidence-v1
validation-v1
```

Breaking schema changes require:

- new schema version,
- migration,
- regression tests,
- export/import update,
- docs update.

---

## 4. Model versioning

Model version format:

```text
{model-family}-{task}-{classVersion}-{semver}
```

Example:

```text
yolov11n-docdet-docdet-v0-0.1.0
```

Model version changes when:

- weights change,
- classes change,
- preprocessing changes,
- postprocessing changes,
- thresholds bundled with model change,
- model runtime/export changes.

---

## 5. Template versioning

Template has:

```text
familyId
version
templateId
status
```

Example:

```text
familyId: vendor_invoice
version: 3
templateId: tpl_vendor_invoice_v3
```

Create new template version when:

- layout changes,
- fields added/removed,
- table schema changes,
- anchors shift significantly,
- validators change materially.

Do not overwrite old version silently.

---

## 6. Dataset versioning

Dataset version includes:

- source manifest,
- split definition,
- annotation version,
- generator version if synthetic,
- redaction status,
- checksum manifest.

Example:

```text
docdet_v0_2026_06
```

Benchmarks must be immutable after release.

---

## 7. Benchmark versioning

Benchmarks are versioned separately from training data.

Example:

```text
silent_error_benchmark_v1
template_match_benchmark_v2
```

Changing ground truth requires new version.

---

## 8. Export format versioning

Exports include:

```json
{
  "schemaVersion": "form-export-v1",
  "appVersion": "0.1.0"
}
```

Breaking export changes require new export schema version and import migration/compatibility handling.

---

## 9. Validator versioning

Validators have IDs and versions.

```text
validatorId: mrz_visual_document_number_match
validatorVersion: 0.1.0
```

Version changes when:

- logic changes,
- severity changes,
- status impact changes,
- parsing assumptions change.

---

## 10. Threshold versioning

Threshold config must be versioned.

Why:

- confidence thresholds affect silent error rate,
- template match thresholds affect false match rate,
- OCR thresholds affect review burden.

Example:

```text
threshold-profile-v0.3.0
```

---

## 11. Compatibility matrix

Maintain:

```text
app version
schema versions
model versions
template versions
migration support
```

Example:

| App | DocGraph | TemplateGraph | Models |
|---|---|---|---|
| 0.1.x | v1 | v1 | docdet-v0 |
| 0.2.x | v1 | v1 | docdet-v0/v1 |

---

## 12. Evidence version trace

Every evidence record must be traceable to:

- app version,
- model version,
- runtime mode,
- preprocessing version,
- postprocessing version,
- validator version,
- threshold profile if relevant.

---

## 13. Final rule

If changing something can change extracted values, statuses, evidence, templates, or exports, it must be versioned and benchmarked.
