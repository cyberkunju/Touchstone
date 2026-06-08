# Build Guide — Edge DocGraph Engine

**Purpose:** Define development setup, build commands, environment requirements, package scripts, model setup, tests, docs generation, and Tauri path.

---

## 1. Build principle

The project should be buildable by a new engineer using documented commands.

Goals:

- deterministic install
- strict TypeScript
- clear model setup
- local-only dev flow
- test commands
- benchmark commands
- web and Tauri paths

---

## 2. Required tools

Recommended:

- Node.js LTS
- pnpm
- Git
- Python for training scripts
- Rust for Tauri path
- modern browser for web runtime tests

Example versions should be pinned in repo docs/tooling once chosen.

---

## 3. Package manager

Recommended:

```text
pnpm
```

Install:

```bash
pnpm install
```

Use lockfile:

```text
pnpm-lock.yaml
```

---

## 4. Common scripts

Recommended root scripts:

```json
{
  "scripts": {
    "dev": "pnpm --filter @app/web dev",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint",
    "format": "pnpm -r format",
    "test": "pnpm -r test",
    "test:unit": "pnpm -r test:unit",
    "test:integration": "pnpm -r test:integration",
    "test:e2e": "pnpm --filter @app/web test:e2e",
    "benchmark": "pnpm --filter @benchmarks/runner benchmark",
    "docs:check": "node scripts/check-docs.js"
  }
}
```

---

## 5. Web development

Start web app:

```bash
pnpm dev
```

Requirements:

- local dev server sends COOP/COEP headers if threaded WASM/SharedArrayBuffer needed,
- model assets available,
- workers load,
- OPFS/IndexedDB available in browser.

---

## 6. Environment variables

Use `.env.example`.

Allowed examples:

```env
VITE_MODEL_BASE_URL=/models
VITE_ENABLE_DEVTOOLS=false
VITE_BUILD_CHANNEL=local
```

Forbidden:

- API keys
- secrets
- real document paths
- private tokens

Do not commit `.env`.

---

## 7. Model setup

Model files may be:

- bundled,
- downloaded from trusted release,
- placed in local `models/` during development.

Expected layout:

```text
models/
  manifests/
    model-manifest.json
  docdet/
  ocr/
  segmentation/
```

Validate models:

```bash
pnpm models:validate
```

Model validation should check:

- manifest valid,
- files exist,
- checksums match,
- runtime compatibility test passes.

---

## 8. Type checking

Run:

```bash
pnpm typecheck
```

Typecheck must pass before merge.

No suppressed errors without documented reason.

---

## 9. Linting

Run:

```bash
pnpm lint
```

Lint should catch:

- unsafe any
- unused imports
- forbidden imports
- no console logging sensitive paths
- module boundary violations if configured.

---

## 10. Tests

Run all tests:

```bash
pnpm test
```

Run specific:

```bash
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:security
```

Tests should use synthetic fixtures by default.

---

## 11. Benchmarks

Run benchmark suite:

```bash
pnpm benchmark
```

Benchmark outputs:

```text
benchmarks/results/
  model/
  extraction/
  performance/
  silent-error/
```

Private benchmark data must stay gitignored.

---

## 12. Tauri development

Install Rust/Tauri prerequisites.

Run:

```bash
pnpm --filter @app/tauri tauri dev
```

Build:

```bash
pnpm --filter @app/tauri tauri build
```

Tauri path must reuse domain/UI packages.

---

## 13. Production build

Web:

```bash
pnpm --filter @app/web build
```

Tauri:

```bash
pnpm --filter @app/tauri tauri build
```

Before production build:

- typecheck
- lint
- tests
- security checks
- no secrets scan
- no PII scan
- model checksums
- docs updated

---

## 14. Security checks

Recommended scripts:

```bash
pnpm security:secrets
pnpm security:pii
pnpm security:no-cloud
pnpm security:imports
```

These should check:

- secrets
- private data paths
- no raw test PII
- network calls during extraction
- import validation.

---

## 15. Clean/reset

Commands:

```bash
pnpm clean
pnpm storage:clear-dev
pnpm models:clear-cache
```

Be careful: destructive commands must clearly say what they remove.

---

## 16. Troubleshooting

### Model does not load

Check:

- model path
- checksum
- ONNX compatibility
- browser console
- worker logs
- execution provider

### Workers fail

Check:

- CSP/headers
- worker file path
- module worker support
- bundler config

### OPFS unavailable

Check browser support/private mode.

### WebGPU unavailable

Use WASM mode if allowed.

---

## 17. Build acceptance

A build is acceptable if:

- install works from lockfile,
- typecheck passes,
- lint passes,
- tests pass,
- synthetic demo works,
- no-cloud test passes,
- model manifest valid,
- security scan clean,
- docs package complete.

---

## 18. Final build rule

A new engineer should be able to clone, install, run, test, and build the project without guessing hidden setup. If setup knowledge lives only in someone’s head, it must be added here.
