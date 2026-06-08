# Coding Standards — Edge DocGraph Engine

**Purpose:** Define TypeScript, naming, strict types, error handling, module discipline, tests, comments, and contribution quality rules.

---

## 1. Core coding principle

This project processes sensitive documents and produces trust-sensitive outputs.

Code must be:

- explicit
- typed
- deterministic where possible
- auditable
- testable
- privacy-aware
- error-aware
- easy to review

Clever code is not welcome if it hides risk.

---

## 2. TypeScript strict mode

Required:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

No casual `any`.

---

## 3. `any` policy

Forbidden:

```ts
function process(x: any) {}
```

Allowed only with:

- explicit justification,
- local containment,
- conversion to typed value,
- validation at boundary.

Preferred:

```ts
unknown
```

Then validate:

```ts
function parseInput(input: unknown): Result<ParsedInput, ParseError> {
  // schema validation
}
```

---

## 4. Branded IDs

Use branded IDs to prevent mixing IDs.

```ts
type Brand<T, B extends string> = T & { readonly __brand: B };

type DocumentId = Brand<string, "DocumentId">;
type PageId = Brand<string, "PageId">;
type EvidenceId = Brand<string, "EvidenceId">;
type FieldId = Brand<string, "FieldId">;
type TemplateId = Brand<string, "TemplateId">;
```

Avoid passing raw strings everywhere.

---

## 5. Result type

Use Result for recoverable domain failures.

```ts
type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

Throw only for programmer errors or truly exceptional cases.

---

## 6. Error handling

Use typed errors.

```ts
type AppError =
  | RuntimeError
  | PipelineError
  | ValidationError
  | StorageError
  | SecurityError
  | UserFacingError;
```

Every error should have:

- code
- developer message
- user message if user-visible
- recoverability
- severity
- safe details

No raw sensitive values in error messages.

---

## 7. Naming conventions

Use:

- PascalCase for types/classes/components
- camelCase for variables/functions
- SCREAMING_SNAKE_CASE for constants only when truly constant
- snake_case for serialized enum strings where stable across storage/export
- kebab-case for filenames in UI components only if chosen consistently
- UPPERCASE markdown doc filenames already established by docs convention

Examples:

```ts
type FieldHypothesis = {};
const fieldHypothesis = {};
function buildDocGraph() {}
```

Serialized status:

```ts
type FieldStatus = "confirmed" | "needs_review" | "missing";
```

---

## 8. File naming

Recommended source filenames:

```text
field-hypothesis.ts
docgraph-builder.ts
template-matcher.ts
validator-registry.ts
```

React components:

```text
FieldCard.tsx
EvidenceDrawer.tsx
DocumentViewer.tsx
```

Keep consistency inside each package.

---

## 9. Function size

Prefer small functions.

Warning signs:

- function longer than ~80 lines,
- multiple unrelated responsibilities,
- hidden mutation,
- accepts large untyped object,
- returns unclear shape.

Break into:

- parser
- validator
- mapper
- reducer
- command handler
- effect/service call

---

## 10. Pure domain logic

Domain code should be pure where possible.

Good:

```ts
assignFieldStatus(hypothesis, validationResults)
```

Bad:

```ts
assignFieldStatusAndUpdateReactStateAndSaveToIndexedDB()
```

Separate calculation from side effects.

---

## 11. Side-effect boundaries

Allowed side effects in:

- storage adapters
- worker adapters
- runtime services
- UI event handlers
- pipeline orchestrators

Avoid side effects in:

- parsers
- validators
- graph selectors
- confidence calculators
- schema validators

---

## 12. Sensitive data logging rule

Never log raw:

- OCR text
- field values
- MRZ
- barcode payloads
- document filenames if sensitive
- crops/images
- corrections with values
- encryption keys

Use safe logs:

```ts
logger.info("ocr_completed", {
  documentId,
  pageId,
  durationMs,
  fieldCount,
});
```

---

## 13. Exhaustive switches

Use exhaustive checking for discriminated unions.

```ts
function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${x}`);
}
```

Example:

```ts
switch (status) {
  case "confirmed":
  case "needs_review":
  case "missing":
  case "conflict":
  case "invalid":
  case "unsupported":
  case "rejected":
    return;
  default:
    assertNever(status);
}
```

---

## 14. Schema validation

All external/untrusted data must be validated:

- imported template packages
- exported/imported DocGraph
- worker messages
- model manifests
- config files
- persisted storage migrations
- user-provided JSON

Use a schema library or strict custom validators.

---

## 15. Async coding

Rules:

- always handle promise rejection,
- support cancellation for long tasks,
- use AbortSignal where possible,
- avoid fire-and-forget unless logged and safe,
- avoid race conditions with stale worker results.

---

## 16. Worker message typing

Worker messages must be typed discriminated unions.

Do not send arbitrary objects.

Good:

```ts
type WorkerRequest =
  | { type: "process_document"; requestId: string; input: ProcessDocumentInput }
  | { type: "cancel_job"; requestId: string; jobId: string };
```

---

## 17. Comments

Use comments for:

- safety reasoning
- non-obvious algorithms
- threshold rationale
- privacy/security constraints
- model postprocessing assumptions
- migration reasons

Avoid comments that restate obvious code.

---

## 18. Tests required

Every new module must include:

- unit tests for pure logic,
- integration tests if it touches pipeline,
- security/privacy tests if it touches data/export/import/logging,
- regression test for every fixed bug.

---

## 19. Dependencies

Add dependencies only if:

- necessary,
- maintained,
- license acceptable,
- bundle/runtime impact acceptable,
- no hidden network behavior,
- works in workers/Tauri/browser as needed.

Document major dependency decisions.

---

## 20. Performance rules

Avoid:

- cloning full DocGraph repeatedly,
- large arrays in React state,
- raw image buffers in state,
- synchronous heavy loops on UI thread,
- unbounded OCR crop batches,
- all-model preload.

---

## 21. Security rules

Every PR must avoid:

- raw HTML from document text,
- unsafe eval,
- untrusted import execution,
- uncontrolled file writes,
- remote document upload,
- telemetry with document data.

---

## 22. Final coding rule

Write code as if a wrong confirmed field could cause real harm. Make types strict, errors explicit, logs safe, state controlled, and every output traceable.
