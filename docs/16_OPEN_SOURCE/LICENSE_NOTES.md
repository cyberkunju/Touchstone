# License Notes

**Purpose:** Track licensing expectations for project code, third-party libraries, models, datasets, documentation, and generated examples.

---

## 1. Project license

The project license must be selected before public release.

Because the recommended detector stack includes Ultralytics YOLO11, which is offered under AGPL-3.0 or Enterprise licensing, an open-source distribution that includes or depends on Ultralytics YOLO11 should assume AGPL-3.0 obligations unless an Enterprise license is obtained or a different detector is selected.

Recommended default if using YOLO11 in the released stack:

```text
AGPL-3.0-compatible open-source project license
```

Final license choice requires legal review.

---

## 2. License inventory requirement

Every release must include a third-party license inventory.

Track:

- package name,
- version,
- license,
- source URL,
- usage,
- distribution status,
- obligations,
- notes.

---

## 3. Source code dependencies

Examples:

| Dependency | Expected license | Notes |
|---|---|---|
| Ultralytics YOLO11 | AGPL-3.0 or Enterprise | Strong copyleft unless Enterprise license |
| PaddleOCR | Apache-2.0 | Verify exact package/model artifact |
| MediaPipe | Apache-2.0 | Verify exact artifact |
| ZXing/zxing-wasm | verify package | Check package lock/repo license |
| ONNX Runtime | MIT | Verify exact package |
| PDF.js | Apache-2.0 | Verify bundled notices |
| Tauri | Apache-2.0/MIT | Verify crate/package versions |

This table is a starting point. The lockfile and actual packaged artifacts are source of truth.

---

## 4. Model licenses

Models may have licenses separate from code.

For every model artifact, record:

- model source,
- base model,
- training code license,
- weights license,
- dataset license,
- redistribution permission,
- commercial restrictions,
- attribution requirements.

---

## 5. Dataset licenses

Public datasets must be reviewed.

Allowed:

- project-generated synthetic data,
- public-license samples,
- redacted examples with documented permission.

Forbidden:

- real private user docs,
- unredacted correction exports,
- copyrighted/private document scans without permission.

---

## 6. Documentation license

Choose a docs license.

Common options:

- same as project code,
- Creative Commons license,
- explicit all-rights-reserved until public release.

Do not copy large text from external sources.

---

## 7. Examples license

Synthetic examples should be clearly marked:

```text
Synthetic sample. Not a real document.
```

If examples include third-party assets/fonts/images, their licenses must be tracked.

---

## 8. License files

Recommended files:

```text
LICENSE
NOTICE
THIRD_PARTY_NOTICES.md
MODEL_LICENSES.md
DATASET_LICENSES.md if datasets included
```

---

## 9. License review checklist

Before release:

- [ ] project license selected
- [ ] all npm/crate/python licenses scanned
- [ ] model licenses reviewed
- [ ] dataset licenses reviewed
- [ ] third-party notices generated
- [ ] AGPL obligations understood if YOLO11 included
- [ ] no incompatible dependency added
- [ ] attribution requirements satisfied

---

## 10. Legal disclaimer

This document is engineering guidance, not legal advice. Obtain legal review before public/commercial release.
