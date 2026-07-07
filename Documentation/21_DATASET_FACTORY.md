# 21 — THE DATASET FACTORY (full-universe corpus plan)

Goal: **never hunt for datasets again.** One factory that generates, labels, degrades and
ratchets every family in [20_DOCUMENT_UNIVERSE.md](20_DOCUMENT_UNIVERSE.md) — then real-world
photos keep arriving through the intake pipeline and only make it stronger.

## 0. The law this plan stands on (proven live, 2026-07-07)

**Generative image models cannot produce ground truth for text documents.** All 21 AI-generated
passports in our real_fakes corpus carry mathematically invalid MRZs — generators paint
plausible glyphs, not correct data. At 1024², a 44-char MRZ gets ~23 px/char (below OCR floor).
Therefore the factory is FOUR engines, each used only where it is the right tool:

| Engine | Produces | Truth source | Cost |
|---|---|---|---|
| **E1 Truth Renderer** (ours: HTML→puppeteer, like compile.cjs) | Tier 1–3 core corpora | **Truth by construction** (checksums, arithmetic, known text) — G1, zero labeling | $0 |
| **E2 Physics Layer** (ours: canvas ops + compositing) | capture realism: blur/noise/rotation/perspective/glare + hand-held/desk/screen-photo contexts | inherits E1 truth (geometry-tracked) | $0 |
| **E3 Adversarial Forge** (GPT Image 2) | photoreal FAKES + non-document negatives + background scenes for E2 | **R labels by definition** (refusal expected; checksum-fail verified) | low — the ONLY image-API use |
| **E4 Real Intake** (Mistral OCR 4 + optional GPT 5.4 adjudicator) | labels for REAL photos users contribute | math-verified (G1) or cross-source (G2) or review (G4) | per real image only |

## 1. What each API is for — and what it is NOT for

- **GPT Image 2** — E3 only: ~250–350 generations to start, **expandable freely**: fake-
  document labels are self-verifying (checksum-fail = confirmed fake, refusal expected), so
  the adversarial corpus can grow without any labeling cost. What it is superb at — SCENE
  realism (lighting, hands, texture) — is exactly what E2 composites consume; what it cannot
  do — DATA realism (checksums, arithmetic; proven live: 21/21 AI passports checksum-invalid)
  — is exactly why it never produces scoreable corpus documents.
  - ~150 photoreal fake IDs/passports/invoices (refusal corpus growth; label = "must refuse").
  - ~50–80 non-document negatives (desks, receipts-in-hands blurry, bookshelves, whiteboards).
  - ~50 clean background scenes (hands, desks, clipboards, car dashboards) that E2 composites
    our RENDERED documents onto with perspective warp — photorealism WITHOUT losing truth.
  - **Never** for corpus documents whose text we must score against.
- **Mistral OCR 4** — the OCR witness. Research verdict: it is a dedicated document-OCR API
  (markdown + tables + layout) — strong at *structure/boxes/tables* (user's intuition correct).
  Used for: (a) real-photo intake labeling (as built in `bench/label-real.ts`), (b) silver
  labels on E3 fakes, (c) table-structure cross-checks for Tier 2/3 real photos.
- **GPT 5.4** — two narrow jobs (it IS vision-capable and reads images directly — that is
  precisely why it works as a witness):
  - **Content writer**: batches of realistic field CONTENT for E1 (names/addresses/vendors/
    line-items across ~10 locales & scripts) — JSON in, rendered by us, truth preserved.
  - **Adjudicator / second witness on real photos**: reads the IMAGE itself. Its value is
    architectural independence from Mistral (semantic vision-language model vs dedicated
    OCR-with-geometry) — agreement between two UNLIKE readers is genuine evidence (G2);
    agreement between two similar OCRs would be correlated error. Where checksum math
    exists, math alone decides — no model outranks it.
  - NOT needed for the synthetic bulk (truth exists before the pixel).
- Barcodes (AAMVA PDF417, boarding-pass Aztec, tracking Code128) are generated **exactly**
  with a barcode library (e.g. bwip-js) inside E1 — payload known, decode verifiable. This is
  Tier 1's biggest unlock: license barcode ↔ VIZ cross-check needs zero new ML.

## 2. Target counts (diversity beats volume — axes, not mass)

| Block | Contents | Count |
|---|---|---|
| Tier 1 identity | passports ✅138 · TD1 id cards 132 · TD2 66 · MRV visas 66 · residence permits 44 · AAMVA licenses w/ real PDF417 132 | **578** |
| Tier 2 commerce | invoices 125 (25 layouts×5 rungs) · receipts 75 (thermal fonts) · bank statements 50 · payslips 50 · tax-style forms 50 · utility bills 50 · POs/quotes 25 | **425** |
| Tier 3 forms/structured | forms 60 (+handwriting-font fills) · certificates w/ seals 50 · transcripts 50 · vehicle docs w/ real VIN check digits 50 · boarding passes w/ real Aztec 50 · shipping labels w/ real tracking digits 50 · business cards 45 · letters/contracts 30 | **385** |
| Tier 4 digital-native | PDFs/XLSX/DOCX files 30 · +2 new rungs (screenshot moiré, screen-photo) applied to 2 identities/family | **~120** |
| Tier 5 adversarial/negative | E3 fakes 150 · negatives 80 · blank forms 20 · foreign-script (REAL Arabic/CJK/Cyrillic text rendered by E1 — no AI) 45 · handwriting-font stress 30 | **325** |
| E2 photo-context composites | 3 capture contexts × ~100 documents sampled across families | **300** |
| **TOTAL** | | **≈ 2,100–2,300 images** (+30 native files) |

Why not 20k: generalization comes from covering the *axes* (font × layout × script ×
degradation × capture-physics × fraud), not from repeating points. 2k images covering 6 axes
beat 50k near-duplicates — and stay runnable.

## 3. The gate-runtime budget (the practical constraint nobody mentions)

Full pipeline ≈ 8 s/image ⇒ 2,200 images ≈ **5 h per full run**. Therefore three gate levels:
- `--quick` (~1 min): per-commit smoke, unchanged.
- **per-family** (~10–30 min): mandatory for any change touching that family's path.
- **full universe** (~5 h): nightly/weekly + before any baseline commit. Same ratchet law.

## 4. Execution order (corpus first, code second — the standing law)

1. **W1**: E1 generators for TD1/TD2/MRV (reuse MRZ machinery — days, biggest unlock)
   + bwip-js PDF417 into an AAMVA license renderer.
2. **W2**: Tier 2 expansion (bank statements/payslips/tax/utility renderers — all reuse the
   invoice arithmetic-closure pattern) + thermal-receipt fonts.
3. **W3**: Tier 3 renderers (certificates w/ seal graphics, transcripts, VIN docs, boarding
   passes, shipping labels) + E2 compositing layer (perspective paste onto scenes).
4. **W4**: E3 batch (GPT Image 2: fakes + negatives + scenes) → label via existing
   `label-real.ts` flow (checksum-fail ⇒ R; silver via Mistral) + Tier 4 native files
   + foreign-script E1 packs.
5. Each block lands with its manifest + per-family baseline BEFORE the next starts.

## 5. What "1000% then flawless on future images" honestly means

The factory maximizes the two things that transfer to unseen documents:
- **Coverage of physics** (capture, degradation, layout, script) — so perception generalizes.
- **Proof discipline** (checksums, arithmetic, cross-source, templates) — so a wrong read
  can never silently pass, even on a document family we have never seen.

Recall on truly novel families will still start below 100 % — and the system will SAY SO
(review-first) instead of pretending. That property, plus the intake pipeline that turns
every new real photo into labeled corpus within minutes, is what "no more dataset hunting"
actually is: the dataset builds itself from use.
