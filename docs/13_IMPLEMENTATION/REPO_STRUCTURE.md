# Repo Structure — Edge DocGraph Engine

**Purpose:** Define the final folder and module structure for building the local evidence graph document intelligence app.

---

## 1. Structure principle

The repository must separate:

- UI
- domain logic
- graph engine
- pipeline orchestration
- model runtime
- worker layer
- storage
- security/privacy
- tests
- docs
- experiments

The architecture must prevent the product from becoming:

```text
React component calls OCR directly
  → model output mutates form state
  → template save stores random fields
  → verifier cannot audit source
```

Correct architecture:

```text
UI
  → app services
  → pipeline/worker contracts
  → evidence producers
  → DocGraph
  → verifier
  → form projection
  → correction/template learning
```

---

## 2. Recommended top-level layout

```text
edge-docgraph-engine/
  README.md
  package.json
  pnpm-lock.yaml
  tsconfig.json
  vite.config.ts
  eslint.config.js
  prettier.config.js

  docs/
  apps/
  packages/
  models/
  datasets/
  benchmarks/
  scripts/
  tests/
  examples/
  private_data/          # gitignored
  user_exports/          # gitignored
```

---

## 3. apps directory

```text
apps/
  web/
    src/
      main.tsx
      App.tsx
      routes/
      ui/
      app/
      styles/
      workers/
      service-worker/
    public/
    index.html

  tauri/
    src-tauri/
    src/
    package.json
```

### apps/web

Browser/PWA frontend.

Owns:

- routing
- workspace shell
- UI composition
- browser worker bootstrap
- browser storage adapters
- service worker if used

### apps/tauri

Serious local-app shell.

Owns:

- Tauri config
- native command bindings
- app packaging
- native storage/model paths
- optional Rust backend services

The same UI/domain packages should be reused.

---

## 4. packages directory

```text
packages/
  core/
  docgraph/
  template-engine/
  verifier/
  pipelines/
  ai-runtime/
  parsers/
  storage/
  ui/
  workers/
  security/
  config/
  testing/
```

Each package has clear ownership.

---

## 5. packages/core

```text
packages/core/
  src/
    types/
    ids/
    geometry/
    result/
    errors/
    events/
    time/
    assertions/
    index.ts
```

Owns shared primitives:

- IDs
- Result type
- domain errors
- geometry utilities
- normalized coordinates
- event types
- branded types
- assertions

Must not import UI, workers, ONNX, OCR, or storage.

---

## 6. packages/docgraph

```text
packages/docgraph/
  src/
    schema/
    nodes/
    edges/
    evidence/
    hypotheses/
    patches/
    builders/
    selectors/
    validation/
    examples/
    index.ts
```

Owns:

- DocGraph schema
- GraphNode types
- GraphEdge types
- EvidenceRecord
- FieldHypothesis
- graph patches
- graph selectors
- graph builders

Must be pure TypeScript domain logic.

No React.  
No direct model runtime.  
No direct IndexedDB.  
No raw UI state.

---

## 7. packages/template-engine

```text
packages/template-engine/
  src/
    schema/
    anchors/
    matching/
    alignment/
    roi/
    versioning/
    corruption-prevention/
    storage-format/
    examples/
    index.ts
```

Owns:

- TemplateGraph schema
- template matching
- anchor scoring
- homography/alignment interfaces
- ROI projection
- template versioning decisions
- template corruption rules

Must not read UI state directly.

---

## 8. packages/verifier

```text
packages/verifier/
  src/
    registry/
    validators/
      required/
      scalar/
      mrz/
      barcode/
      table/
      cross-field/
      quality/
      template/
    confidence/
    status/
    reports/
    index.ts
```

Owns:

- ValidatorRegistry
- verifier engine
- field status assignment
- confidence explanation
- validation result creation
- silent error guard logic

Must not call OCR/detector directly. It validates graph evidence.

---

## 9. packages/pipelines

```text
packages/pipelines/
  src/
    upload/
    pdf/
    image-normalization/
    extraction/
    ocr/
    assets/
    barcode/
    mrz/
    table/
    form-generation/
    correction/
    known-template/
    unknown-document/
    scheduler/
    index.ts
```

Owns orchestration logic.

It coordinates services through interfaces:

- PdfService
- ImageService
- DetectorService
- OcrService
- SegmenterService
- ParserService
- VerifierService
- StorageService

Pipeline code must not import concrete browser/Tauri runtime libraries directly.

---

## 10. packages/ai-runtime

```text
packages/ai-runtime/
  src/
    model-registry/
    onnx/
    preprocessing/
    postprocessing/
    yolo/
    ppocr/
    tensor/
    memory/
    benchmarks/
    index.ts
```

Owns model runtime abstractions:

- model manifest
- ONNX Runtime Web adapter
- tensor helpers
- detector postprocessing
- OCR postprocessing
- segmentation postprocessing
- memory/session lifecycle

No UI.  
No DocGraph mutation directly.  
Only returns typed evidence candidates.

---

## 11. packages/parsers

```text
packages/parsers/
  src/
    mrz/
    barcode/
    dates/
    amounts/
    ids/
    phone/
    email/
    country/
    tables/
    index.ts
```

Owns deterministic parsers.

Parsers should be:

- pure when possible
- thoroughly unit tested
- no UI
- no storage
- no network

---

## 12. packages/storage

```text
packages/storage/
  src/
    interfaces/
    indexeddb/
    opfs/
    sqlite/
    tauri/
    encryption/
    migrations/
    cleanup/
    index.ts
```

Owns local persistence:

- document store
- template store
- model cache
- artifact store
- correction store
- encryption wrappers
- deletion
- migration

Domain packages depend on storage interfaces, not concrete stores.

---

## 13. packages/workers

```text
packages/workers/
  src/
    protocol/
    client/
    orchestrator/
    inference/
    image/
    pdf/
    parser/
    storage/
    task-queue/
    index.ts
```

Owns:

- worker message protocol
- worker APIs
- Comlink contracts if used
- task queues
- progress events
- cancellation
- worker error mapping

---

## 14. packages/ui

```text
packages/ui/
  src/
    components/
    workspace/
    document-viewer/
    form-renderer/
    evidence-viewer/
    correction-ui/
    template-save/
    status/
    accessibility/
    hooks/
    index.ts
```

Owns reusable UI components.

UI must consume:

- view models
- selectors
- commands

UI must not directly call model runtime.

---

## 15. packages/security

```text
packages/security/
  src/
    classification/
    redaction/
    export-safety/
    import-validation/
    xss/
    encryption/
    logging-policy/
    no-cloud/
    index.ts
```

Owns:

- data classification
- redaction helpers
- import validators
- export manifests
- security checks
- privacy utilities

---

## 16. packages/config

```text
packages/config/
  src/
    defaults/
    schemas/
    feature-flags/
    thresholds/
    model-manifest/
    runtime-profiles/
    index.ts
```

Owns:

- configuration schema
- feature flags
- model paths
- thresholds
- device profiles
- experiment switches

No arbitrary untyped config.

---

## 17. tests directory

```text
tests/
  unit/
  integration/
  e2e/
  model/
  performance/
  security/
  fixtures/
```

Tests can import package internals through public test helpers where necessary.

---

## 18. models directory

```text
models/
  manifests/
  docdet/
  ocr/
  segmentation/
  table/
```

Model files may be large and may not be committed depending policy.

Keep:

- manifests
- checksums
- model cards
- metadata

Use `.gitignore` for raw private/large model artifacts if needed.

---

## 19. datasets and benchmarks

```text
datasets/
  synthetic/
  public_license/
  redacted_reviewed/

benchmarks/
  manifests/
  expected_outputs/
  synthetic_cases/
```

Private data never goes here unless gitignored and clearly marked.

---

## 20. scripts

```text
scripts/
  generate-synthetic-data.ts
  validate-docgraph.ts
  validate-template.ts
  export-model.ts
  benchmark-model.ts
  check-no-secrets.ts
  check-no-pii.ts
  package-docs.ts
```

Scripts must be deterministic where possible.

---

## 21. Import direction rules

Allowed direction:

```text
ui → app services → pipelines → domain/runtime/storage interfaces
domain packages → core
runtime packages → core/config
storage packages → core/security/config
```

Forbidden:

```text
docgraph imports React
verifier imports UI
core imports storage
model runtime mutates DocGraph directly
UI imports raw ONNX Runtime directly
pipeline imports concrete browser storage directly
```

---

## 22. Path aliases

Recommended TypeScript aliases:

```json
{
  "@core/*": ["packages/core/src/*"],
  "@docgraph/*": ["packages/docgraph/src/*"],
  "@template/*": ["packages/template-engine/src/*"],
  "@verifier/*": ["packages/verifier/src/*"],
  "@pipelines/*": ["packages/pipelines/src/*"],
  "@runtime/*": ["packages/ai-runtime/src/*"],
  "@parsers/*": ["packages/parsers/src/*"],
  "@storage/*": ["packages/storage/src/*"],
  "@workers/*": ["packages/workers/src/*"],
  "@ui/*": ["packages/ui/src/*"],
  "@security/*": ["packages/security/src/*"],
  "@config/*": ["packages/config/src/*"]
}
```

---

## 23. Final repo rule

The repository must make the architecture obvious. A new engineer should be able to open the folder tree and understand where extraction, graph, verification, templates, runtime, UI, storage, and security belong.
