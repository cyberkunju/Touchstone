# PERCEPTION MASTER PLAN — Boxing, Layout, Extraction, OCR

Three independent deep analyses (Agent A: innovation brainstorm; Agent B: ruthless
principal-engineer critique; C: live image-by-image evidence from `passptest` +
external vision ground truth on 20 renamed images) were produced in parallel and
merged here. Every item is grounded in this codebase and constrained by:
browser-only ONNX WASM, <50MB models, TypeScript, the N1 law (a wrong CONFIRMED
value is catastrophic; refusal is acceptable; confidence is never proof), and the
certified corpus (1,649/1,656, SILENT=0) which must never regress.

---

## 1. The Convergent Diagnosis (all three opinions agree)

1. **Structure is discarded too early.** `OcrItem` keeps only text + one
   axis-aligned box + confidence + lattice. Page region, rotated quad, script,
   ink source, local quality, and transform provenance are destroyed before
   binding ever runs. Every downstream failure is a shadow of this loss.
2. **The superior rotated-quad OCR path already exists and is unused.**
   `src/ai-runtime/ocr.ts` contains quad detection + rectified crop recognition,
   but the main full-page path in `src/workers/inference.worker.ts` calls the
   axis-aligned `detectLinesCore`. The engine owns the cure and doesn't take it.
3. **One-caption→one-node binding cannot represent reality.** A three-line
   authority, a stacked bilingual value, a wrapped address — all are invisible
   to a matcher whose value universe is single OCR items
   (`src/docgraph/field-extraction.ts`).
4. **Quality signals are cosmetic.** `preprocess.ts` hardcodes `perspective` and
   `cropCompleteness` as good; enhancement applies the same stretch to every
   crop; verifier penalties are page-global, not per-evidence-region.
5. **Proof arrives after geometry has already chosen.** Checksums/arithmetic
   mostly *cap* bad assignments post-hoc instead of *constraining which
   assignment can exist*.

Live-evidence confirmations (C): US 3-line authority truncated (p02–p04);
blurred+tilted Indian pages collapse (p08–p10); stamps spread → 40 garbage
pairs (p05); cropped French MRZ → total loss (p13–p14); fake US MRZ was
*repaired into validity* by legacy autoCorrect (p03 — **already fixed**:
position-class + uniqueness + blast-radius laws in `src/parsers/mrz.ts`);
`Personal No.` had no lexicon entry (p01 — **already fixed**); Germany prints
country code `D` which the alpha-3-only pattern refuses (p11/p12 — **open**).

---

## 2. Unified Ranked Roadmap

Ordering = (live-evidence frequency × N1 risk removed) / implementation cost.
Every phase carries an activation gate: full corpus ≥ 1,649/1,656, SILENT=0,
and byte-identical output on clean paths when the feature's trigger doesn't fire.

### P1 — Quad-Native Perception Frame  *(A#1, B#2, C#4 — unanimous top pick)*
Kill: tilt/perspective collapse; lying rectangles.
- Main path switches to the existing rotated-quad detection; non-level lines get
  rectified crops before recognition (already implemented for MRZ regional reads).
- Estimate a page frame: `document_page` detection + contour corners + RANSAC
  text-baseline vanishing lines → homography accepted ONLY with a unique
  low-residual solution; identity fallback otherwise (a wrong warp is worse
  than no warp).
- `OcrItem` gains `polygonNorm` (source quad) + `layoutBoxNorm` (rectified
  frame box) + `regionId`. Binding runs in rectified coordinates; UI keeps
  AABBs mapped back through the inverse transform. No viewer rewrite.
- Gate: ≥40% CER reduction and ≥30-point field recall gain on keystone/rotation
  fixtures; exact parity on clean corpus.

### P2 — Multi-Line Value Spans  *(A#2, B#1, C#2 — unanimous #2)*
Kill: truncated authorities/addresses; neighboring-field steals.
- Two stages:
  1. **This week (C's surgical version):** constrained continuation merge for
     FREE-TEXT fields only (issuing_authority, place_of_birth, address-like):
     next line strictly below within 1.6 line-heights, left-aligned within
     tolerance, similar x-height, not a caption (`isDefiniteFieldLabel`), not
     claimed, same `regionId`. NEVER merge typed values — p20 stacks two dates
     in one visual column; a blind join would fabricate
     "01 JAN 2023 31 DEC 2032" (live counterexample).
  2. **Then (A/B's full version):** ValueSpan hypergraph — enumerate 1–4-line
     blocks under alignment/axis/gap/no-intervening-caption constraints, score
     caption→block hyperedges, k-best disjoint set-packing with explicit NULL;
     low assignment margin always review-caps; all member `valueNodeIds` linked.
- Gate: ≥90% exact recovery of clear 2–3-line values; ≥80% fewer neighbor
  steals; zero multiline-derived confirmation without an attestor.

### P3 — Multilingual Caption Compiler  *(A#7, B#10, C#3)*
Kill: bilingual/trilingual caption misses (German/French/Spanish/Chinese live pages).
- Immediate lexeme injection (near-zero risk, exact containment matching):
  DE: pass-nr, vornamen, staatsangehörigkeit, geburtsdatum, geburtsort,
  gültig bis, ausstellungsdatum, ausstellende behörde, personal-nr;
  FR: passeport n°, prénoms, née le, délivrance, expiration, autorité,
  lieu de naissance; ES: apellidos, nombres, fecha de nacimiento, caducidad;
  ZH: 护照号, 姓名, 性别, 国籍, 出生日期, 出生地点, 签发日期, 有效期至, 签发机关.
- Slash/stacked-segment parsing: each `/`-separated or vertically-paired segment
  matches independently; independent language segments agreeing on the same
  canonical field = strong caption; disagreement = reject (dual-witness law).
- Unproved aliases never enter the global registry (document-scoped only).
- Gate: +25 caption-recall points on multilingual fixtures; false canonical
  matches < 0.1%.

### P4 — Ink-Layer Quarantine  *(A#6, B#9, C live p05/p17)*
Kill: 40-garbage-pair stamps pages; stamp text entering field extraction.
- Use existing `stamp`/`signature`/`photo`/`text_block` detections + cluster OCR
  by angle/script/x-height/stroke regularity. Only dominant printed-text
  clusters enter scalar extraction; stamp clusters become review-only
  page annotations (visible, never captions, never confirmable values).
- Cheap admission gate first: a page with zero lexicon caption hits AND
  rotated/mixed-script clusters emits annotations instead of caption→value pairs.
- Gate: p05-class page produces ≤3 review annotations (from 40); ≤5% loss of
  unobscured printed fields elsewhere.

### P5 — Proof-Carrying Character Geometry  *(A#4, B#8 — INVENTION)*
Kill: whole-MRZ-band evidence boxes; imprecise substring boxes.
- Preserve CTC per-character timestep ranges through decoding; project each
  decoded character back through the line's rectification transform to a
  quad slice. A field records exactly the character slices it used.
- Fix the concrete hole B found: fallback MRZ probes set `itemIds: []` so
  `projectMrzFieldBox` degrades to the whole band — retain page-mapped line
  boxes in the regional path.
- Gate: substring-box IoU > 0.85 on clear MRZ/inline goldens; zero whole-band
  fallbacks when line geometry exists.

### P6 — Field-Local Counterfactual Readability  *(A#3, B#3)*
Kill: confident garbage under blur/glare; indiscriminate enhancement.
- Per-value-polygon quality (blur, clipping, contrast, stroke, periodic
  background). Uncertain/required-missing ROIs get ≤2 native-resolution rereads
  with selected enhancement branches (raw always retained; illumination
  flattening, grayscale, channel-minimum under glare).
- Lattices are ALIGNED and compared, never averaged (correlated readings of the
  same pixels are not independent witnesses). Divergence/entropy/blank-pressure
  can only refuse or expose alternatives — stability never confirms.
- Replace hardcoded `cropCompleteness` with boundary-touching component counts
  and clipped-quad tests (B#13).
- Gate: zero silent values on blur challenge; ≥95% retention of clean readable
  fields; triggers on <10% of clean pages.

### P7 — Offset-Tomographic Partial MRZ  *(A#9, B#5 — INVENTION)*
Kill: total loss on frame-cropped MRZs (live p13/p14).
- Model each observed line as a canonical-MRZ substring with latent offset;
  enumerate offsets constrained by glyph pitch, sibling geometry, image-edge
  contact, format grammar. Emit a proven field ONLY when its complete data span
  + dedicated check digit are fully observed and the value is invariant across
  every surviving offset/decode. Absent pixels are never filler characters.
- Gate: recover ≥1 proven field from 60% of one-sided crops; zero fabricated
  fillers; names/composite-only fragments never proven.

### P8 — Spread Decomposition + Constraint IR + Script Routing  *(consolidation)*
- Hard gutter partition (B#4): corroborated low-ink vertical seam + page
  detections → immutable `regionId`s; extraction never crosses regions.
- Constraint-automata redecoding (B#7): dates/amounts/alpha-3/enums as explicit
  automata over lattices with lattice-ceiling gap + per-char mass floor guards.
- Script-island posterior routing (A#13): per-line Unicode-script posterior
  mass routes decoding alphabets; mixed lines split into timestep islands.
- Security-print residual OCR (A#10, B#11): background estimation → ink
  residual; components present only in periodic/chromatic layers are nuisance.
- Detector-disagreement refill (B#12): `text_block` zones with poor DBNet
  coverage get native-resolution regional rereads under a fixed budget.

### P9 — Immediate surgical fixes (independent of phases, this week)
1. **ICAO short country codes** (C, live p11/p12): `country_code` valuePattern
   refuses Germany's legitimate `D`. Accept 1–3 letters ONLY when the exact
   string is a known ICAO issuing-state code (reuse the `mrz-fields.ts`
   country table); alpha-3 rule stays for everything else.
2. ~~Personal number lexicon + TD3 optional-data checksum wiring~~ — DONE.
3. ~~Legacy autoCorrect forging validity on fakes~~ — DONE (position-class,
   uniqueness, blast-radius).
4. **K-best binding shadow** (A#11): refuse any binding whose winner changes
   under small score perturbation (margin law generalized to all types).
5. Space-separated numeric dates ("24 02 2021", French VIZ) accepted by the
   date normalizer.

---

## 3. Where the Three Opinions Differed (and the ruling)

| Question | A | B | C | Ruling |
|---|---|---|---|---|
| Multiline mechanism | full hypergraph now | span graph + syndrome rejection | staged: merge now, graph later | **C's staging** — ship the constrained merge behind the same tests, grow into B's span graph |
| Homography trust | unique low-residual or identity | corroborated frame + RANSAC baselines | wrong warp worse than no warp | All agree: **identity fallback**; never unconditional warp |
| Caption ML classifier | optional 2–5MB ONNX later | scoped equivalence classes, no ML | lexeme injection first | **Lexemes + segments now**; ML only if recall gate misses |
| Stamps handling | quarantine clusters | ink-layer firewall + provenance classes | cheap admission gate first | **Gate first, firewall second** |
| Partial MRZ priority | high (#9) | high (#5) | after P1–P4 (frequency-weighted) | **P7 slot** — high value, high care, not first |

## 4. Unified DO-NOT-BUILD (unanimous)

- LayoutLM/Donut/LLM extraction — budget, latency, fabrication risk, no proof semantics.
- Generative deblur/super-resolution — manufactures strokes; destroys evidence.
- OCR ensembles / photometric variants treated as independent attestors —
  correlated readings can agree on the same wrong glyph.
- Unconditional warp/CLAHE/threshold/sharpen — a wrong transform corrupts the
  certified clean path.
- Naive rectangle-overlap line concatenation — swallows adjacent fields (p20 proves it).
- Padding/hallucinating cropped MRZ chars — unknown offsets are not fillers.
- `docdet_v1` boxes as truth — proposal generator only; quarantine and seed, never bind.
- Raising confidence thresholds as "safety" — confident CTC deletion stays confidently wrong.
- Rotated-polygon UI rewrite — keep quads internal, map to AABBs.
- Learned GNN binder this quarter — duplicates deterministic geometry at calibration cost.

## 5. Execution Order

```
Week 1: P9 (surgical fixes) + P2 stage-1 (continuation merge) + P3 lexemes
Week 2: P1 (quad-native frame)  ← the structural unlock everything else rides on
Week 3: P4 (ink quarantine) + P5 (character geometry)
Week 4: P6 (readability gate) + P2 stage-2 (span graph)
Week 5: P7 (partial MRZ) + P8 (consolidation)
Each phase: fixtures first → implementation → full corpus gate → visual-binding
browser acceptance → commit. No phase may proceed with SILENT > 0.
```

## 6. Build Status (2026-07-10)

| Phase | Status | Delivered as |
|---|---|---|
| P1 quad-native | ✅ BUILT | tilt-triggered rectified crops in `detectAndRecognize`; `quadNorm` on OcrItem; **projective page rectification** (`src/geometry/page-rectify.ts`: Otsu page-quad + DLT warp, border-contrast guard, adopt-only-if-verified); deskew ±40°; keystone law (suppression + honesty banner) |
| P2 spans | ✅ BUILT (scoped) | continuation merge for `issuing_authority` + `place_of_birth`, typed values never merge, same-region guard; full k-best hypergraph deliberately NOT built (no corpus/live evidence demanding it — DO-NOT-BUILD complexity discipline) |
| P3 captions | ✅ BUILT | diacritic folding, DE/FR/ES lexemes, dual-language slash captions, ICAO-table code validation |
| P4 ink quarantine | ✅ BUILT (gate form) | proportional-anchor + tilt-scatter + chaos admission gate (46 garbage pairs → 1 honest asset); stroke-classifier deferred until a live failure demands it |
| P5 char geometry | ✅ BUILT | CTC `charSpans` from greedy decoder; inline "Label: value" sub-boxes; MRZ per-line boxes retained through band/layout/hi-res/foveated paths (`lineBoxesNorm`) — whole-band fallback eliminated |
| P6 readability | ✅ BUILT | counterfactual native-resolution re-read of ≤6 uncertain typed fields; divergence review-caps, agreement changes nothing; page-level honest refusal banner (<4 legible + no MRZ + no codes) |
| P7 partial MRZ | ✅ BUILT | `src/parsers/mrz-partial.ts` offset-tomography: complete window + check digit + unique viable alignment; recovered fields gap-fill review-capped |
| P8 consolidation | ✅ BUILT (scoped) | gutter partition (`regionId`, cross-surface binding forbidden in both extractors); constraint-IR/script-routing/security-print deferred — no live failure class demands them yet |
| P9 surgical | ✅ BUILT | ICAO short codes, personal_number, endorsements, space dates, signature caption+ink laws, printed-value transparency, template trust boundary, network-free processing |
```
