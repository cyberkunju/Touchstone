# Dataset Catalog — Master Index & Acquisition Plan

Consolidated from 6 parallel research sweeps. Detailed per-domain catalogs:
- [`ids_passports.md`](./ids_passports.md) — real IDs/passports/MRZ (the real-bad-passport fix)
- [`layout_tables.md`](./layout_tables.md) — document layout + tables
- [`forms_kv_receipts.md`](./forms_kv_receipts.md) — forms / key-value / **checkbox**
- [`visual_assets.md`](./visual_assets.md) — signature/stamp/seal/logo/qr/barcode
- [`ocr_multilingual.md`](./ocr_multilingual.md) — OCR detection/recognition, multilingual
- [`synthetic_engines.md`](./synthetic_engines.md) — better generators, teachers, degradation tools

License classes: **PERMISSIVE** (CC-BY/MIT/Apache/CDLA — shippable) · **RESEARCH-ONLY**
(train/eval internally, don't ship) · **GATED** (registration) · **UNVERIFIED** (confirm first).

---

## Real-label coverage per docdet-v0 class (the honest scorecard)

| class | best REAL source | license | status |
|---|---|---|---|
| document_page | MIDV-500/2019/2020 | research-only | ✅ real (train-only) |
| photo | MIDV photo field; DocLayNet Picture (imperfect) | research / permissive | ✅ real-ish |
| signature | tech4humans/signature-detection (Tobacco-800+) | **Apache-2.0** | ✅ **escapes synthetic-only (permissive)** |
| stamp | DDI-100 stamp masks | **MIT** | ✅ **escapes (permissive)** |
| seal | (only research/unclear sets) | — | ❌ stays synthetic (fold seal→stamp) |
| logo | IIIT-AR-13K (doc logos) / LogoDet-3K (generic) | unclear/research | ⚠️ eval-only, no permissive doc set |
| qr_code | ABBYY barcode_detection_benchmark (ZVZ) | **Apache-2.0** | ✅ **escapes (permissive)** |
| barcode | ABBYY ZVZ (+ InventBar/ParcelBar CC-BY) | **Apache-2.0** | ✅ **escapes (permissive)** |
| mrz_zone | MIDV mrz field | research-only | ✅ real (train-only) |
| table | PubTables-1M/FinTabNet (PDF) + **TabRecSet** (real photos) | **CDLA / CC-BY-4.0** | ✅ **permissive, incl. real photos** |
| checkbox | **CommonForms** (ChoiceButton) | code Apache; data UNVERIFIED | ✅ **first real source (verify license)** |
| text_block | DocLayNet + PubLayNet | **CDLA-Permissive** | ✅ permissive (clean PDFs; +HierText CC-BY-SA) |

**Net result: of the 7 previously "synthetic-only" classes, 4 (signature, stamp, qr_code, barcode) can now get REAL boxes under PERMISSIVE licenses; checkbox gets its first real source (CommonForms, license-pending); seal + logo remain the hard gaps.**

---

## Acquisition queue

### P0 — permissive + highest leverage (collect first)
1. **MIDV-500 + MIDV-2019 + MIDV-2020** — real passports/IDs in the wild → `document_page`/`photo`/`mrz_zone`. *Research-only: train, don't redistribute images.* The direct real-bad-passport fix.
2. **DocLayNet** (CDLA-Permissive) — `text_block`+`table`, real-label backbone.
3. **PubTables-1M + FinTabNet** (CDLA-Permissive) + **TabRecSet** (CC-BY-4.0, real photos) — `table`.
4. **signature** tech4humans/signature-detection (Apache-2.0); **stamp** DDI-100 (MIT); **qr_code+barcode** ABBYY ZVZ (Apache-2.0) — retire 4 synthetic-only classes with permissive real boxes.
5. **CommonForms** — `checkbox` real boxes (filter ChoiceButton→checkbox; verify dataset license before shipping).
6. **DocXPand generator** (MIT) — run locally to mint a redistributable ID/passport corpus (photo+MRZ+fields).

### P1 — strong, after P0
- KV-linking: **FUNSD + XFUND** (research) + **CORD** (CC-BY-4.0, shippable).
- Layout depth: **DocBank** (Apache), **M⁶Doc** (research, real photos).
- OCR: **HierText** (CC-BY-SA), **TextOCR** (CC-BY) Latin; **KHATT** (Arabic), **CASIA-HWDB** (CJK), **DDI-100** (Cyrillic) for multilingual eval/finetune.
- Tables (real photo): **WTW** (verify license).
- ID volume: **IDNet** (~837k synthetic, verify license).

### Generator/realism upgrades (bolt onto synthgen — see synthetic_engines.md)
- **Augraphy (MIT)** — drop-in print/scan/ink-bleed realism. DO FIRST.
- **TRDG (MIT)** — realistic MRZ/OCR-B + field text lines.
- **DocCreator (LGPL)** ideas — 2D mesh warp + bleed-through.

### Offline teachers for pseudo-labeling real docs (distillation bridge)
- **Qwen2.5-VL-7B (Apache-2.0)** primary (KV/MRZ/tables/grounding) · **GOT-OCR2.0 (Apache-2.0)** + **GLM-OCR (MIT)** OCR · **Florence-2 (MIT)** boxes · **DocLayout-YOLO (AGPL — offline-only)** layout boxes.

---

## Licensing landmines (do-not-ship list)
- **MIDV family**: "public copyright" prose ≠ redistributable — train-only, never bundle images.
- **DocXPand-25k dataset** CC-BY-NC-SA → use the **MIT generator** to make our own clean corpus instead.
- **CC-BY-NC-ND** HF passport/MRZ sets: ND blocks derivative datasets — avoid.
- **XFUND/FUNSD/RVL-CDIP/KHATT/CASIA/MADCAT(LDC gated)**: research-only/gated — eval/finetune only.
- **DocLayout-YOLO / LayoutLMv3 / PaliGemma / Qwen-3B**: AGPL / NC / gated — offline-only or exclude.
- **CommonForms, WTW, SROIE, WildReceipt, IDNet, SynthTabNet**: license UNVERIFIED — verify before any non-research use.

---

## Verify-before-ship queue (blocking for redistribution)
CommonForms dataset license · AutoFormBench · SROIE · WildReceipt · WTW · IDNet · SynthTabNet ·
exact XFUND string · GLM-OCR repo tag · DDI-100 exact terms.
