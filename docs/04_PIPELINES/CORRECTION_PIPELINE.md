# Correction Pipeline — Edge DocGraph Engine

**Purpose:** Define how user corrections update the form, DocGraph, verification state, and TemplateGraph memory safely.

---

## 1. Pipeline goal

The correction pipeline turns user edits into high-trust evidence. It updates the DocGraph, re-runs affected verification, updates the form, and optionally saves or updates TemplateGraph memory.

Correction is not just UI editing. It is the learning mechanism.

---

## 2. High-level flow

```text
user correction
  → correction event
  → UserCorrectionEvidence
  → graph patch
  → affected validators rerun
  → form state update
  → optional TemplateGraph save/update/version
```

---

## 3. Correction types

Supported corrections:

- label edit
- value edit
- field type change
- region redraw
- asset crop correction
- asset type change
- add missing field
- delete false field
- merge fields
- split field
- checkbox state correction
- table cell edit
- table structure edit
- template save
- template update
- template version creation
- do-not-learn decision

---

## 4. Correction event schema

```ts
type CorrectionEvent = {
  id: string;
  documentId: string;
  pageId?: string;
  targetId: string;
  kind:
    | "label_edit"
    | "value_edit"
    | "type_change"
    | "region_edit"
    | "asset_crop_edit"
    | "asset_type_change"
    | "add_field"
    | "delete_field"
    | "merge_fields"
    | "split_field"
    | "checkbox_state_edit"
    | "table_cell_edit"
    | "table_structure_edit"
    | "template_decision";
  before: unknown;
  after: unknown;
  createdAt: number;
};
```

---

## 5. UserCorrectionEvidence

Every correction becomes evidence.

```ts
type UserCorrectionEvidence = {
  id: string;
  source: "user_correction";
  correctionEventId: string;
  targetId: string;
  correctionKind: string;
  before: unknown;
  after: unknown;
  trust: "high";
  createdAt: number;
};
```

---

## 6. Graph patching

Corrections patch the DocGraph through controlled APIs.

Examples:

### Label edit

- update FieldHypothesis label
- create alias candidate
- preserve original OCR label
- add correction evidence

### Value edit

- update FormValue/FieldHypothesis
- preserve original OCR value
- mark userEdited true
- rerun validators

### Region redraw

- create new region evidence
- update target node box
- create new crop artifact if needed
- preserve original region evidence

### Asset type change

- update VisualAssetNode assetType
- create correction evidence
- update asset field type

### Table edit

- patch TableCellNode/TableNode
- rerun table validators
- preserve original reconstruction

---

## 7. Verification after correction

Corrections should trigger targeted re-verification.

Examples:

- date edit → date validator
- amount edit → amount and table total validators
- MRZ-related field edit → MRZ cross-check
- crop edit → asset presence/face verifier if photo
- checkbox edit → checkbox group validator
- table edit → table arithmetic validators

User-corrected does not always mean confirmed automatically. If the user enters invalid data, status may remain invalid but user_overridden.

---

## 8. Template learning decision

After correction, the user can choose:

- save as new template
- update existing template
- create new version
- do not learn from this document

The system must not silently update templates.

---

## 9. TemplateGraph creation from corrections

When saving template:

- use corrected labels
- use corrected field types
- use corrected regions
- use corrected asset crops
- use corrected table structure
- store aliases
- store validators
- store relationships
- store version metadata

Do not learn variable values as anchors by default.

---

## 10. Template update safety

Before updating existing template, check:

- how many fields changed
- whether regions shifted significantly
- whether new fields appeared
- whether required fields disappeared
- whether validators changed
- whether table structure changed

If changes are major, suggest new version.

---

## 11. Correction provenance

Every final field should be able to show:

- original OCR/detector evidence
- correction history
- who/when locally if available
- template update decision
- final status

Provenance helps debug and prevents hidden edits.

---

## 12. UI requirements

Correction UI should support:

- inline field edit
- evidence panel
- document overlay selection
- crop redraw
- type selector
- add/delete field
- merge/split
- table grid editing
- template save/update/version dialog

Every correction should feel immediate but be graph-backed.

---

## 13. Conflict resolution

If user resolves a conflict:

- record which evidence was chosen
- preserve rejected evidence
- update status
- optionally update template rule

Example:

```text
MRZ DOB conflicts with visual DOB.
User confirms visual DOB.
Field status becomes user_confirmed_with_conflict_override.
```

The export should still preserve that there was an override if configured.

---

## 14. Deleting fields

Deleting a field should:

- mark hypothesis rejected
- remove from current form
- keep evidence
- prevent template save of rejected field unless user restores it

Do not delete raw OCR/detector evidence.

---

## 15. Adding fields

Adding a field should require:

- label
- type
- optional value
- optional region/evidence
- required/optional flag

If no region is selected, mark as user-created manual field.

---

## 16. Table correction

Table correction can be complex.

Supported:

- edit cell
- add row/column
- delete row/column
- merge cells
- split cells
- mark header
- mark total row
- map column types

All table corrections update TableNode and TemplateTable if saved.

---

## 17. Error handling

If graph patch fails:

- show error
- do not lose user input
- keep correction event pending if possible

If storage fails during template save:

- keep corrected DocGraph in memory
- show retry option
- do not claim template saved

---

## 18. Tests

Test corrections:

- label edit
- value edit
- type change
- crop redraw
- add field
- delete field
- table edit
- conflict resolution
- save template
- update template
- create version

Assertions:

- correction evidence created
- original evidence preserved
- graph patched
- validators rerun
- template updated only with user decision

---

## 19. Invariants

1. Correction is evidence.
2. Original evidence is preserved.
3. Templates are not silently updated.
4. Variable values are not learned as anchors by default.
5. Verification runs after correction.
6. Form state and graph state must remain consistent.
7. User decisions are auditable.

---

## 20. Final correction rule

The correction pipeline is the learning pipeline. A great correction system is what turns the app from a one-time extractor into a reusable local template engine.
