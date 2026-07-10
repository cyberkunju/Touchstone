# 14 — Quality & Testing

The doctrine that makes "flawless" a measured property instead of a hope.

---

## 1. The hierarchy of gates

1. **Absolute blocker (inherited, permanent):** critical silent-error count = 0 — a wrong value
   in `confirmed` status on any benchmark document blocks everything outright.
2. **Phase gates:** each phase's observable gate ([15](15_ROADMAP_TASKS.md)) must be green to
   proceed.
3. **Baseline ratchet:** `bench/baselines/*.json` committed per phase; any run scoring below the
   committed baseline fails (improvements re-commit the baseline).
4. **Budget gates:** [13](13_PERFORMANCE_BUDGETS.md) from Phase 7 as CI, as design law from P1.

## 2. Benchmark corpora (`bench/corpora/`)

| Corpus | Contents | Introduced |
|---|---|---|
| `passports` | the 20 real images in `passport_images/` (fixed forever — the historical gate) | P1 |
| `mixed` | ≥ 15 invoices (incl. QR-bearing: EPC/Swiss/UPI/GST), ≥ 5 XLSX/DOCX, ≥ 5 PDFs (digital/scanned/hybrid incl. one planted garbage text layer), ≥ 5 ID-style docs (Aadhaar/PAN-format samples), hard negatives (book pages, screenshots) | P2–P4 |
| `degraded` | blur/glare/crumple/perspective variants of the above (synthetic degradation of real captures) | P4 |
| `personal` | the user's own corrected archive (Shadow CI — grows itself, never committed) | P6 |
Manifests pin sha256 + per-document expected outcomes (field values where ground truth is known,
expected statuses elsewhere — *status expectations are first-class*: a needs_review that should
be needs_review is a pass).

## 3. The gate runner (`bench/gate.mjs`)

Evolves `batch_test.cjs`: headless run per corpus → per-document field-level scoring →
`{ exactMatch, normalizedMatch, statusAccuracy, silentErrors, mrzValidRate, stp, timings }` →
diff vs baseline → exit code. One command: `node bench/gate.mjs --corpus passports`.

## 4. Scoring definitions (frozen)

- **Silent error:** status = confirmed ∧ normalized value ≠ ground truth. Severity: critical
  (identity/money/date fields) vs minor — critical count must be 0, minor count is ratcheted.
- **Normalized match:** after type normalization (dates → ISO, amounts → decimal, IDs → canonical).
- **MRZ valid rate:** fraction of physically-legible MRZs (human-adjudicated flag in manifest)
  fully decoded with all check digits passing.
- **STP:** [11 §6](11_WORKSPACE_DATA_MODEL.md). Measured on the known-template segment of each
  corpus.
- **Template safety:** false-match rate (matched wrong family) — any critical field confirmed
  through a false match counts as a silent error.

## 5. Unit discipline

- Pure-function modules get dense colocated vitest suites: `beam/` (lattice ops, beam, every
  grammar), `attestors/` (every algorithm: valid/invalid/boundary/transliteration cases),
  `consensus/` (Hungarian, solver invariants, justification constructor fuzz — forging
  `confirmed` without attestation must be unrepresentable), `geometry/` (homography RANSAC with
  synthetic outliers, phash), `template-engine/`, `storage/` (migration idempotency).
- The existing 303-test suite is inviolable — it runs green at every commit; MRZ/scalar parsers
  keep their suites as cross-checks of the new decoders.
- Service: pytest per stage (goldens) + contract tests (schema validation both directions) +
  the permanent lattice-tap tensor test ([05 §7](05_PERCEPTION_SERVICE.md)).
- Coverage focus (quality over %): decision logic ≥ 90 % branch; UI logic tested at the routing
  state machine level; no snapshot-test theater.

## 6. Shadow CI (I11, P6.3)

- Trigger: engine version change (brain or service or model manifest).
- Action: replay every stored docGraph's source through the new engine (offline, background),
  diff field outcomes vs user-confirmed values.
- Verdict: any regression on a user-confirmed field ⇒ update blocked, field-level report shown;
  user may accept individual diffs (which updates the record with provenance).
- This is the mechanism that makes "it only ever gets better *for you*" a guarantee, not a wish.

## 7. E2E & manual

- Puppeteer flows (evolving existing scripts): J1–J6 journeys ([01 §3](01_PRODUCT_AND_FEATURES.md))
  scripted; bulk-drop of the full passport corpus; export-open-verify (xlsx parsed back and
  checked); fallback-mode smoke (service stopped).
- Manual test matrix per release: Windows/Linux/macOS, Chrome/Edge/Firefox (fallback mode at
  least smoke-level on Firefox), lite/full profiles.

## 8. Regression policy

Every real-world bug that reaches a user-visible wrong result gets: a minimal repro added to the
relevant corpus/manifest → fix → test proves fix → baseline re-committed. Silent-error bugs
additionally get a written 5-line post-mortem note in the amendment log (what channel lied, why
the solver believed it, which constraint now prevents it).

## 9. Amendment — the real-world judge loop (2026-07-10, commit `191b183`)

Corpus SILENT=0 does **not** imply real-world visual quality (proven live). Three permanent
harnesses close that gap:

1. **`bench/inspect-one.mjs <image>`** — single-image forensics: every hypothesis (label,
   canonical, value, status, box), the DIAG trail, and a full-page UI screenshot.
2. **`bench/vision-judge.mjs <image>`** — external GPT-5.4 vision judge (`.env.local`):
   composites the engine's boxes onto the engine's WORKING bitmap (compositing on the
   original photo misaligns the moment deskew/rectification fires) plus the full app page;
   grades per-box tightness/targeting, form truth, and status honesty in strict JSON.
   Refusal on stamps/blank/degraded pages is graded as SUCCESS by prompt law.
3. **`bench/responsive-smoke.mjs`** — 3-viewport UI screenshots.

Methodology (the only one that survived contact with reality): one real image → inspect →
judge → root-cause → named law + unit test → family gate → next image. Ten-image judged
batches (seeded `Get-Random -SetSeed`) quantify progress — the 2026-07-10 round moved the
mean from 5.9 to 8.2 with zero silent errors throughout.
