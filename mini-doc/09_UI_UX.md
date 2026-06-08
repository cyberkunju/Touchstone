# 09 — UI / UX

**Purpose:** Define the workspace, document viewer, form renderer, evidence viewer, correction UI, status visuals, error wording, and accessibility. The UI is part of the verification system: if the Verifier knows uncertainty but the UI hides it, the product still lies.

Principles: correction-first, evidence-first, uncertainty-aware, local-first, review-efficient, accessible.

---

## 1. Main workspace

Two-pane, resizable layout.

```
Top bar: document name · "Processing locally" · page count · extraction mode · template status · status counts · Save Template · Export
Left (≈55–60%): Document Viewer — page, overlays, evidence highlights, crop/region controls, page thumbnails
Right (≈40–45%): Form panel — review queue, status counts, sections, editable fields, tables, assets, MRZ/code panels
Drawer: Evidence viewer (side/bottom, pinnable)
```

- Extraction mode badge: `Unknown document` / `Matched template: X` / `Similar layout: create new version?` / `Manual` / `Draft template`.
- Status summary is clickable to filter the form. Bidirectional linking: select a field → highlight + scroll to its source region; select a region → select the related field (or offer "create field from region").
- Loading shows named stages (normalizing, detecting, reading text, verifying, building form) and is cancellable; never freeze the UI.

## 2. Document viewer

- Zoom/pan/fit, page thumbnails (with per-page unresolved counts), overlay toggles, region draw, crop resize, evidence highlight, tooltips.
- Coordinates: DocGraph normalized → viewer pixels → screen; user edits convert back to normalized. Never store viewer pixels.
- Overlay visual hierarchy (strongest first): selected region → conflict/missing/invalid → needs_review → confirmed → passive OCR boxes. Don't draw thousands of boxes at full intensity.
- Show **missing** expected ROIs (dashed outline + "Missing expected field") even when no value node exists. Conflicts highlight both sources labeled (Visual / MRZ / QR / Table). Keep interactive overlays as accessible DOM/SVG over the canvas.

## 3. Form renderer

Each field card: label · value control · status badge (text + color) · short reason · evidence button · correction menu.

- Controls by type: text/name/id/address/phone/email → text input; date → date-or-text hybrid showing raw + interpreted + ambiguity note; amount → amount input with currency + arithmetic link; photo/signature/stamp/seal/logo → crop preview + redraw/type/raw-vs-mask; table → editable grid (cell edit, add/del row/col, merge/split, header/total marking, low-confidence cell highlight, arithmetic panel); checkbox → control + group exclusivity; qr/barcode → code panel (type, payload as escaped text, URL-safety note, cross-check); mrz → structured panel (raw lines, normalized, parsed fields, check-digit results, cross-checks); unknown → text + type selector.
- Editing dispatches a correction command → CorrectionEvent → graph patch → re-verify → status refresh. Never mutate only local input state.
- Render from hypotheses only; every field links to evidence or is marked manual; missing required fields are shown; export preview preserves status.

## 4. Evidence viewer (the trust microscope)

For the selected field show: header (label, value, status, short reason, page); source crop (value + label crops, ROI, masks); OCR (raw + normalized + confidence + mode + model/version + alternatives); detection; parser output (MRZ lines/check digits, barcode payload, parsed date/amount); validator results (pass/warn/fail + message); confidence breakdown; template projection (template/version, projection confidence, drift); correction history; conflict comparison (both sources side by side). Developer mode adds IDs (hypothesis/node/evidence/edge/validation/template). Normal mode uses plain language.

## 5. Correction UI (the learning interface)

Make fixing fast, transparent, graph-backed. Supported: rename label (optionally add alias), edit value, change type, redraw value/label region, edit asset crop/type, add missing field, delete/reject false field, merge/split, edit table cells/structure, checkbox state, resolve conflict (choose source / enter value / keep unresolved), template decision.

- Every correction creates `UserCorrectionEvidence`, patches the graph, re-runs only affected validators, updates template-save eligibility. Original evidence preserved; rejected fields excluded from form/export/learning but kept for audit; region edits update normalized coordinates.
- Immediate corrections: label/value/type. Confirmation-required: delete field, template update/version, override of an invalid critical field, export of unresolved critical fields. Support undo/redo or at least "reset field to original extraction."
- After meaningful corrections, a non-intrusive prompt: "Use these corrections for future similar documents?" → Save / Update / New version / Don't learn. **Never** auto-update a template.

## 6. Template save UI

A panel (not a `prompt()`): tabs for Fields / Assets / Tables / Codes-MRZ / Anchors / Validators / Versioning. Clearly state: "This saves the layout and extraction rules, not this document's private values." Show what will be learned, required flags, selected anchors, and warnings. Warn/remove variable-looking anchors. Block active save (offer **draft**) on unresolved critical conflicts, weak anchors, poor scan quality, or similar-template ambiguity. Show the version decision and confirm new-version creation (old version preserved).

## 7. Status visuals

Show **status, not raw confidence**, and never by color alone — always text label + icon/shape + reason.

| Status | Color (token) | Icon | Treatment |
|---|---|---|---|
| confirmed | green | check | calm; evidence still available |
| needs_review | amber | warning | review queue |
| missing | red/orange | dashed-outline | expected ROI shown |
| conflict | red | compare | both sources shown |
| invalid | red | error | validator reason; block clean critical export |
| unsupported | gray/purple | question | manual action |
| rejected | gray | — | hidden from form, recoverable in audit |

Use semantic design tokens (`status.confirmed.bg/text/border`), not hardcoded colors. A failed validator with high OCR confidence is **red conflict/invalid**, never green. Verify in dark mode and color-blindness simulations.

## 8. Error messages

Every message answers: what happened, why it matters, what to do. Examples: "Processing locally. Your document is not uploaded."; "The passport number is too blurry to confirm. Retake the image or enter it manually."; "Conflict: MRZ and visible field show different dates of birth."; "Missing required field. Expected region is highlighted."; "Invalid because the MRZ check digit failed."; "This export contains unresolved critical fields." Never say "success" while unresolved critical issues remain. Internal IDs only in developer mode.

## 9. Export UX

Pre-export summary with counts; modes: all-with-statuses (default), confirmed-only (lists excluded), custom selection. Warn before exporting evidence/template/training packages (sensitive). Block clean export of unresolved invalid/conflict critical fields unless the user explicitly chooses to export with warnings.

## 10. Accessibility (mandatory)

Keyboard for everything (tab order; viewer pan/zoom shortcuts; `n`/`p` next/prev issue; `e` evidence; `Enter` edit; `Esc` close; arrow-key crop nudge; table-cell navigation). Screen-reader labels announce field/value/status/reason and conflicts ("Date of Birth, value 01/02/1999, needs review, date format ambiguous"). Status by text + icon + ARIA, never color only. WCAG contrast in light/dark; respect reduced motion; logical focus management (open → first control, close → return focus); evidence crops have alt text; editable tables keyboard-navigable; touch targets large enough; no hover-only actions. Test with axe-core + keyboard + screen reader + zoom 200% + color-blindness simulation.

## 11. Invariants

1. Every field shows status and links to evidence (or is marked manual).
2. Uncertainty is always visible; conflicts show both sources.
3. Corrections create graph evidence; templates never auto-update.
4. Export preserves status; sensitive exports warn.
5. Status is conveyed by text + icon, never color alone.
6. UI stays responsive during local inference.
