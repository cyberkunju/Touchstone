# HANDOFF — Live Development State

**Purpose:** everything needed to continue this project cold: what exists, what's in flight, what
to be careful of, and every non-obvious lesson paid for in debugging time. Companion to
[plan.md](plan.md) (the law) and [Documentation/](Documentation/README.md) (the spec).
Status source of truth: [Documentation/15_ROADMAP_TASKS.md](Documentation/15_ROADMAP_TASKS.md).

*Last updated: 2026-07-07 (night) — definitive certification chain running · P2/P3/P4/P6/P7
delegable tasks ALL absorbed by the lead (built + tested; src-destined pieces staged) ·
service core COMPLETE incl. HTTP surface, live-proven · first chain verdicts: passports
183/183, docs 37/37, licenses 126/126, ids 123/126 (2 silents root-caused, fix staged).*

---

## 1. Where the project stands (measured, not vibes)

| Metric | Value | Source |
|---|---|---|
| Unit tests | **484 green** across 28 files, tsc clean | `npm run test` |
| Service tests (Python) | **107 green** — tap, routes, bundle, ladder+reperceive, HTTP, codes, dewarp, tables, quality, layout decode, reconcile | `python -m pytest service/tests` |
| Staged src-patches | **80 green** — dHash, export, perception client, checkbox, shadow-CI, UI logic cores, question ranking | `npx vitest run --config .staging/vitest.staging.ts` |
| Perf budgets (service half) | **ALL GREEN live** — health 1.2ms/50 · digital 446ms/1000 · RSS 94MB/450 | `node bench/perf.mjs --service` |
| Passports (deepened, 183) | **183/183 · SILENT 0 · exit 0** | definitive chain |
| Docs (37) | **37/37 · SILENT 0** | definitive chain |
| Licenses (126) | **126/126 · SILENT 0** | definitive chain |
| ID cards (126) | 123/126 · **SILENT 2** — country_code truncation ("TO"), law fix staged (`.staging/fix-country-code.md`) | definitive chain |
| Visas (MRV) | smoke 10/10 · MRZ 100% · SILENT 0; full 40 in chain | visa smoke run |
| Real fakes | forge 280 complete; dual-witness fold RUNNING; `real` gate queued post-chain | `bench/label-real.ts` |
| **Dataset factory** | **1,471+ artifacts / 29 families** + mixed-page generator written (compile post-chain) | `test_cases/` |

### The immediate task queue (strict order)
1. Definitive chain (27 keys, running) → auto-commits baselines; triage any silents on completion
   (silents = blockers; recall floors ratchet later).
2. When the chain frees src/ + harness: run `.staging/apply-post-chain.ps1` (refusal-guarded,
   idempotent — applies the country-code law, moves all staged src-patches with import fixes,
   runs tsc + full vitest), then the printed gate sequence: `ids` re-gate → `real` (301
   entries) → mixed compile + gate (scoring patch: `.staging/gate-mixed-patch.md`) → browser
   perf half.
3. P4.1 second half: fetch layout model artifacts → A/B over degraded bench → verdict artifact.
4. Remaining hard core (lead-only): P5.2 consensus solver · P6.1 confusion priors · P4.3
   brain-side closure/repair · P3.6 A/B + enum lock.
5. Standing: rotate the pasted API keys when the factory settles; `.env.local` is gitignored.

### 1b. Silent errors killed to date (regression watchlist — 35 instances across 11 classes)
1. `mrzToFields` claimed composite-check coverage for fields ICAO's composite does NOT span
   (country_code/sex/names) → misread `XCO`/`XAN` promoted as proven. Fix: uncovered ⇒ `null`.
2. Legacy `parseMrz(autoCorrect)` minted checksum-consistent fiction when the beam refused.
   Fix: `reviewCap` law — non-beam MRZ sources can never auto-confirm.
3. Beam minted a valid TD2 from a squeezed TD3 (prefix-identical layouts). Fix:
   `MAX_GREEDY_EXCESS` length prior.
4. `U`→0 blur (mod-10 invisible class) passed all checks. Fix: `low_posterior` ambiguity kind,
   `MIN_INVISIBLE_POSTERIOR = 0.85`.
5. *(docs corpus)* invoice_number typed `text` let the vendor's COMPANY NAME pair under the
   "INVOICE" title and confirm (5 instances). Fix: `id_number` typing + digits `valuePattern`.
6. *(docs corpus)* CTC dropped a doubled digit (`7745`→`745`) and the unattested read confirmed
   (2 instances). Fix: **identifiers read from pixels alone are review-capped by law** — only
   attested paths (beam-proven MRZ, template/cross-channel consensus) auto-confirm ids.
7. *(licenses corpus, 14 instances)* GENERATOR bug, not engine: AAMVA `DBC` sex code X was
   rendered as '2' (female) — the barcode contradicted the printed card and the engine
   faithfully decoded the payload. Law: AAMVA DBC is 1=M, 2=F, 9=X. The gate audits the
   corpus generators too — that is a feature.
8. *(real fakes, forge_009 — the sharpest catch)* An AI fake printed PARTIALLY-correct check
   digits; the beam "corrected" the wrong printed expiry check into validity. Fix:
   **printed-contradiction guard** — correction may fix blurry pixels, NEVER overrule crisp
   print (top-1 crisp ≥ 0.85 differing + computed-evidence ratio < 0.25 ⇒ refuse).
9. *(bank/payslips, 10 instances)* Malformed amount tokens confirmed: merged neighbor digit
   (`6 3,707.56`), dropped digit breaking a comma group (`1,05.11`), double decimal
   (`4.511.28`). Fix: `isWellFormedAmountToken` — comma groups must be exactly 3 digits, one
   decimal point, no internal whitespace; malformed ⇒ score 0 (refuse to pair). Plus the gate
   now compares money NUMERICALLY (`3,859.6` ≡ `3859.60` — string compare was minting fake
   silents).
10. *(bank, 1 instance)* A WELL-FORMED but wrong amount (`1,055.1` — CTC dropped the trailing
    digit) auto-confirmed — no shape law can catch it. Fix: **closure attestation law** —
    documents that publish their own math (bank: opening+credits−debits=closing; payslip:
    gross−deductions=net) auto-confirm amounts ONLY when the equation verifies to the cent;
    broken/unevaluable closure review-caps every amount in the family.
11. *(ids deepened corpus, 2 instances)* Rotation clipped "UTO" → "TO" and the country-code
    pattern accepted 2–3 letters — truncation was unfalsifiable. Fix (staged): ICAO country
    codes are EXACTLY alpha-3; `valuePattern /^[A-Z]{3}$/`.

## 2. How to run everything

```bash
npm run dev                      # dev server :5173 (MUST be running for all browser harnesses)
npm run test                     # 432 unit tests
npx tsc --noEmit                 # typecheck
node scripts/fetch-models.mjs    # OCR models + YuNet → public/models (skips existing)

node bench/corpus/compile.cjs [--quick]        # passports → test_cases/passports/synthetic (6 themes)
node bench/corpus/compile-docs.cjs [--quick]   # invoices/receipts/forms/negatives → test_cases/docs/synthetic
node bench/corpus/compile-ids.cjs [--quick]    # TD1/TD2 id cards + AAMVA licenses (real PDF417)
node bench/corpus/compile-commerce.cjs [--quick] # bank statements / payslips / utility bills
node bench/corpus/compile-structured.cjs [--quick] # vehicle VIN docs / boarding Aztec / shipping Code128 / cards
node bench/forge-adversarial.mjs [--count N] [--dry] # GPT Image 2 photoreal fakes → refusal corpus
node bench/gate.mjs [--quick] [--commit] [--filter regex] [--verbose]
  [--corpus docs|real|ids|licenses|bank|payslips|utility|vehicles|boarding|shipping|cards]
                                 # THE gate. exit 2 = silent errors (absolute blocker),
                                 # exit 3 = baseline regression. Always writes
                                 # bench/baselines/last-run.json with full per-entry detail.
node bench/goldens.mjs [--commit]              # visual goldens → test_cases/visual_goldens/
npx vite-node bench/label-real.ts              # label real images: Mistral OCR + checksum proof
                                 # (creds via .env.local; offline reruns from ocr/ cache)
```

**ALL test data lives in `test_cases/`** (family/provenance tree — see
[test_cases/README.md](test_cases/README.md)); target coverage universe in
[Documentation/20_DOCUMENT_UNIVERSE.md](Documentation/20_DOCUMENT_UNIVERSE.md).

## 3. Critical operational knowledge (paid for in debugging — do not relearn)

### Browser/dev-server layer
- **`.puppeteer-profile/` is the model-cache accelerator** (OPFS persists → runs are 5–8 s/image
  instead of minutes). It MUST stay in `vite.config.ts` `watch.ignored` — Chrome holds locked
  SQLite WALs inside it and fs.watch on those **kills the dev server with EBUSY**. Also gitignored.
- **ORT wasm glue under Vite dev**: onnxruntime-web dynamically `import()`s `/ort/*.jsep.mjs`;
  Vite's transform pipeline refuses public-dir source imports → "no available backend found"
  (only when WebGPU is absent, i.e. headless — deceptive!). Fixed by `serveOrtGlueRaw()` in
  [vite.config.ts](vite.config.ts). It must set **COEP+COOP+CORP** on its responses: the glue
  spawns a nested pthread worker, and worker scripts in a crossOriginIsolated context need
  `COEP: require-corp` themselves or Chrome blocks with `ERR_BLOCKED_BY_RESPONSE`. PowerShell
  `Invoke-WebRequest` showing 200 proves nothing — it doesn't enforce COEP.
- **The app `alert()`s on failure** — an unhandled dialog **freezes the whole CDP session**
  (manifests as puppeteer `protocolTimeout`). Every harness must `page.on('dialog', dismiss)`.
- **Never DOM-poll (`waitForFunction`) during OCR** — WASM inference pegs the main thread and the
  poll starves. Harnesses are event-driven on console signals:
  `successfully verified and cached` / `Processing failed`.
- The gate parses the app's `[GATE] {json}` console line (emitted in
  [App.tsx](src/App.tsx) after verification). Renaming labels/statuses breaks scoring — update
  `LABEL_TO_TRUTH` in [bench/gate.mjs](bench/gate.mjs) in the same commit.
- Only ONE browser harness can run at a time (shared profile lock).

### Corpus generation
- **MRZ `<` must be HTML-escaped** in generated pages — unescaped, the browser parses the rest of
  the line as a tag and silently deletes it (found via band-pixel dump: only "P" rendered).
- MRZ font: **Lucida Console, normal weight, no letter-spacing** — Courier New's `<` is too faint
  for DBNet; wide tracking makes the recognizer emit CJK fullwidth garbage (`∩╝░`).
- Real passport anatomy = **caption above value**, never inline `Label: value` (OCR merges inline
  pairs into unparseable lines; real docs don't do it either).
- Rotation rungs must scale-to-fit (0.86×) or the MRZ rotates out of frame.
- `page.setContent(..., { waitUntil: 'load' })` for static pages — `networkidle0` can hang.
- Truth is *computed* (check digits, invoice totals) — labels are correct by mathematics. Never
  hand-type a golden; build it with the same `computeCheckDigit` and assert parser-valid first.

### Algorithms (subtle correctness points)
- **ICAO checksum blind spot**: characters with values ≡ 0 (mod 10) — `{0, A, K, U, <}` — are
  mutually INVISIBLE to every MRZ check digit. The decoder flags same-class near-ties as
  `ambiguities` and [App.tsx](src/App.tsx) withholds authoritative promotion for affected fields.
  Do not "fix" this by trusting checksums harder; it is mathematically unfixable at that layer
  (cross-channel attestation in P5 is the designed closure).
- **CTC synthetic lattices in tests MUST interleave blank separator steps** (char step, then
  `[['',0.92]]`) or doubled letters (ANNA, `<<<<`) are unrepresentable and everything fails
  mysteriously. Char *i* lives at lattice index *2i*.
- **Hungarian reduction**: infeasible/pad cells cost exactly `maxProfit` (= profit 0), NEVER a
  BIG constant — BIG makes assignment *cardinality* dominate total profit (two mediocre pairings
  beat one excellent one). The brute-force equivalence fuzz in
  [hungarian.test.ts](src/consensus/hungarian.test.ts) is the guard.
- **Skew estimator**: run-length filter (≤12 px runs = glyphs) is what makes it work on real
  pages — dark backgrounds otherwise drown the projection profile. It returns 0 unless the peak
  beats level by 8 % (never guesses). Test synthetics must be dashed/glyph-like or the run filter
  erases them. Shear sign was verified by test (first cut was exactly negated).
- **A calendar-valid date scores 0 as `id_number`** (type exclusion in
  [field-extraction.ts](src/docgraph/field-extraction.ts)) — a real silent error caught live by
  the gate (date confirmed into passport-number on a degraded scan).
- **YuNet 2023mar shipped artifact is STATIC 640×640** (input `[1,3,640,640]` verified by onnx
  graph inspection — the session throws on 320; the dynamic 2026may re-export 404s on the HF
  mirror). Blob is **BGR planar raw 0–255**, zero-padded top-left. Decode formulas are
  documented in [yunet.ts](src/ai-runtime/yunet.ts) verbatim from OpenCV's `face_detect.cpp`
  and fully parameterized by input size.
- **OPFS model cache can be POISONED**: requesting a model file before it exists in
  `public/models/` makes Vite's SPA fallback answer 200 with index.html, which gets cached
  forever and fed to ORT ("protobuf parsing failed"). [model-loader.ts](src/ai-runtime/model-loader.ts)
  now validates artifacts (HTML sniff) and self-heals by eviction — keep that guard.
- **Never edit source files while a gate run is in flight** — Vite HMR reloads the page the
  harness is driving mid-entry; the entry FAILs with a 360 s timeout or a stale-code read.
  Two "failures" in full-run 2 were exactly this artifact.
- **PP-OCR rec crops must keep NATURAL aspect** (`REC_MAX_WIDTH=2560`): clamping below natural
  width squeezes glyphs into shared receptive fields and CTC merges them (43-char greedy reads
  of 44-char MRZ lines; beam rightly refuses). PaddleOCR reference is uncapped by design.
- **Vocabulary crowding**: under blur, the 6.6k-class rec head scatters mass over CJK/fullwidth
  classes and the true char drops out of the top-5 lattice. `extractProjectedLattice` (posterior
  projected onto the legal alphabet, NFKC+case folding pools same-glyph variants, NO
  renormalization) is the antidote — wired via `ocrRegionLines({projectAlphabet})`.
- **DBNet under blur drops faint filler runs** (`ZOFIA<<<<…` detected only to `ZOFIA`), making
  fixed-length MRZ undecodable. `unifyLineWidths` extends sibling wide lines to their union
  (ICAO lines are equal-width by spec) and lets the RECOGNIZER judge the faint glyphs.
- **Perspective needs rotated-quad crops**: axis-aligned boxes feed slanted text + neighbor
  bleed. `postProcessDBNetQuads` (hull + rotating calipers) + `rectifyQuadBitmap` (exact affine)
  = PaddleOCR's `get_rotate_crop_image`. Took persp rungs 0→12/12.
- The corpus adversarial class (old AI-fake passports, `3/6/7.jpg`) **must keep failing to parse**
  — their MRZs are structurally non-ICAO; refusal = pass. If they ever "succeed", something
  started guessing.
- **Signature stroke-width discrimination is legitimately fooled by calligraphic print** (Arabic
  captions) — that is WHY the Signature hypothesis is review-capped; the goldens harness asserts
  sanity + drift, not shape aesthetics. OCR-text masking in the region removes what OCR *can*
  see; scripts OCR misses remain for the human.

## 4. Architecture state (what exists where)

- `src/beam/` — lattice (top-k=5) + `extractProjectedLattice`, CTC prefix beam (width 50, prior
  hook for P6), grammar library (date/amount/enum/id/email/phone + MRZ format specs),
  checksum-guided MRZ decoder with trace hook, plausibility gate (`MAX_LOGPROB_GAP=-20`,
  recalibrated on real lattices), excess-length prior (`MAX_GREEDY_EXCESS=2`), invisible-class
  ambiguity guard (`near_tie` + `low_posterior` kinds).
- `src/geometry/homography.ts` — Hartley-normalized DLT, deterministic RANSAC, frozen ladder
  (homography→affine→similarity→failed), `projectBox`; consumed by
  `TemplateEngine.computeAlignment`/`alignAndProject`.
- `src/docgraph/signature-ink.ts` — Sauvola (integral image), chamfer stroke-width stats,
  ruled-line removal, despeckle, cluster; wired in App with OCR-text masking + review cap.
- `src/consensus/` — Munkres optimal assignment (used by field extraction; full solver lands P5).
- `src/ai-runtime/yunet.ts` + worker `detectFaces` + `src/docgraph/portrait-frame.ts` — P1.7 core.
- `src/workers/preprocess.ts` — quality metrics + `estimateSkewDeg`; App rotates working bitmap
  AND regenerates the viewer URL (overlays must match processed pixels).
- App MRZ path: full-page OCR → `detectMrzZone` → **bottom-band hi-res fallback probe** when
  missed → hi-res re-OCR → beam-first decode → legacy parseMrz(autoCorrect) fallback.
- `bench/` — corpus compilers, gate, baselines (`p1.json` quick-committed; full pending),
  `_full_run.log`, `last-run.json` (per-entry detail, always written).
- Deferred by design (do NOT "helpfully" add): security hardening (Phase 7, owner decision),
  table engine (P4), attestor registry (P5), LWT priors (P6 — the beam's `prior` hook is wired
  and no-op). Frozen decisions live in plan.md §17; change control in §18/Constitution §6.

## 5. Open risks / watch items

- **4 silent errors in the full run** — unknown class until `last-run.json` lands. If they're the
  date-as-X pairing family, expect another type-exclusion; if MRZ-side, inspect ambiguity-guard
  coverage. Nothing ships past this.
- `id11_blur2` total OCR wipeout (0 fields, mrz=N, no silent) — blur2+jpeg60 at that identity's
  glyph mix kills DBNet. Candidate: foveated retry rung or acceptable-and-documented.
- `_probe.cjs` at repo root is a dev tool (gitignored); fold into `bench/` during P2 cleanup.
- Quick-gate baseline in `p1.json` predates the full run — re-commit after silent-error fix, else
  the ratchet is weaker than reality.
- The old `passport_test.png`/`invoice_test.png` fixtures and `browser_test.cjs`/`e2e_test.cjs`
  still reference pre-corpus flows; they evolve into journey tests in P2.

## 6. Update discipline for this file

This file is operational state, not spec. Update the status header + task queue + risks when a
work session ends; put durable lessons in §3; never let it contradict
[15_ROADMAP_TASKS.md](Documentation/15_ROADMAP_TASKS.md) — that file wins on status.
