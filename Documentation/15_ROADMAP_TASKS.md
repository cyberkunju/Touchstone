# 15 — Roadmap & Tasks

The complete build sequence. Phases are strictly ordered; tasks within a phase are numbered and
executed in order unless marked ∥ (parallelizable). Every task ends with: code + tests green +
gate not worsened. This file mirrors and elaborates plan.md §15 (which remains the frozen law).

## Current Completion State — 2026-07-10

- **Certified and baseline-sealed:** **1649/1656, SILENT=0**, 29/29 families
	(`ap-nfYHTCuf8Cbk1NRWfoQnNS`, funded `stratosix-labs` workspace). Cards, insurance,
	labs, and mixed are complete family passes;
	all five performance budgets, 769 browser tests, 123 service tests, TypeScript, production build,
	dependency audits, and the seven-job Linux/macOS/Windows CI matrix are green. Post-certification
	release hardening was universe-recertified unchanged at **1649/1656, SILENT=0** by dry burst
	`ap-FKSNuEuEXYMxcxf2SKBkp9` (all 29 families accounted for; no baseline writes).
- **Lab residual closed:** the remaining +4 were not new OCR guesses: the engine already extracted
	exact lab patient names, while the scorer resolved the shared
	`PATIENT NAME` label to the prescription schema key. Context-aware scoring plus a narrowly
	gated uppercase direct-stack ownership law passes the complete labs family at 32/32 and 73.7%
	field recall; the universe burst proves no family regression and SILENT=0.
- **Certification infrastructure hardened:** `stratosix-labs` now holds a SHA-256-verified
	`docutract-corpus` volume. The Modal coverage law includes `mixed`, so an absent mixed corpus can
	never again masquerade as a 0/0 pass.

### Active Completion Queue

1. Treat the final seven misses (3 composites, 4 real-world photos) as measured recall research;
	 no release change may trade away N1 or regress a committed family baseline.
2. Keep release tooling truthful: lint, build, tests, audits, perf, OS smoke, and universe coverage
	 remain executable gates rather than documentation claims.

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

| Task | Status | Work | Done when |
|---|---|---|---|
| P2.1 | ✅ | IndexedDB v2 migration (`workspace-db.ts`, adds-only, tested against a REAL populated v1 db) + `family-store.ts`/`record-store.ts` (11 §1; append-only law, exact rolling stats) | migration idempotency + CRUD tests ✅ (workspace-stores suite) |
| P2.2 ∥ | ✅ | `geometry/phash.ts` (dHash-64, area-average grid, malformed⇒64) in src/ with 13 tests incl. THE acceptance (3 real corpus rescan pairs at Hamming ≤ 8); wired into App auto-filing as identity tier 2 | dedupe detects exact + near-dup ✅ (live in the filing path) |
| P2.3 | ✅ | Routing state machine (11 §4) as a pure reducer (`src/workspace/routing.ts`; frozen thresholds 0.75/0.55; IllegalTransition loud on every unlisted pair; bulk queue concurrency-2 per-file isolation) | J1/J2/J4 scripted green ✅ + exhaustive state×event sweep (28 legal pairs) |
| P2.4 | ✅ | Workspace UI: certified cores (windowing/review-lane/schema-editor reducers, 25 tests) + THIN components — ReviewLane.tsx (keyboard-first, single-flight, dispatch-only), QuestionCards.tsx, WorkspaceTable.tsx (virtualized via computeWindow); wired into App form panel | J3 e2e green ✅ (bench/e2e-ui.mjs: lane opens on real open fields, keyboard-accepts all, zero remain) |
| P2.5 ∥ | ✅ | PDF interim: pdf-text-layer.ts (browser twin of certified service laws; difflib-parity similarity PROVEN vs real Python; I9 sampled-span verification; digital lines skip OCR w/ certainty-1 lattices) + pdf-runtime.ts (PDF.js v6, 2200px raster) + App intake (%PDF magic sniff, untrusted layer ⇒ vision + loud flag) | scanned+digital PDF pass through pipeline ✅ (15 tests; build clean) |
| P2.6 | ✅ | Export: exceljs XLSX (records + manifest sheets, provenance option) + RFC 4180 CSV + JSON archival + JSZip assets — in src/workspace/export.ts, tested incl. THE acceptance (exported XLSX re-imported cell-exact vs the record store); CSV download wired into WorkspaceView (draft families blocked per law) | export re-parsed and verified ✅; UI download live ✅ |

**GATE P2:** bulk-drop 20 passports → one family, 20 records, review lane only where unattested ·
invoice upload spawns draft (zero passport pollution) · XLSX opens clean with provenance columns.

## Phase 3 — Perception Service + Universal Ingestion

| Task | Status | Work | Done when |
|---|---|---|---|
| P3.1 | ✅ | `service/` FastAPI service, config profiles, tokenless `/v1/health`, bearer-gated `/v1/perceive` + `/v1/reperceive`, `fetch_models.py` + sha256 MANIFEST, localhost-scoped CORS, one error envelope | health/perceive/reperceive HTTP tests green; models fetch+verify ✅ |
| P3.2 | ✅ | **Lattice tap prototype (kill-risk RETIRED):** `service/stages/ocr_tap.py` — raw T×C captured pre-argmax from the pinned rec ONNX via Python ORT; browser-twin greedy + top-k=5 lattice; v6 swap is P3.6's A/B on the same code path | permanent tensor test green ✅ (`service/tests/test_lattice_tap.py`, 8 tests: shape/prob-mass/ordering/determinism + MRZ case-flip truth-survives-in-lattice proof) |
| P3.3 | ✅ | `router.py` (magic-byte, rename-proof) + `stages/office_stage.py` (xlsx values+formulas+merges, docx, csv sniffer) + `stages/pdf_stage.py` (text runs w/ boxes, digital/scanned/hybrid classify, raster) + `stages/reconcile.py` (I9 sampled re-OCR vs claimed spans), composed by FastAPI and gated vs the native corpus | route tests per format ✅; **planted-garbage-text-layer caught ✅** (invisible-render-mode trap PDF flagged untrusted by REAL OCR; honest corpus invoices stay trusted) |
| P3.4 | ✅ | `bundle.py` (assembly + lattice-required validation) + Draft-2020-12 `bundle-schema.json` + `ladder.py` (bytes→route→stages→validated bundle; I9 demotion; explicit stageErrors; 2×-DPI `reperceive()` with lattices and degenerate-ROI honesty) + browser-twin DBNet stage; HTTP wrap live in P3.1; schema mirrored to `src/perception/` | contract tests both directions green ✅ (ladder E2E, reperceive goldens, browser bundle mapper, live service→brain solve) |
| P3.5 | ✅ | `src/perception/client.ts`: probe (300ms, null = answer) → service, transparent fallback; mid-session death degrades silently + flips mode. **App-WIRED via bundle-map.ts** (poly→boxNorm, top1/conf/lattice verbatim; refuses native/rasterless/malformed pages whole) with the coordinate-coherence guard (browser deskew ⇒ browser ladder). Service grew localhost-scoped CORS + preflight-exempt bearer. LIVE-validated both directions: service bundle → MRZ beam-proven from service lattices, identical solve; failure → invisible fallback | mode switch invisible ✅ (proven live in both directions) |
| P3.6 | ✅ | **ENUM LOCKED: v6-small** — three-tier universe A/B under the new safety laws (unverifiable-machine-zone, orphaned-competitor, fabrication floor, weak_span, pattern date-windows, classifier corroboration): v6-small **1475/1656 SILENT=0** (rec 3× faster) vs v5-server 1406 vs v6-medium 1422 w/ SILENT=3 (DISQUALIFIED — confident-wrong VIZ reads). The investigation falsified the original hallucination theory, found+fixed six model-agnostic engine holes, and resurrected three families (tax 32/32 PERFECT, icards 0→23, letters 0→13) killed by a naked-keyword classifier bug that v5's garbled OCR had been accidentally masking. All verdicts + runs in bench/baselines/ab-v6-rec.json | A/B recorded ✅; enum locked ✅ (v6-small; v5-server retained fallback tier) |

**GATE P3:** P1 gate results equal-or-better through the service, faster · XLSX + digital PDF
extract cell-exact with zero OCR · hybrid reconciliation catches the trap.

> **CERTIFIED UNIVERSE RECORD — 1649/1656 SILENT=0** (burst
> `ap-nfYHTCuf8Cbk1NRWfoQnNS`, 29/29 baselines sealed). The record is +174 over
> v6-adoption 1475.
> The **structural-geometry law family**
> (`src/docgraph/generic-extraction.ts`: graded position scores · document-axis · header · PEER ·
> disjoint-column row completion · interposition · bias gate) resurrected the label-above-grid and
> results-table archetypes that pairwise geometry mis-paired: certificates 0→32, medical labs
> 0→28, transcripts 24→32, insurance-cards 0→32, prescriptions 16→48, vehicles 36→50 PERFECT,
> leases 31→32 PERFECT, letters 13→24 PERFECT — every family SILENT=0. The contact-cluster law
> resurrected business cards 9→36 PERFECT (validated email+phone + uppercase identity heading,
> still review-capped); strict policy labels resurrected insurance notices 24→32 PERFECT. A scorer
> schema ambiguity (`PATIENT NAME`: labs `full_name` vs prescriptions `patient_name`) hid four
> already-correct lab reports; context-aware resolution plus identity-role-gated uppercase
> direct-stack ownership closes labs 28→32 at 73.7% field recall. Archetypes are locked as unit fixtures
> (`structural-geometry.test.ts`, incl. live-box real-lease and worst-lab geometry).

> **REAL-WORLD PERCEPTION BUILD-OUT — P1–P9 COMPLETE, commit `191b183` (2026-07-10).**
> A ~90-image realistic photographed-passport set (`passptest/`), an external **GPT-5.4
> vision judge** (`bench/vision-judge.mjs`), and live human testing exposed that corpus
> SILENT=0 did not imply real-world quality. Every failure was root-caused into a named,
> unit-locked law (see [PERCEPTION_MASTER_PLAN.md](../PERCEPTION_MASTER_PLAN.md) §6 and
> [HANDOFF.md](../HANDOFF.md) §2/§4): quad-native recognition + projective page
> rectification (adopt-only-if-verified) + deskew ±40° + keystone suppression; autoCorrect
> anti-forgery (position-class / unique-repair / blast-radius — a fake MRZ can no longer be
> repaired into validity); partial-MRZ offset tomography; CTC character-span geometry
> (inline sub-boxes, per-line MRZ boxes through all four probe paths); multilingual caption
> folding + ICAO code-table validation; free-text continuation merge; text-physics law;
> signature caption/ink laws; stamps admission gate (46 garbage pairs → 1 honest asset);
> gutter partition; counterfactual native-res re-reads; quality-refusal banner;
> printed-value transparency; template trust boundary; network-free processing; fluid
> responsive UI. **Recertified: passports 183/183 SILENT=0 recall 99.9% adversarial 100%,
> 810 unit tests, perf 5/5, J3/J4, visual-binding 13/13. External judge on 10 random
> real-world images: 5.9 → 8.2 mean, status honesty 9.5, zero silents.
>
> **POST-PERCEPTION UNIVERSE CERTIFICATION — 1644/1656 SILENT=0, 29/29 coverage
> complete** (Modal run `ap-56e3BbnOzcs6WXlt8pbKa2`, 2026-07-10). The first burst
> (`ap-hwW9xZYvBnRrt1x8riiZyO`) exposed a stale Modal corpus volume — insurance covered
> 0/32 despite 32 local entries. The corpus was rebuilt from current `test_cases` (922 MB,
> 19 retried chunks, SHA-256 `f35b05516ff8…`), seeded in-cloud with SHA verification
> (`ap-XhtzsnoBqJByZD0CmQhDBc`), then rerun. Coverage-complete scoreboard:
> passports 183/183 · docs 37/37 · ids 126/126 · licenses 126/126 · bank 50/50 ·
> payslips 50/50 · utility 40/40 · vehicles 50/50 · boarding 50/50 · shipping 50/50 ·
> cards 35/36 · visas 40/40 · permits 40/40 · tax 32/32 · po 32/32 · insurance 32/32 ·
> certificates 31/32 · transcripts 28/32 · labs 32/32 · icards 32/32 · blanks 24/24 ·
> foreign 36/36 · letters 24/24 · leases 32/32 · rx 48/48 · quest 32/32 ·
> composites 42/48 · mixed 9/9 · real 301/301 — every family SILENT=0.
> The prior 1649 record remains the recall high-water mark; the post-perception build is
> five passes below it (conservative refusals only), so this dry run intentionally did NOT
> overwrite baseline ratchets. N1 is fully recertified; recall gaps belong to the ongoing
> real-image loop, not release-blocking silent-error work.**

## Phase 4 — Universal Vision

| Task | Status | Work | Done when |
|---|---|---|---|
| P4.1 | ✅ | `docdet_v1.onnx` model artifact + `service/stages/layout_stage.py` browser-twin letterbox/decode/per-class-NMS (attribute-major [4+C, anchors]; class-count mismatch LOUD), browser worker layout rung, 7 synthetic-tensor goldens; degraded-bench A/B and verdict committed | layout wired; A/B verdict committed; MRZ-zone seed certified ✅ |
| P4.2 ∥ | ✅ | `stages/codes_stage.py` zxing-cpp (raw `.bytes` payloads — display-escaping trap caught; wired into the ladder) + `stages/dewarp_stage.py` classical (Otsu quad + brightness-plausibility ring; honesty pass-through; wired into the ladder, UVDoc still flag-future) | code corpus decodes ✅ (Aztec BCBP / Code128 / AAMVA PDF417 bit-exact vs manifests, 18 tests; boarding-pass-through-ladder E2E); dewarp goldens ✅ (6 tests incl. phantom-quad + registration-square accuracy) |
| P4.3 | ✅ | Table engine: rulings tier + quality stage; **borderless cluster tier** (`align_stage.py`: majority-column law + 60% occupancy, method schema-frozen) wired as fallback; brain closure+repair in `table-closure.ts`; HSV chroma seal/stamp masks in `seal_stage.py`. SLANet/LORE remains an optional future accuracy tier behind the same contract, not a release dependency | closure attests clean invoices ✅; repair/cluster/seal suites green ✅ |
| P4.4 ∥ | ✅ | Corpus expansion: mixed multi-document pages compiled (9 pages, 4 pairings; networkidle0→load+decode-wait fix) + gate mixed_page scoring live (constituents score independently; cross-document confident bleed = THE silent class) | corpora committed with expectations ✅ (mixed 9/9 SILENT=0 bleed=0, baseline committed)

**GATE P4:** invoice tables reconstructed with closure passing on clean scans · QR/PDF417 payloads
cross-attest printed totals · zero silent errors on `mixed`.

## Phase 5 — Full Consensus Solver + Attestor Registry

| Task | Status | Work | Done when |
|---|---|---|---|
| P5.1 | ✅ | Attestor registry live: `consensus/attestors/` — checksums.ts (15 schemes, authentic vectors, measured blind-spot fuzz), checksum-attestors.ts (claim-gating law: overlapping gates never contradict unclaimed fields; unclaimed-valid supports + self-labels N5, never proves), dates.ts (valid=supports-only; cross-channel proves), closure.ts (FULL-equation law), mrz-attestor.ts (proven MRZ radiates via witness agreement; L-vs-LI cased), payload-attestors.ts (AAMVA/BCBP/GS1/EPC/Swiss-QR/UPI) | every attestor suite green ✅ (83 tests incl. 10k corruption fuzz per scheme) |
| P5.2 | ✅ | `consensus/solver.ts`: THE LAW AS A TYPE — ConfirmedField sealed behind module-private symbol + sole constructor (non-empty typed proof tuple, contradiction veto); document-global date-order via exact hypothesis search (ties→null, no unforced commitment); Hungarian assignment; refused/review always carry reasons | fuzz: forged confirmed unrepresentable ✅ (10k-doc forge-fuzz + type-level @ts-expect-error) |
| P5.3 ∥ | ✅ | `consensus/quorum.ts` (08 §7): review-status critical fields w/ geometry → ONE decorrelated re-read; same-channel agreement constitutionally refused; agree⇒proves(0.9), disagree⇒loud conflict w/ both reads | quorum unit laws green ✅ (e2e on degraded corpus rides the next burst cert) |
| P5.4 | ✅ | `consensus/scheduler.ts` (13 §4): verify-then-spend foveation planning — unproven critical ROIs only, 2-round frozen cap, DPI doubling, budget breach names every starved field & dispatches nothing | budget behavior tests green ✅ |

**GATE P5:** every confirmed field on `mixed` carries a printable justification chain · an unseen
doc type (vehicle registration) yields self-labeled attested fields with **zero code added** (N5
proven) · zero silent errors.

## Phase 6 — Learning Without Training + Shadow CI

| Task | Status | Work | Done when |
|---|---|---|---|
| P6.1 | ✅ | `lwt/confusion-priors.ts`: THE WRITE GATE IS A TYPE — learnFromProven accepts only sealed ConfirmedField (feedback loops dead by construction); conservative equal-length alignment (ambiguity teaches nothing); Laplace at read; identity never zeroed; anecdote gate (min 3 obs) on beam suggestions; putConfusionPrior/putFormatPrior persistence | prior improves synthetic confusable suite measurably ✅ (P(0|O) dominance test) |
| P6.2 ∥ | ✅ | I12 question ranking core (tier critical≫required≫column, conflicts outrank, cap 3/doc, NEVER questions confirmed) + QuestionCards.tsx wired into App (conflict cards = one-tap candidates; low-confidence = Yes/Fix) | J4 e2e green ✅ (cards render ≤3 on open docs; answering confirms + removes) |
| P6.3 | ✅ | Shadow-CI replay: `workspace/replay.ts` re-verifies stored graphs through the CURRENT engine and photographs diffs; VERDICT LAW: any value change or confirmed-downgrade = REGRESSED (safety wins mixed runs); user edits never diff. 'Replay engine check' trigger + verdict banner in WorkspaceView; BenchRun persisted to the benchruns store | deliberately-regressed build is caught ✅; trigger live in the workspace ✅ |

**GATE P6:** P1 benchmark with warmed priors ≥ accuracy with fewer questions · Shadow CI catches
the planted regression. — **CLOSED**: beam prior loop live (makeBeamPrior boost-only + learnFromProvenMrz sealed-teacher + NEVER-TESTIFY rawScore track); shadow-CI replay wired into the workspace (verdict banner + BenchRun store).

## Phase 7 — Hardening, Packaging, Security

| Task | Status | Work | Done when |
|---|---|---|---|
| P7.1 | ✅ | Perf CI: `bench/perf.mjs` — ALL FIVE budgets green under the v6-small lock: health 0.9ms/50 · digital 249ms/1000 · RSS 95MB/450 · **unknown-doc-full-form 6.0s/8s @2× throttle** · **known-template refill 0.8s/1.5s @2× throttle** (I8 SPARSE REFILL: anchor-probe match + ROI-only batched reads — 6.3s→0.8s; bit-parity `recognizeBoxes` worker API); bearer-token handshake wired | budgets green in CI ✅ |
| P7.2 | ✅ | Packaging: package-dir wheel (data-file shipment proven), service-hosted UI, Dockerfile, and **OS smoke matrix** complete. Fresh-checkout defects found by production CI were fixed at the dependency and fixture boundaries; tracked-files-only simulation yields 46 pass / 77 loud artifact skips. Release tooling is pinned to Bun 1.3.14 + Node 22 CI, with Vite 8.1.4, Vitest 4.1.10, plugin-react 6.0.3, frozen Bun/npm installs, and an enforced ESLint 10 gate. GitHub Actions run `29052393388` is green across browser, Linux/macOS/Windows JS smoke, Linux service, and macOS/Windows service smoke. | fresh-machine install→first extraction ≤ 10 min; seven-job portability matrix green ✅ |
| P7.3 | ✅ | Security pass per [17](17_SECURITY_PRIVACY_PLAN.md): bearer-token handshake (constant-time, 0600 handshake file, tokenless /v1/health, 401-envelope pytest), tight CSP + self-hosted fonts (live-verified via e2e), XSS sink bans as executable tests, AES-GCM-256 workspace crypto (PBKDF2 600k, tamper-loud, keyring DB v3), priors privacy audit test, audits clean (protobufjs + ExcelJS UUID 11 overrides in both lockfiles; full `npm audit` and `pip-audit` clean), W&B key + c7i.pem purged (ROTATION = user action), threat-model review [19](19_THREAT_MODEL_REVIEW.md) | 17's checklist complete ✅ |

**GATE P7 (release):** all budgets green · install gate · security checklist · all corpora zero
silent errors · amendment log reviewed.

---

**Standing rules:** commits prefixed `P<phase>.<task>`; a task is not done with a red gate; parked
ideas go to plan.md §19; the only re-planning path is Constitution §6.
