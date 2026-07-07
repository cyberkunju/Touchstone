# 18 — Glossary

Precise definitions. If a term is used differently anywhere, this file wins.

| Term | Definition |
|---|---|
| **Attestation** | A machine-checkable proof attached to a field value: checksum pass, cross-channel agreement, arithmetic closure, template consistency, quorum agreement, native-digital parse, or explicit user confirmation. The only currency of confirmation. |
| **Attestor** | A deterministic verifier in the registry (e.g., IBAN mod-97, Verhoeff) that validates a token and may self-label its field. |
| **Anytime ladder** | The budgeted escalation strategy (I10): cheap full-page discovery, then high-DPI re-perception only of unproven ROIs, streaming results throughout. |
| **Beam decoding** | Searching the OCR lattice for the highest-probability string that satisfies a grammar/checksum constraint set, instead of trusting the greedy top-1. |
| **Brain** | The TypeScript judgment core (graph, decoding, solver, attestors, templates, priors, storage, UI). The only place decisions are made (N7). |
| **Bundle / Evidence Bundle** | The versioned JSON contract carrying all perception output from senses to brain ([06](06_EVIDENCE_BUNDLE_CONTRACT.md)). |
| **Closure (arithmetic)** | A satisfied identity over table/total values (Σ lines = subtotal, qty×unit = line) that attests every participating cell. |
| **Confusion prior** | Per-installation character-confusion statistics harvested exclusively from checksum-verified reads; re-weights future beam decoding (I5). Learning without training. |
| **Consensus solver** | The constraint-satisfaction engine choosing the maximum-consistency assignment of values to fields and emitting justification chains (I1, [08](08_CONSENSUS_AND_ATTESTORS.md)). |
| **Discovery** | The unknown-document flow: full evidence extraction + cautious solving + review-first statuses. |
| **DocGraph** | The per-document evidence graph (nodes, edges, evidence records, hypotheses, validations) — inherited concept, retained. |
| **Draft family** | An auto-proposed family (tab + generated form) awaiting user approval after an unknown upload. Never exports, never pollutes. |
| **Dewarp** | Geometric flattening of curved/crumpled pages. Classical first; UVDoc grid-regression behind a flag (pixels remapped, never generated). |
| **Family** | A document family: form schema + template versions + append-only records table, shown as a workspace tab. |
| **Fallback mode** | Browser-only perception (PP-OCRv5 wasm, zxing-wasm, PDF.js) when the local service is absent — same contract, reduced capability, honest badge. |
| **Foveation** | Re-perceiving only specific ROIs at higher resolution, driven by verification failures. |
| **Grammar (automaton)** | A finite-state definition of a field type's valid strings (dates, amounts, enums, IDs, MRZ lines) used to constrain beam decoding (I3). |
| **Hybrid PDF** | A PDF with both a text layer and raster content; both are extracted and reconciled — mismatch means the text layer is untrusted (I9). |
| **Identity tiers** | sha256 exact → dHash-64 near-duplicate → template match → unknown (I13). Powers routing and dedupe. |
| **JIT / Extraction plan** | The compiled per-document program produced from a matched template: batched ROI crops + bound grammars/attestors, skipping discovery entirely (I8). |
| **Justification chain** | The per-field record of status, value, attestations, candidates considered, and penalties — the audit artifact behind every confirmed value. |
| **Lattice** | Per-CTC-step top-k character probability distributions from the recognizer — the raw material of all constrained decoding. Mandatory in vision-route bundles. |
| **Lite / Full profile** | Hardware-tiered model configurations for 4 GB and 8 GB+ machines ([13 §1](13_PERFORMANCE_BUDGETS.md)). |
| **LWT (Learning Without Training)** | All zero-gradient improvement loops: confusion priors, format priors, template flywheel, Shadow CI. |
| **MRZ** | Machine Readable Zone (ICAO 9303): TD1 (3×30), TD2 (2×36), TD3 (2×44) with 7-3-1 check digits — decoded under checksum constraints (I2). |
| **N1…N7** | The seven invariants ([00 §2](00_CONSTITUTION.md)). |
| **Perception / Senses** | The stateless Python service (or browser fallback) converting bytes into evidence. Never makes decisions. |
| **Quorum** | Agreement between two decorrelated perception channels on the same value — grants attestation for critical fields (I6). |
| **Record** | One processed document as an append-only row in a family: values + statuses + justifications + asset refs + source ref. |
| **Review lane** | The per-family queue of unproven fields awaiting human eyes (F15). |
| **Shadow CI** | Local replay of the user's corrected archive against a new engine version; regressions block the update (I11). |
| **Silent error** | A wrong value presented as `confirmed`. The one unforgivable failure; must be 0 on every benchmark (N1). |
| **STP (straight-through rate)** | % of uploads per family processed with zero human touches — the north-star product KPI. |
| **Template consistency** | The attestation granted when a value reads from an aligned template ROI, is grammar-valid, and the family has confirmed history for that field ([08 §5](08_CONSENSUS_AND_ATTESTORS.md)). |
| **TemplateGraph** | The learned, versioned structure of a family's layout: anchors, field bindings, fingerprint — structure only, never document data. |
| **VIZ** | Visual Inspection Zone of an ID document (the human-readable part), cross-attested against the MRZ. |
