# docdet v1 — CLASS SPECIFICATION (authoritative labeling contract)

This is the single source of truth for what every class means. Generators,
dataset importers, auto-label validators, and human QA all conform to THIS file.
Inconsistent labels are the #1 accuracy ceiling — when in doubt, this document
wins. Changing any rule requires a `CLASS_VERSION` bump + dataset migration.

Class version: **docdet-v1** (supersedes docdet-v0's single 12-class detector).

## Topology recap (why classes are split across models)
- **Model 1 — Page Locator:** `document_page` only, as a region + 4-corner quad.
- **Model 2 — Primitive Detector** (runs on the rectified page crop): the 10
  in-page primitives below.
- **Model 3 — Text Detector** (DBNet-style, on demand): `text_line`/`text_region`.
- `text_block` from docdet-v0 is **deleted** from the primitive set (moved to
  Model 3). `document_page` is **moved out** of the primitive set into Model 1.

---

## Global rules (apply to every class)
- **Coordinates:** Model 1 ground truth is a polygon/quad (clockwise from
  top-left). Model 2 ground truth is an axis-aligned box (AABB) in the rectified
  crop frame. Synthetic labels are exact-by-construction; imported/auto-labeled
  boxes follow the per-class rules below. The one exception is `ignore_region`,
  which is a polygon (see "The `ignore_region` mechanism").
- **Min size / ignore:** an instance whose shorter side is below the class
  min-size is marked `ignore=true` (excluded from loss AND from recall
  denominators), never silently dropped. **Min size is RELATIVE to the working
  frame's short side** (`PRIMITIVE_MIN_SIDE_FRAC` in `classes.py`); the
  absolute-px numbers are reference only. See "Min-size rule
  (resolution-invariant)" below — this is required because Model 2 runs on a
  variable-resolution rectified crop and on a full-frame fallback, so the same
  control must not flip ignore↔positive between frames.
- **Partial objects:** if an instance is clipped by the frame, label the visible
  polygon/box and set `truncated=true`. Enforce ≥25% visible to keep it as a
  positive; below that, `ignore=true`.
- **Overlap:** overlapping instances each get their own box (e.g., a signature
  on top of a stamp → both). Do not merge.
- **Hierarchy:** primitives are labeled independently of the page. A logo inside
  a document is still a `logo`; the page is Model 1's job.
- **Ignore beats every positive:** if a region is covered by an `ignore_region`
  polygon, no positive primitive box is emitted for the obscured content. Ignore
  is the safe sink for "obscured / ambiguous / out of scope."
- **Provenance:** every annotation carries `label_origin`, `generation_engine`,
  `domain_bucket`, `license_bucket`, `validator_status` (Section 9 of the master
  plan).

---

## The `ignore_region` mechanism (first-class annotation)

`ignore_region` is a **first-class annotation primitive**, not a detector class.
It exists because several negative rules need to say "this area must not count
for or against the model," and a per-instance `ignore=true` flag can only be
attached to a real class box — it cannot mark free-floating areas of the page.

- **What it is:** a free-floating **polygon** (not constrained to an AABB)
  labeled `ignore_region`, drawn anywhere on the working frame.
- **Not a class:** `ignore_region` has **no class id** in `PRIMITIVE_CLASS_NAMES`
  and is never a prediction target. It is consumed only by the loss/metrics
  masking step.
- **Effect:** any predicted or ground-truth content whose box center (or ≥50% of
  area) falls inside an `ignore_region` is **excluded from the loss AND from both
  the precision and the recall denominators**. A detection there is neither a
  true positive, a false positive, nor a false negative — it simply does not
  count.
- **Use it for:** watermarks; guilloché / security-print artwork; microprint
  fields; redaction bars; full-surface holographic OVD overlays; EMV chip and
  magnetic-stripe regions; tiled/background government crests; and **anything
  genuinely ambiguous** that an annotator cannot confidently assign to a class.
- **Precedence:** `ignore_region` wins over every positive class. If real content
  (e.g. a logo) is partly under a redaction bar, mask the obscured part with an
  `ignore_region` and only label the clearly-visible remainder.
- **Do not abuse:** `ignore_region` is for genuinely out-of-scope or unscorable
  pixels. It is not a way to hide hard-but-valid positives.

Negative rules that say "→ `ignore_region`" below all refer to THIS mechanism.

---

## Min-size rule (resolution-invariant)

Model 2 runs on (a) a **variable-resolution rectified crop** and (b) a
**full-frame fallback** when page rectification is skipped/failed. An absolute-px
threshold would mark the same control `ignore` in one frame and a positive in
another. The threshold is therefore **relative to the working frame's short
side**, matching `PRIMITIVE_MIN_SIDE_FRAC` in `classes.py`:

| class      | min shorter side (frac of working-frame short side) | reference px* |
|------------|-----------------------------------------------------|---------------|
| photo      | 0.015                                               | ~12 px        |
| signature  | 0.012                                               | ~12 px        |
| stamp      | 0.012                                               | ~12 px        |
| seal       | 0.012                                               | ~12 px        |
| logo       | 0.012                                               | ~12 px        |
| qr_code    | 0.012                                               | ~12 px        |
| barcode    | 0.012                                               | ~12 px        |
| mrz_zone   | 0.010                                               | ~8 px         |
| table      | 0.020                                               | ~16 px        |
| checkbox   | 0.010                                               | ~8 px         |

\* Reference px are illustrative only (≈ the value at an ~800 px short side) and
are NOT the gate. `PRIMITIVE_MIN_SIDE_PX` in `classes.py` is kept for reference;
`PRIMITIVE_MIN_SIDE_FRAC` is authoritative.

- An instance whose shorter side is below `frac × (working-frame short side)` is
  `ignore=true` (excluded from loss AND recall denominators), never dropped.
- **Full-frame fallback note:** when Model 2 runs on the full frame (no rectified
  crop), the "working-frame short side" is the **full image** short side, so the
  same fraction yields a larger absolute pixel floor — this is intended. The
  fraction, not a pixel count, is what keeps a control's ignore/positive status
  consistent across the rectified-crop branch and the full-frame branch. Per-class
  fractions never change between branches.

---

## Model 1

### document_page
- **Definition:** the visible extent of a single physical document, card, page,
  or receipt in the image.
- **Positive:** a passport page, an ID/credit-shaped card, a sheet of paper, a
  receipt, a form, a screenshot of a document (a document IS present), a page in
  a book IF it is the subject of the capture.
- **Negative:** the background scene; a monitor/desk that merely contains a doc
  (the doc is the positive, not the desk); a poster/sign on a wall (confuser).
- **Boundary rule:** label the document's own 4 corners as a **quad/polygon**,
  not the AABB. For curved/rolled receipts, label the visible outline polygon.
- **Multi-doc:** each document is a separate instance. A two-page spread = **two**
  `document_page` instances (one per page), split at the gutter.
- **Receipt roll:** label the **visible segment** only, `truncated=true` if it
  runs off-frame.
- **Partial:** visible polygon + `truncated=true`; ≥25% visible to be positive.
- **Min size:** shorter side ≥ 5% of image short side; below → `ignore`.

---

## Model 2 (in-page primitives, on the rectified crop)

### photo
- **Definition:** a photographic/continuous-tone portrait or scene image region
  embedded in the document.
- **Positive:** ID face photo; embedded scene/product photograph; a person photo
  on a certificate. (Subject to the content-validator gate below.)
- **Negative:** a **pictorial logo mark** (→ `logo`); a **chart/graph/diagram/
  figure** (out of scope, → see "figure/chart" rule, NOT labeled); a decorative
  background pattern (→ `ignore_region` if it would otherwise confuse).
- **Boundary:** tight AABB around the photographic region.
- **Min size:** shorter side ≥ 0.015 of working-frame short side (~12 px ref).
- **DATA-REALITY / content-validator gate (`NEEDS_CONTENT_VALIDATOR`):**
  DocLayNet `Picture` and PubLayNet `figure` are **NOT trusted as `photo`**.
  Those buckets are largely charts, diagrams, and line drawings, so importing
  them blind **poisons** the class. An imported `Picture`/`figure` becomes a
  `photo` label **only after a figure-vs-photo content validator passes**;
  otherwise it is dropped (treated as out-of-scope figure, NOT labeled). This
  matches `NEEDS_CONTENT_VALIDATOR = {"photo"}` in `classes.py`.

### figure / chart (out of scope — handling rule, NOT a class)
- **Ruling:** charts, graphs, plots, diagrams, schematics, line drawings, and
  generic "figure" regions are **out of scope and NOT labeled** in Model 2. They
  have no class and must not be emitted as `photo`.
- **Why this rule exists:** to stop annotators and importers from dumping
  DocLayNet `Picture` / PubLayNet `figure` content into `photo` (see the photo
  content-validator gate above).
- **If a figure region is actively confusing the detector,** an annotator MAY
  cover it with an `ignore_region`; otherwise simply leave it unlabeled.

### signature
- **Definition:** a handwritten signing mark.
- **Positive:** handwritten signature; handwritten initials; a stylized
  handwritten mark even if partly illegible.
- **Negative:** a **printed cursive name** in a font (NO); typed name lines (NO);
  **free handwriting that is not a signing mark** (handwritten notes, filled-in
  handwritten form answers, marginalia) → NOT a signature; it is handwritten
  text and is **not labeled in Model 2** (Model 3's job).
- **Overlap:** a signature overlapping a stamp/line → its own box AND the stamp's.
- **Boundary:** tight AABB around the ink strokes (not the surrounding ruled line).
- **Min size:** shorter side ≥ 0.012 of working-frame short side (~12 px ref).

### stamp
- **Definition:** an applied **inked impression** (rubber/ink stamp).
- **Positive:** circular/rectangular ink stamps; notary stamps with text;
  "PAID"/"RECEIVED"/date stamps; partial/smudged impressions; **a rubber-stamped
  company logo or a "RECEIVED" stamp that contains a logo** (application method
  wins — see Decision Tree tie-break c).
- **Negative:** a discrete applied non-ink **seal device** (→ `seal`); a crest
  printed **into** the document's background security artwork (→ `ignore_region`);
  a foreground printed **logo** that is not an inked impression (→ `logo`).
- **Boundary:** AABB around the inked impression extent.
- **Min size:** shorter side ≥ 0.012 of working-frame short side (~12 px ref).

### seal
- **Definition:** a **discrete applied non-ink seal device** (wax seal, foil
  disc, applied hologram sticker, dry-seal/deboss ring), classified by its role
  as an applied official device — NOT by whether relief survives the capture.
- **Positive:** wax seals; foil seal discs; applied hologram **stickers/devices**
  used as a discrete seal; notary deboss/dry-seal rings; **a flat-scanned
  embossed notary seal** (see Decision Tree tie-break a — still a `seal`).
- **Negative:** an inked impression (→ `stamp`); a foreground printed brand/
  government emblem acting as branding (→ `logo`); a crest printed into the
  background security artwork (→ `ignore_region`); a **full-surface holographic
  OVD overlay** covering most of the card (→ `ignore_region`, not a discrete
  device).
- **Boundary:** AABB around the seal device.
- **Min size:** shorter side ≥ 0.012 of working-frame short side (~12 px ref).
- **DATA-REALITY NOTE (`SYNTHETIC_OR_EVAL_ONLY_CLASSES`):** `seal` currently has
  **no license-clean real-data source**. It is trained **synthetically** and
  evaluated on real data only where any exists. It is **EXCLUDED from the hard
  real-recall gate** until a real source is added (see `classes.py`:
  `SYNTHETIC_OR_EVAL_ONLY_CLASSES = {"seal", "logo"}`). Do not gate this class on
  real recall yet.
- **NOTE:** stamp/seal/logo are the hardest confusion triple — see Decision Tree.

### logo
- **Definition:** a company/organization brand mark or government emblem used as
  **foreground branding** (letterhead/masthead/issuer mark).
- **Positive:** company logos; bank/vendor marks; a government emblem used as a
  **foreground letterhead/masthead brand**; a **credit-card holographic brand
  mark** (see Decision Tree tie-break b — decided as `logo`).
- **Negative:** a faint **watermark** (→ `ignore_region`); a **background/tiled/
  faint government crest** printed into the page as security artwork (→
  `ignore_region` — see the crest disambiguation rule in the Decision Tree); an
  inked **stamp** (→ `stamp`); a discrete applied **seal** device (→ `seal`); a
  photographic image (→ `photo`).
- **Boundary:** AABB around the mark (including wordmark if visually unified).
- **Min size:** shorter side ≥ 0.012 of working-frame short side (~12 px ref).
- **DATA-REALITY NOTE (`SYNTHETIC_OR_EVAL_ONLY_CLASSES`):** `logo` currently has
  **no license-clean real-data source** held to the gate. It is trained
  **synthetically** (and uses appearance/eval data where license-clean) and is
  **EXCLUDED from the hard real-recall gate** until a real source exists (see
  `classes.py`: `SYNTHETIC_OR_EVAL_ONLY_CLASSES = {"seal", "logo"}`).

### qr_code
- **Definition:** a 2D matrix code (QR, and by extension DataMatrix/Aztec are
  also `qr_code` for this detector).
- **Positive:** any 2D matrix barcode, even partially occluded, as long as the
  finder pattern is visible.
- **Negative:** 1D barcode (→ `barcode`); decorative grid/checkerboard art
  (confuser, NO).
- **Boundary:** tight AABB around the code quiet-zone.
- **Validator:** synthetic codes MUST decode; auto-labeled codes that decode are
  high-confidence positives, undecodable-but-clearly-QR are accepted with a flag.
- **Min size:** shorter side ≥ 0.012 of working-frame short side (~12 px ref).

### barcode
- **Definition:** a 1D linear barcode (Code128/39, EAN, UPC, ITF, PDF417 stacked
  linear).
- **Positive:** any linear/stacked-linear symbology.
- **Negative:** 2D matrix (→ `qr_code`); ruled lines / striped patterns
  (confuser, NO).
- **Boundary:** tight AABB including the bars (and the digits row if visually
  part of the symbol).
- **Validator:** same decode policy as qr_code.
- **Min size:** shorter side ≥ 0.012 of working-frame short side (~12 px ref).

### mrz_zone
- **Definition:** the full machine-readable zone band of an ID/passport, ALL
  lines together as one box. Per **ICAO 9303** the line counts are: **TD1 = 3
  lines, TD2 = 2 lines, TD3 = 2 lines** (TD3 is the passport book).
- **Positive:** the contiguous OCR-B `<`-filled band (all 3 lines for TD1; both
  lines for TD2/TD3).
- **Negative:** ordinary monospaced text; a single MRZ line in isolation is still
  part of the one zone box (do not split lines).
- **Boundary:** AABB enclosing all MRZ lines.
- **Validator:** synthetic MRZ passes ICAO regex + check digits.
- **Min size:** shorter side ≥ 0.010 of working-frame short side (~8 px ref;
  MRZ bands are short/wide).

### table
- **Definition:** a tabular structure (rows × columns), bordered OR borderless.
- **Positive:** bordered grids; borderless aligned columns; key-value form grids;
  **receipt line-item blocks**.
- **Negative:** a single line of text (→ Model 3); a form field group with no
  row/column structure; **multi-column running text** (reading-order text
  columns are NOT a table — no cell grid → not labeled, Model 3's job).
- **Nested tables (table-in-table):** label the **outermost** table as a single
  `table` box. Do **not** emit separate boxes for inner/nested tables — Model 2
  emits one region per table structure; nested-structure recovery is downstream.
- **Boundary:** AABB enclosing the full table (header + body).
- **Validator (auto-label):** require row/column evidence (≥2 rows AND ≥2 cols
  alignment) to accept.
- **Min size:** shorter side ≥ 0.020 of working-frame short side (~16 px ref).

### checkbox
- **Definition:** a small selection control.
- **Positive:** empty AND checked/crossed checkboxes; **radio buttons**; toggle
  squares/circles meant for selection.
- **Negative:** tiny decorative **square/round bullets** in body text (→ drop via
  min-size + context, or cover with `ignore_region` if they actively confuse the
  detector); table cell borders.
- **Boundary:** tight AABB around the control glyph only (not its label text).
- **Min size:** shorter side ≥ 0.010 of working-frame short side (~8 px ref;
  checkboxes are intrinsically small — this is why Model 2 runs on the rectified
  crop, where they are large enough relative to the short side).

---

## Model 3 (text, separate detector)
### text_line / text_region
- Handled by a DBNet-style detector. Definitions deferred to Model 3's own spec.
- **In Models 1/2, text is NEVER labeled** (no `text_block`). Text inside a
  stamp/seal/logo/mrz/table belongs to that primitive's box, not a text box.

---

## Decision tree for the hard confusions

**Round/emblem/applied element — is it stamp, seal, logo, or ignore?**

Classify by **OBSERVABLE 2-D APPEARANCE + ROLE**, never by relief/foil/
micro-shadow alone. Those relief cues do **not survive** flat scans, photocopies,
or compressed phone photos, so the same object would otherwise flip class with
the lighting. Relief MUST NOT decide the class.

1. **Inked impression?** (ink texture/color offset, smudge/rotation, over-printed
   on top of existing content; "PAID"/"RECEIVED"/date/notary text) → **stamp**.
   This holds even if the impression contains a brand/logo.
2. **Discrete applied non-ink device?** (a separate object stuck/struck onto the
   page: wax blob, foil disc, applied hologram sticker, deboss/dry-seal ring) →
   **seal**. Classify by the *role* of being a discrete applied device, not by
   how much relief the capture preserved.
3. **Foreground printed brand/issuer emblem?** (opaque, in the foreground,
   identifies the issuer; company mark, bank mark, or a government emblem used as
   a letterhead/masthead) → **logo**.
4. **Faint / background / tiled security artwork printed INTO the page?**
   (guilloché, microprint field, watermark-like or repeated crest) →
   **`ignore_region`** (document design, not a detector class).

**DEFAULT WHEN RELIEF IS NOT VISIBLE (capture-invariant fallback):** if you
cannot tell whether an emblem is embossed/foil because the capture is flat
(scan / photocopy / low light), do **NOT** guess `seal`. Decide on the 2-D
appearance + role only:
- reads as inked / over-printed → **stamp**
- foreground opaque issuer/brand emblem → **logo**
- faint background/tiled artwork → **`ignore_region`**
- a discrete applied device is still actually observable (visible wax / foil /
  sticker / deboss ring outline) → **seal**

**Government-crest contradiction — ONE rule (no exceptions):** a printed
government crest is classified **solely by role/appearance**, and the two
outcomes are mutually exclusive:
- **Foreground, opaque, identifying letterhead/masthead crest → `logo`.**
- **Faint, background, tiled, or watermark-like security-artwork crest →
  `ignore_region`.**
A crest is **never** simultaneously both, and it is never left in an undefined
"not labeled / maybe security artwork" state — it is exactly one of `logo` or
`ignore_region` per the foreground-vs-background test above.

**Tie-break rulings (the three known-ambiguous cases):**
- **(a) Flat-scanned embossed notary seal → `seal`.** Even when the emboss is
  flattened by the scan and reads as a faint colorless ring, it is a discrete
  applied official device. Classify by role as `seal`; do not downgrade to
  `ignore` just because relief is gone.
- **(b) Credit-card holographic brand mark → `logo`.** A holographic *brand/issuer
  mark* (e.g. the card-network bird/globe) is foreground branding → `logo`. (A
  *full-surface* hologram overlay is different → see Coverage Gaps → `ignore_region`.)
- **(c) Rubber-stamped company logo / "RECEIVED" stamp containing a logo →
  `stamp`.** The application method (inked impression) wins over the embedded
  brand content. One `stamp` box for the whole impression; do not also emit a
  `logo` for the brand inside it.

**Signature vs text:** handwritten signing strokes → `signature`; font glyphs and
free handwriting that is not a signing mark → not labeled in Model 2 (Model 3's
text).

**photo vs logo:** photographic/continuous-tone → `photo` (after the photo
content-validator gate); flat vector/brand mark → `logo`.

**photo vs figure/chart:** continuous-tone photograph → `photo`; chart/graph/
diagram/line drawing → out of scope, NOT labeled (never `photo`).

**qr vs barcode:** 2D matrix (finder squares) → `qr_code`; 1D bars → `barcode`.

**table vs form fields:** has row AND column structure → `table`; isolated
labeled fields without grid → not a table (fields are Model 3 text + checkbox);
reading-order text columns → not a table.

---

## Coverage gaps — explicit rulings

For each previously-undefined case, the ruling is positive / negative / ignore.
"Not labeled" means no class and no `ignore_region` (just leave it).

| case | ruling |
|------|--------|
| **Free handwriting that is NOT a signature** (notes, handwritten form answers, marginalia) | **Not labeled** in Model 2 — it is handwritten text → Model 3. NOT `signature`. |
| **Redaction bars** (solid black/white boxes over content) | **`ignore_region`** — they obscure content and must not score. Mask the bar; label only the clearly-visible remainder around it. |
| **EMV chip / magnetic stripe on cards** | **`ignore_region`** — not a detector class; the metallic contact pad and the dark mag-stripe band are masked out. |
| **Full-surface holographic OVD overlay** (hologram across most of the card) | **`ignore_region`** — it is a full-surface security overlay, NOT a discrete applied seal device (contrast a discrete hologram sticker → `seal`, and a holographic brand mark → `logo`). |
| **Ghost / secondary portrait on IDs** | **`photo`** if a face is actually resolvable (own box, even if faint). If it is only a faint translucent security duplicate / watermark-like tint with no resolvable face → **`ignore_region`**. |
| **Nested tables (table-in-table)** | **`table`** — one box on the **outermost** table only; do not emit inner-table boxes. |
| **Multi-column running text** | **Not labeled** in Model 2 — reading-order text columns are NOT a `table` (no cell grid) → Model 3. |

---

## Source-dataset mapping summary (full logic in `source_map.py`)
- DocLayNet: Page→Model1 page; **Picture→`photo` ONLY after the figure-vs-photo
  content validator passes** (charts/diagrams/line-drawings → out of scope, NOT
  labeled — see photo gate / `NEEDS_CONTENT_VALIDATOR`); (Title/Text/List/
  Caption→Model 3, NOT labeled in Model 2); Table→table.
- PubLayNet: **figure→ treated like DocLayNet Picture — NOT trusted as `photo`
  without the content validator** (it is mostly charts/figures).
- CommonForms: Choice Button→checkbox; Signature→signature; Text Input→Model 3.
- DDI-100 / StaVer: stamp masks→stamp (manual seal/stamp disambiguation pass).
- PubTables-1M: table→table.
- MIDV-500/2020: document quad→Model1 page; (field/photo/mrz where available)→
  photo/mrz_zone. (Research-only: eval/R&D, never shipped.)
- Tobacco-800: signature→signature; logo→logo (appearance/eval only — `logo` is
  `SYNTHETIC_OR_EVAL_ONLY`, not real-recall gated). CEDAR/GPDS: signature
  appearance.
- Barcode/QR real sets: →barcode/qr_code (eval + validator calibration).
- **`seal` and `logo` have NO license-clean real training source** mapped
  (`SYNTHETIC_OR_EVAL_ONLY_CLASSES`): trained synthetically, excluded from the
  hard real-recall gate until a real source exists.
