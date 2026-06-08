# 14 — Glossary

Canonical terminology. Use these terms consistently across code, schemas, UI, and docs. Do not introduce synonyms without adding them here.

---

**Anchor** — A stable reference point used for template matching and alignment. Types: text, visual, geometry, keypoint, special_zone, table_grid. Must never be a variable document value.

**Asset (Visual asset)** — A non-text document object: photo, signature, stamp, seal, logo, emblem, flag, symbol. A first-class node, not an OCR attachment.

**BoxNorm / NormalizedBox** — `[x1,y1,x2,y2]` in 0–1 page space. Survives resolution changes; the coordinate form stored in the graph.

**Canonical coordinate system** — Normalized page layout, canonical width 1000, proportional height. Used for templates, overlays, alignment.

**Confidence (explainable)** — A score plus components, penalties, and reasons. Never a bare number. Subordinate to status.

**Conflict** — Two or more independent evidence sources disagree (e.g. MRZ DOB vs visible DOB). A field status and a `ConflictRecord`.

**Correction** — A user edit (label/value/type/region/crop/table/checkbox/conflict/template). High-trust evidence; never deletes original evidence.

**Critical field** — A field whose silent error is severe: passport/ID number, name, DOB, expiry/issue dates, nationality, MRZ values, identity code payloads, invoice total, tax id, account number, balances, required signature/photo presence, required legal/consent checkbox.

**Detector** — Model proposing document object regions (YOLOv11n custom-trained). Output is candidate evidence, not truth.

**DocGraph** — The central source-of-truth structure for one processed document: pages, nodes, edges, evidence, hypotheses, validations, provenance, quality, template context.

**Edge** — A typed relationship between graph nodes (contains, label_of, value_of, same_row, validated_by, conflicts_with, template_projected_from, corrected_by, ...).

**Edge device** — The user's local device (browser/laptop/tablet/Tauri app). "Edge" means no cloud inference.

**Evidence / EvidenceRecord** — An immutable, append-only observation/action supporting or disputing an interpretation, with source, kind, coordinates, confidence, model/parser version, provenance.

**Evidence producer** — Any module that emits evidence (detector, OCR, segmenter, parsers, table engine, face check, quality analyzer, user correction).

**FieldHypothesis** — A proposed form field created from evidence, with label, value, type, source node ids, confidence, status, reasons. Not final truth until verified.

**Field status** — The verifier's trust decision: `confirmed | needs_review | missing | conflict | invalid | unsupported | rejected`.

**Fingerprint** — Compact template signature (stable tokens, layout/visual/special-zone hashes) used for fast candidate retrieval.

**Form (EditableForm)** — A view projected from DocGraph hypotheses + statuses. Never the source of truth.

**Homography** — A perspective transform used in normalization, template alignment, and ROI projection.

**Hypothesis** — A proposed interpretation of evidence (this text is a label; this nearby text is its value; this crop is a signature). Requires verification.

**Known template** — A document layout already saved as a TemplateGraph. Known-template extraction is ROI-first.

**Layout drift** — A document is similar to a known template but fields/anchors shifted enough to reduce confidence; may trigger a new template version.

**MRZ** — Machine-Readable Zone (passports/IDs/visas). Parsed locally with mandatory check-digit validation.

**No-cloud policy** — Core processing must work without uploading document data; no telemetry with document data.

**Normalized coordinates** — Page-relative coordinates 0–1. Used for templates, cross-resolution layout, ROI projection, overlays.

**OPFS** — Origin Private File System. Local storage for large binaries: models, page images, crops, descriptors.

**Provenance** — The recorded history of how an output was produced (which evidence, model/parser/version, validator, correction, template projection).

**ROI (Region of Interest)** — A bounded page area selected for OCR/parse/crop/segment. Known templates use ROI-first extraction.

**ROI-first extraction** — Fast known-template strategy: project saved regions and extract only those first, instead of rediscovering the page.

**Segmentation** — Pixel-mask extraction for visual assets. Conditional, never full-page by default.

**Silent error** — A wrong value presented as confirmed/trusted without warning. The most dangerous failure. A wrong **critical** field confirmed is a release blocker.

**TemplateGraph** — Reusable local memory learned from a corrected DocGraph: anchors, region definitions, validators, aliases, relationships, fingerprint, version metadata. Stores structure, never variable values.

**Template family** — A group of related template versions sharing a `familyId`.

**Template version** — A specific layout variant within a family. Created on drift; never overwrites the previous version.

**Validator** — A deterministic rule checking evidence/fields (required, date, amount, id pattern, MRZ checksum, barcode payload, table arithmetic, face presence, cross-field, ...). Returns a `ValidationResult`; never mutates the graph.

**ValidationResult** — Structured validator output: target, status (pass/warn/fail/not_applicable), severity, message, evidence ids, optional status impact.

**Verifier** — The module that combines evidence and validations to assign field status. The single authority for trust; prevents silent errors.

**WebGPU / WASM** — Browser inference paths via ONNX Runtime Web. WebGPU primary where available; WASM is the required compatibility path (not a redundant fallback).

**WebCrypto (AES-GCM)** — Browser API used for local encryption of sensitive records. Never use custom crypto.
