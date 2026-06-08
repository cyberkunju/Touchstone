# 07 — Template Engine

**Purpose:** Define how corrected documents become reusable local memory and how future similar documents are matched, aligned, ROI-extracted, versioned, and protected from corruption.

Core principle: a TemplateGraph stores **where and how to extract**, never **what value to reuse**. Schema in [03_DATA_MODEL.md](03_DATA_MODEL.md).

---

## 1. What is learned (and what is not)

Learn: anchors, field/asset/table/code/MRZ/checkbox regions, value types, aliases, validators, relationships, sections, fingerprint, matching weights/thresholds, version metadata.

Never learn as reusable values: names, ID/passport numbers, DOB, invoice numbers, totals, addresses, phone/email, MRZ parsed values, QR payloads, account numbers — any document-specific variable data. These may exist in the source DocGraph but must not become template anchors or stored future values.

```
Correct:  field "Passport Number" → valueType id_number, valueBoxNorm [...], validators [...], anchors [PASSPORT, MRZ zone, photo]
Wrong:    anchor "A1234567"  (a variable value used as an anchor)
```

## 2. Anchor types

- **text** — stable labels/titles (`PASSPORT`, `Invoice No.`, `Total`, table headers). Match exact/alias/fuzzy with position tolerance.
- **visual** — logo/emblem/seal via descriptor/perceptual hash. (User photos/signatures are NOT stable visual anchors.)
- **geometry** — boundary, lines, form boxes, photo/table region, checkbox cluster.
- **keypoint** — ORB-style descriptors; useful for textured forms/logos; never used alone.
- **special_zone** — MRZ/QR/barcode/photo/table presence + location (strong family signal).
- **table_grid** — column count, header labels, row policy.

Each anchor has `importance` and `stability` (0–1). Mark variable-looking values `mustNotContainVariableValue`. Too many required anchors → false unknowns; too few → false matches.

## 3. Template matching (conservative)

`candidate retrieval → multi-signal scoring → decision`. A false match is worse than a false unknown.

- **Candidate retrieval** (fast, recall-oriented): page count, aspect ratio, doc-type hint, stable tokens, layout histogram, object-class histogram, special zones, recent templates.
- **Score** (weights configurable, calibrated per family):
  ```
  overall = 0.25*textAnchor + 0.20*geometry + 0.20*visualAnchor
          + 0.15*keypoint + 0.10*specialZone + 0.10*requiredRegion
  ```
- **Decision:** `same_template` (high score, all required anchors present); `same_family_new_version` (medium + strong family signals + drift); `ambiguous_match` (top candidates close → ask user or run unknown flow); `unknown_template` (low).
- Default thresholds (calibrate): sameTemplate ≈ 0.88, newVersion ≈ 0.60, unknown < 0.45, ambiguousMargin ≈ 0.05.
- False-match prevention: respect required anchors; downgrade if text and geometry strongly disagree; downgrade on special-zone mismatch; if uncertain, run unknown flow; retroactively downgrade if post-extraction validators cluster-fail.

## 4. Alignment

`coarse (boundary/orientation/scale) → global transform → validate → local correction → ROI projection`.

- Global methods (use best validated): homography from document corners; ORB/RANSAC keypoints; affine from text anchors; similarity from layout anchors. Prefer a hybrid; keypoints fail on plain-text/blurry pages, so never rely on them alone.
- **Validate the transform** before projecting: known anchors land near expected positions; required regions stay inside the page; scale/rotation not extreme. If validation fails, downgrade the decision (do not project a bad transform).
- **Local correction:** for each ROI, find nearby observed anchors, compute a local shift, adjust + expand the ROI, retry. Report a drift summary.

## 5. ROI projection and ROI-first extraction

- Project each `TemplateField`/`TemplateAsset`/`TemplateTable`/`TemplateCode`/`TemplateMRZ`/`TemplateCheckbox` region; expand by type and alignment uncertainty (date 5–10%, ID 5–15%, amount 5–10%, name/text 5–15%, MRZ 2–5%, table 2–5%, photo 1–3%, signature/stamp 5–10%).
- Extract by type: text→ROI OCR; date→OCR+date parser; amount→OCR+amount parser; id→OCR+pattern+cross-check; asset→crop(+optional segmentation); table→schema-guided geometry; code→zxing; mrz→MRZ OCR+parser.
- **Search-nearby repair** on ROI failure: shift using nearby anchors, expand, retry; if still failing → `missing`/`needs_review`. This is alignment repair, not a jump to old values.
- ROI extraction creates `template_projection` + extraction evidence, both linked to the hypothesis. **Never copy old values.** Always verify (see [06_VERIFICATION.md](06_VERIFICATION.md)).

## 6. Versioning

Documents change; versioning protects memory.

- `same_template` → reuse (optional explicit small update). `same_family_new_version` → extract cautiously, correct, save new version under the same `familyId`. `unknown_template` → unknown flow. `ambiguous_match` → ask user.
- Drift report: `none|low|medium|high` from average/max field shift, missing required fields, new fields, table changes, validator-failure clusters.
- Create a new version when fields move systematically, fields are added/removed, table schema changes, visual anchors change while family text remains, or the user corrects many projected fields. **Never overwrite the old version.** Reuse `familyId`; increment `version`; keep old versions usable; record `versionReason` and provenance.

## 7. Corruption prevention

The engine must be conservative; preventing corruption matters more than aggressive learning.

- **No silent updates** — save/update/version is always an explicit user choice.
- **No variable values as anchors** by default (classifier + explicit static marking only).
- **Quality gate** — don't save active templates from bad scans/weak anchors/unresolved critical conflicts; offer **draft** instead (drafts aren't auto-matched).
- **Change-impact gate** on update: low → allow with confirmation; medium → suggest new version; high → block overwrite, force new version.
- Don't save rejected hypotheses; don't auto-mark fields required from one example (user confirms required); keep old versions recoverable (deprecate, don't delete); detect post-use corruption (repeated same-field corrections, frequent false matches, often-empty required ROIs) and flag the template for review.

## 8. Storage and matching index

Templates are sensitive (they reveal layout/labels/issuer structure). Store TemplateGraph + descriptors/thumbnails locally (IndexedDB metadata + OPFS artifacts), encrypt where feasible, warn before export, import as **draft** only. Maintain retrieval indexes (text-anchor, layout-fingerprint, visual-hash, special-zone, doc-type, recent) and a rebuild routine. Details in [10_SECURITY_PRIVACY.md](10_SECURITY_PRIVACY.md) and [08_EDGE_RUNTIME.md](08_EDGE_RUNTIME.md).

## 9. Invariants

1. Templates store structure, not variable values.
2. Matching is multi-signal and conservative; a false unknown beats a false match.
3. Alignment is validated before projection.
4. ROI-first always extracts and verifies current evidence; old values are never reused.
5. Drift creates a version; the old template is never corrupted.
6. Template save/update/version is always explicit and gated.
7. Required fields are represented even when missing in a new document.
