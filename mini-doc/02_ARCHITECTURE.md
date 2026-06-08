# 02 — Architecture

**Purpose:** Define the system structure, modules and their boundaries, the data flow, the two extraction flows, and the invariants that must never break.

---

## 1. Architecture thesis

Do not build `OCR output → form`. Build an evidence graph:

```
Multiple local modules produce EVIDENCE.
The DocGraph stores and relates evidence.
The Hypothesis Generator proposes fields/assets/tables.
The Verifier decides status (trust).
The Form Renderer displays only graph-backed hypotheses.
User corrections become high-trust evidence.
The TemplateGraph learns corrected structure for fast future extraction.
```

Every model and parser is a replaceable evidence producer. None is the final authority.

## 2. Layered module map

```
UI Layer
  Upload · Document Viewer · Evidence Overlay · Form Renderer · Correction UI · Template UI · Export
        │ typed commands / view models
Orchestration Layer
  Job Scheduler · Worker Manager · Model Session Manager · Progress · Error Router
        │ typed worker messages
Input + Page Layer
  File Type Detector · PDF Processor · Image Decoder · Page Record Builder · Page Normalizer
        │ NormalizedPage + PageQualityReport + transforms
Evidence Producer Layer
  Detector · OCR · Segmenter · Barcode Parser · MRZ Parser · Table Engine · Face Check · Quality Analyzer
        │ EvidenceRecord[]
Graph Layer
  Evidence Store · DocGraph Builder · Node/Edge Managers · Provenance · Graph Query
        │ DocGraph
Reasoning Layer
  Field/Asset/Table Hypothesis Generators · Validator Registry · Verifier
        │ statuses, validations, conflicts
Learning Layer
  TemplateGraph Builder · Template Matcher · Alignment · ROI Projector · Versioning
        │ TemplateGraph
Storage/Security Layer
  IndexedDB · OPFS · Encryption · Model Cache · Export/Import
```

## 3. Module responsibilities and boundaries

The defining rule: **evidence producers produce evidence; they do not decide final truth.** Specific boundaries:

- **UI** displays and collects corrections; never runs inference, never confirms fields, never mutates the TemplateGraph directly.
- **Orchestration** schedules jobs, loads/unloads models, tracks progress, routes errors; never interprets document semantics.
- **Input/Normalizer** produces page records, normalized images, quality reports, coordinate transforms; never creates fields.
- **Detector/OCR/Segmenter** produce candidate evidence with coordinates, confidence, model version; never create confirmed fields.
- **Parsers (barcode/MRZ/table)** produce parsed evidence + validation signals; never overwrite visible fields silently.
- **DocGraph** stores evidence and relationships; never runs inference, never renders, never persists directly (delegates to storage).
- **Hypothesis Generator** proposes; never sets final `confirmed` status; never bypasses validators.
- **Verifier** owns final status; never mutates raw evidence or edits user values; never hides uncertainty.
- **Form Generator** renders hypotheses + status; never reads raw OCR; never confirms.
- **Correction Capture** records edits as evidence, patches graph, triggers re-verification; never deletes original evidence, never auto-updates templates.
- **TemplateGraph engine** stores structure not values; never overwrites on drift; never confirms a value alone.
- **Storage** persists/encrypts/retrieves; never interprets semantics or logs sensitive values.

A module that cannot say what evidence it produced, what it consumed, and which layer may interpret its output does not belong in the architecture.

## 4. Data flow (canonical)

```
RawFile → DocumentRecord → PageRecord[] → NormalizedPage[]
        → EvidenceRecord[] → DocGraph
        → FieldHypothesis[] → ValidationResult[]
        → FormSchema + FormValues → UserCorrectionEvidence[]
        → TemplateGraph
```

Invariant: data must not collapse into plain text early. Coordinates, source, model version, confidence, and provenance are preserved at every stage. See [03_DATA_MODEL.md](03_DATA_MODEL.md).

## 5. Two extraction flows

### 5.1 Unknown-document flow (discovery-first, cautious)

```
upload → normalize → quality → template pre-check (may switch to known flow)
       → detector pass → OCR (full-page + blocks + special zones)
       → asset crops → code parse → MRZ parse → table reconstruct → face check
       → DocGraph build → hypothesis generation → verification
       → editable form (uncertainty visible) → correction → optional TemplateGraph save
```

### 5.2 Known-template flow (verification-first, fast)

```
upload → normalize → candidate template retrieval → multi-signal scoring → decision
       → alignment (global + local correction) → ROI projection
       → ROI-first extraction (OCR/parse/crop only where expected)
       → verification (required-field, cross-field, drift)
       → fill form fast → review only uncertain fields → version on drift
```

Decisions: `same_template | same_family_new_version | unknown_template | ambiguous_match`. Never force a weak match; a false unknown is safer than a false match. Detail in [07_TEMPLATE_ENGINE.md](07_TEMPLATE_ENGINE.md).

## 6. Runtime split

- **Main thread:** React rendering, viewer, form, evidence drawer, progress, light orchestration. Never runs OCR/detection/segmentation/large PDF rasterization/OpenCV loops.
- **Workers:** preprocessing, inference (ONNX), parsing, table geometry, graph building, verification, storage I/O. Typed message contracts; cancellable; memory-aware.

Full runtime rules in [08_EDGE_RUNTIME.md](08_EDGE_RUNTIME.md).

## 7. Trust model

A field is `confirmed` only if: evidence exists; source confidence is sufficient for the field type; geometry is plausible; required validators pass; no critical conflict; quality is adequate for the region; and template alignment is trustworthy when template-derived. Otherwise it is `needs_review | missing | conflict | invalid | unsupported`.

## 8. Architecture invariants (never break)

1. The DocGraph is the source of truth.
2. The form is a view over hypotheses, not raw OCR.
3. Every field has evidence (or is explicitly user-created).
4. Every evidence item preserves coordinates and source.
5. User corrections become evidence; original evidence is never deleted.
6. Templates are versioned; never silently overwritten.
7. Models never write final form truth; the Verifier owns status.
8. Low-confidence/critical-conflict fields are flagged, not guessed.
9. Processing is local-only; sensitive data stays on device.
10. Known templates are ROI-first; unknown documents are review-first.
