# Template Save UI — Edge DocGraph Engine

**Purpose:** Define the user interface for saving new templates, updating existing templates, creating versions, choosing not to learn, and preventing template corruption.

---

## 1. Template save UI role

The template save UI turns a corrected document into reusable local TemplateGraph memory.

It must make clear:

- what will be learned,
- what will not be learned,
- which fields/assets/tables are included,
- which anchors are used,
- what risks exist,
- whether this is new, update, or version.

---

## 2. Entry points

Template save UI can appear:

- after user reviews/corrects unknown document
- after known-template extraction with corrections
- when layout drift detected
- from toolbar “Save template”
- from review completion prompt

Prompt example:

```text
Want to make future similar documents faster?
Save this layout as a local template.
```

---

## 3. Main actions

Actions:

1. Save as new template
2. Update existing template
3. Create new version
4. Do not learn
5. Save as draft

---

## 4. Template save screen layout

```text
Header:
  Save layout as template

Summary:
  fields/assets/tables/codes/MRZ/checkboxes to learn
  unresolved warnings

Tabs:
  Fields
  Assets
  Tables
  Codes/MRZ
  Anchors
  Validators
  Versioning

Footer:
  Save as active
  Save as draft
  Cancel
```

---

## 5. Critical explanation

Display clearly:

```text
This saves the layout, regions, labels, validators, and extraction rules.
It does not reuse this document’s private values on future documents.
```

If any sensitive preview/crop/thumbnail will be saved, explicitly say so.

---

## 6. Save as new template

Use when:

- no template matched
- user wants future similar extraction
- layout is new

Fields:

- template name
- document type
- required fields
- active/draft
- page count
- optional description

Example:

```text
Template name: Vendor Invoice
Document type: Invoice
Status: Active
```

---

## 7. Update existing template

Use when:

- current document matched template
- corrections are small
- user intentionally improves template

Show change impact:

```text
3 field labels changed
1 crop adjusted
0 fields added
0 table schema changes
```

If impact medium/high:

```text
This looks like a layout change. Create a new version instead?
```

---

## 8. Create new version

Use when:

- same family
- layout drift detected
- fields moved
- table changed
- new/removed fields
- validators changed significantly

Show:

```text
Create Vendor Invoice v3 from v2
Reason: layout drift detected, total field moved, discount field added.
```

Old version remains unchanged.

---

## 9. Do not learn

Action:

```text
Do not learn from this document
```

Use when:

- one-off document
- highly sensitive layout
- extraction too uncertain
- user does not want template memory

Do not show repeated prompts aggressively after user chooses this.

---

## 10. Save as draft

Draft is for uncertain templates.

Use when:

- scan quality poor
- unresolved critical issues
- weak anchors
- table uncertain
- user not ready to activate

Draft templates are not used automatically unless user enables them.

---

## 11. Fields tab

Show fields to save:

Columns:

- include checkbox
- label
- type
- required
- value region preview
- validators
- warnings

Important:

- show labels and regions,
- do not show private values by default unless needed for review,
- if showing sample values, mark as sample and not learned.

---

## 12. Assets tab

Show:

- asset type
- crop preview
- required/optional
- segmentation preference
- warnings

Assets:

- photo
- signature
- stamp
- seal
- logo
- emblem
- flag
- symbol

Warn:

```text
Portrait/signature crops are not saved as reusable values. Only the region and extraction rule are saved.
```

---

## 13. Tables tab

Show:

- table region
- headers
- columns
- column types
- required columns
- arithmetic validators
- variable rows policy

Warn if table uncertain:

```text
This table structure still needs review. Save as draft or fix table first.
```

---

## 14. Codes/MRZ tab

Show:

- QR/barcode regions
- MRZ region
- parsers
- validators
- cross-check fields

Important:

```text
Code/MRZ payload values are not saved as future values.
```

---

## 15. Anchors tab

Show selected anchors:

- text anchors
- visual anchors
- geometry anchors
- special zones
- keypoint anchors
- table-grid anchors

Warn about dangerous anchors:

```text
This looks like a variable value and should not be used as a template anchor.
```

Allow remove anchor.

---

## 16. Validators tab

Show validators:

- required
- date
- amount
- ID pattern
- MRZ checksum
- QR/barcode payload
- table arithmetic
- face present
- checkbox group

Let user toggle optional validators only where safe.

Critical validators should be recommended and clearly explained.

---

## 17. Versioning tab

Show:

- template family
- current version
- proposed action
- drift report
- compatibility
- old version preservation

Example:

```text
Action: Create new version
Current: Vendor Invoice v2
New: Vendor Invoice v3
Reason: 6 fields shifted and table schema changed.
```

---

## 18. Template save warnings

Block active save or recommend draft when:

- unresolved critical conflict
- missing required fields
- invalid critical fields
- weak anchors
- poor scan quality
- table schema uncertain
- variable values selected as anchors
- similar template ambiguity unresolved

---

## 19. Success messages

New template:

```text
Template saved locally. Future similar documents can use fast verified extraction.
```

Update:

```text
Template updated locally.
```

Version:

```text
New template version created. The old version was preserved.
```

Draft:

```text
Draft template saved. It will not be used automatically until activated.
```

Do not learn:

```text
No template was saved for this document.
```

---

## 20. Error messages

Storage failure:

```text
Template could not be saved because local storage is unavailable or full. Your corrections are still visible in this session.
```

Weak template:

```text
This template does not have enough stable anchors to match safely. Add anchors or save as draft.
```

---

## 21. Tests

Test:

- save new template
- update existing template
- create version
- save draft
- do not learn
- unresolved conflict blocks active save
- variable anchor warning
- table uncertainty warning
- storage failure
- old version preserved

---

## 22. Invariants

1. Template save is explicit.
2. Template update is explicit.
3. Version creation preserves old template.
4. Private values are not saved as future values.
5. Dangerous anchors are warned/blocked.
6. Unresolved critical issues block active save.
7. Draft templates are not auto-used by default.
8. Success wording says local.

---

## 23. Final template save UI statement

The template save UI is where user corrections become safe reusable memory. It must be transparent, conservative, and explicit, because one bad template can cause repeated future errors.
