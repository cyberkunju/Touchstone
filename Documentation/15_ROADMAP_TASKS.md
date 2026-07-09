# 15 — Roadmap & Tasks

The complete build sequence. Phases are strictly ordered; tasks within a phase are numbered and
executed in order unless marked ∥ (parallelizable). Every task ends with: code + tests green +
gate not worsened. This file mirrors and elaborates plan.md §15 (which remains the frozen law).

---

## Phase 1 — Passport E2E Perfection *(current browser app; no backend)*

*Rationale: the plan's riskiest bet (checksum-guided lattice decoding) is falsified or proven
first, on real documents, in the already-working app. All work is brain-side → 100 % preserved
investment.*

**STATUS (2026-07-07, end of session): P1.1–P1.9 ✅ ALL DONE — GATE P1 PASSED AND CERTIFIED.
Full-corpus certification run: **138/138, SILENT = 0, MRZ 100 %, fields 98.6 %, adversarial
refusal 100 %** — committed as the ratchet baseline (`bench/baselines/p1.json`). Docs corpus
first measurement surfaced 7 invoice_number silents (company-name steal via `text` typing +
unattested CTC digit-drops); both classes fixed (id_number typing + digits pattern; identifiers
from pixels alone are now review-capped by law) → re-run **37/37, SILENT = 0**, committed
(`bench/baselines/docs.json`). Visual goldens ALL PASS (committed ratchet). Unit suite 432
green across 25 files. Phase 2 is next.**

| Task | Status | Work | Done when |
|---|---|---|---|
| P1.1 | ✅ | Lattice exposure: refactor `src/ai-runtime/ocr.ts` post-proc to emit top-k=5 lattice alongside kept `decodeCTCGreedy`; type in `src/beam/lattice.ts` | lattice invariants unit-tested; existing OCR tests green |
| P1.2 | ✅ | `src/beam/beam-search.ts` generic CTC-aware beam (width 50, prior hook no-op) | synthetic-lattice suite green incl. null-return cases |
| P1.3 ∥ | ✅ | Grammars: `date`, `amount`, `enum`, `id`, `mrz-td1/2/3`, `email`, `phone` (07 §3) | per-grammar suites: valid/invalid/ambiguity emission |
| P1.4 | ✅ | `src/beam/mrz-beam.ts` joint checksum-constrained decoder (07 §4) + invisible-class ambiguity guard + plausibility gate + LINE_BREAK structural tokens | corruption suite green; **zero incorrect accepts** (1 000-round fuzz) |
| P1.5 | ✅ | Wire: MRZ path in `App.tsx` beam-first (hi-res band lattices; bottom-band fallback probe added); old parser = final fallback; honest EP metadata | live decode proven on corpus (`TD3 logProb=-16.08`, all checks pass, O/0 corrected) |
| P1.6 | ✅ | Typed re-decode (sex/dates) + `consensus/hungarian.ts` (Munkres, brute-force-fuzz-verified) replacing greedy pairing; date-as-id type exclusion | "c/call"-class extinct; silent-error regression test added |
| P1.7 ∥ | ✅ | YuNet in registry+worker+fetch (640×640 static input verified against the live artifact; poisoned-OPFS self-heal added); `portrait-frame.ts` (roll/3:4/eye-line 45 %) wired in App; `signature-ink.ts` (Sauvola + chamfer stroke-width variability + ruled-line removal + cluster; text-masked region; review-capped) | crops verified: `bench/goldens.mjs` ALL PASS (geometry asserts + committed ratchet + human-inspectable PNGs) |
| P1.8 | ✅ | Deskew (`estimateSkewDeg`, rot rungs 0→100 %); `geometry/homography.ts` (Hartley-normalized DLT, deterministic RANSAC, frozen ladder homography→affine→similarity→failed, wild-anchor rejection); `TemplateEngine.computeAlignment` once-per-doc + `alignAndProject` through `projectBox`; JIT-lite refill timing diag | 11-test suite incl. 40 %-outlier fuzz; fields land in correct ROIs under synthetic rotation/perspective (persp rungs 12/12 live) |
| P1.9 | ✅ | **Exceeded plan**: `bench/corpus/compile.cjs` (ground-truth passport corpus: seeded identities, computed check digits, 11-rung physics ladder, conflict + adversarial classes) + `bench/corpus/compile-docs.cjs` (invoices/receipts/forms/negatives) + `bench/gate.mjs` (silent-error law, per-corpus ratchet baselines, `--filter`, persisted last-run report); archive move done early | gate runs one-command; baselines committed |

**GATE P1:** ~~on `passport_images/`~~ *(superseded: the ground-truth corpus replaced unlabeled
AI-fake images as the gate corpus — fakes remain as the adversarial refusal class)*: MRZ valid
parse ≥ committed baseline on legible MRZs ✅ (97.8 %) · **silent errors = 0** ✅ (full corpus) ·
garbage fields = 0 ✅ (label-steal fix; fields 97.8 %) · template alignment through the frozen
homography ladder with fields landing in correct ROIs under rotation/perspective ✅ (JIT-lite
refill instrumented; full re-upload timing measured in P2 alongside the workspace flow) · all
legacy tests green ✅ (432/432). **GATE P1: PASSED — Phase 1 complete.**

## Phase 2 — Workspace: Families, Records, Bulk, Export

| Task | Work | Done when |
|---|---|---|
| P2.1 | ✅ | IndexedDB v2 migration (`workspace-db.ts`, adds-only, tested against a REAL populated v1 db) + `family-store.ts`/`record-store.ts` (11 §1; append-only law, exact rolling stats) | migration idempotency + CRUD tests ✅ (workspace-stores suite) |
| P2.2 ∥ | 🔶 staged ✅ | `geometry/phash.ts` (dHash-64, spec interface `dHash64`/`hammingDistance`, area-average grid, malformed⇒64) built + tested in `.staging/src-patches/` (13 tests incl. THE acceptance: 3 real corpus rescan pairs at Hamming ≤ 8 via RGBA fixtures); moves into src/ when the chain frees it | dedupe detects exact + near-dup in tests ✅ (staged) |
| P2.3 | ✅ | Routing state machine (11 §4) as a pure reducer (`src/workspace/routing.ts`; frozen thresholds 0.75/0.55; IllegalTransition loud on every unlisted pair; bulk queue concurrency-2 per-file isolation) | J1/J2/J4 scripted green ✅ + exhaustive state×event sweep (28 legal pairs) |
| P2.4 | ✅ | Workspace UI: certified cores (windowing/review-lane/schema-editor reducers, 25 tests) + THIN components — ReviewLane.tsx (keyboard-first, single-flight, dispatch-only), QuestionCards.tsx, WorkspaceTable.tsx (virtualized via computeWindow); wired into App form panel | J3 e2e green ✅ (bench/e2e-ui.mjs: lane opens on real open fields, keyboard-accepts all, zero remain) |
| P2.5 ∥ | ✅ | PDF interim: pdf-text-layer.ts (browser twin of certified service laws; difflib-parity similarity PROVEN vs real Python; I9 sampled-span verification; digital lines skip OCR w/ certainty-1 lattices) + pdf-runtime.ts (PDF.js v6, 2200px raster) + App intake (%PDF magic sniff, untrusted layer ⇒ vision + loud flag) | scanned+digital PDF pass through pipeline ✅ (15 tests; build clean) |
| P2.6 | 🔶 staged ✅ | Export: exceljs XLSX (records + manifest sheets, provenance option) + RFC 4180 CSV + JSON archival + JSZip assets — staged + tested incl. THE acceptance (exported XLSX re-imported cell-exact vs the record store) | export re-parsed and verified ✅ (staged; e2e wiring when src/ frees) |

**GATE P2:** bulk-drop 20 passports → one family, 20 records, review lane only where unattested ·
invoice upload spawns draft (zero passport pollution) · XLSX opens clean with provenance columns.

## Phase 3 — Perception Service + Universal Ingestion

| Task | Work | Done when |
|---|---|---|
| P3.1 | `service/` skeleton, config profiles, `/v1/health`, `fetch_models.py` + sha256 MANIFEST | health probe green; models fetch+verify |
| P3.2 | ✅ | **Lattice tap prototype (kill-risk RETIRED):** `service/stages/ocr_tap.py` — raw T×C captured pre-argmax from the pinned rec ONNX via Python ORT; browser-twin greedy + top-k=5 lattice; v6 swap is P3.6's A/B on the same code path | permanent tensor test green ✅ (`service/tests/test_lattice_tap.py`, 8 tests: shape/prob-mass/ordering/determinism + MRZ case-flip truth-survives-in-lattice proof) |
| P3.3 | 🔶 cores ✅ | `router.py` (magic-byte, rename-proof) + `stages/office_stage.py` (xlsx values+formulas+merges, docx, csv sniffer) + `stages/pdf_stage.py` (text runs w/ boxes, digital/scanned/hybrid classify, raster) + `stages/reconcile.py` (I9 sampled re-OCR vs claimed spans) — DONE and gated vs the native corpus (caught a real generator bug: opening_balance absent from ledger cells). Remaining: FastAPI wiring (P3.1 composes) | route tests per format ✅; **planted-garbage-text-layer caught ✅** (invisible-render-mode trap PDF flagged untrusted by REAL OCR; honest corpus invoices stay trusted) |
| P3.4 | 🔶 cores ✅ | `bundle.py` (assembly per stage + validation incl. lattice-required law) + `bundle-schema.json` (Draft 2020-12, single source of truth) + **`ladder.py`** (bytes→route→stages→validated bundle; I9 lying-layer pages auto-demote to vision; partials explicit via stageErrors; **`reperceive()` foveation logic** — ROI re-read at 2× DPI with lattices, degenerate-ROI honesty) + `stages/det_stage.py` (browser-twin DBNet pre/post). E2E proven: corpus passport → ladder → MRZ text + lattices delivered (sim > 0.85 both lines, discovery AND foveated paths). Remaining: thin HTTP wrap only (P3.1 skeleton composes `perceive()`/`reperceive()`); schema mirrored to `src/perception/` ✅ (types at P3.5) | contract tests both directions green (service side ✅ incl. ladder E2E + reperceive goldens, brain side at P3.5) |
| P3.5 | 🔶 staged ✅ | `src/perception/client.ts` staged: probe (300ms, null = answer) → service, transparent fallback; mid-session death degrades silently + flips mode (no zombie retries); malformed bundles rejected to fallback | mode switch invisible ✅ (staged; App wiring when src/ frees) |
| P3.6 | v6-vs-v5 A/B on P1 gate → lock OCR enum | A/B result recorded in baselines; enum locked |

**GATE P3:** P1 gate results equal-or-better through the service, faster · XLSX + digital PDF
extract cell-exact with zero OCR · hybrid reconciliation catches the trap.

## Phase 4 — Universal Vision

| Task | Work | Done when |
|---|---|---|
| P4.1 | 🔶 wiring ✅ | `service/stages/layout_stage.py` — letterbox/decode/per-class-NMS as a faithful browser-twin port (attribute-major [4+C, anchors]; class-count mismatch is LOUD), 7 synthetic-tensor goldens. Remaining: model artifacts + the A/B harness run over the degraded bench → verdict artifact → model decision | layout wired; A/B verdict committed |
| P4.2 ∥ | ✅ | `stages/codes_stage.py` zxing-cpp (raw `.bytes` payloads — display-escaping trap caught; wired into the ladder) + `stages/dewarp_stage.py` classical (Otsu quad + brightness-plausibility ring; honesty pass-through; wired into the ladder, UVDoc still flag-future) | code corpus decodes ✅ (Aztec BCBP / Code128 / AAMVA PDF417 bit-exact vs manifests, 18 tests; boarding-pass-through-ladder E2E); dewarp goldens ✅ (6 tests incl. phantom-quad + registration-square accuracy) |
| P4.3 | 🔶 rulings+closure ✅ | Table engine: `service/stages/tables_stage.py` rulings-first DONE w/ synthetic goldens. `stages/quality_stage.py` done. **Brain closure+repair DONE**: `src/docgraph/table-closure.ts` — equation auto-discovery (column sums via 3 structural signals: holds / same-result-row corroboration / totals-row layout; row products via 60% majority column-triple), full closure self-attests, single-cell lattice repair must satisfy ALL equations simultaneously (0 or 2+ repairs ⇒ review), failure message IS the equation. Remaining: SLANet_plus → LORE fallback for borderless; stamp/seal masks | closure attests clean invoices ✅; repair suite green ✅ |
| P4.4 ∥ | ✅ | Corpus expansion: mixed multi-document pages compiled (9 pages, 4 pairings; networkidle0→load+decode-wait fix) + gate mixed_page scoring live (constituents score independently; cross-document confident bleed = THE silent class) | corpora committed with expectations ✅ (mixed 9/9 SILENT=0 bleed=0, baseline committed)

**GATE P4:** invoice tables reconstructed with closure passing on clean scans · QR/PDF417 payloads
cross-attest printed totals · zero silent errors on `mixed`.

## Phase 5 — Full Consensus Solver + Attestor Registry

| Task | Work | Done when |
|---|---|---|
| P5.1 | ✅ | Attestor registry live: `consensus/attestors/` — checksums.ts (15 schemes, authentic vectors, measured blind-spot fuzz), checksum-attestors.ts (claim-gating law: overlapping gates never contradict unclaimed fields; unclaimed-valid supports + self-labels N5, never proves), dates.ts (valid=supports-only; cross-channel proves), closure.ts (FULL-equation law), mrz-attestor.ts (proven MRZ radiates via witness agreement; L-vs-LI cased), payload-attestors.ts (AAMVA/BCBP/GS1/EPC/Swiss-QR/UPI) | every attestor suite green ✅ (83 tests incl. 10k corruption fuzz per scheme) |
| P5.2 | ✅ | `consensus/solver.ts`: THE LAW AS A TYPE — ConfirmedField sealed behind module-private symbol + sole constructor (non-empty typed proof tuple, contradiction veto); document-global date-order via exact hypothesis search (ties→null, no unforced commitment); Hungarian assignment; refused/review always carry reasons | fuzz: forged confirmed unrepresentable ✅ (10k-doc forge-fuzz + type-level @ts-expect-error) |
| P5.3 ∥ | ✅ | `consensus/quorum.ts` (08 §7): review-status critical fields w/ geometry → ONE decorrelated re-read; same-channel agreement constitutionally refused; agree⇒proves(0.9), disagree⇒loud conflict w/ both reads | quorum unit laws green ✅ (e2e on degraded corpus rides the next burst cert) |
| P5.4 | ✅ | `consensus/scheduler.ts` (13 §4): verify-then-spend foveation planning — unproven critical ROIs only, 2-round frozen cap, DPI doubling, budget breach names every starved field & dispatches nothing | budget behavior tests green ✅ |

**GATE P5:** every confirmed field on `mixed` carries a printable justification chain · an unseen
doc type (vehicle registration) yields self-labeled attested fields with **zero code added** (N5
proven) · zero silent errors.

## Phase 6 — Learning Without Training + Shadow CI

| Task | Work | Done when |
|---|---|---|
| P6.1 | ✅ | `lwt/confusion-priors.ts`: THE WRITE GATE IS A TYPE — learnFromProven accepts only sealed ConfirmedField (feedback loops dead by construction); conservative equal-length alignment (ambiguity teaches nothing); Laplace at read; identity never zeroed; anecdote gate (min 3 obs) on beam suggestions; putConfusionPrior/putFormatPrior persistence | prior improves synthetic confusable suite measurably ✅ (P(0|O) dominance test) |
| P6.2 ∥ | ✅ | I12 question ranking core (tier critical≫required≫column, conflicts outrank, cap 3/doc, NEVER questions confirmed) + QuestionCards.tsx wired into App (conflict cards = one-tap candidates; low-confidence = Yes/Fix) | J4 e2e green ✅ (cards render ≤3 on open docs; answering confirms + removes) |
| P6.3 | 🔶 core ✅ | `lwt/shadow-ci.ts` staged: engine-injected replay + field diff (value_changed/field_lost/status_downgraded = regressions; upgrades/new fields = improvements) + pluggable block predicate; block/report UX pending src/ | deliberately-regressed build is caught ✅ (staged acceptance test green) |

**GATE P6:** P1 benchmark with warmed priors ≥ accuracy with fewer questions · Shadow CI catches
the planted regression.

## Phase 7 — Hardening, Packaging, Security

| Task | Work | Done when |
|---|---|---|
| P7.1 | ✅ | Perf CI: `bench/perf.mjs` — ALL budgets from 13 green: health 0.7ms/50 · digital 167ms/1000 · RSS 95MB/450 · **unknown-doc-full-form 7.9s/8s @2× throttle** (was 13.2s; won by 13 §5's mandatory batched recognition — detectAndRecognize one-call worker API, exact-width tensor batching, bit-parity two-step draw — + zxing overlap; methodology per 13 §6: warmup untimed, median of 3) | budgets green in CI ✅ |
| P7.2 | 🔶 install+UI+Docker ✅ | Packaging: package-dir move (`docutract_service` package — wheel PROVEN to ship MANIFEST.json/bundle-schema.json by building+inspecting the real wheel in tests); UI served from the service (DOCUTRACT_UI_DIR → ../dist → packaged ui/, /v1/* wins); service/Dockerfile (loopback isolation via host-side publish rule; models fetch-verified at first run). Remaining: OS smoke matrix | fresh-machine install→first extraction ≤ 10 min |
| P7.3 | ✅ | Security pass per [17](17_SECURITY_PRIVACY_PLAN.md): bearer-token handshake (constant-time, 0600 handshake file, tokenless /v1/health, 401-envelope pytest), tight CSP + self-hosted fonts (live-verified via e2e), XSS sink bans as executable tests, AES-GCM-256 workspace crypto (PBKDF2 600k, tamper-loud, keyring DB v3), priors privacy audit test, audits clean (protobufjs override both lockfiles; pip-audit clean), W&B key + c7i.pem purged (ROTATION = user action), threat-model review [19](19_THREAT_MODEL_REVIEW.md) | 17's checklist complete ✅ |

**GATE P7 (release):** all budgets green · install gate · security checklist · all corpora zero
silent errors · amendment log reviewed.

---

**Standing rules:** commits prefixed `P<phase>.<task>`; a task is not done with a red gate; parked
ideas go to plan.md §19; the only re-planning path is Constitution §6.
