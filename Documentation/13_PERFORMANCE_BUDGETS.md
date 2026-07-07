# 13 — Performance & Memory Budgets

Budgets are law (Constitution, Law 6). Every number here becomes an automated test in Phase 7 and
is respected as a design constraint from Phase 1.

---

## 1. Reference hardware

| Profile | Definition | Models |
|---|---|---|
| **lite** (default) | 4 GB RAM, 4-core x86-64 CPU (~2015+), no GPU, spinning-disk tolerant | PP-OCRv6-small (or tiny), PP-DocLayout-S, SLANet_plus, YuNet |
| **full** | 8 GB+, 4+ cores | PP-OCRv6-medium, PP-DocLayout-M, same others |
CI perf runs execute on a throttled container profile emulating **lite** (cpuset 4, mem 3.2 GB
available to the stack).

## 2. Memory budgets

| Component | Ceiling | Mechanism |
|---|---|---|
| Service resident (models + runtime) | **≤ 450 MB** (expected < 220 MB, [04 §4](04_MODEL_SELECTION.md)) | lazy load, LRU eviction at ceiling, script-models evicted first |
| Service transient per document | ≤ 500 MB | discovery raster ≤ 2200 px long side; full-res stays on disk; foveated crops only; scratch wiped per request |
| Browser (brain + UI + fallback) | ≤ 600 MB | graphs are KB-scale; originals/assets in OPFS not JS heap; virtualized tables; fallback models load only in fallback mode |
| Peak system total (lite, one doc in flight) | ≤ 1.6 GB | leaves ~2.4 GB for OS + user on a 4 GB machine |

## 3. Latency budgets (lite profile, single page, 4-core CPU)

| Path | Budget | Breakdown intent |
|---|---|---|
| Exact re-upload (I13 tier 1) | **≤ 0.3 s** | hash + store lookup |
| Known template (I8) | **≤ 1.5 s** | align ≤ 150 ms · batched rec ≤ 900 ms · decode+solve ≤ 200 ms · UI ≤ 250 ms |
| Unknown doc — first verified fields | **≤ 1.5 s** | discovery pass streams verified fields as they land |
| Unknown doc — full verified form | **≤ 8 s** | ladder complete incl. foveation rounds |
| Digital file (xlsx/docx/digital-pdf) | ≤ 1 s/25 pages-or-sheets | native parse, no inference |
| Bulk sustained throughput | ≥ 12 docs/min known-template | concurrency 2 |
| `/v1/health` | ≤ 50 ms | never loads models |

## 4. The anytime ladder (I10) — how budgets are met, not hoped for

1. **Discovery at bounded DPI** (≤ 2200 px): layout+codes+faces+OCR in one pass — the only
   full-page inference that ever runs.
2. **Verify-then-spend:** solver marks unproven fields; only their ROIs re-perceive at higher DPI
   (`/v1/reperceive`), max 2 foveation rounds (frozen), each round budget-checked.
3. **Streaming:** verified fields commit to the UI immediately; the ladder never blocks paint.
4. **Budget breach behavior:** `BUDGET_EXCEEDED` stage errors → affected fields stay
   needs_review with a "deep scan" button (user-invoked round 3) — degradation is explicit,
   never silent (N1 applies to performance too).

## 5. Throughput disciplines

- One batched recognition call per foveation round (dozens of crops per tensor batch) — batching
  is the single biggest CPU win and is mandatory in both service and fallback paths.
- ONNX sessions created once per model, reused; intra-op threads = physical cores; no session
  per request.
- Bulk concurrency is 2 **by measurement rationale**: OCR is CPU-saturating; higher concurrency
  thrashes cache and worsens P95 (revisit only via change control with measurements).
- No image ever crosses the service boundary twice: sha256-keyed scratch enables reperceive
  without re-upload within a session.

## 6. Measurement methodology (perf CI, P7.1)

- Fixed corpus (passport ×3, invoice ×2, xlsx ×1, scanned-pdf ×1) × 5 runs → median + P95;
  budgets assert on median, alert on P95 > 1.5× budget.
- `EvidenceBundle.timings` feeds a per-stage regression chart committed to `bench/baselines/`.
- Memory: service RSS sampled per stage; browser via `performance.measureUserAgentSpecificMemory`
  where available, else heap snapshots in the harness.
- A budget-worsening change fails CI exactly like a correctness regression.
