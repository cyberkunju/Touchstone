# Attestation Engine (docutract)

A fully local, zero-training, zero-silent-error document intelligence platform: any file in →
evidence-backed editable form → correct once → every similar document fills instantly into a
growing, exportable records table. No cloud. Runs on a 4 GB laptop.

## Start here

1. **[Documentation/](Documentation/README.md)** — the complete, final documentation set (A–Z).
2. **[plan.md](plan.md)** — the master plan: strategy (Part I) + frozen execution workbook (Part II).
3. Build order: [Documentation/15_ROADMAP_TASKS.md](Documentation/15_ROADMAP_TASKS.md) — currently at **P1.1**.

## Repository layout

| Path | Purpose |
|---|---|
| `Documentation/` | Canonical docs (constitution, architecture, specs, tasks) |
| `plan.md` | The law — decisions, contracts, change control |
| `src/` | The brain: TypeScript pipeline + UI (React/Vite) |
| `public/`, `scripts/` | Browser-fallback models (PP-OCRv5, ORT wasm) + fetch scripts |
| `passport_images/`, `passport_test.png`, `invoice_test.png` | Benchmark corpus & e2e fixtures |
| `*.cjs` | Current puppeteer test harness (evolves into `bench/` at P1.9) |
| `bin/` | Frozen archive: legacy docs, research, abandoned training pipeline — read-only, nothing deleted |

## Commands

```bash
npm install && npm run setup   # deps + fallback OCR models
npm run dev                    # app at http://localhost:5173
npm run test                   # unit suite (must stay green)
node batch_test.cjs            # passport batch diagnostics (dev server must be running)
```

Everything runs offline. The only network activity is the explicit model-fetch script.
