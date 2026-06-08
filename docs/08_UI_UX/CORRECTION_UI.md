# Correction UI — Edge DocGraph Engine

**Purpose:** Define how users correct labels, values, types, regions, assets, tables, checkboxes, and template memory.

---

## 1. Correction UI role

The correction UI is the learning interface.

Every correction should:

1. update the visible form,
2. create UserCorrectionEvidence,
3. patch DocGraph,
4. rerun affected validators,
5. optionally update TemplateGraph after user decision.

Correction must be fast enough that users are willing to fix errors.

---

## 2. Correction types

Supported corrections:

- rename label
- update value
- change field type
- redraw value region
- redraw label region
- edit asset crop
- change asset type
- add missing field
- delete/reject false field
- merge fields
- split field
- edit table cells
- edit table structure
- correct checkbox state
- resolve conflict
- choose template action

---

## 3. Correction entry points

Users can correct from:

- field card
- document viewer overlay
- evidence viewer
- table editor
- conflict compare panel
- template save screen
- review queue

All entry points should create the same correction event model.

---

## 4. Rename label

UI:

```text
Label: [DOB]
Change to: [Date of Birth]
```

Actions:

- save
- cancel
- add old label as alias?

On save:

- create `label_edit` correction
- update field label
- update canonical label if user chooses
- optionally add alias to TemplateGraph

---

## 5. Update value

UI:

```text
Value: [01/02/1999]
```

Actions:

- save
- cancel
- show source crop
- mark as confirmed after edit if validators pass

On save:

- create `value_edit` correction
- preserve raw OCR value
- update display/normalized value
- rerun validators

---

## 6. Change field type

Types:

- text
- name
- date
- amount
- ID number
- phone
- email
- country
- image/photo
- signature
- stamp/seal/logo
- table
- checkbox
- QR/barcode
- MRZ
- unknown

On type change:

- create `type_change` correction
- rerun validators for new type
- change form control if needed
- update template-save candidate

---

## 7. Redraw region

Region redraw flow:

```text
Click Edit Region
  → viewer enters region edit mode
  → user drags/resizes box
  → crop preview updates
  → Save / Cancel
```

On save:

- create `region_edit` correction
- update node/hypothesis region
- run OCR/parser if applicable
- rerun validators

---

## 8. Asset crop correction

Asset correction UI:

- crop handles
- raw/refined crop preview
- change type dropdown
- segmentation refine button if available
- save/cancel

Actions:

- redraw crop
- change photo/signature/stamp/seal/logo type
- delete asset
- split overlapping asset

On save:

- create `asset_crop_edit` or `asset_type_change`
- update VisualAssetNode
- rerun asset validators
- update TemplateAsset candidate

---

## 9. Add missing field

User flow:

```text
Click Add Field
  → draw/select region or manual value
  → enter label
  → choose type
  → run extraction if region selected
  → save
```

New field source:

- `user_created` if manual
- `user_region` if region selected
- may include OCR evidence if extracted from region

---

## 10. Delete/reject false field

Delete action should mean:

```text
Reject this hypothesis from form/export/template learning.
```

It should not delete raw evidence.

On delete:

- mark hypothesis rejected
- create correction evidence
- hide from default form
- keep in audit/developer view

---

## 11. Merge fields

Use when duplicate hypotheses exist.

Example:

```text
"Passport No" and "Document Number" refer to same value.
```

Flow:

- choose primary field
- merge evidence IDs
- merge aliases
- preserve both source regions
- create `merge_fields` correction

---

## 12. Split field

Use when one OCR block incorrectly contains multiple fields.

Flow:

- select text/region split
- create multiple field hypotheses
- assign labels/values
- preserve original OCR block as evidence
- create `split_field` correction

---

## 13. Table correction

Table UI supports:

- edit cell value
- add row
- delete row
- add column
- delete column
- merge/split cells
- mark header row
- mark total row
- set column type
- map table to field

Each action creates table correction evidence.

After correction:

- rerun table validators
- rerun linked field validators
- update TemplateTable candidate

---

## 14. Checkbox correction

Checkbox controls:

- checked
- unchecked
- uncertain
- group assignment
- label edit

On save:

- create `checkbox_state_edit`
- rerun checkbox group validators
- update TemplateCheckbox if saved

---

## 15. Conflict resolution

Conflict UI options:

- use source A
- use source B
- enter corrected value
- keep unresolved
- mark not applicable

Resolution creates correction evidence with:

- conflict ID
- chosen value
- rejected source(s)
- user-entered value if any

Do not delete original conflict evidence.

---

## 16. Correction confirmation level

Some corrections can be immediate:

- label edit
- value edit
- type change

Some require explicit confirmation:

- delete field
- update template
- create new template version
- override invalid critical field
- export unresolved critical fields

---

## 17. Undo/redo

Recommended:

- support undo for current document corrections
- maintain correction event stack
- undo creates or marks reversal evidence depending architecture

At minimum, allow reset field to original extraction.

---

## 18. Template update prompts

After meaningful corrections, show non-intrusive prompt:

```text
Use these corrections for future similar documents?
```

Actions:

- Save as template
- Update template
- Create version
- Do not learn

Do not update automatically.

---

## 19. Correction evidence schema

```ts
type CorrectionEvent = {
  id: string;
  targetId: string;
  kind: string;
  before: unknown;
  after: unknown;
  createdAt: number;
};
```

Correction evidence must include before/after.

---

## 20. Validation after correction

After correction, rerun only affected validators.

Examples:

- date value edit → date validators + date relationship validators
- total edit → amount validators + table math
- crop edit → asset validators
- MRZ-related field edit → MRZ cross-check
- checkbox edit → group validator

---

## 21. UX copy

Good messages:

```text
Correction saved. Validators updated.
```

```text
This correction will not update the saved template unless you choose to update it.
```

```text
This value still fails validation. You can keep it, but it will be exported as invalid/overridden.
```

---

## 22. Tests

Test:

- edit label
- edit value
- change type
- redraw region
- crop asset
- add missing field
- reject field
- merge/split
- table edit
- checkbox edit
- conflict resolution
- validator rerun
- template prompt

---

## 23. Correction invariants

1. Every correction creates evidence.
2. Original evidence is preserved.
3. Validators rerun after correction.
4. Template update is explicit.
5. Rejected fields do not export by default.
6. Critical overrides are auditable.
7. Region edits update normalized coordinates.

---

## 24. Final correction UI statement

The correction UI turns user effort into reusable precision. It must make fixing mistakes fast, transparent, and safe, while ensuring every correction becomes evidence and every template update is intentional.
