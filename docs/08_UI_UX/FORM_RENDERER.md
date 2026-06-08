# Form Renderer — Edge DocGraph Engine

**Purpose:** Define how generated form fields, visual assets, tables, checkboxes, MRZ/code panels, statuses, evidence buttons, and correction controls are rendered.

---

## 1. Renderer role

The form renderer turns DocGraph hypotheses into editable UI controls.

It renders:

- text fields
- dates
- amounts
- ID fields
- names/addresses
- visual assets
- tables
- checkboxes
- QR/barcode payloads
- MRZ blocks
- missing fields
- conflicts
- unsupported regions

The form is a view over DocGraph, not the source of truth.

---

## 2. Input

Form renderer receives:

```ts
type FormRendererInput = {
  formSchema: FormSchema;
  formValues: FormValueSet;
  docGraph: DocGraph;
  selectedFieldId?: string;
  filter?: FormFilter;
};
```

---

## 3. Field card structure

Each field card should show:

```text
Label
Value control
Status badge
Short reason
Evidence button
Correction menu
```

Example:

```text
Date of Birth
[01/02/1999]
Needs review
Date format is ambiguous.
[Show evidence] [Change type] [Edit region]
```

---

## 4. Field status badge

Statuses:

- Confirmed
- Needs review
- Missing
- Conflict
- Invalid
- Unsupported
- Rejected

Badge must include text, not only color.

---

## 5. Text-like fields

Use text input for:

- text
- name
- ID number
- address
- phone
- email
- country

Behavior:

- editing value creates correction event
- pressing evidence highlights source
- field type selector available
- validator messages shown inline

---

## 6. Date fields

Use hybrid date/text control.

Why:

- scanned dates may be ambiguous
- locale formats vary
- raw value must be preserved

UI should show:

- raw value
- normalized candidate if available
- ambiguity warning
- date picker optional
- format hint

Example:

```text
Raw: 01/02/1999
Interpreted as: 1999-02-01
Needs review: Date format is ambiguous.
```

---

## 7. Amount fields

Use amount input with:

- raw text
- normalized numeric value
- currency selector/hint
- validation result
- table arithmetic link if relevant

Example:

```text
Total
₹1,200.00
Confirmed — table total matches.
```

---

## 8. Visual asset fields

Render asset cards for:

- photo
- signature
- stamp
- seal
- logo
- emblem
- flag
- symbol

Card shows:

- crop preview
- asset type
- status
- evidence/source region button
- redraw crop
- change type
- raw/refined crop toggle if available

Example:

```text
Signature
[Crop preview]
Needs review — crop may be incomplete.
[Redraw region] [Show evidence]
```

---

## 9. Table fields

Render editable grid.

Features:

- cell editing
- row/column add/delete
- merge/split cells
- header row marking
- total row marking
- low-confidence cell highlighting
- arithmetic validation panel
- source crop button

Table field card should show summary:

```text
Line Items
Needs review — one column boundary is uncertain.
```

---

## 10. Checkbox fields

Render checkbox control with status.

For groups:

- show group label
- show each option
- show exclusivity warnings
- allow manual state correction

Example:

```text
Consent
[✓] Yes
[ ] No
Needs review — checkbox mark is faint.
```

---

## 11. QR/barcode fields

Render as code panel.

Show:

- code type
- decoded payload
- parsed fields if supported
- source crop
- safety warning for URL payloads
- cross-field validation

Do not auto-open URLs.

---

## 12. MRZ panel

Render MRZ as structured panel.

Show:

- raw MRZ lines
- normalized lines
- parsed fields
- check digit results
- visual cross-checks
- source crop

For simple form, parsed MRZ fields can also appear as normal fields with MRZ evidence link.

---

## 13. Missing fields

Render expected missing fields.

Show:

- label
- required badge
- expected source region if known
- add value
- select region
- mark unavailable if allowed

Example:

```text
Passport Number
Missing required field.
Expected region is highlighted on page.
```

---

## 14. Conflict fields

Conflict card must show comparison.

Example:

```text
Date of Birth — Conflict

Visual field:
01/03/1999

MRZ:
01/02/1999

[Use visual] [Use MRZ] [Enter corrected value]
```

Each choice creates correction evidence.

---

## 15. Invalid fields

Show validator failure.

Example:

```text
Expiry Date
2020-01-01
Invalid — expiry date is before issue date.
```

Actions:

- edit value
- show evidence
- override if policy allows

---

## 16. Unsupported fields

Show:

- region/type
- reason unsupported
- manual type selector
- ignore option

Example:

```text
Unsupported region
This looks like a symbol, but no supported parser exists.
```

---

## 17. Field grouping

Group fields into sections:

- template sections
- spatial sections
- document-type sections
- review sections

Examples:

- Identity Details
- Invoice Details
- Line Items
- Signatures and Stamps
- Codes and Machine-Readable Data

---

## 18. Filtering and sorting

Filters:

- all
- confirmed
- needs review
- missing
- conflict
- invalid
- assets
- tables
- user edited

Sort by:

- review priority
- page order
- template order
- field type
- section

---

## 19. Correction controls

Every field should support:

- edit label
- edit value
- change type
- edit region
- show evidence
- delete/reject
- mark confirmed
- add alias to template
- update template region

Controls can be in a menu to avoid clutter.

---

## 20. Form state update rules

When user edits:

1. update UI optimistically if safe,
2. create CorrectionEvent,
3. patch DocGraph,
4. rerun validators,
5. refresh status,
6. update template-save eligibility.

Do not mutate only local input state without graph update.

---

## 21. Export display

Export preview should show:

- fields
- values
- statuses
- warnings
- selected export mode

Export modes:

- all with statuses
- confirmed only
- custom selected fields

---

## 22. Accessibility

- every input has label
- status badges have text
- errors linked to fields
- keyboard navigation through fields
- evidence buttons accessible
- tables editable by keyboard
- crop previews have alt text

---

## 23. Tests

Test:

- render all field types
- edit value creates correction
- conflict comparison
- missing required field
- invalid field
- asset crop card
- table editor
- checkbox group
- MRZ panel
- evidence button linkage
- accessibility labels

---

## 24. Renderer invariants

1. Form values come from DocGraph/FormValueSet.
2. Every field shows status.
3. Every field links to evidence or is marked manual.
4. Corrections create graph evidence.
5. Conflicts show both sides.
6. Missing required fields are visible.
7. Export preserves status.

---

## 25. Final renderer statement

The form renderer is not a pretty JSON viewer. It is the correction and verification interface that turns uncertain extraction into trustworthy structured data.
