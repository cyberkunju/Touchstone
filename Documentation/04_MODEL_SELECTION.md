# 04 — Model Selection (Final, Locked 2026-07-06)

The complete model/library arsenal, the verification record behind every choice, and the rejected
candidates. Selection method: six independent deep-research reports (`bin/Research MSel/`)
cross-examined, every disputed or novel claim then verified against primary sources (GitHub
releases, PyPI, model cards). **No slot may be reopened during development** (Constitution §7);
pre-authorized fallbacks are listed per slot.

---

## 1. Neural models

### 1.1 OCR — PP-OCRv6 (primary), PP-OCRv5 (pinned fallback + scripts + browser)
- **Role:** text detection (DBNet-family) + recognition (CTC) — the perception backbone; the
  recognizer's raw T×C probability tensor is *the* enabling artifact for I2/I3/I5.
- **Tiers:** tiny 1.5 M params (ultra-low), **small 7.7 M (lite default)**, medium 34.5 M (full
  profile). Verified real: PaddleOCR v3.7.0 release, 2026-06-11 — +4.6 % det / +5.1 % rec vs
  v5-server (vendor numbers → gated), 50-language unified model, ≤ 5.2× CPU speedup. RapidOCR
  v3.9.1 ships ONNX; decode confirmed still `CTCLabelDecode` → lattice preserved.
- **Fallback enum:** `ocr.tier = v6-small | v6-tiny | v6-medium | v5-mobile | v5-server`. v6 locks
  only after our passport gate ([14](14_QUALITY_TESTING.md)) meets/beats the v5 baseline.
- **Scripts:** non-Latin (Cyrillic, Arabic, Devanagari, Korean, Thai, Greek, Tamil, Telugu) ride
  PP-OCRv5 script-specific ~2 M-param rec models, hot-swapped per detected script. Memory cost
  accepted: script models load lazily, LRU-evicted.
- **Browser fallback:** PP-OCRv5 mobile ONNX (already deployed in `public/models/`).
- **Handwriting:** slot **closed** — v5/v6 handle printed-form handwriting natively via the same
  lattice path (zero added memory).
- **License:** Apache-2.0. **Key caveat (op48, confirmed):** RapidOCR's convenience API returns
  strings only — the service runs the rec ONNX directly and taps the tensor pre-argmax (P3.2
  week-one prototype; the browser path already owns this tensor in `src/ai-runtime/ocr.ts`).
- **Rejected:** Surya (~48 s/page CPU; conditional license), docTR/OnnxTR (Latin-centric, no edge),
  OpenOCR/SVTRv2 (CN/EN-only, research cadence), Tesseract (no usable lattice, weaker on docs),
  EasyOCR (PyTorch-heavy), every VLM (hallucination ⇒ violates N1; GBs ⇒ violates N4),
  PaddleOCR-VL (0.9 B params — violates N4).

### 1.2 Layout — PP-DocLayout-S / -M (primary), DocLayout-YOLO (challenger only)
- **Role:** universal layout zones: text, titles, tables, figures/photos, **seal**, formulas,
  headers/footers… 23 classes.
- **Variants:** S = 4.8 MB / ~15 ms CPU / 70.9 mAP (lite); M = 22.6 MB / ~50 ms / 75.2 (full);
  L exists (123 MB) but is out of budget by default.
- **Why primary:** Apache-2.0 (vs AGPL), 8× smaller and faster than DocLayout-YOLO, official ONNX
  path in PaddleOCR 3.x, actively maintained (DocLayout-YOLO repo dormant ~1 year), and the
  dedicated `seal` class gives stamps bounding boxes for free ([10 §4](10_VISUAL_ASSETS_AND_TABLES.md)).
- **Challenger protocol:** DocLayout-YOLO (DocStructBench) is A/B'd on our degraded-photo bench
  in P4.1; it wins a slot only by beating S/M on *our* corpus (vendor mAP not trusted).
- **Rejected:** LayoutLM family (needs fine-tuning → N3), DETR/Table-Transformer (CPU-hostile),
  Surya-layout (slow, license).

### 1.3 Table structure — SLANet_plus
- **Role:** borderless-table cell-grid inference (ruled tables are solved classically first).
- **Facts:** 6.8–7.4 MB ONNX, ~40 ms CPU; neutral RapidAI TEDS bench: **0.845** vs unitable 0.862
  @ 500 MB PyTorch (disqualified), SLANeXt+RT-DETR 0.799, Table-Transformer 0.600. Apache-2.0.
- **Fallback ladder (pre-authorized):** classical rulings → SLANet_plus → `lineless_table_rec`
  (LORE, Apache-2.0, ONNX) → x/y-cluster alignment. Arithmetic closure ([10 §3](10_VISUAL_ASSETS_AND_TABLES.md))
  guards correctness on every rung — a structural error can never silently confirm.

### 1.4 Faces — YuNet (OpenCV Zoo)
- **Role:** face box + 5 landmarks for portrait crop and roll alignment. Detection only —
  recognition is a non-goal.
- **Facts:** ~0.3 MB, single-digit ms CPU, detects 10–300 px faces (exactly ID-photo scale),
  MIT (verified in model directory), 2023mar static + 2026may dynamic ONNX exports available.
- **Rejected:** SCRFD/InsightFace (weights non-commercial), RetinaFace/MediaPipe (weight/runtime
  overkill for presence+landmarks).

### 1.5 Dewarping — classical first; UVDoc behind a flag
- **Classical (default):** page contour + text-line thin-plate-spline (OpenCV) handles most curl
  and perspective at zero model weight.
- **UVDoc (gated, lazy):** grid-*regression* dewarper (~8–30 MB) — outputs a coordinate grid,
  pixels are only remapped, never generated ⇒ checksum-safe by construction. Packaged with ONNX
  pre/post in RapidAI `rapid-undistorted` (Apache-2.0; UVDoc license to be confirmed at
  integration — pre-authorized check in P4.2). Activates only if the classical path fails on the
  measured crumpled-capture set.

## 2. Deterministic decoders & parsers (chosen because they are exact)

| Component | Facts & verdict |
|---|---|
| **zxing-cpp** (official Python wheel) | QR, Micro QR, rMQR, PDF417 + MicroPDF417 (AAMVA licenses), Aztec, DataMatrix, DataBar, all 1D — with Reed-Solomon error correction: a decode is *ground truth*, the strongest attestor. v3.x, commits days old, Apache-2.0, zero deps. Rejected alternatives: ZBar (no PDF417/Aztec/DataMatrix), OpenCV (QR+1D only), browser BarcodeDetector (inconsistent). Browser fallback: zxing-wasm (already integrated). |
| **pypdfium2** | Digital-PDF text spans **and** page rasterization in one mature Apache/BSD library (Chrome's PDFium). Correction from research review: `pdf_oxide` (real, MIT, fast) **cannot rasterize**, is beta, single-maintainer — watch-list only. PyMuPDF dropped (AGPL, now unnecessary). |
| **openpyxl / python-docx** | Exact spreadsheet/document parsing. MIT. Unanimous. |
| **PDF.js** | Browser-side interim PDF route (P2) + fallback mode. Apache-2.0. |
| **exceljs** | Client-side XLSX export (records tables). MIT. |
| **Custom (ours):** MRZ beam decoder, grammar automata, attestor registry, consensus solver, Hungarian matcher, RANSAC homography, dHash | Nothing off-the-shelf does lattice-level constrained decoding or unified attestation; at document scale these are small, exact, exhaustively testable TS modules. |

## 3. Runtime & infrastructure

| Component | Why |
|---|---|
| **ONNX Runtime** (native + web) | One inference engine everywhere; CPU-optimized (AVX, threads); int8-friendly; already integrated browser-side. |
| **FastAPI + uvicorn** | Minimal typed async service; exactly one meaningful endpoint — anything heavier is banned ceremony. |
| **OpenCV (headless)** | Classical vision: deskew, rulings, adaptive threshold, stroke-width, Hough, TPS remap. Deterministic sub-problems get deterministic tools. |
| **React + Vite + TS, Comlink, idb, OPFS** | The existing tested brain/UI stack — evolved, never rewritten (N7). |

## 4. Resident-memory ledger (lite profile)

| Model | Disk | Resident (est.) |
|---|---|---|
| PP-OCRv6-small det + rec | ~20 MB | ~60 MB |
| PP-DocLayout-S | 4.8 MB | ~25 MB |
| SLANet_plus | 7 MB | ~40 MB |
| YuNet | 0.3 MB | ~2 MB |
| zxing-cpp | ~2 MB | ~5 MB |
| UVDoc | lazy | 0 until flagged |
| ORT + Python runtime | — | ~80 MB |
| **Total** | **~35 MB** | **< 220 MB** (budget: 450 MB — headroom banked) |

## 5. Model distribution

`service/models/fetch_models.py` downloads from official mirrors (HF/Paddle) with **sha256 pins in
`MANIFEST.json`**; a mismatch aborts. Models are git-ignored; the manifest is committed. The only
network activity in the product's life is this explicit, user-invoked script (Law of Locality).
Browser fallback models keep the existing `scripts/fetch-models.mjs` flow.
