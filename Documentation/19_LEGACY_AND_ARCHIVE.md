# 19 — Legacy & Archive

How the existing repository maps into the final plan: what is kept, evolved, superseded, or frozen.
Nothing is deleted; history is preserved.

---

## 1. Disposition table

| Existing artifact | Disposition |
|---|---|
| `src/` (brain: docgraph, verifier, parsers, template-engine, storage, workers, components) | **Kept & evolved in place** — the tested core (303 unit tests) that Part II's tasks build on. |
| `src/ai-runtime/` (PP-OCRv5 browser ONNX, yolo.ts) | **Kept** as fallback-mode perception; `LAYOUT_MODEL` slot finally fills in P4 (service-side primary, PP-DocLayout). |
| `public/models/`, `public/ort/`, `scripts/*.mjs` | **Kept** — fallback model distribution. |
| `docs/` (18-section corpus) — **now `bin/docs/`** | **Historical reference.** Still authoritative *only* where this Documentation doesn't speak: deep DocGraph node/edge specs (05), verifier status precedence (07), template corruption rules (06), a11y details (08), threat model raw material (11). Everything strategy/model/training-related is **superseded**. |
| `mini-doc/` — now `bin/mini-doc/` | Superseded (condensed form of the old plan). Reference only. |
| `plan.md` | **The law** (Part I strategy + Part II frozen contracts/tasks/change-control). This Documentation elaborates it. |
| `INNOVATIONS.md`, `suba.md` — now in `bin/` | Research heritage — the verifiability thesis that Part I §1 relocated from training-time to inference-time. Read-only. |
| `Research/`, `Research MSel/` — now in `bin/` | Research records (training-era + model-selection reports). Read-only; model-selection conclusions live in [04](04_MODEL_SELECTION.md). |
| `training/`, `kaggle_probe/`, `kaggle_smoke/`, `kaggle_t4x2/`, `kaggle_train/`, `kaggle_run_out/`, `kaggle_probe_out/`, `kaggle_t4x2_out/`, `smoke_out/`, `check_run.py`, `training_code.tgz`, `c7i.pem` | **Frozen — moved to `bin/` on 2026-07-06** (owner-directed; supersedes the planned `_archive/`; move, never delete). The custom-training path is abandoned per N3: it cost weeks, its best real-gate recall was 0.82 vs a 0.90 floor, and pretrained PP-DocLayout supersedes its purpose at $0. ⚠ Contains a hardcoded W&B API key **and a stray private key (`c7i.pem`)** — purge+rotate is a mandatory P7.3 checklist line. |
| `batch_test.cjs`, `browser_test.cjs`, `e2e_test.cjs`, `diag_mrz.cjs`, `analyze.cjs` | **Evolved** into `bench/gate.mjs` + e2e journey scripts (P1.9/P2). Originals archived once superseded. |
| `passport_images/`, `test_screenshots/` | `passport_images/` = the permanent P1 gate corpus (frozen, stays at root). Historical screenshots moved to `bin/test_screenshots/`; harnesses recreate the folder on next run. |
| root `README.md` (old project description) | Moved to `bin/README.md`; replaced by a minimal root README pointing at `Documentation/` + `plan.md`. |

## 2. Known legacy debts (tracked, owned)

| Debt | Where handled |
|---|---|
| MRZ parse failures ("TD3 invalid" across batch report) | P1.4/P1.5 — the checksum-guided decoder exists precisely for this |
| Sex-field garbage, label/value mispairing | P1.6 (grammar re-decode + Hungarian) |
| Weak template alignment (translation+scale only) | P1.8 (homography ladder) |
| No table engine | P4.3 |
| No encryption at rest | P7.3 ([17](17_SECURITY_PRIVACY_PLAN.md)) |
| App metadata claims `webgpu` even when worker fell back to WASM | fixed opportunistically in P1.5 wiring (report actual EP) |
| W&B API key in training scripts | P7.3 purge+rotate (archive move in P1.9 does not close it) |
| Google Fonts runtime dependency in `index.html` | P7.2 self-host fonts (CSP) |

## 3. Continuity guarantees

- Every legacy unit test keeps passing at every commit; legacy parsers remain as cross-checks and
  final fallbacks ([07 §6](07_LATTICE_BEAM_GRAMMARS.md)).
- IndexedDB migrations are strictly additive; a v1 database opens cleanly under v2 with all old
  docGraphs/templates intact.
- The old single-document flow remains reachable (a family view of one record) — no user-facing
  regression during the workspace transition.

## 4. Historical honesty (why the pivot was right — for the record)

The original path (browser-only + custom-trained 12-class YOLO) produced: a synthetic-real gap
(0.986 synthetic mAP vs 0.78–0.82 real recall), weeks of Kaggle logistics (hardware mismatches,
12 h caps), and an unfilled `LAYOUT_MODEL: null`. The pivot (2026-07-06) to pretrained perception
+ attestation-centered judgment removed the entire training cost surface, made the quality story
*stronger* (proof search vs prediction), and preserved every line of tested brain code. The
research corpus that led here (`INNOVATIONS.md`, `suba.md`, `Research/`) contained the seed idea —
verifiability as supervision — which this architecture finally ships, at inference time, at $0.
