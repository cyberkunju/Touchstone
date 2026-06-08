# 11 — Implementation

**Purpose:** Define repo structure, module interfaces, coding standards, state management, worker protocols, configuration, error handling, logging, and migrations. This is how the architecture becomes maintainable, testable, and swappable code.

---

## 1. Repo structure (monorepo)

pnpm workspaces. Separate UI, domain, runtime, storage, security, config. The structure must make the architecture obvious.

```
edge-docgraph-engine/
  apps/
    web/                # browser/PWA frontend, worker bootstrap, browser adapters
    tauri/              # desktop shell, native command bindings (reuses packages)
  packages/
    core/               # IDs, Result, errors, geometry, events, time, assertions  (no UI/IO)
    docgraph/           # schema, nodes, edges, evidence, hypotheses, builders, selectors, patches
    template-engine/    # schema, anchors, matching, alignment, roi, versioning, anti-corruption
    verifier/           # registry, validators, confidence, status, reports
    pipelines/          # upload, pdf, normalization, extraction, ocr, assets, barcode, mrz, table,
                        # form-generation, correction, known-template, scheduler  (uses interfaces)
    ai-runtime/         # model registry, onnx adapter, preprocessing, postprocessing, yolo, ppocr, tensor, memory
    parsers/            # mrz, barcode, dates, amounts, ids, phone, email, country, tables  (pure)
    storage/            # interfaces, indexeddb, opfs, sqlite, tauri, encryption, migrations, cleanup
    workers/            # protocol, client, orchestrator, inference, image, pdf, parser, storage, task-queue
    ui/                 # components, workspace, viewer, form, evidence, correction, template-save, status, a11y
    security/           # classification, redaction, export-safety, import-validation, xss, encryption, logging-policy
    config/             # defaults, schemas, feature-flags, thresholds, model-manifest, runtime-profiles
  models/  datasets/  benchmarks/  scripts/  tests/  examples/
  private_data/  user_exports/   # gitignored
```

**Allowed import direction:** `ui → app services → pipelines → domain/runtime/storage interfaces`; domain → core; runtime → core/config; storage → core/security/config. **Forbidden:** docgraph imports React; verifier imports UI; core imports storage; model runtime mutates DocGraph; UI imports raw ONNX; pipeline imports concrete browser storage. Use path aliases (`@core/*`, `@docgraph/*`, ...).

## 2. Module interfaces (depend on these, not libraries)

```ts
interface DetectorService    { detect(i: DetectionInput): Promise<Result<DetectionOutput, DetectorError>> }
interface OcrService         { read(i: OcrInput): Promise<Result<OcrOutput, OcrError>> }
interface SegmenterService   { segment(i: SegmentationInput): Promise<Result<SegmentationOutput, SegmenterError>> }
interface BarcodeParserService { decode(i: BarcodeDecodeInput): Promise<Result<BarcodeDecodeOutput, BarcodeError>> }
interface MrzParserService   { parse(i: MrzParseInput): Result<MrzParseOutput, MrzParseError> }
interface TableExtractionService { extract(i: TableExtractionInput): Promise<Result<TableExtractionOutput, TableError>> }
interface GraphBuilder       { buildInitialGraph(i): Result<DocGraph,_>; applyPatch(g,p): Result<DocGraph,_>; addEvidence(g,e): Result<DocGraph,_> }
interface FieldHypothesisGenerator { generate(i): Result<FieldHypothesis[],_> }
interface VerifierService    { verify(i: VerifierInput): Promise<Result<VerifierOutput, VerifierError>> }
interface TemplateMatcher    { findCandidates(i): Promise<Result<TemplateCandidate[],_>>; decide(i): Result<TemplateDecision,_> }
interface AlignmentService   { align(i): Promise<Result<AlignmentOutput,_>> }
interface RoiExtractionService { projectFields(i): Result<ProjectedRoi[],_>; extractRois(i): Promise<Result<RoiExtractionOutput,_>> }
interface StorageService     { saveDocGraph; loadDocGraph; saveTemplate; loadTemplate; saveArtifact; deleteDocument }
interface FormProjectionService { project(i): Result<FormProjectionOutput,_> }
interface CorrectionService  { applyCorrection(i): Promise<Result<CorrectionOutput,_>> }
interface ExportService      { createExport(i): Promise<Result<ExportPackage,_>> }
```

Every interface has a mock for tests, contract tests, and error-behavior tests. Evidence-producing services return candidates/evidence + model run info; they never mutate the DocGraph directly.

## 3. Coding standards

- **TypeScript strict**: `strict`, `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch`. No casual `any`; use `unknown` + validation at boundaries.
- Branded IDs; `Result<T,E>` for recoverable failures (throw only for programmer errors); typed `AppError`.
- Naming: PascalCase types/components; camelCase vars/functions; snake_case for serialized enum strings stable across storage/export.
- Small pure functions; separate calculation from side effects. Side effects only in storage/worker/runtime adapters, UI handlers, pipeline orchestrators — never in parsers/validators/selectors/confidence calculators.
- Exhaustive switches over discriminated unions (`assertNever`). Validate all external/untrusted data (imports, worker messages, manifests, config, persisted migrations).
- **Never log** raw OCR text, field values, MRZ, payloads, crops, correction values, keys. Comment safety/threshold/privacy reasoning, not obvious code.

## 4. State management

Truth hierarchy: artifacts → EvidenceRecords → DocGraph → Verifier results → form view model → UI controls. Form state is a **projection**, never truth.

State stores (each with a clear owner): `AppState` (small/global), `DocumentState`, `GraphState` (graph + incremental patches + version), `FormState` (derived projection + review queue + selection), `ViewerState` (UI-only), `WorkerState` (jobs/progress), `RuntimeState` (model load states, no tensors), `TemplateState`, `CorrectionState` (undo/redo), `StorageState`.

Use a command pattern: user actions dispatch typed commands → produce graph patches / worker tasks / storage writes / UI updates. Use selectors for derived data (visible fields, review queue, status counts, evidence for selection, export readiness, template-save eligibility). After correction: command → CorrectionEvent → graph patch → re-verify affected → status update → form re-derive → template eligibility. Handle stale results via job/graph-version IDs. Devtools must redact sensitive values and be disabled in production.

## 5. Worker protocol

Typed/versioned/cancellable envelope, references for large data, transferables, stale-result rejection, privacy-safe errors — full spec in [08_EDGE_RUNTIME.md](08_EDGE_RUNTIME.md). Request union covers process_document, normalize_page, run_detection, run_ocr, run_segmentation, parse_barcode, parse_mrz, extract_table, verify_graph, save/load artifact/docgraph. Cancellation: stop scheduling, abort if supported, ignore stale results, clean temp artifacts, preserve applied corrections.

## 6. Configuration

Typed, validated at startup, versioned, safe-by-default. Categories: model, runtime, pipeline, **thresholds**, feature flags, security, storage, UI, benchmark. Thresholds (confidence/template/OCR) affect silent-error and false-match rates — version them (`threshold-profile-vX`) and benchmark changes; never lower them to improve demos. Feature flags default safe (`enableSegmentationBucket:false`, `enableUnsafeDebugMode:false`). Security config: `noCloudMode:true` (not disableable in default builds), `telemetryEnabled:false`. Config load order: hardcoded safe defaults → build-time → local user settings → device-profile adjustments. No remote config silently changing extraction thresholds. `.env` holds no secrets/real paths.

## 7. Error handling

Typed `AppError { id, code, category, severity, recoverable, userMessage, developerMessage, safeDetails?, causedBy?, createdAt }`. Categories: runtime, pipeline, model, ocr, parser, verifier, template, storage, security, privacy, ui. Severity: info/warning/error/critical. `userMessage` safe and actionable; `developerMessage`/`safeDetails` contain no raw sensitive values. Distinguish operational errors (recover/retry, fail the task not the app) from evidence uncertainty (becomes a field status). UI error boundaries around workspace/viewer/form/evidence/template-save must not erase current corrections. Critical security/silent-error issues are release blockers.

## 8. Logging & debug

Local-only, redacted by default. Allowed: status counts, durations, model id/version, runtime mode, error code, memory warnings, field type without value. Forbidden: raw OCR/values/MRZ/payloads/crops/keys/sensitive filenames. All logs pass a sanitizer that strips keys like `value/text/mrz/payload/crop/image/raw/password/key/secret`. Debug graph inspector defaults to redacted; full/unsafe value display requires an explicit action + warning. Debug-package export defaults redacted and warns.

## 9. Migrations

Step migrations per schema (`docgraph-v1→v2`, `templategraph-v1→v2`, ...) via a registry resolving a path. Back up before migrating; never overwrite old data until success; never fabricate evidence; preserve original evidence/corrections/template history; mark unconvertible-confidence templates as **draft/review_required** rather than active. Imports migrate in temp then are reviewed. Each migration has before/after fixtures and a regression test. Failure keeps the app usable and offers a safe backup/export.

## 10. Contribution gates (PR checklist)

typecheck + lint + tests pass; no secrets/real documents/raw-value logs; module boundaries respected; docs updated for behavior changes; schema + migration updated for data-shape changes; benchmark added for model/extraction changes; silent-error risk considered; privacy/no-cloud preserved; decision log updated for model/threshold/security/architecture changes.
