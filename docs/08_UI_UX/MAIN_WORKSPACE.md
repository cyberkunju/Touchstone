# Main Workspace — Edge DocGraph Engine

**Purpose:** Define the primary document processing screen: document viewer on the left, generated form on the right, review queue, toolbar, status summary, and interaction flow.

---

## 1. Main layout

The main workspace uses a two-pane layout:

```text
┌──────────────────────────────────────────────────────────────┐
│ Top Bar: document name, local status, template status, export │
├───────────────────────────────┬──────────────────────────────┤
│                               │                              │
│ Left: Document Viewer          │ Right: Generated Form         │
│ - page preview                 │ - status summary              │
│ - overlays                     │ - review queue                │
│ - evidence highlights          │ - editable fields             │
│ - crop controls                │ - tables/assets               │
│                               │                              │
├───────────────────────────────┴──────────────────────────────┤
│ Bottom/Side: evidence drawer, logs, template action drawer     │
└──────────────────────────────────────────────────────────────┘
```

Default split:

- Document viewer: 55–60%
- Form panel: 40–45%

The split should be resizable.

---

## 2. Top bar

Top bar should show:

- document name
- local processing badge
- page count
- extraction mode
- template match status
- save/template actions
- export button
- settings/menu

Example:

```text
passport_sample.png
Local processing
Unknown layout
3 need review
```

Known template example:

```text
vendor_invoice.pdf
Local processing
Matched: Vendor Invoice v2
18 confirmed · 2 need review
```

---

## 3. Local processing indicator

Display:

```text
Processing locally
```

Tooltip:

```text
Your document is processed on this device. No cloud OCR is used.
```

Do not claim absolute privacy if browser/OS environment cannot be fully controlled. Keep wording accurate.

---

## 4. Extraction mode badge

Possible modes:

- Unknown document
- Matched template
- Similar layout / new version suggested
- Manual review
- Draft template

Examples:

```text
Unknown document
Matched template: Passport TD3 v1
Similar layout: create new version?
```

---

## 5. Status summary

Show counts:

```text
18 Confirmed
3 Need review
1 Conflict
1 Missing
```

Clicking a count filters the form panel.

Priority order:

1. Conflict
2. Invalid
3. Missing
4. Needs review
5. Unsupported
6. Confirmed

---

## 6. Left pane: document viewer

The viewer shows:

- rendered/normalized document
- page thumbnails for multi-page docs
- overlay boxes
- selected evidence
- source regions
- crop handles
- table grid overlays
- MRZ/code/photo/signature regions

Selecting form field highlights document region.

---

## 7. Right pane: generated form

The form panel shows:

- review queue
- sections
- fields
- tables
- visual assets
- codes/MRZ panels
- correction controls
- confidence/status badges
- evidence buttons

Selecting a document region selects related field if one exists.

---

## 8. Evidence drawer

A drawer/panel can open from either side.

Shows:

- source crop
- OCR tokens
- detector evidence
- parser output
- validator result
- graph links
- correction history

The drawer should not permanently crowd the main form unless user pins it.

---

## 9. Review queue

At top of form panel, show unresolved issues.

Example:

```text
Review needed
1 conflict · 1 missing required · 2 low-confidence fields
```

Each issue row:

- field label
- status
- short reason
- jump to field
- jump to source region

---

## 10. Page navigation

For multi-page documents:

- thumbnail rail
- page number
- next/previous page
- unresolved issue indicators per page

Example:

```text
Page 2 has 3 unresolved fields.
```

---

## 11. Selection behavior

### Selecting a form field

Should:

- scroll document viewer to source region
- highlight related evidence boxes
- show evidence drawer preview
- show correction handles if edit mode active

### Selecting a document region

Should:

- highlight related nodes/evidence
- show linked field if exists
- offer “create field from region” if no field exists

### Selecting conflict

Should:

- show both evidence regions
- show side-by-side compare in form/evidence drawer

---

## 12. Workspace modes

### 12.1 Review mode

Default after extraction.

Focus:

- resolve unresolved issues
- verify fields
- correct mistakes

### 12.2 Edit regions mode

Used for:

- redraw field ROI
- crop asset
- table correction
- add field

### 12.3 Template save mode

Shows:

- what will be saved
- anchors
- fields
- required flags
- warnings

### 12.4 Developer/audit mode

Optional advanced mode:

- graph IDs
- evidence IDs
- model versions
- validator traces

---

## 13. Responsive behavior

### Desktop

Use two-pane layout.

### Tablet

Use split or tabbed layout:

- Document
- Form
- Evidence

### Mobile

Use stacked workflow:

1. document
2. field card
3. evidence/correction bottom sheet

Mobile support can be P2 if desktop/Tauri is primary.

---

## 14. Main actions

Primary actions:

- Upload new document
- Review issues
- Save as template
- Export
- Clear document

Secondary actions:

- Re-run extraction
- Process as new layout
- Select template manually
- Delete document data
- View audit details

---

## 15. Loading states

During processing, show stages:

```text
Creating pages
Normalizing image
Detecting document elements
Reading text
Extracting tables/assets
Verifying fields
Building form
```

Do not freeze UI. Allow cancellation.

---

## 16. Empty states

Before upload:

```text
Upload a PDF or image to extract a local evidence-backed form.
```

After upload failure:

```text
This file could not be processed. Try a PNG, JPEG, WebP, or PDF.
```

No fields found:

```text
No reliable fields were detected. You can select regions manually to create a template.
```

---

## 17. Error states

Errors should appear near the affected area and in a global summary if critical.

Examples:

- scan too blurry
- required field missing
- template match ambiguous
- model failed to load
- local storage full
- PDF render failed

---

## 18. Export readiness

Export button states:

- enabled: all critical fields confirmed or user accepts warnings
- warning: unresolved non-critical issues
- blocked/confirm required: unresolved critical issues

Before export, show summary.

---

## 19. Template action placement

Template actions should be visible but not forced.

After correction/review, show:

```text
Want to make future similar documents faster?
Save this layout as a template.
```

Actions:

- Save as new template
- Update matched template
- Create new version
- Do not learn

---

## 20. Workspace invariants

1. Document and form are always linkable.
2. Unresolved issues are easy to find.
3. Evidence is one click away.
4. Corrections are graph-backed.
5. Template actions require explicit choice.
6. Export warns about unresolved statuses.
7. UI stays responsive during local inference.

---

## 21. Final workspace statement

The main workspace is the user’s command center. It must let users see the document, inspect evidence, correct results, resolve uncertainty, and save reusable templates without switching contexts or trusting hidden magic.
