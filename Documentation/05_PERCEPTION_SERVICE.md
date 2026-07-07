# 05 — Perception Service

Complete specification of the stateless Python senses. Bytes in, Evidence Bundle out, nothing
remembered.

---

## 1. Process shape

- Python 3.11+, FastAPI + uvicorn, **binds `127.0.0.1` only** (hard-coded; changing it is a
  Constitution violation until Phase 7 adds authenticated exposure).
- Stateless: no database, no session, no persisted artifacts. A tmpfs-style scratch dir holds the
  current request's rasterizations, keyed by sha256, wiped on completion (and on boot).
- One document per request; parallelism across documents is the brain's bulk queue (concurrency 2).
- ONNX Runtime sessions: intra-op threads = physical cores; inter-op 1. Models lazy-load on first
  use into an LRU registry with a resident ceiling per profile ([13](13_PERFORMANCE_BUDGETS.md)).

## 2. Endpoints (frozen contract — plan.md §13.2)

### `POST /v1/perceive`
- **In:** multipart — `file` (bytes) + `options` JSON:
  `{ profile?: 'lite'|'full', budgetMs?: number, pageRange?: [number, number], wantStages?: string[] }`
- **Out:** `EvidenceBundle` ([06](06_EVIDENCE_BUNDLE_CONTRACT.md)), HTTP 200.
- Partial failures never masquerade as success: each failed stage appends
  `{ stage, code, detail }` to `stageErrors[]` while other stages still deliver.

### `POST /v1/reperceive`
- **In:** `{ sha256, page, rois: Box[], dpiHint: number, recModel?: string }` — foveation
  callback (I10). If the scratch copy expired, responds `410 GONE`; the brain re-uploads.
- **Out:** partial bundle: `ocr` (with lattices) for the requested ROIs only.

### `GET /v1/health`
- **Out:** `{ ok: true, version, profile, modelsLoaded: Record<string,string>, residentMB }`.
  The brain probes this once at startup (and on failure) to choose service vs browser fallback.

### Error envelope
`{ error: { code: 'UNSUPPORTED_TYPE'|'DECODE_FAIL'|'BUDGET_EXCEEDED'|'PAYLOAD_TOO_LARGE'|'GONE'|'INTERNAL', detail: string } }`
with appropriate HTTP status. No stack traces in responses.

## 3. Router (`router.py`) — magic bytes, never extensions

| Sniff | Route |
|---|---|
| `%PDF` | pdf.py → digital / scanned / hybrid classification (per-page: text-span coverage vs raster-only) |
| `PK…` + `[Content_Types].xml` containing `spreadsheet` | office.py (openpyxl) |
| `PK…` + `word/` | office.py (python-docx; embedded images recurse through vision) |
| OLE `D0CF11E0` | legacy XLS → openpyxl-compat path or explicit `UNSUPPORTED_TYPE` with guidance |
| JPEG/PNG/WebP/TIFF/BMP signatures | vision ladder |
| plausible UTF-8/latin text with separators | CSV sniffer (dialect detection) |
| anything else | `UNSUPPORTED_TYPE` — explicit, never guessed |

## 4. Stages (`stages/`) — each a pure function over (image|bytes, params) → typed partial evidence

| Stage | Contents |
|---|---|
| `quality.py` | Blur (variance of Laplacian, normalized), glare (highlight-clipping ratio), contrast; feeds bundle geometry.quality and the UI rescan hint. |
| `dewarp.py` | Classical: page contour (adaptive threshold + largest quad) → perspective rectify; text-line curvature fit → TPS remap. UVDoc behind `config.dewarp='uvdoc'` flag, lazy-loaded. Records `dewarp.method` in geometry. |
| `layout.py` | PP-DocLayout-S/M ONNX; letterbox → forward → NMS; emits the 23 classes verbatim (no re-mapping — the brain owns semantics). |
| `ocr.py` | **The lattice tap.** Det: DBNet post-proc (threshold, unclip, min-size) → line polys. Rec: crops (rot-corrected, height-normalized) → ONNX → raw `T×C` softmax **captured pre-argmax** → top-k=5 per step emitted as the bundle's `lattice`, plus greedy `top1`/`conf` for display. Script detection (charset heuristic on greedy pass) may re-run crops through a v5 script model. |
| `tables.py` | Rulings first (morphology → grid intersections → cells); borderless → SLANet_plus → LORE fallback; emits cell geometry only (row/col/span/box) — **cell text comes from ocr/reperceive; semantic closure lives in the brain**. |
| `faces.py` | YuNet → boxes + 5 landmarks. |
| `codes.py` | zxing-cpp all-formats scan on rectified page + on layout-proposed code regions at native resolution; emits format, payload, box, EC level. |
| `pdf.py` | pypdfium2: per-page text spans (`native.textRuns` with boxes/fonts) for digital pages; rasterization (≤ 2200 px long side discovery, higher for foveation) for scanned; **hybrid** = both + reconciliation sample (N random spans re-OCR'd; disagreement ⇒ page flagged `textLayerUntrusted` and treated as scanned). |
| `office.py` | openpyxl: values + formulas + number formats + merged ranges → `native.cells`; python-docx: runs/tables; embedded images extracted and run through the vision ladder as sub-pages. |

## 5. Ladder (`ladder.py`) — I10 orchestration

1. Normalize/rasterize at discovery DPI → quality → (dewarp if triggered) → layout, codes, faces
   in one pass → OCR at discovery resolution with lattices.
2. Assemble bundle; return within `budgetMs` (default 6000): stages that would exceed the budget
   are skipped with `stageErrors: BUDGET_EXCEEDED` so the brain can decide to reperceive.
3. Foveation is brain-driven via `/v1/reperceive` (the brain knows which fields failed
   verification; the service stays judgment-free).

## 6. Configuration (`config.py`)

```python
profile: 'lite' | 'full'            # model tiers per 04 §1
ocr_tier: 'v6-small' (lite) | 'v6-medium' (full)   # enum incl. v5 fallbacks
dewarp: 'classical' | 'uvdoc'
resident_ceiling_mb: 450
discovery_long_side: 2200
lattice_k: 5
```
All values have exactly one source of truth here; nothing reads env vars ad hoc.

## 7. Testing ([14](14_QUALITY_TESTING.md))

- Per-stage golden tests (pytest): fixed inputs → asserted evidence shapes/values.
- Contract tests: every response validates against the shared JSON Schema; a schema drift between
  `service/bundle.py` and `src/perception/bundle-types.ts` fails CI.
- The P3.2 lattice-tap prototype test is permanent: asserts tensor shape, prob-mass ≈ 1 per step,
  and top-k ordering for a golden crop.
