# 22 — HANDOFF TASK PACK (delegable work, with specs)

**Audience:** the engineer(s) taking the 🟢 clean-handoff and 🟡 spec-handoff tasks.
**Read first:** [00_CONSTITUTION.md](00_CONSTITUTION.md) (the invariants — N1 above all),
[16_ENGINEERING_RULES.md](16_ENGINEERING_RULES.md), and this file fully before writing code.

## Ground rules (non-negotiable, apply to every task here)

1. **N1:** a field is `confirmed` ⟺ at least one attestation proves it. When your code cannot
   prove something, it must say "review", never guess. Silent errors (confirmed + wrong) are
   the ONE unforgivable defect class.
2. **Tests land WITH the code, in the same commit.** Every module gets a dense vitest suite
   (see any existing `src/**/*.test.ts` for the standard — property tests and fuzz loops where
   the logic is algorithmic). `npx tsc --noEmit` and `npm run test` must both be green.
3. **Never touch these without the lead:** `src/beam/**`, `src/verifier/**`,
   `src/parsers/mrz.ts`, `bench/gate.mjs` scoring rules, `bench/baselines/**`, any
   `reviewCap` behavior, model files, `vite.config.ts` isolation headers.
4. **Do not run browser harnesses concurrently** — one `bench/gate.mjs`/`goldens.mjs` at a
   time (shared `.puppeteer-profile`), dev server on :5173 must be up. Never edit `src/**`
   while a gate run is in flight (Vite HMR corrupts the run).
5. Commit prefix per task id (e.g. `P2.2: dHash-64 + tests`).
6. TypeScript strict; no `any` unless quarantined with a comment; no new dependencies without
   asking (exceljs, bwip-js, puppeteer, comlink, idb, zxing-wasm already exist).

---

## 🟢 CLEAN HANDOFF

> **2026-07-07 update (final):** owner decision — no external delegation; the lead absorbed
> EVERYTHING. Status: P2.2 ✅ P2.6 ✅ P3.1 ✅ P3.5 ✅ (round 1) · P4.2 ✅ checkbox ✅ P6.3 core ✅
> P2.4 logic cores ✅ P6.2 core ✅ P7.1 service half ✅ P7.2 service half ✅ P4.4 generator ✅
> P4.1 decode wiring ✅ (round 2). src-destined pieces live in `.staging/src-patches/`
> (tested via `.staging/vitest.staging.ts`) until the certification chain frees `src/`.
> Still genuinely open: thin React components + J3/J4 e2e (P2.4/P6.2 UI), P2.5 PDF.js
> interim, P4.1 model A/B, P7.2 UI-serving + Docker, and the lead-only hard core (P5.x, P6.1,
> P4.3 brain side, P3.6).

### P2.2 — `src/geometry/phash.ts` (dHash-64) — identity tier 2 ✅ DONE (lead)
**Spec:** [11 §3](11_WORKSPACE_DATA_MODEL.md). Implement:
```ts
/** 64-bit difference hash of a page raster. Grayscale → 9×8 downsample →
 *  left>right comparisons → 64 bits as a 16-char lowercase hex string. */
export function dHash64(rgba: Uint8ClampedArray, w: number, h: number): string;
/** Hamming distance between two dHash64 hex strings (0..64). */
export function hammingDistance(a: string, b: string): number;
```
Downsampling: area-average (not nearest-neighbor). Deterministic — same input, same hash.
**Tests:** identical images ⇒ distance 0; brightness shift ±20 ⇒ ≤ 4; 90° rotation ⇒ ≥ 20
(distinct); random noise images (seeded) ⇒ expected ~32 mean distance; property: distance is
symmetric and ≤ 64. **Acceptance:** near-dup rescan pairs (blur/jpeg rungs of the same corpus
identity in `test_cases/passports/synthetic`) land at Hamming ≤ 8 — write that as a test that
loads 3 such pairs via canvas in a jsdom-free way (use raw PNG decode via `pngjs` if needed —
ask before adding the dep, or precompute RGBA fixtures).

### P2.4 — Workspace UI
**Spec:** [12_UI_UX_SPEC.md](12_UI_UX_SPEC.md). React components (existing stack, no new UI
libs): left family rail, virtualized records table (200 rows smooth — use windowing), review
lane (only `needs_review`/`conflict` fields, keyboard-first: Enter=accept, E=edit, arrows),
bulk queue panel (per-file state machine display), draft-family review screen (schema editor:
rename/retype/delete fields before approval). Data comes from `family-store.ts`/
`record-store.ts` (lead is building them — code against the interfaces in [11 §1](11_WORKSPACE_DATA_MODEL.md)).
**Acceptance:** J3 e2e (bulk 20 files → review lane → export) scripted green; table stays
60fps-smooth at 200 rows (measure with Performance API in the e2e).

### P2.6 — Export (XLSX/CSV/JSON + assets) ✅ DONE (lead)
**Spec:** [11 §7](11_WORKSPACE_DATA_MODEL.md). exceljs is installed. Sheet 1 = records ×
schema columns (only `column: true` fields); optional provenance block; sheet 2 = manifest
(family, template versions, engine version, date). CSV strictly RFC 4180 (quote rules!).
JSON = full records with justifications. Assets export = zip of OPFS `assets/<recordId>/`
(use JSZip — already a transitive dep of zxing-wasm? verify; ask if not).
**Acceptance test (the important one):** e2e re-imports the exported XLSX with exceljs and
verifies every cell equals the record store value — export is proven lossless, not assumed.

### P3.1 — Service skeleton ✅ DONE (lead)
**Spec:** [05_PERCEPTION_SERVICE.md](05_PERCEPTION_SERVICE.md) §1-2. Python 3.11, FastAPI +
uvicorn, `service/` dir. Endpoints: `/v1/health` (returns versions, loaded models, profile).
`fetch_models.py`: downloads the model set from the URLs in 05 §2, verifies sha256 against a
committed MANIFEST file, idempotent (skips verified files). Config profiles: `lite` / `full`
(env `DOCUTRACT_PROFILE`). No inference code — that's P3.2 (lead).
**ALREADY BUILT by the lead (do not redo — wire these up):** `service/router.py` (magic-byte
routing, tested rename-proof), `service/stages/ocr_tap.py` (P3.2, the lattice tap),
`service/stages/pdf_stage.py` + `service/stages/office_stage.py` (P3.3 cores, gated vs the
native corpus), `service/bundle.py` + `service/bundle-schema.json` (P3.4 assembly +
validation). Your skeleton composes them behind the endpoints; `python -m pytest
service/tests` (39 tests) must stay green.
**Acceptance:** fresh venv → `pip install -r requirements.txt` → `python fetch_models.py` →
`uvicorn service.main:app` → health probe green, models verified. Works offline after fetch.

### P3.5 — Perception client (browser side) ✅ DONE (lead — staged; App wiring when src/ opens)
**Spec:** [05 §6](05_PERCEPTION_SERVICE.md). `src/perception/client.ts`: on startup, probe
`http://127.0.0.1:8477/v1/health` with a 300 ms timeout; if healthy, route perception through
the service (`/v1/perceive` multipart); else transparent fallback to the existing in-browser
worker path. The BRAIN must not know which mode it is in — same EvidenceBundle either way.
Mode surfaced only as a status chip + console diag. The bundle schema is
`service/bundle-schema.json` — mirror it byte-for-byte to `src/perception/bundle-schema.json`
and generate `bundle-types.ts` to match (CI diffs the copies).
**Acceptance:** all existing brain tests pass in both modes (mock the service in vitest);
kill the service mid-session → next upload falls back without an error dialog.

### P4.4 — Corpus expansion (mixed + degraded manifests)
**Spec:** [14 §2](14_QUALITY_TESTING.md). The factory pattern is established — read
`bench/corpus/compile-ids.cjs` as the canon. Build `mixed` manifests (multi-doc-type batches
for bulk-flow testing) and additional degradation rungs (screenshot moiré: render → downscale
→ JPEG → upscale; photo-of-screen: add refresh-band gradient overlay). Truth discipline:
computed truth only, no hand-typed goldens.
**Acceptance:** manifests committed; `node bench/gate.mjs --corpus <new>` runs green with
SILENT=0 (recall floors may start low — that's fine, they ratchet).

### P6.2 — Question cards UX
**Spec:** [12 §6](12_UI_UX_SPEC.md). Renders the I12 question queue (lead builds ranking):
one card per question, evidence crop shown, single-tap answers, keyboard navigation.
**Acceptance:** questions-per-doc metric visibly drops on the replayed corpus in e2e.

### P7.1 — Perf CI
**Spec:** [13_PERFORMANCE_BUDGETS.md](13_PERFORMANCE_BUDGETS.md) — every budget in that file
becomes a test on the throttled "lite" profile (Chrome CPU throttling ×4 via puppeteer).
Output a table artifact per run; red = fail CI.
**Acceptance:** deliberately slowing a stage (add a test-only sleep) turns the budget red.

### P7.2 — Packaging
**Spec:** [15_DEVOPS_PACKAGING-equivalent in 05 §8 + 17]. `pip install docutract-service`
serves the built UI statically + the service; Dockerfile alternative; OS smoke matrix
(Win/macOS/Linux): fresh machine → install → first extraction < 10 min documented.

---

## 🟡 SPEC HANDOFF (lead reviews every PR in this section line-by-line)

### P5.1 — The attestor registry (~25 attestors)
**Spec:** [08 §6](08_CONSENSUS_AND_ATTESTORS.md). THE parallelizable chunk. Frozen interface
(do not modify — lead owns it):
```ts
interface Attestor {
  id: string;                          // 'checksum.mrz', 'closure.table', …
  appliesTo(field: FieldCandidate, ctx: DocContext): boolean;
  attest(field: FieldCandidate, ctx: DocContext): Attestation | null;  // null = cannot judge
}
interface Attestation {
  attestorId: string;
  verdict: 'proves' | 'supports' | 'contradicts';
  strength: number;                    // calibrated per 08 §6 table
  evidence: EvidenceRef[];             // ALWAYS non-empty — no unexplained verdicts
}
```
One attestor per file under `src/consensus/attestors/`, named `<kind>.<name>.ts`, with a
dense test file each. Work down the 08 §6 table top-to-bottom. **Traps to respect:** mod-10
checksum blind spots (see `mrz-beam.ts` invisible-class guard — same math applies to any
mod-N check), date plausibility vs format ambiguity (12/06 vs 06/12), amount rounding is
banker's-rounding-sensitive — flag, don't assume. An attestor that cannot decide returns
null; it NEVER stretches. **Acceptance:** every attestor suite green; property fuzz per
attestor (seeded) shows zero false `proves` on 10k corrupted inputs.

### P4.1 — Layout model wiring + A/B harness 🔶 DECODE DONE (lead — `service/stages/layout_stage.py`; model artifacts + A/B run remain)
**Spec:** [04 §1.2](04_MODEL_SELECTION.md), [05 §3]. Wire PP-DocLayout-S ONNX into the
service (`layout.py`); build the A/B harness that runs BOTH PP-DocLayout and DocLayout-YOLO
over the degraded corpus and emits per-class precision/recall to a JSON verdict artifact.
**You do not make the model decision** — the artifact goes to the lead. Reuse the letterbox/
NMS code patterns from `src/ai-runtime/yolo.ts` (port to Python faithfully).

### P4.2 — Codes + classical dewarp (service) ✅ DONE (lead)
**Spec:** [05 §3]. `codes.py`: zxing-cpp official wheel, all symbologies on, per-code corner
geometry returned. `dewarp.py`: classical cylinder/fold dewarp (Hough baseline curvature →
polynomial remap with OpenCV); UVDoc behind a flag, do not enable by default.
**Acceptance:** code corpus (`test_cases/licenses`, `boarding_passes`, `shipping_labels`)
decodes ≥ the browser-side rates; dewarp goldens (synthetic cylinder warps of flat corpus
pages — generate them, truth = the flat original's OCR).

### Checkbox primitive (P4 scope) ✅ DONE (lead — staged; two-feature design: fill ratio + stroke coherence)
**Spec sketch (lead approves before you start):** given template ROIs of checkbox cells
(`test_cases/questionnaires` truth has `checkedStates`), compute fill-ratio after adaptive
threshold within each ROI, calibrate checked/unchecked/ambiguous thresholds on the corpus,
ambiguous ⇒ review (never guess a checkbox). Deliver as `src/docgraph/checkbox.ts` + tests
+ a gate scoring rule proposal (lead wires it).

### P6.3 — Shadow-CI replay runner ✅ CORE DONE (lead — staged; block/report UX pending src/)
**Spec:** [14 §6]. `lwt/shadow-ci.ts`: replays every stored DocGraph's ORIGINAL inputs
through the current engine build, diffs field outcomes vs stored values, emits a verdict
(`identical | improved | regressed(fields)`), UI report + a block flag. The BLOCK semantics
(what counts as a regression) are the lead's — implement them as a pluggable predicate.
**Acceptance:** a deliberately-regressed build (test fixture) is caught and blocked.

---

## Working agreements

- Daily: run `npm run test` + `npx tsc --noEmit` before any push. CI (P7.1) will enforce later.
- Questions → open a `QUESTION:` comment in the PR rather than guessing; guessing against the
  Constitution is the only firing offense in this codebase.
- The gate is the judge. If your work has a corpus, it isn't done until the gate says so.
