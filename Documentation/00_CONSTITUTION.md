# 00 — Constitution

The laws of the Attestation Engine. Every design, task, and line of code is derivable from this
document. Nothing overrides it.

---

## 1. Mission

Build a platform where a user feeds in **any file** — photo, scan, PDF, Excel, Word, anything —
and receives a fully understood, evidence-backed, editable form: every text field, photo,
signature, stamp, table, barcode, and MRZ extracted; uncertainty asked, never hidden. The user
corrects once; the layout becomes a learned template; every similar document afterward is extracted
**instantly** and appended to a growing records table, exportable to Excel/CSV/JSON. It runs
entirely on a normal 4–8 GB laptop, offline, forever free of cloud and training costs — and it
gets measurably better with every correction, approaching zero human intervention for stable
document families.

## 2. The invariants (N1–N7)

| # | Invariant | Binding consequence |
|---|---|---|
| **N1** | **Zero silent errors.** A wrong value displayed as confirmed is the only unforgivable failure. | A field is `confirmed` **iff** it carries ≥1 machine-checkable attestation (checksum, cross-channel agreement, arithmetic closure, template consistency, quorum, native-digital parse, or explicit user confirmation). Everything else is a question. Encoded in the `Justification` type ([08](08_CONSENSUS_AND_ATTESTORS.md)) and fuzz-tested. |
| **N2** | **100 % local.** No document byte leaves the machine, ever. | Loopback-only service; no telemetry; no cloud APIs; models on disk; export is an explicit user act. |
| **N3** | **$0 training; ≤ $30 emergency reserve.** | Pretrained models + deterministic algorithms + local statistics only. The reserve is spendable only on benchmark-proven gaps surviving every zero-cost lever, decided by gate evidence. |
| **N4** | **4 GB RAM floor; CPU-only baseline.** | Budgets in [13](13_PERFORMANCE_BUDGETS.md) are law and become CI tests. Lazy model loading, LRU eviction, foveated high-res, tiled images. |
| **N5** | **No document-type code paths.** | Universality emerges from universal primitives + the attestor registry + grammars + templates. "Add support for document X" must require zero new code. Any special-case PR is rejected by design. |
| **N6** | **Second upload is instant.** | Known-template extraction ≤ 1.5 s via compiled extraction plans (Template JIT), exact re-upload ≤ 0.3 s. |
| **N7** | **Judgment in one language.** | All decision logic (graph, solver, verifier, templates, priors) lives in the TypeScript brain. Python is stateless perception only. Decision logic is never duplicated across languages. |

## 3. The seven laws

1. **Law of Evidence** — no field exists without evidence; every value traces to pixels, payload
   bytes, or an explicit user action, through a recorded provenance chain.
2. **Law of Attestation** — extraction is proof search, not prediction. Confidence is never a
   model's feeling; it is the count and strength of independent agreements.
3. **Law of the Question** — when proof is missing, the system asks. A question is a success mode,
   not a failure mode. It asks the fewest, highest-information questions possible (I12).
4. **Law of Locality** — the user's machine is the whole world. Anything requiring a network is
   design error (model fetch scripts are the sole, explicit, user-invoked exception).
5. **Law of the Template** — corrections are precious; they become templates, priors, and personal
   regression tests. No correction is ever wasted, and no template is ever silently mutated.
6. **Law of Budgets** — memory and latency ceilings are functional requirements with the same
   force as correctness. Blowing a budget is a failing test.
7. **Law of the Plan** — [`plan.md`](../plan.md) Part II froze every decision. Development follows
   the task list in order. Change happens only through §6 below.

## 4. Honest definitions (anti-hype clauses)

- **"Flawless"** means: zero *silent* errors, ever — not zero questions. On physically unreadable
  input, the flawless behavior is a rescan request or a question, never a guess.
- **"Perfect extraction"** means: every value the document can *prove* is extracted and confirmed;
  every value it cannot prove is presented with evidence and asked.
- **"No human intervention"** is an asymptote measured by **STP (straight-through rate)** per
  family. Stable, attestable families genuinely reach 100 %. Degraded or unprovable inputs
  route to questions by design — that behavior is the product, not a limitation.
- **Vendor benchmark numbers are never trusted** — every model switch locks only after our own
  gate passes ([14](14_QUALITY_TESTING.md)).

## 5. Deferred by explicit owner decision

- **Security hardening is Phase 7** (owner directive, 2026-07-06): encryption-at-rest, service
  auth, threat-model review land last, per [17_SECURITY_PRIVACY_PLAN.md](17_SECURITY_PRIVACY_PLAN.md).
  Until then builds are dev-trust-only. This is recorded, intentional, and scoped — not forgotten.

## 6. Change control (the only planning permitted after dev starts)

1. **Pre-authorized branches** — every risk in the pre-mortem has a pre-chosen fallback
   (PP-OCRv6→v5, SLANet→LORE→cluster, homography→affine→translation, UVDoc flag, $30 reserve).
   Flipping to a fallback on gate evidence is a **config change + log line**, not planning.
2. **Reality contradictions** (missing API, license surprise, budget breach): write a ≤5-line
   amendment in plan.md §19 (what/why/evidence), apply the smallest correction, resume.
3. **New ideas** during dev: parked in plan.md §19 backlog, untouched until the Phase 7 gate is
   green.
4. Anything else — including "improvements" to this documentation — waits for Phase 7.

## 7. Decision freeze (summary — full register in plan.md §17)

OCR = PP-OCRv6 tiers (v5 fallback enum) · Layout = PP-DocLayout-S/M (DocLayout-YOLO challenger
only) · Tables = SLANet_plus ladder · Faces = YuNet · Codes = zxing-cpp · PDF = pypdfium2 ·
Office = openpyxl/python-docx · Dewarp = classical→UVDoc flag · Handwriting slot closed ·
Segmentation = classical only · Service = stateless FastAPI · Brain = TS-only judgment ·
Storage = IndexedDB v2 + OPFS · Export = exceljs · Beam k=5/width 50 · Hungarian pairing ·
Statuses enum unchanged · Phases 1→7 strictly ordered · Security last.

**These are closed. Reopening any of them is a constitution violation.**
