# Accessibility — Edge DocGraph Engine

**Purpose:** Define accessibility requirements for keyboard navigation, screen readers, contrast, zoom, overlays, correction tools, tables, and evidence inspection.

---

## 1. Accessibility goal

The app must be usable by people who rely on:

- keyboard navigation
- screen readers
- high contrast mode
- zoom/magnification
- reduced motion
- non-color cues
- large text
- assistive technologies

Document intelligence tools often become visually complex. Accessibility must be built in from the beginning.

---

## 2. Core accessibility principles

1. Every interactive control is keyboard accessible.
2. Every status is conveyed by text, not color alone.
3. Every field has an accessible label.
4. Every evidence region has a text equivalent.
5. Focus order is logical.
6. Error messages are associated with fields.
7. Viewer overlays are selectable by keyboard.
8. Tables are editable by keyboard.
9. Zoom does not break layout.
10. Motion is optional/reduced when requested.

---

## 3. Keyboard navigation

Required keyboard support:

- tab through toolbar, viewer, form, evidence drawer
- arrow keys pan viewer
- plus/minus zoom viewer
- enter/space activate selected overlay/field
- escape close modal/drawer/edit mode
- shortcuts for next/previous issue
- keyboard crop nudging
- table cell navigation

Suggested shortcuts:

| Action | Key |
|---|---|
| next issue | `n` |
| previous issue | `p` |
| show evidence | `e` |
| edit selected field | `Enter` |
| close drawer/modal | `Esc` |
| fit page | `f` |
| fit width | `w` |
| zoom in/out | `+` / `-` |

Shortcuts must not conflict with text input.

---

## 4. Focus management

When opening:

- evidence drawer → focus first heading/control
- correction modal → focus first editable input
- conflict resolver → focus conflict heading
- crop editor → focus crop region control
- template save UI → focus template name or heading

When closing:

- return focus to the field/control that opened it

---

## 5. Screen-reader labels

Every field card should announce:

```text
Date of Birth, value 01/02/1999, needs review, date format is ambiguous.
```

Every overlay should announce:

```text
Date of Birth value region, page 1, needs review.
```

Every conflict should announce both sides:

```text
Conflict. Visual value 1999-03-01. MRZ value 1999-02-01.
```

---

## 6. Status accessibility

Do not rely on color.

Use:

- text
- icon with accessible name
- ARIA label
- screen-reader reason
- tooltip/focus description

Example:

```html
<span aria-label="Needs review: OCR confidence is low">
  Needs review
</span>
```

---

## 7. Error messages

Errors must be associated with fields.

For inputs:

- use `aria-describedby`
- place message near field
- announce dynamic changes through polite live region
- critical errors use assertive only when necessary

Example:

```text
Invalid: expiry date is before issue date.
```

---

## 8. Document viewer accessibility

Viewer challenges:

- canvas content is not naturally accessible
- overlays need keyboard/focus semantics
- evidence regions require descriptions

Implementation recommendation:

- render interactive overlays as HTML/SVG accessible elements over canvas/image
- provide region list alternative
- allow field selection from form
- allow page/region navigation by keyboard

---

## 9. Region editing accessibility

Crop/region editing must support keyboard.

Controls:

- move region with arrow keys
- resize with modifier + arrow
- numeric coordinate input optional
- save/cancel buttons
- screen-reader updates

Example:

```text
Signature crop selected. Use arrow keys to move. Shift plus arrow to resize.
```

---

## 10. Table accessibility

Editable tables must support:

- arrow key cell navigation
- row/column headers
- screen-reader cell coordinates
- add/delete row/column buttons
- validation messages per cell
- low-confidence cell labels

Example announcement:

```text
Line Items table, row 2, Amount column, value 1200.00, confirmed.
```

---

## 11. Evidence viewer accessibility

Evidence drawer should:

- be keyboard navigable
- have headings
- have alt text for crops
- describe OCR text and parser output
- announce validator results
- allow copying raw values
- trap focus only if modal behavior is used

Crop alt text example:

```text
Source crop for Date of Birth field on page 1.
```

---

## 12. Contrast

Requirements:

- text meets WCAG contrast targets
- status badges readable in light/dark
- overlay borders visible on document backgrounds
- selected region has high contrast
- high contrast mode supported

Avoid low-contrast yellow text. Use dark text on light amber or appropriate dark-mode token.

---

## 13. Zoom and responsive layout

Users may zoom browser to 200%+.

UI must:

- not hide critical controls
- allow horizontal/vertical scrolling where necessary
- keep form fields readable
- keep status labels visible
- avoid fixed heights that clip text

---

## 14. Reduced motion

Respect reduced motion preferences.

Avoid:

- excessive overlay animations
- flashing highlights
- smooth scrolling that disorients
- animated loaders that cannot be reduced

Use simple transitions or disable when requested.

---

## 15. Color blindness support

Use:

- labels
- icons
- patterns
- border styles
- shape differences

Examples:

- dashed border for missing
- warning icon for conflict
- check icon for confirmed
- error icon for invalid

---

## 16. Touch accessibility

For tablets/mobile:

- touch targets large enough
- crop handles usable
- pinch zoom supported
- no hover-only actions
- long-press alternatives
- visible focus/selection state

---

## 17. Plain language

Messages should be clear.

Bad:

```text
Validator failure.
```

Good:

```text
Invalid because the expiry date is before the issue date.
```

---

## 18. Accessibility testing

Test with:

- keyboard only
- screen reader
- browser zoom 200%
- high contrast mode
- dark mode
- color blindness simulator
- reduced motion enabled
- touch device

Automated:

- axe-core or equivalent
- contrast checking
- focus order tests

Manual:

- crop editing by keyboard
- table editing by keyboard
- conflict resolution by screen reader

---

## 19. Accessibility acceptance checklist

- [ ] All controls keyboard accessible
- [ ] Focus order logical
- [ ] Status text visible
- [ ] Errors associated with fields
- [ ] Evidence crops have text alternatives
- [ ] Viewer overlays selectable by keyboard or alternative list
- [ ] Tables editable by keyboard
- [ ] Contrast passes
- [ ] Zoom works
- [ ] Reduced motion respected
- [ ] No color-only meaning

---

## 20. Final accessibility statement

Accessibility is not optional. The product’s core promise is evidence and correction; users must be able to inspect evidence and correct results regardless of input method, vision, or assistive technology.
