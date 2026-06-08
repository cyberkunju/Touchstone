# Document Viewer — Edge DocGraph Engine

**Purpose:** Define zoom, pan, overlays, evidence highlights, page navigation, selection, crop controls, table overlays, and region editing behavior.

---

## 1. Viewer role

The document viewer is the visual source of truth for the user.

It must show:

- original/normalized page image
- extraction overlays
- evidence source regions
- selected field highlights
- crop handles
- table grids
- asset masks/crops
- conflicts and missing expected regions

The viewer must be tightly linked to the generated form.

---

## 2. Core capabilities

Required:

- zoom
- pan
- fit to width
- fit to page
- rotate view
- page thumbnails
- overlay toggles
- select region
- draw region
- resize crop
- highlight evidence
- show tooltip on hover/focus
- keyboard navigation

---

## 3. Viewer coordinate model

The viewer must distinguish:

```text
DocGraph normalized coordinates
  → viewer canvas coordinates
  → screen coordinates
```

Rules:

- DocGraph stores normalized coordinates.
- Viewer transforms them to screen.
- User edits convert screen coordinates back to normalized page coordinates.
- Do not store UI pixel coordinates in DocGraph.

---

## 4. Page display modes

### 4.1 Normalized page mode

Default for extraction review.

Shows the normalized/corrected page used by models.

### 4.2 Original image mode

Optional compare mode.

Useful for:

- checking perspective correction
- debugging crop
- verifying source authenticity
- viewing raw scan

### 4.3 Overlay comparison mode

Shows original vs normalized or source vs projected ROI.

---

## 5. Zoom and pan

Controls:

- zoom in/out buttons
- mouse wheel/pinch zoom
- fit page
- fit width
- reset view
- pan drag
- keyboard shortcuts

Keyboard:

- `+` zoom in
- `-` zoom out
- `0` reset
- arrow keys pan
- `f` fit page
- `w` fit width

---

## 6. Overlay types

Overlay layers:

- OCR text boxes
- field value regions
- labels
- visual assets
- table regions
- table cells
- QR/barcode regions
- MRZ region
- checkbox regions
- template projected ROIs
- quality warning regions
- conflicts
- user-corrected regions

Users should be able to toggle layers.

---

## 7. Overlay visual hierarchy

Selected field overlay should be strongest.

Suggested hierarchy:

1. selected source region
2. conflict/missing/invalid regions
3. needs-review regions
4. confirmed regions
5. passive OCR/text overlays
6. background/template hints

Do not overload the page with all boxes at full intensity.

---

## 8. Evidence highlight behavior

When user selects a field:

- highlight label node(s)
- highlight value node(s)
- highlight asset/table/code/MRZ source
- dim unrelated overlays
- scroll/zoom to region if far away
- show evidence popover/drawer

When user selects conflict:

- highlight both conflicting sources
- use clear labels: `Visual`, `MRZ`, `QR`, `Table`, etc.

---

## 9. Tooltip behavior

Hover/focus tooltip should show:

- node type
- extracted text/value
- status
- confidence/status reason
- click action

Example:

```text
OCR text: "Date of Birth"
Confidence: 94%
Used as label for Date of Birth
```

For conflict:

```text
Conflict source: MRZ DOB = 1999-02-01
```

---

## 10. Region selection

Users can draw a region to:

- create field
- update field value ROI
- create asset crop
- create table region
- create code/MRZ region
- add template anchor
- ignore/reject region

After region draw, show action menu:

```text
Create as:
- Text field
- Photo
- Signature
- Stamp/Seal
- Table
- QR/Barcode
- MRZ
- Checkbox
- Anchor
```

---

## 11. Crop controls

For field/asset crop editing:

- drag handles
- resize
- move
- aspect lock optional
- nudge with arrow keys
- show crop preview
- save/cancel
- restore original detected region

For assets, show raw and refined/masked crop if available.

---

## 12. Table overlay controls

Table editing needs:

- show grid lines
- adjust row boundary
- adjust column boundary
- add row
- delete row
- add column
- delete column
- merge cells
- split cells
- mark header row
- mark total row

Viewer and form table editor should stay synchronized.

---

## 13. Missing expected region

For known templates, missing fields should show expected ROI.

Example:

```text
Expected Passport Number here, but no readable value was found.
```

Overlay should be visible even if no value node exists.

---

## 14. Quality overlays

Quality warnings:

- blur area
- glare area
- low resolution warning
- crop incomplete warning

Only show quality overlays when relevant or toggled, to avoid visual clutter.

---

## 15. Mask display

For segmentation masks:

- show mask outline
- allow mask overlay toggle
- show raw crop vs refined crop
- user can adjust crop even if mask exists

Do not make masks look like truth if uncertain.

---

## 16. Multi-page behavior

Thumbnail rail should show:

- page number
- unresolved issue count
- current page
- page processing status

Clicking a field from another page should switch page and highlight source.

---

## 17. Performance

Viewer must remain smooth.

Rules:

- virtualize page thumbnails
- render overlays separately from image
- debounce hover calculations
- use canvas/SVG hybrid carefully
- avoid drawing thousands of OCR boxes at high opacity
- use offscreen rendering where appropriate

---

## 18. Accessibility

Viewer must support:

- keyboard focus on regions
- screen-reader labels for selected evidence
- non-color status labels
- zoom controls
- high contrast overlays
- reduced motion

Every selectable overlay must have accessible name.

Example:

```text
Date of Birth value region, needs review, OCR confidence low.
```

---

## 19. Tests

Test:

- zoom/pan
- select field highlights region
- select region highlights field
- draw region
- resize crop
- table grid edit
- conflict dual highlight
- missing expected ROI
- overlay toggles
- keyboard navigation
- coordinate conversion accuracy

---

## 20. Viewer invariants

1. Viewer coordinates map exactly to DocGraph normalized coordinates.
2. Every form field can highlight its source region.
3. User-edited regions create correction evidence.
4. Missing expected fields show expected ROIs.
5. Conflict highlights show both sources.
6. Overlay visibility must not hide status truth.
7. Viewer remains responsive on large pages.

---

## 21. Final viewer statement

The document viewer is where trust becomes visible. Users must be able to see exactly where every value, asset, table, code, and warning came from, and correct regions precisely when the system is wrong.
