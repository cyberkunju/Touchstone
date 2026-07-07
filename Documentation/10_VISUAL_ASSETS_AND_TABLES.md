# 10 — Visual Assets & Tables

Pixels are fields too (N1 applies to crops). The deterministic pipelines for portraits, signatures,
stamps/seals — and the table engine whose acceptance test is arithmetic.

---

## 1. Portrait extraction (F12, P1.7)

**Goal:** the "perfectly edited, arranged, cropped" ID photo — deterministic and explainable.

1. **Locate:** photo-region candidates from layout (`image` class) ∩ YuNet face detections
   (face box + 5 landmarks: eyes, nose, mouth corners). A face without a photo-region still
   proceeds (some IDs have borderless portraits).
2. **Roll-align:** rotate so the eye line is horizontal (angle from landmark pair; applied to the
   *source-resolution* crop, bicubic).
3. **Frame:** standardized portrait geometry — face height (chin↔crown estimate from landmarks)
   ≈ 70 % of crop height, eye line at ≈ 45 % from top, 3:4 aspect. Config-frozen constants.
4. **Edge-snap:** if a rectangular photo border exists nearby (strong gradient rectangle within
   12 % of the frame), snap to it — preserves the printed photo's own framing when present.
5. **Output:** PNG at source resolution (never upscaled), stored in OPFS
   `assets/<recordId>/portrait.png`, plus provenance (face box, landmarks, transform matrix) as
   evidence. Face *recognition* is permanently out of scope.

Quality guards: face conf < 0.8 or multiple faces in one photo region → asset flagged
needs_review with candidates shown, never silently chosen.

## 2. Signature extraction (F12, P1.7)

1. **Locate:** template ROI (known family), or layout text-free zones near signature keywords
   ("signature", "signed", localized variants — lexical *hint*, not a doc-type rule), or user draw.
2. **Ink isolation:** local adaptive threshold (Sauvola) → stroke-width transform keeps thin
   varying-width strokes and drops printed text (near-constant stroke width) and lines →
   largest connected stroke cluster ∩ ROI.
3. **Clean:** remove ruled baseline (long horizontal runs), despeckle (< 3 px components).
4. **Output:** tight-bbox crop as **transparent-background PNG** (ink alpha = binarized mask,
   anti-aliased edges), OPFS `assets/<recordId>/signature.png` + mask provenance.
5. Honesty: signature *presence and clean crop* is the product; signature *verification/matching*
   is a non-goal.

## 3. Stamp / seal extraction (F12, P4.3)

1. **Locate:** PP-DocLayout `seal` boxes (the selection's free gift) ∪ chroma outliers (stamps are
   typically red/blue/violet ink: HSV gate vs page-dominant hues) ∪ Hough circles/ellipses.
2. **Mask:** color-gated pixels within the located region, morphological close → contour → mask
   tolerant of overlapping print (overlap pixels resolved by hue distance).
3. **Output:** masked crop PNG + mask, `assets/<recordId>/seal_<n>.png`. Stamps containing text
   get a foveated OCR pass (often circular — rotated line handling via polar unwrap when Hough
   gives a circle; best-effort, review-first).

## 4. The table engine (F14, P4.3)

### 4.1 Structure ladder (frozen fallbacks)
1. **Ruled:** morphological H/V line extraction → intersection grid → cells. Deterministic;
   handles the majority of invoices/statements.
2. **Borderless:** SLANet_plus (service stage) → cell grid; if spike-gate fails → LORE
   (`lineless_table_rec`) → x/y-cluster alignment of OCR boxes.
3. Method used is recorded per table (`method` field in the bundle) — provenance for debugging
   and benchmarks.

### 4.2 Cell filling
Cells are foveated: each cell ROI re-OCR'd at adequate DPI (batched); numeric-looking columns
(≥ 60 % numeric cells) get `AMOUNT` grammar re-decode (I3); header row detected by type contrast +
layout position and mapped to family schema columns when a template exists.

### 4.3 Arithmetic closure — the acceptance test (I1/I4 #19)
- Candidate equations auto-discovered: column sums vs bottom-row/labeled totals; row products
  (qty × unit ≈ line); subtotal + tax − discount ≈ grand total; ε = max(0.01, 0.5 %).
- **All discovered equations satisfied ⇒ the entire table self-attests** (every participating
  cell gets `arithmetic_closure`).
- One equation broken ⇒ solve for the single-cell repair: if **exactly one** cell substitution
  (from that cell's lattice top-k) satisfies *all* equations simultaneously, propose it as a
  high-confidence candidate (still marked, auto-confirmed only if an independent attestation also
  lands); if zero or multiple repairs exist ⇒ the implicated cells go to review with the broken
  equation displayed. The failure message is the equation — the user sees *why*.
- Tables without any discoverable arithmetic (schedules, rosters) simply don't get this
  attestation — their cells confirm via other channels or stay review-first. No fake certainty.

## 5. Cross-cutting rules

- Every asset and every cell carries evidence provenance (source region, transform, method) —
  inspectable in the UI ([12 §5](12_UI_UX_SPEC.md)).
- Assets export alongside records ([11 §7](11_WORKSPACE_DATA_MODEL.md)).
- No neural segmentation models in this layer by decision (04 §1.5, Constitution §7) — classical
  methods + layout seeding cover it; a measured failure would go through change control.
