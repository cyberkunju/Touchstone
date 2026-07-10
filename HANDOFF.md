# HANDOFF — Live Development State

**Purpose:** everything needed to continue this project cold: what exists, what's in flight, what
to be careful of, and every non-obvious lesson paid for in debugging time. Companion to
[Documentation/](Documentation/README.md) (the spec), [PERCEPTION_MASTER_PLAN.md](PERCEPTION_MASTER_PLAN.md)
(the perception build-out record), and [Documentation/15_ROADMAP_TASKS.md](Documentation/15_ROADMAP_TASKS.md)
(status source of truth). The previous edition of this file (pre-perception, 2026-07-09) is in
git history at `39c11fc` — its §1b silent-error classes 1–11 remain law and are locked by tests.

*Last updated: 2026-07-10 — **REAL-WORLD PERCEPTION BUILD-OUT COMPLETE (P1–P9), commit `191b183`**:
the engine was confronted with ~90 realistic photographed-passport images (`passptest/`, gitignored),
an external GPT-5.4 vision judge, and a human tester — every failure was root-caused and killed.
183/183 passports SILENT=0 (recall 99.9%), 810 unit tests, all five perf budgets, J3/J4,
13/13 visual-binding acceptance, typecheck/lint/build clean. External judge on 10 random
real-world images: mean 5.9 → 8.2, status honesty 9.5/10, zero silent errors.*

---

## 0. READ THIS FIRST — the shape of the whole project

This is an **attestation engine**, not an OCR wrapper. The one law that outranks everything:

> **N1 — a field is `confirmed` ⟺ an attestor PROVED it.** Confidence is never proof.
> A wrong confirmed value is the only unforgivable defect class. Refusal/review is always
> an acceptable answer; a fabricated answer never is.

Proof sources (the ONLY things that confirm): MRZ check digits through the **beam decoder**
(legacy parse can never confirm), barcode payload duplication (PDF417/Aztec — Reed-Solomon),
arithmetic closure (documents that publish their own math), cross-channel agreement, and the
sealed consensus solver (`ConfirmedField` is unforgeable outside its sole constructor).

Everything below exists in service of that law. When in doubt: **omit or review-cap, never guess.**

## 1. Where the project stands (measured, not vibes)

| Metric | Value | Source |
|---|---|---|
| **Committed head** | `02c2649` pushed to `origin/main` + `touchstone/main`; certification-evidence commit follows this handoff update | `git log`, remote refs |
| **Universe recall record** | **29/29 families · 1,649/1,656 · SILENT=0** (burst `ap-nfYHTCuf8Cbk1NRWfoQnNS`, sealed `d21ede0`) | committed baselines |
| **Post-perception universe certification** | **29/29 · 1,644/1,656 · SILENT=0, coverage complete** (dry run `ap-56e3BbnOzcs6WXlt8pbKa2`; five conservative-refusal passes below the recall record, baselines intentionally unchanged) | Modal scoreboard, 2026-07-10 |
| Passport family (post-perception) | **183/183 · SILENT=0 · recall 99.9% · adversarial refusal 100% · no baseline regression** | `bench/baselines/last-run.json` |
| Unit tests | **810 green / 60 files** (Bun + Vitest 4) | `bun run test` |
| Service tests (Python) | 123 green | `python -m pytest service/tests` |
| Perf budgets | 5/5 green (unknown-doc 4.7s/8s · known-template 525ms/1.5s · digital 279ms/1s · health 0.9ms/50ms · RSS 95MB/450MB) | `node bench/perf.mjs` |
| UI acceptance | visual-binding 13/13 · J3/J4 e2e green | `bench/visual-binding.mjs`, `bench/e2e-ui.mjs` |
| Static gates | typecheck=0 · lint=0 (ESLint 10 flat) · build=0 (Vite 8.1.4) | CI seven-job green at `39c11fc` |
| Security | npm audit 0 · pip-audit 0 · CSP zero third-party origins | committed CI |
| **External vision judge** | 10 random real-world images: **mean 8.2/10, status honesty 9.5, zero silents** | `test_screenshots/judge/v2rnd*.verdict.json` |

### The immediate task queue (strict order)
1. **Continue the real-world test loop** — the user uploads photos into the running app and
   screenshots failures; fix at root cause, one image at a time. The harness trio in §3 makes
   any single image fully forensic in <60 s.
2. Investigate the 12 honest recall misses only when a real-image failure intersects them:
  cards 1, certificates 1, transcripts 4, composites 6. Do not trade N1 for their recovery;
  the 1,649 record remains the recall high-water mark.
3. Standing: rotate the exposed keys (W&B, Azure, Modal — see §6), delete `bin/` (59 GB), keep
   `.env.local` gitignored.

## 2. The real-world perception saga (2026-07-10) — what was built and WHY

The user proved with one screenshot that the certified synthetic corpus did NOT imply
real-world quality. The response was a systematic evaluation loop:

1. `bench/inspect-one.mjs <image>` — run ANY image through the live app; dumps every hypothesis
   (label, canonical, value, status, box), the full DIAG trail, and a UI screenshot.
2. An external **GPT-5.4 vision judge** (`bench/vision-judge.mjs`) — composites the engine's
   boxes onto the engine's *working bitmap* plus the full app page, and grades boxing,
   form-truth, and status-honesty in strict JSON.
3. A 20-image ground-truth pack labeled by a second vision model (`passpout/passptest_20.json`,
   mapping in `passptest_20/mapping.txt` — both gitignored).

Every defect found became a **named law with a unit test**. In build order:

### Perception (the geometry stack)
- **Quad-native recognition (P1)** — `detectAndRecognize` post-processes ONE DBNet forward both
  ways; genuinely tilted lines (≥2.5°, ≥60px, IoU≥0.5 quad match) are recognized from
  **rectified crops**; level lines keep the certified axis path bit-identical. `quadNorm` flows
  onto `OcrItem`.
- **Projective page rectification** — [src/geometry/page-rectify.ts](src/geometry/page-rectify.ts):
  Otsu luminance page-quad + DLT inverse-bilinear warp. Guards: area fraction 20–95%, convexity,
  side ratios, **border-contrast ≥30** (a WHITE table swallowed page+table into one junk quad —
  live failure), keystone ≥3° to bother, and **ADOPT-ONLY-IF-VERIFIED** (post-warp residual skew
  must be ≤3° or the warp is refused). A wrong warp is worse than none.
- **Deskew ±40°** ([src/workers/preprocess.ts](src/workers/preprocess.ts)) — live-caught TWICE:
  a ~20° page sat outside the original ±12° window, then a ~30° page outside ±25°. Each time
  every caption→value binding downstream ran on diagonal geometry and produced garbage.
- **Keystone law** ([src/App.tsx](src/App.tsx)) — measured from line-quad headings after deskew:
  spread ≥5° across ≥4 tilted lines OR median |angle| ≥8° ⇒ **every geometry-only binding is
  dropped** (checksum-witnessed fields survive), the generic layer is suppressed, and an honest
  banner explains why. Review status does NOT excuse a wrong VALUE on screen.
- **Gutter partition (P8)** — wide pages (aspect ≥1.35, ≥10 lines) with a clean low-crosser
  valley in x∈[0.42,0.58] split into L/R surfaces (`OcrItem.regionId`); `relate()`, generic
  `positionScore`, and continuation merge all refuse cross-surface pairs.

### Character-level geometry (P5)
- `decodeCTCGreedy` returns **`charSpans`** (per emitted character, the crop-x fraction of its
  CTC emission, split at neighbor midpoints). Inline `"Label: value"` values now carry
  **sub-boxes covering only the value's characters** (`subBoxForCharRange`).
- **MRZ per-line geometry survives every probe path** — `MrzZone.lineBoxesNorm` is recorded by
  the bottom-band fallback, the docdet-seeded probe, the hi-res re-read, AND the foveated retry
  (each maps region→page coordinates). `mrzBoxFor` prefers explicit line boxes; the
  whole-band-box failure class is dead.

### Trust & MRZ hardening
- **autoCorrect can no longer forge validity** ([src/parsers/mrz.ts](src/parsers/mrz.ts)) — the
  legacy checksum-guided repair now obeys three laws: (a) **position-class** — candidates must be
  legal for the ICAO position (dates are digits-only; the old code wrote `GO0101` INTO A DATE);
  (b) **uniqueness** — if ≥2 distinct repairs pass the check digit, the repair is a guess ⇒
  refuse (an all-zero fake doc number had FIVE passing mutations); (c) **blast-radius** — ≥2
  independently-checked components failing simultaneously is forgery/garbage, not OCR noise ⇒
  no correction at all. A real AI-fake passport was being "repaired" into `mrzValid=true`.
- **Partial-MRZ offset tomography (P7)** — [src/parsers/mrz-partial.ts](src/parsers/mrz-partial.ts):
  a frame-cropped TD3 line-2 fragment recovers a field ONLY when the field's complete data
  window + its dedicated check digit lie inside the fragment at a viable alignment AND the value
  is invariant across ALL viable alignments. Edge inference from the line box touching the frame.
  Recovered values gap-fill **review-capped** (checksum-verified ≠ beam-proven).
- **TD3 `personal_number`** (optional data, dedicated check digit at pos 42) wired end-to-end:
  lexicon spec, `mrzToFields`, character spans, attestor `CHECKSUM_COVERED_FIELDS`.

### Extraction correctness
- **Multilingual caption compiler (P3)** — `normalizeLabelText` folds diacritics (é→e, ü→u,
  ß→ss; the old strip turned é into a SPACE and broke every accented caption); synonyms fold at
  match time; DE/FR/ES lexemes added (`pass nr`, `prénoms`, `gültig bis`, `apellidos`, …).
- **ICAO code-table validation** — `country_code` accepts 1–3 letters ONLY when the exact string
  is a known ICAO issuing-state code (`isKnownCountryCode`); Germany legitimately prints `D`,
  and a length regex can neither accept it nor refuse shape-valid garbage.
- **Free-text continuation merge (P2)** — `issuing_authority` + `place_of_birth` merge ≤2
  strictly-below, aligned, free-text-shaped continuation lines ("UNITED STATES / DEPARTMENT OF /
  STATE"). **Typed values NEVER merge** — a real page stacks two dates in one visual column and
  a blind join fabricates "01 JAN 2023 31 DEC 2032". Union evidence box; continuation nodes
  claimed. The full k-best span hypergraph was **deliberately not built** (no evidence demands
  it — see PERCEPTION_MASTER_PLAN §6).
- **Text-physics law** — a 1–3-character token whose box is taller than 0.12 page-height is OCR
  garbage (ghost-art), never a value. Live-caught: a quarter-page `D` passed the ICAO validator
  and stole `country_code` from the true `XBB` on 24 corpus entries.
- **Signature laws** — captions (`signature`, `titulaire`, `unterschrift`, `firma`) are definite
  labels (a caption was bound as a FULL NAME value); signature ink must have extent (≥3% width,
  ≥0.9% height, ≥150 px) AND ≥1.5% density inside its own bbox (empty-area boxes judged twice).
- **Stamps-page admission gate (P4)** — `pageAdmitsGenericExtraction`: caption anchors must be
  proportional (≥3 or ≥8% of pool — ONE stray colon among 89 stamp fragments must not veto);
  tilt-scatter (≥4 tilted lines across ≥3 15°-heading bins) or chaos fraction >0.4 refuses.
  A stamps spread went from 46 garbage caption→value pairs to 1 honest signature asset.
- **Counterfactual readability (P6)** — ≤6 uncertain typed fields (bindingAmbiguous, score<0.6,
  or conf<0.78) are re-read at native resolution in one batched call; **divergence review-caps,
  agreement changes nothing** (two readings of the same pixels are correlated — never a proof).

### Honesty & UX
- **Quality-refusal banner** — <4 legible lines AND no MRZ AND no barcode ⇒ the pipeline stops
  with "Image quality too poor…", emits `[GATE] {fields:[], qualityRefused:true}`, and shows a
  role=alert banner. No fabricated fields.
- **Printed-value transparency** — when normalization changed the surface form (ISO dates), the
  hypothesis carries `displayValue` = the printed text, and the form shows "printed: …" beneath
  the input. The judge repeatedly graded ISO values as "wrong" until the printed source was shown.
- **Template trust boundary** ([src/template-engine/template.ts](src/template-engine/template.ts)) —
  only confirmed/user-edited bindings compile into template fields/anchors; unresolved scalars
  are skipped with a warning; a graph with ZERO resolved scalars throws. (First cut threw on ANY
  unresolved binding — the perf harness live-caught that it killed the legitimate
  save-after-closure flow. The law is "never fossilize noise", not "never save".)
- **Network-free processing** — mid-pipeline dynamic imports died when the dev server restarted
  (user-hit crash: plain PNG upload failed with "Failed to fetch dynamically imported module").
  Geometry/skew/partial-MRZ are static imports; PDF detection is an inline `%PDF-` magic-byte
  sniff; PDF.js loads through a memoized self-healing loader; module-fetch failures alert with
  an actionable message.
- **Responsive UI system** ([src/index.css](src/index.css)) — fluid root font
  `clamp(13px…16.5px)`, spacing tokens, component classes (`.app-header`, `.tab-btn`, `.btn`,
  `.badge`, `.field-card` + status left-borders, `.status-pill`, `.field-input`), grid main
  (`minmax(0,1fr) clamp(330px,31vw,500px)`), single-column stack <1100px, phone tier <560px.
  `bench/responsive-smoke.mjs` screenshots 1920/1366/820.

## 3. How to run everything

```bash
bun run dev                      # dev server :5173 (MUST be up for all browser harnesses)
bun run test                     # 810-test unit suite
bun run lint && bun run typecheck && bun run build
node scripts/fetch-models.mjs    # OCR models + YuNet + docdet → public/models

# ---- single-image forensics (THE real-world loop) ----
node bench/inspect-one.mjs "path/to/image.png" --out tag [--headful] [--chrome]
  # → test_screenshots/inspect/tag.json (hypotheses+boxes+DIAG) + tag.ui.png
node bench/vision-judge.mjs "path/to/image.png" --out tag
  # external GPT-5.4 judge (needs .env.local); → test_screenshots/judge/tag.verdict.json
  # + tag.composite.png (boxes on WORKING bitmap) + tag.apppage.png
node bench/responsive-smoke.mjs [image]        # 3-viewport UI screenshots

# ---- corpus & certification ----
node bench/gate.mjs [--quick] [--commit] [--filter regex] [--corpus <family>]
  # exit 2 = silent errors (absolute blocker), exit 3 = baseline regression
  # ALWAYS writes bench/baselines/last-run.json with per-entry detail
node bench/visual-binding.mjs                  # 13-check UI truth acceptance
node bench/e2e-ui.mjs                          # J3/J4 journeys (NOT while gate runs)
node bench/perf.mjs                            # five budgets (starts its own preview)
$env:PYTHONUTF8='1'; modal run bench/modal_gate.py 2>&1 | Select-Object -Last 55
  # full 29-family universe burst (~8 min, ~$3, profile stratosix-labs)
```

**Credentials** live in `.env.local` (gitignored): Azure endpoint + key, `GPT_TEXT_DEPLOYMENT=gpt-5.4`
(the judge), `GPT_IMAGE_DEPLOYMENT=gpt-image-2` (fake forging), Mistral OCR (real-image labeling).
Loaded by `loadEnvLocal()` in [bench/ai-services.mjs](bench/ai-services.mjs).

**Test data:** `test_cases/` (committed corpus tree) · `passptest/` (~90 realistic passport
photos, gitignored, user-supplied) · `passptest_20/` + `passpout/passptest_20.json` (renamed
subset + external vision ground truth, gitignored).

## 4. Silent errors & garbage classes killed to date (regression watchlist)

Classes 1–11 (pre-perception: composite-coverage lie, legacy-MRZ fiction, TD2-from-TD3 squeeze,
U→0 blur, invoice-title steal, CTC doubled-digit drop, AAMVA DBC generator bug, forged-check
"correction" of crisp print, malformed amount tokens, closure-less amount confirm, clipped
"TO" country code) are preserved verbatim in the previous HANDOFF edition (`git show
39c11fc:HANDOFF.md`) and locked by tests. The perception round added:

12. **Legacy autoCorrect forged `mrzValid=true` on an AI fake** — repaired `E000000000…` (3
    failing components) field-by-field into validity, wrote letters into a DATE window
    (`900101→GO0101`), then the corrupted MRZ *contradicted a correct VIZ read* into conflict.
    Fix: position-class + uniqueness + blast-radius laws (`mrz.test.ts` locks all three).
13. **Ghost-art token stole a field** — quarter-page `D` (ICAO-valid string!) beat the true
    `XBB` for country_code on 24 entries. Fix: text-physics law (tiny token ⇒ line-height box).
14. **Caption bound as value across languages** — `SIGNATURE DU TITULAIRE` became full_name.
    Fix: signature-caption family in `isDefiniteFieldLabel`.
15. **Accented captions never matched** — `Prénoms`, `Gültig bis`, `Staatsangehörigkeit`
    normalized é→SPACE. Fix: NFKD diacritic folding both sides of synonym matching.
16. **Germany's `D` refused / garbage `XQZ` accepted** by the alpha-3 length regex. Fix:
    ICAO table validation (`valueValidator` on FieldSpec).
17. **Multiline authority truncated** to its first line on every US-style page. Fix:
    continuation merge (free-text only — typed merge fabricates; p20 counterexample test).
18. **Stamps spread → 46 fabricated caption→value pairs** (all review, but garbage). Fix:
    proportional-anchor + tilt-scatter + chaos admission gate.
19. **20–30° camera tilt → all bindings garbage** (Surname=FRANÇAISE, Given Names=a date;
    later Type='E', authority=CJK noise — wrong VALUES at review status). Fixes: deskew ±40°,
    page rectification, keystone suppression law.
20. **Whole-MRZ-band boxes** on every regional-probe path (`itemIds:[]` starved
    `projectMrzFieldBox`). Fix: `lineBoxesNorm` through all four probe paths.
21. **Signature sliver on empty area** (3.5%×0.6% blob) judged twice on different pages. Fix:
    extent + ink-density plausibility.
22. **A 9↔0 personal-number misread surfaced at review** (correctly held — kept as the P6
    exemplar: uncertain identifiers get the counterfactual re-read; still never confirmable
    from pixels alone).

**Meta-lesson the next agent must internalize:** corpus SILENT=0 does NOT imply visual
correctness or real-world quality. The judge loop (inspect-one → vision-judge → root-cause →
law + test → re-gate) is the only methodology that survived contact with reality.

## 5. Critical operational knowledge (paid for in debugging — do not relearn)

### Browser/dev-server layer
- `.puppeteer-profile/` = model-cache accelerator (OPFS). MUST stay in `vite.config.ts`
  `watch.ignored` (Chrome's locked SQLite WALs kill the dev server with EBUSY) and gitignored.
  **IndexedDB persists across runs** — stale templates/families CAN alter engine behavior
  (a fossilized template once re-projected 40 garbage fields; purge via a puppeteer evaluate
  clearing the `templates` store when hunting heisenbugs).
- **Vite 8 binds `localhost` IPv6-first (::1) on Windows** — harnesses hitting `127.0.0.1`
  get ERR_CONNECTION_REFUSED while the server is healthy. Always use `http://localhost:5173`.
- Only ONE `.puppeteer-profile` harness at a time (gate vs e2e-ui collide on the profile lock).
  `vision-judge`/`visual-binding` use `test_screenshots/.visual-binding-profile` and CAN run
  alongside the gate.
- The app `alert()`s on failure — an unhandled dialog freezes the whole CDP session. Every
  harness must `page.on('dialog', dismiss)`.
- Never DOM-poll during OCR (WASM pegs the main thread) — harnesses are event-driven on the
  `[GATE] {json}` console line. **The graph console-arg `jsonValue()` resolves AFTER the GATE
  line** — wait ~1.5s or the captured graph is empty (the judge once graded a composite with
  zero boxes because of this race).
- Puppeteer protocol keep-alives can hold node's event loop open after work completes —
  bench scripts end with `process.exit(0)`.
- `window.__docutract.workingImage` (set in App after deskew/rectification) is the ONLY
  correct base for compositing engine boxes — boxes live in working-bitmap space, and
  compositing on the original photo silently misaligns everything the moment deskew fires.
- ORT wasm glue under Vite dev is served by `serveOrtGlueRaw()` in vite.config.ts with
  COEP+COOP+CORP headers (nested pthread workers need `COEP: require-corp` themselves).
- A stale tab needs a reload after a dev-server restart (new module hashes); image uploads
  themselves are now network-free after page load.

### PowerShell/Windows layer
- `2>&1 | Select-Object`/`Select-String` swallow exit codes AND can show stale buffered output —
  verify with `$LASTEXITCODE` per command (`bun run x > $null 2>&1; $LASTEXITCODE`).
- Multi-line `node -e "…"` in PS: escaped quotes break; prefer single-line or a temp file.
- `Get-Random -SetSeed 42` makes image sampling reproducible across sessions.
- NEVER run `modal run` unpiped (progress UI + backgrounding = interrupt at dispatch).
- `$env:PYTHONUTF8='1'` before any Python that prints the scoreboard (Windows cp1252).

### TypeScript/build layer
- **TS 5.9: `new ImageData(view)` rejects `Uint8ClampedArray<ArrayBufferLike>`** — wrap in a
  fresh `new Uint8ClampedArray(copy)` to pin the ArrayBuffer type.
- ESLint 10 flat config (`eslint.config.js`); `--max-warnings 0` is the CI law.
- Vite build "chunk larger than 500 kB" is a warning, not a failure — check `$LASTEXITCODE`,
  not the scary text.

### Algorithms (subtle correctness points — unchanged laws still in force)
- ICAO checksum blind spot `{0,A,K,U,<}` (mod-10 invisible) — beam flags ambiguities;
  affected fields are never authoritatively promoted. Unfixable at that layer by design.
- CTC synthetic lattices in tests MUST interleave blank steps (char at index 2i).
- Hungarian pad cells cost exactly maxProfit, never BIG (cardinality-vs-profit trap).
- `estimateSkewDeg` returns 0 unless the peak beats level by 8% — never guesses; test
  synthetics must be dashed/glyph-like (≤12px runs) or the run filter erases them.
- A calendar-valid date scores 0 as `id_number` (type exclusion).
- PP-OCR rec crops keep NATURAL aspect (`REC_MAX_WIDTH=2560`); clamping merges glyphs.
- `extractProjectedLattice` (alphabet projection, no renorm) is the blur antidote for MRZ.
- `unifyLineWidths` extends sibling MRZ lines to their union (equal-width by ICAO spec).
- OPFS model cache self-heals HTML poisoning (SPA-fallback 200s) — keep the sniff guard.
- The adversarial corpus (`real_fakes/3|6|7.jpg`) must keep REFUSING to parse — if they ever
  "succeed", something started guessing.
- Never edit `src/**` while a gate run is in flight (HMR reloads the page mid-entry).
- MRZ corpus rendering: `<` must be HTML-escaped; Lucida Console, no letter-spacing;
  captions above values; rotation rungs scale-to-fit 0.86×.

## 6. Security/keys status
- `.env.local` (gitignored) holds a shared Azure key for GPT-5.4/GPT-Image-2/Mistral-OCR —
  **user should rotate it** along with the previously-exposed W&B and Modal tokens.
- Workspace encryption (AES-GCM-256, PBKDF2 600k) is wired ("Protect this workspace").
- CSP allows zero third-party origins; the only network egress is the explicit model fetch
  and the (localhost-only, bearer-token) perception service.

## 7. Architecture map (what exists where)

- `src/ai-runtime/` — ocr.ts (DBNet post-proc axis+quads, CTC greedy **+charSpans**, tensor
  norms), model-registry/loader (OPFS, sha-pinned, HTML-poison self-heal), yunet.ts (faces),
  image-enhance.ts.
- `src/workers/inference.worker.ts` — sessions (WebGPU→WASM fallback), batched
  `detectAndRecognize` (quad-rectified tilted lines), `recognizeBoxes` (P6 probes),
  `ocrRegionLines` (regional hi-res, alphabet projection, width unification), layout detection
  (docdet_v1), face detection.
- `src/workers/preprocess.ts` — quality metrics, `estimateSkewDeg` (±40°).
- `src/geometry/` — homography.ts (Hartley-normalized DLT, RANSAC, frozen ladder),
  **page-rectify.ts** (page quad + projective warp).
- `src/beam/` — lattices (top-k=5 + projection), CTC prefix beam (width 50, prior hook),
  grammar library, checksum-guided MRZ decoder (the ONLY proof-grade reader), plausibility
  gate, excess-length prior, invisible-class ambiguity guard.
- `src/parsers/` — mrz.ts (parse + hardened autoCorrect), **mrz-partial.ts** (offset
  tomography), scalars.ts (dates incl. space-separated "24 02 2021", amounts, ids), aamva.ts,
  pdf-text-layer.ts, pdf-runtime.ts (lazy, memoized).
- `src/docgraph/` — field-extraction.ts (lexicons + `valueValidator` + relate/regionId +
  Hungarian + orphan law + continuation merge + text-physics + `subBoxForCharRange`),
  generic-extraction.ts (structural-geometry laws + admission gate + regionId),
  mrz-fields.ts (country tables, `isKnownCountryCode`, field char spans, box projection),
  mrz-zone.ts (+`lineBoxesNorm`), builder.ts (+`setHypothesisDisplayValue`), signature-ink.ts,
  portrait-frame.ts, document-classify.ts, table-closure.ts, hypotheses.ts.
- `src/consensus/` — sealed solver (`ConfirmedField` unforgeable), attestor registry
  (checksums/dates/closure/MRZ/payloads — claim-gating law), bridge (justify+downgrade+promote,
  certified at universe scale; legacy MRZ can never radiate proof), quorum, hungarian.
- `src/verifier/` — status law: no proof ⇒ no confirm (confidence-only confirmation removed).
- `src/template-engine/` — learn (trust boundary), match (fingerprint), sparse anchor-probe
  refill (I8), alignment ladder consumer.
- `src/components/` — DocumentViewer (high-DPI, status-colored overlays, DPR-correct clicks),
  FormEditor (field-card system, printed-value hint, canonical data attributes), 
  EvidenceInspector (binding trace, aspect-true crops), ReviewLane/QuestionCards (J3/J4),
  WorkspaceView/Table, UploadManager, WorkspaceProtection, ModelLoaderOverlay.
- `src/App.tsx` — THE pipeline: decode → rectify/deskew → quality+hook → OCR (service branch
  when coordinates coherent) → gutter partition → quality-refusal gate → MRZ ladder
  (zone→band→docdet-seed→hi-res→beam→foveated retry→legacy(review-capped)→partial recovery) →
  AAMVA promotion → known-field extraction (keystone law, MRZ reconciliation, P6 probes) →
  closure attestation → MRZ fallback boxes → gap-fill → generic layer (admission gate) →
  portrait/signature → codes → template path → verify → consensus → workspace filing → [GATE].
- `src/storage/` + `src/workspace/` — IndexedDB stores (docGraphs/templates/families/records/
  priors/benchruns/keyring), assembly, crypto-gate.
- `service/` — FastAPI perception twin (123 pytest), loopback + bearer token, Docker.
- `bench/` — gate (per-family baselines + ratchets), **inspect-one**, **vision-judge**,
  **visual-binding**, **responsive-smoke**, e2e-ui, perf, goldens, corpus compilers,
  forge-adversarial, modal_gate.py (burst), ai-services.mjs (Azure/Mistral clients).

## 8. What is deliberately NOT built (do not "helpfully" add)
- LayoutLM/Donut/LLM extraction (budget, latency, fabrication risk — violates N1).
- Generative deblur/super-resolution (manufactures strokes — destroys evidence).
- OCR ensembles as attestors (correlated readings can agree on the same wrong glyph).
- Unconditional warps/CLAHE/thresholding (every transform needs a trigger + identity fallback).
- Full k-best value-span hypergraph & stroke-type classifier (no failure class demands them;
  the scoped versions in place are documented in PERCEPTION_MASTER_PLAN §6).
- Rotated-polygon UI rewrite (quads stay internal; AABBs to the viewer).

## 9. Handoff instructions for the next agent
1. Read [Documentation/00_CONSTITUTION.md](Documentation/00_CONSTITUTION.md), this file, then
   [PERCEPTION_MASTER_PLAN.md](PERCEPTION_MASTER_PLAN.md) §6 (build table + decisions).
2. Repo memory (`/memories/repo/docutract-state.md`) carries the compressed session ledger —
   trust it; it was updated at every milestone.
3. Any engine claim must be re-provable in one command from §3. If you can't re-prove it,
   treat it as false.
4. The user's standard: **exceptional, root-cause, no silent errors, honest refusal**. They
   test with real photos and screenshots; they explicitly reject repeated broad test loops as
   a substitute for root-causing a single real image.
5. Before ANY "done" claim: units + family gate + visual-binding + perf + (for engine-wide
   changes) the Modal universe burst. SILENT=0 is non-negotiable; recall may only ratchet up.
