# 12 — UI / UX Specification

The workspace surface. Evolves the existing React app (viewer, form editor, evidence inspector are
kept and re-homed). Design language: existing tokens in `src/index.css`; dark-first; density
comfortable for clerical throughput.

---

## 1. Shell layout

```text
┌────────────────────────────────────────────────────────────────┐
│ TopBar: app name · service-mode badge · global drop-target hint │
├──────────┬─────────────────────────────────────────────────────┤
│ Family   │  Active family view                                 │
│ Tabs     │  ┌ Toolbar: Upload/Bulk · Review(n) · Export · ⚙ ┐  │
│ (rail)   │  ├ RecordsTable (virtualized)                     │  │
│ + New    │  └ Detail drawer: Document | Form | Evidence      │  │
│ Drafts   │                                                    │  │
└──────────┴─────────────────────────────────────────────────────┘
```
- **Family rail:** active families + drafts (pulsing badge); counts; per-family STP chip.
- **Service-mode badge:** `Full (local service)` / `Fallback (browser)` with capability tooltip —
  the honesty indicator for [02 §3](02_ARCHITECTURE.md).
- Global drag-anywhere upload; drops route by identity (never by which tab is open — the active
  tab is only a *view*).

## 2. Records table (F8)

- Virtualized rows (≥ 200 rows smooth on 4 GB target); columns = schema `column:true` fields +
  status chip + created + source.
- Cell renders value + status color; hover reveals attestation summary ("MRZ ✓ + VIZ agree");
  click opens the detail drawer at that field.
- Row states: `complete` (all confirmed), `review` (amber count), `failed` (bulk error, reason).
- Bulk header: progress `17/40 · 2 review · 1 failed`, pause/cancel.

## 3. Status colors (inherited, frozen)

| Status | Color | Meaning |
|---|---|---|
| confirmed | green | ≥ 1 attestation — safe |
| needs_review | amber | best candidate shown, unproven |
| conflict | red | independent channels disagree — both shown |
| invalid | red-outline | failed a hard validator |
| missing | gray | required but not found |
Color is never the only signal (icons + text — a11y).

## 4. Document + form detail (kept components, re-homed)

- **DocumentViewer:** pan/zoom canvas, field overlays in status colors, click-to-select synced
  with form; MRZ/code/photo zones outlined.
- **FormEditor:** schema-ordered fields; inline edit (edit ⇒ `user_confirmed` provenance);
  enum/date/amount inputs use the same grammars as the decoder (one truth for validity);
  asset fields show crops with a re-crop affordance (drag handles → re-run asset pipeline on the
  adjusted ROI).
- **EvidenceInspector:** the field's source crop, candidate list with per-channel provenance, and
  the **justification chain rendered in plain language**: "Confirmed because: MRZ check digits
  valid ✓; visual zone agrees ✓." — the product's trust moment.

## 5. Review lane (F15)

A filtered queue across the family: only unproven fields, grouped by record, keyboard-first
(accept ⏎ / edit / skip ⇥). Empty state celebrates: "All 40 records fully attested."

## 6. Questions (I12, P6.2)

- Ranked by information gain; top 1–3 rendered as single-decision cards:
  "Dates in this document family — day first or month first? `12/03/2024` → 12 March / Dec 3".
- One answer may resolve many fields (visible: "resolves 14 fields across 6 records").
- Answers write format priors ([11 §1](11_WORKSPACE_DATA_MODEL.md)) — asked once per family, ever.

## 7. Draft family review (J4)

Side-by-side: document with proposed field overlays ↔ editable proposed schema (rename, retype,
require, delete, add-by-drawing-ROI). Approve ⇒ family activates, parked records re-solve.
Discard ⇒ nothing persists.

## 8. Bulk queue (F9)

Drop N files → queue panel: per-file thumbnail, state (queued/processing/appended/review/failed),
isolated errors with reason ("password-protected PDF"). Concurrency 2. Failures never block the
queue.

## 9. Quality & rescan UX (J5)

Blur/glare over threshold → non-blocking banner: "This scan is blurry — results will need more
review. Rescan for best results." Extraction still proceeds (review-first), never a hard wall.

## 10. Accessibility & keyboard (baseline, not deferred)

Full keyboard traversal (tab order = schema order); focus rings; ARIA roles on table/tabs/drawer;
status = icon + color + text; min contrast 4.5:1; hit targets ≥ 32 px. (Deep a11y audit remains a
Phase 7 checklist item; the baseline above ships from P2.)

## 11. Anytime feel (I10)

Fields appear as they verify (streaming); skeleton rows for in-flight; the known-template path
renders the filled form in one paint (≤ 1.5 s budget). No spinner ever exceeds 2 s without a
progress narrative ("re-reading 3 regions at high resolution…").

## 12. Amendment — fluid design system + honesty surfaces (2026-07-10, commit `191b183`)

- **Fluid scale**: root font `clamp(13px, 12px + 0.28vw, 16.5px)`; rem-based spacing tokens
  (`--sp-1…--sp-6`); component classes in [src/index.css](../src/index.css)
  (`.app-header`, `.tab-btn`, `.btn[--primary|--ghost]`, `.badge`, `.field-card` with
  status-colored left borders, `.status-pill`, `.field-input`, `.panel-title/-sub`).
- **Layout**: CSS-grid main `minmax(0,1fr) clamp(330px,31vw,500px)`; sidebar rows
  `minmax(0,3fr)/minmax(0,2fr)`; single scrolling column <1100px (nothing clipped);
  compact phone tier <560px. Verified at 1920/1366/820 by `bench/responsive-smoke.mjs`.
- **Honesty surfaces**: quality-refusal banner (role=alert) when the page is too poor to
  extract; keystone banner when perspective suppressed geometric bindings; "printed: …"
  hint under any normalized value (`displayValue`); binding-trace evidence inspector with
  aspect-true crops; high-DPI status-colored canvas overlays.
- Acceptance: `bench/visual-binding.mjs` (13 checks — real pixel colors, DPR backing,
  visible-side geometry, inspector binding trace) is the UI truth gate and runs on its own
  browser profile (can run alongside the corpus gate).
