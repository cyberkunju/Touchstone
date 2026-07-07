# 03 — Innovations

The complete innovation catalog (I1–I14). Each entry: mechanism, why it's genuinely new, what
observed failure it kills, cost, phase, and its failure counter. Honesty rule: novelty claims are
scoped precisely — nothing here is oversold.

**The unifying thesis:** every mainstream pipeline is `predict → score → hope`. We invert it to
`evidence → constraints → solve → attest`. Documents carry their own verification machinery
(check digits, error-corrected payloads, arithmetic identities, geometric priors, grammars);
harvesting *agreement between independent channels* yields calibrated certainty that model scale
cannot buy — at $0.

---

## I1 — Consensus Solver: extraction as constraint satisfaction
- **Mechanism:** fields are variables; candidates come from every channel (OCR top-k, grammar
  re-decodes, MRZ decode, code payloads, template projections, native cells); validators are
  constraints (hard: checksums/grammar validity/containment; soft: label affinity, template prior,
  confusion-prior likelihood, quorum, cross-field rules). A deterministic exact search finds the
  maximum-consistency assignment; disagreements surface as conflicts, never averaged away.
  Label↔value pairing is globally optimal (Hungarian algorithm), not greedy.
- **Kills:** the observed label/value mispairing and "header text becomes a field" bugs.
- **Novelty:** constraint-based extraction exists in academia; shipping it as the core of a local
  training-free engine is new. **Cost:** pure TS. **Phase:** lite in P1.6, full in P5. Spec: [08](08_CONSENSUS_AND_ATTESTORS.md).

## I2 — Checksum-guided beam decoding (MRZ and beyond)
- **Mechanism:** keep the recognizer's per-step probability lattice; beam-search the character
  space *subject to* all ICAO 9303 check digits passing and MRZ grammar (charset, date ranges,
  sex ∈ {M,F,<}). Checksums drive the read instead of judging it afterward. Generalizes to any
  checksummed token (IBAN, VIN, Aadhaar…).
- **Kills:** the #1 observed failure — "MRZ zone detected, TD3 parse invalid".
- **Novelty:** commercial passport SDKs do weak variants; no open local engine does lattice-level
  checksum-constrained decoding. **Cost:** TS beam (~88 steps × k=5 — trivial). **Phase:** P1.4. Spec: [07](07_LATTICE_BEAM_GRAMMARS.md).

## I3 — Grammar-constrained lattice re-decoding for every typed field
- **Mechanism:** for fields with known type, re-decode the lattice against a finite-state grammar
  (dates all orderings, amounts with locale hypotheses, enums, ID patterns). Highest-probability
  *valid* path wins, or "nothing valid" → question. Document-global locale decisions resolve once.
- **Kills:** the observed `sex = "c/call"` garbage class; date/amount misreads.
- **Novelty:** weighted-FST rescoring is known tech; applying it per-field over exposed CTC
  lattices in a no-training product pipeline is not standard practice anywhere open.
- **Cost:** ~200-line TS automata. **Phase:** P1.3/P1.6.

## I4 — The Attestor Registry: the world's checksums as a self-labeling layer
- **Mechanism:** ~25 deterministic verifiers scan every token stream; any hit self-labels the
  field ("Verhoeff-valid 12 digits ⇒ Aadhaar, verified") with zero document-type code. This is
  the concrete mechanism behind N5 (expect anything).
- **Novelty:** each checksum is textbook; the universal registry replacing doc-type templates as
  the labeling mechanism is the architectural differentiator. **Cost:** TS table + dense tests.
  **Phase:** P5.1. Full list: [08 §6](08_CONSENSUS_AND_ATTESTORS.md).

## I5 — Learning Without Training (LWT)
- **Mechanism:** (a) every checksum-verified read is free ground truth of *printed vs seen* →
  per-installation character confusion matrix (Laplace-smoothed) re-weights all future beam
  decoding — the engine adapts to *your* scanner with statistics, not gradients; (b) format
  priors per family (date order, decimal style) resolved once, stored forever.
- **Novelty:** confusion-prior adaptation sourced from checksum-verified reads (not human labels)
  appears genuinely novel in shipping products. **Cost:** a JSON matrix in IndexedDB. **Phase:** P6.1.

## I6 — Dual-channel perception quorum
- **Mechanism:** N-version programming for OCR: critical unattested fields re-read through a
  decorrelated channel (alternate preprocessing or second recognizer tier); agreement ≈ proof
  (decorrelated errors rarely coincide on the same wrong string); disagreement → review.
- **Cost:** 2× inference on small ROIs only, milliseconds. **Phase:** P5.3.

## I7 — Text-as-keypoints homography
- **Mechanism:** OCR word boxes are the keypoint set — matched by string equality + mutual
  geometric consistency, RANSAC over centroids → full homography (DLT); ladder to affine →
  translation when anchors are sparse. Words beat SIFT/ORB on documents: abundant,
  string-labeled, already computed.
- **Kills:** template refill drift under rotation/perspective (the old translation+scale hack).
- **Cost:** ~200-line TS. **Phase:** P1.8. Spec: [09 §4](09_TEMPLATE_ENGINE.md).

## I8 — Template JIT: templates compiled to extraction programs
- **Mechanism:** on match, compile the TemplateGraph into an ordered plan (ROI → grammar →
  attestors → field), all ROI recognitions batched into one inference call, validators pre-bound.
  Discovery, layout, and classification are *skipped*, not sped up.
- **Delivers:** N6 (≤ 1.5 s refill) by construction. **Phase:** P1.8 lite, P3+ full. Spec: [09 §5](09_TEMPLATE_ENGINE.md).

## I9 — "Never OCR digital truth": the ingestion router
- **Mechanism:** magic-bytes routing; digital files parse exactly (cells/runs/spans), scans go to
  vision; hybrid PDFs get both with reconciliation (text-layer claims verified against a rendered
  OCR sample; mismatch ⇒ vision wins + flag — kills the garbage-text-layer trap).
- **Delivers:** "any extension" as a routing problem with perfect extraction for digital files.
  **Phase:** P2.5 interim (PDF.js), P3.3 full. Spec: [05 §4](05_PERCEPTION_SERVICE.md).

## I10 — Anytime extraction: deadline scheduler + foveation
- **Mechanism:** explicit compute budget; low-DPI discovery first; only verification-failing ROIs
  re-perceived at higher DPI; verified results stream to the UI immediately; memory mirrors the
  ladder (full-res on disk, only foveated crops materialize).
- **Delivers:** N4 (4 GB) and perceived instantness simultaneously; compute lands exactly where
  proof is missing. **Phase:** P3.4/P5.4. Spec: [13 §4](13_PERFORMANCE_BUDGETS.md).

## I11 — Corrections as a personal regression suite (Shadow CI)
- **Mechanism:** the user's corrected archive replays through every new engine version locally;
  field-level diffs vs user-confirmed truth; regressions block the update with a report.
- **Novelty:** personal, local, automatic regression testing of an extraction engine appears
  unique. It operationalizes N1 permanently. **Phase:** P6.3. Spec: [14 §6](14_QUALITY_TESTING.md).

## I12 — Information-gain question ordering
- **Mechanism:** open questions ranked by how many downstream uncertainties each answer collapses
  (a date-format answer resolves every date in the family, forever); top 1–3 asked.
- **Delivers:** minimal user labor; every answer feeds I5. **Phase:** P6.2. Spec: [12 §6](12_UI_UX_SPEC.md).

## I13 — Three-tier document identity
- **Mechanism:** sha256 (exact re-upload → dedupe, answer from store, ≤ 0.3 s) → 64-bit dHash
  perceptual near-dup → template/anchor match (family) → unknown (discovery). Powers workspace
  auto-routing: match → instant fill + record; no match → draft family proposal.
- **Phase:** P2.2. Spec: [11 §5](11_WORKSPACE_DATA_MODEL.md).

## I14 — Render-and-compare tripwire *(experimental — flag, Phase 6)*
- **Mechanism:** re-render accepted critical values and compare against source crops as a final
  wrong-accept tripwire. Shipping variant of the idea is I6 (quorum); I14 stays a research flag
  until it proves signal on the personal benchmark. **Marked honestly: promising, unproven.**

---

## Innovation → failure-mode coverage matrix

| Observed/expected failure | Killed by |
|---|---|
| MRZ detected but parse invalid | I2 |
| Garbage enum/date/amount values | I3, I5 |
| Label/value mispairing | I1 (Hungarian + constraints) |
| Template refill drift | I7, I8 |
| Wrong value confirmed (silent error) | I1 attestation rule, I6, I14, N1 law |
| Slow on 4 GB machines | I8, I10, tiered models |
| Garbage PDF text layers | I9 reconciliation |
| Same doc uploaded twice | I13 |
| Engine gets worse after update | I11 |
| User fatigue from questions | I12, I5 |
| "It can't read MY scanner" | I5 confusion priors |
