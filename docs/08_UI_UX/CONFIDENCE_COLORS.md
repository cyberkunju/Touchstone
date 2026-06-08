# Confidence Colors and Status Visual Rules — Edge DocGraph Engine

**Purpose:** Define visual status colors, badges, icons, and non-color cues for confidence/status display.

---

## 1. Important distinction

This document is named `CONFIDENCE_COLORS`, but the UI should primarily show **status**, not raw confidence.

Statuses:

- confirmed
- needs_review
- missing
- conflict
- invalid
- unsupported
- rejected

Confidence can appear in details, but the main UI should communicate verifier status.

---

## 2. Color rule

Color must never be the only signal.

Every colored status must also have:

- text label
- icon or shape if useful
- tooltip/reason
- accessible label

---

## 3. Recommended status palette

Suggested semantics:

| Status | Color meaning | Text |
|---|---|---|
| confirmed | green | Confirmed |
| needs_review | yellow/amber | Needs review |
| missing | red/orange | Missing |
| conflict | red | Conflict |
| invalid | red | Invalid |
| unsupported | gray/purple | Unsupported |
| rejected | gray | Rejected |

Actual color tokens should come from design system, not hardcoded in components.

---

## 4. Design tokens

Use semantic tokens:

```ts
status.confirmed.bg
status.confirmed.text
status.confirmed.border

status.needsReview.bg
status.needsReview.text
status.needsReview.border

status.missing.bg
status.missing.text
status.missing.border

status.conflict.bg
status.conflict.text
status.conflict.border

status.invalid.bg
status.invalid.text
status.invalid.border

status.unsupported.bg
status.unsupported.text
status.unsupported.border

status.rejected.bg
status.rejected.text
status.rejected.border
```

Do not use direct color names in business logic.

---

## 5. Badge rules

Badge must include text.

Examples:

```text
[Confirmed]
[Needs review]
[Missing]
[Conflict]
[Invalid]
```

For compact UI, icon can be used only if accessible text is still present.

---

## 6. Overlay color rules

Document viewer overlays should use status colors.

### Confirmed

- low-intensity border
- not visually dominant
- visible on selection

### Needs review

- medium-intensity amber/yellow border
- visible in review mode

### Missing

- strong dashed border around expected region
- label “Missing expected field”

### Conflict

- strong red border
- dual-source overlays labeled Source A / Source B

### Invalid

- strong red border
- validation icon

### Unsupported

- neutral/gray/purple border
- manual action indicator

---

## 7. Confidence intensity

Do not map raw confidence directly to arbitrary colors.

If confidence appears visually:

- use opacity/intensity secondary to status,
- show numeric/details only in evidence viewer,
- avoid green for high confidence if validator failed.

Example:

High OCR confidence + MRZ conflict must be red conflict, not green.

---

## 8. Conflict visual rule

Conflict must be unmistakable.

Show:

- conflict badge
- both values
- both source labels
- both source overlays
- correction action

Colors alone are not enough.

---

## 9. Missing visual rule

Missing expected field should show:

- expected ROI outline
- missing badge
- action to add/select value
- explanation

Example:

```text
Missing required field
Expected region highlighted.
```

---

## 10. Invalid visual rule

Invalid field should show:

- invalid badge
- failed validator message
- source evidence
- correction input

Example:

```text
Invalid — MRZ check digit failed.
```

---

## 11. Needs-review visual rule

Needs-review should be noticeable but not alarming.

Show reason:

```text
Needs review — OCR confidence is low.
Needs review — date format is ambiguous.
```

---

## 12. Confirmed visual rule

Confirmed should be calm.

But evidence should still be available.

Do not hide evidence just because field is confirmed.

---

## 13. Dark mode

Status colors must work in dark mode.

Requirements:

- sufficient contrast
- clear borders
- no low-contrast yellow text
- no red/green-only distinction
- test with common color blindness simulations

---

## 14. Accessibility

Minimum requirements:

- WCAG contrast targets for text
- status text labels
- icon labels
- non-color shapes/patterns for overlays
- screen-reader labels
- high contrast mode

Screen reader example:

```text
Date of Birth, needs review, date format is ambiguous.
```

---

## 15. Color blindness considerations

Red/green can be hard to distinguish.

Add:

- icons
- labels
- border styles
- patterns
- tooltip text

Examples:

- confirmed: check icon + text
- conflict: warning triangle + text
- missing: dashed outline + text
- invalid: error icon + text

---

## 16. Review queue colors

Review queue should prioritize by status, not only color.

Order:

1. conflict
2. invalid
3. missing
4. needs_review
5. unsupported

Each row includes label and reason.

---

## 17. Export summary colors

Export summary should use status badges and counts.

Example:

```text
18 Confirmed
2 Need review
1 Conflict
1 Missing
```

If unresolved critical items exist, show explicit warning.

---

## 18. Testing

Visual tests:

- each status badge
- document overlay for each status
- dark mode
- high contrast
- color blindness simulation
- selected/unselected overlays
- export summary

Accessibility tests:

- screen-reader labels
- keyboard focus visibility
- contrast ratios
- no color-only status

---

## 19. Invariants

1. Status text is always visible.
2. Color is never the only signal.
3. Conflict/invalid override high confidence colors.
4. Confirmed does not hide evidence.
5. Missing expected regions are visible.
6. Design tokens are semantic.
7. Dark/high contrast modes are supported.

---

## 20. Final color rule

Use color to support trust communication, not replace it. The user should understand every status even in grayscale, with a screen reader, or under color blindness.
