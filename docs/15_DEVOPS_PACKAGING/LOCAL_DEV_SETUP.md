# Local Dev Setup — Edge DocGraph Engine

**Purpose:** Explain how to run the project locally for development, testing, model/runtime checks, and documentation work.

---

## 1. Local development goal

A new engineer should be able to clone the repository and run the app locally without guessing hidden steps.

The local setup must support:

- browser/PWA development,
- local-only document processing,
- worker runtime,
- local model assets,
- IndexedDB/OPFS storage,
- tests,
- schema validation,
- synthetic examples,
- Tauri desktop path when needed.

---

## 2. Recommended tools

Required baseline:

```text
Git
Node.js LTS
pnpm
Modern Chromium browser
```

Recommended for full project:

```text
Python 3.10+ for training/data scripts
Rust toolchain for Tauri
System build tools for native dependencies
```

Optional:

```text
VS Code
Playwright browsers
Docker for reproducible benchmark runners
```

---

## 3. Clone and install

```bash
git clone https://github.com/YOUR_ORG/edge-docgraph-engine.git
cd edge-docgraph-engine
pnpm install
```

The repository should use a committed lockfile:

```text
pnpm-lock.yaml
```

Do not use mixed package managers unless explicitly supported.

---

## 4. Environment file

Create local env from example:

```bash
cp .env.example .env.local
```

Allowed values:

```env
VITE_MODEL_BASE_URL=/models
VITE_BUILD_CHANNEL=local
VITE_ENABLE_DEVTOOLS=false
VITE_ENABLE_UNSAFE_DEBUG=false
```

Forbidden in env files:

- API keys
- cloud OCR tokens
- real document paths
- production secrets
- private user data
- telemetry tokens unless opt-in telemetry exists

`.env.local` must be gitignored.

---

## 5. Model assets for local dev

The app needs local models to run extraction.

Expected layout:

```text
models/
  manifests/
    model-manifest.json
  docdet/
    yolov11n-docdet-v0/
      model.onnx
      metadata.json
  ocr/
    ppocrv5/
      det.onnx
      rec.onnx
      dict.txt
```

Validation command:

```bash
pnpm models:validate
```

This should verify:

- manifest exists,
- model files exist,
- checksums match,
- model IDs match config,
- schemas validate.

If models are not committed because of size/licensing, provide a script:

```bash
pnpm models:pull
```

The pull script must download only from trusted release sources and verify checksums.

---

## 6. Start browser development app

```bash
pnpm dev
```

Expected:

```text
local dev server starts
workers load
model manifest loads
app opens in browser
synthetic upload works
```

For advanced WASM/threading, dev server may need COOP/COEP headers:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

---

## 7. Local-only verification

After startup, verify:

- app can run with network disabled after model cache/package is available,
- upload does not trigger document upload,
- extraction uses local workers/models,
- no OCR text appears in network logs,
- export is user-triggered only.

Run:

```bash
pnpm test:no-cloud
```

---

## 8. Run tests

All tests:

```bash
pnpm test
```

Unit:

```bash
pnpm test:unit
```

Integration:

```bash
pnpm test:integration
```

E2E:

```bash
pnpm test:e2e
```

Security/privacy:

```bash
pnpm test:security
pnpm test:privacy
```

Schema:

```bash
pnpm schemas:validate
```

---

## 9. Run lint and typecheck

```bash
pnpm lint
pnpm typecheck
```

Both are required before merging.

Strict TypeScript is mandatory.

---

## 10. Synthetic demo data

Use synthetic examples only.

```text
examples/synthetic/
```

Do not use real passports, bank statements, signatures, MRZ, or private invoices in demos.

Run demo generation:

```bash
pnpm synthetic:generate
```

---

## 11. Local storage reset

Development storage can be cleared:

```bash
pnpm dev:clear-storage
```

This should clear:

- IndexedDB project records,
- OPFS document artifacts,
- temporary files,
- local template drafts if requested.

It should not delete downloaded models unless explicitly requested:

```bash
pnpm dev:clear-model-cache
```

---

## 12. Tauri local dev

Install Rust and Tauri prerequisites.

```bash
pnpm --filter @app/tauri tauri dev
```

Tauri dev should reuse the same UI/domain packages.

---

## 13. Common issues

### Models not found

Check:

- `VITE_MODEL_BASE_URL`,
- model manifest path,
- files exist,
- checksums match.

### Workers fail to load

Check:

- CSP/headers,
- module worker support,
- bundler paths.

### OPFS unavailable

Check:

- browser support,
- private browsing mode,
- origin permissions.

### WebGPU unavailable

Use WASM mode if allowed:

```env
VITE_FORCE_RUNTIME=wasm
```

### App freezes

Check:

- heavy work accidentally on main thread,
- worker task queue,
- image size,
- model batch size.

---

## 14. Local dev acceptance checklist

- [ ] `pnpm install` works
- [ ] `pnpm dev` starts app
- [ ] synthetic document uploads
- [ ] workers start
- [ ] models validate
- [ ] extraction runs locally
- [ ] no-cloud test passes
- [ ] typecheck passes
- [ ] lint passes
- [ ] unit tests pass
- [ ] schema validation passes

---

## 15. Final rule

Local development must reflect the real product: local-only, evidence-backed, worker-based, model-versioned, and privacy-safe. Do not add dev shortcuts that bypass verifier, upload documents, or hide uncertainty.
