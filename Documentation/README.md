# Attestation Engine — Complete Documentation

**The definitive, final documentation set for building the Attestation Engine** — a fully local,
zero-training, zero-silent-error document intelligence platform that turns any file into
evidence-backed, self-verifying structured records.

This folder supersedes [`bin/docs/`](../bin/docs/README.md) and [`bin/mini-doc/`](../bin/mini-doc/README.md) (the
legacy corpus, archived to `bin/`) wherever
they conflict (see [19_LEGACY_AND_ARCHIVE.md](19_LEGACY_AND_ARCHIVE.md)). Together with
[`plan.md`](../plan.md) (the law), it is everything required to build the entire project without
further planning.

---

## Document precedence

1. **[00_CONSTITUTION.md](00_CONSTITUTION.md)** — invariants and laws. Nothing overrides it.
2. **[`plan.md`](../plan.md) Part II** — frozen contracts, decision freeze register, change control.
3. **This documentation set** — elaboration and executable detail.
4. Legacy `bin/docs/` — historical reference only where not superseded.

## Reading order (new engineer, ~2 hours)

1. [00_CONSTITUTION.md](00_CONSTITUTION.md) — the laws
2. [01_PRODUCT_AND_FEATURES.md](01_PRODUCT_AND_FEATURES.md) — what we're building
3. [02_ARCHITECTURE.md](02_ARCHITECTURE.md) — how it fits together
4. [03_INNOVATIONS.md](03_INNOVATIONS.md) — why it wins
5. [15_ROADMAP_TASKS.md](15_ROADMAP_TASKS.md) — what to do next
6. Everything else as the task at hand demands.

## Full map

| # | Document | Contents |
|---|---|---|
| 00 | [CONSTITUTION](00_CONSTITUTION.md) | Mission, invariants N1–N7, the seven laws, honest definitions, change control |
| 01 | [PRODUCT_AND_FEATURES](01_PRODUCT_AND_FEATURES.md) | Vision, workspace model, features F1–F20, user journeys, input matrix, STP KPI, non-goals |
| 02 | [ARCHITECTURE](02_ARCHITECTURE.md) | Brain/senses split, component map, data flows, runtime modes, degradation ladder |
| 03 | [INNOVATIONS](03_INNOVATIONS.md) | I1–I14 complete catalog: mechanism, novelty, cost, phase, failure counters |
| 04 | [MODEL_SELECTION](04_MODEL_SELECTION.md) | Final locked arsenal, per-slot rationale + verification record, rejected candidates, fetch/manifest |
| 05 | [PERCEPTION_SERVICE](05_PERCEPTION_SERVICE.md) | FastAPI service: endpoints, router, stages, ladder, config, memory management, errors |
| 06 | [EVIDENCE_BUNDLE_CONTRACT](06_EVIDENCE_BUNDLE_CONTRACT.md) | The brain⇄senses contract v1: full types, field semantics, versioning governance |
| 07 | [LATTICE_BEAM_GRAMMARS](07_LATTICE_BEAM_GRAMMARS.md) | CTC lattices, beam search, grammar automata, the MRZ checksum-guided decoder |
| 08 | [CONSENSUS_AND_ATTESTORS](08_CONSENSUS_AND_ATTESTORS.md) | Consensus solver spec, Hungarian pairing, justification chains, the full attestor registry |
| 09 | [TEMPLATE_ENGINE](09_TEMPLATE_ENGINE.md) | TemplateGraph v2, matching, text-keypoint homography, JIT compilation, versioning/drift |
| 10 | [VISUAL_ASSETS_AND_TABLES](10_VISUAL_ASSETS_AND_TABLES.md) | Portrait crop, signature ink, stamp/seal masks, table engine + arithmetic closure |
| 11 | [WORKSPACE_DATA_MODEL](11_WORKSPACE_DATA_MODEL.md) | Families/records/priors schemas, IndexedDB v2, OPFS layout, identity tiers, routing state machine, export |
| 12 | [UI_UX_SPEC](12_UI_UX_SPEC.md) | Workspace UI, review lane, bulk queue, evidence inspector, question UX, colors, a11y |
| 13 | [PERFORMANCE_BUDGETS](13_PERFORMANCE_BUDGETS.md) | Memory/latency budgets, profiles, anytime ladder, measurement methodology, perf CI |
| 14 | [QUALITY_TESTING](14_QUALITY_TESTING.md) | Quality doctrine, gates, benchmark corpora, unit standards, Shadow CI, silent-error policy |
| 15 | [ROADMAP_TASKS](15_ROADMAP_TASKS.md) | Phases P1–P7, task-by-task breakdown with done-criteria and gates |
| 16 | [ENGINEERING_RULES](16_ENGINEERING_RULES.md) | Discipline doctrine, code standards, repo layout, dev environment, commits, change control |
| 17 | [SECURITY_PRIVACY_PLAN](17_SECURITY_PRIVACY_PLAN.md) | The deferred-but-specified Phase 7 security pass: encryption, tokens, threat model |
| 18 | [GLOSSARY](18_GLOSSARY.md) | Every term, precisely defined |
| 19 | [LEGACY_AND_ARCHIVE](19_LEGACY_AND_ARCHIVE.md) | Relationship to old docs/code/training, what is kept/evolved/frozen |

## Governance

This set is **final**. After development starts, it changes only through the change-control rule
in [00_CONSTITUTION.md §6](00_CONSTITUTION.md) (identical to plan.md §18): pre-authorized fallback
flips are logged, genuine contradictions get a ≤5-line amendment, new ideas are parked until
Phase 7. There are no redesign sessions. The plan flow is the law.
