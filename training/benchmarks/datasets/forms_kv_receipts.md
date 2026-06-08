# Forms / KV / Receipts — Interrogation Case Files

> **Case officer's note.** Every suspect below claimed to be "useful for document AI."
> This file is the cross-examination record. Two things our pipeline needs and that
> these suspects might supply:
>
> 1. **The "relate" layer (KV linking)** — pairing field *labels* with *values*
>    (a.k.a. entity linking / key-value pairing).
> 2. **`checkbox(10)`** — our biggest hole. It is currently **synthetic-only**
>    (see `training/benchmarks/README.md` "KNOWN MEASUREMENT GAP"). We need a
>    **real**-document source of checkbox boxes.
>
> Secondary value: real `text_block(11)` on messy, skewed, photographed
> forms/receipts (the sim2real stressor).
>
> **docdet-v0 classes (never renumber):**
> `0 document_page 1 photo 2 signature 3 stamp 4 seal 5 logo 6 qr_code 7 barcode 8 mrz_zone 9 table 10 checkbox 11 text_block`
>
> **Evidence rule.** Claims are verified against the primary source (paper / repo / HF
> card) with inline links. Anything not confirmed is tagged **UNVERIFIED** — not
> laundered as fact. Content paraphrased for licensing compliance.

---

## Summary table

| # | Suspect | Real? | Scale | Gives us (docdet) | KV-link? | **CHECKBOX boxes?** | License | Usability | Access | Lang | Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **CommonForms** | ✅ real (Common Crawl PDFs) | ~55k docs / ~450k pages / ~500k imgs | `checkbox(10)`, `text_block(11)`(proxy), `signature(2)` | ❌ (no label↔value) | ✅ **YES** — "ChoiceButton" = checkbox/radio (widget boxes) | Code Apache-2.0; **dataset license UNVERIFIED** | **P0 / VERIFY** | HF `jbarrow/CommonForms` | multi | **P0** |
| 2 | **AutoFormBench** | ✅ real forms | 407 forms | `checkbox(10)`, `text_block(11)`, `signature(2)` | partial | ✅ **YES** (form element detection incl. checkboxes) | **UNVERIFIED** | P1 / VERIFY | arXiv 2503.* (preprint) | en+ | **P1** |
| 3 | **CheckboxQA** | ✅ real | small (QA pairs) | none (no boxes) | ❌ | ❌ **NO boxes** (QA only) | **UNVERIFIED** | optional | arXiv 2504.10419 | en | optional |
| 4 | **FUNSD** | ✅ real scanned forms | 199 forms | `text_block(11)`, KV links | ✅ **YES** (Q/A linking) | ❌ no | research-use (RVL-CDIP subset) | P0 for KV | guillaumejaume.github.io/FUNSD | en | **P0** |
| 5 | **XFUND** | ✅ real forms | ~1,393 forms, 7 langs | `text_block(11)`, KV links | ✅ **YES** | ❌ no | RESEARCH-ONLY (CC BY-NC-SA, UNVERIFIED exact) | P1 multilingual KV | HF `rogerdehe/xfund`; gh `doc-analysis/XFUND` | zh/ja/es/fr/it/de/pt | **P1** |
| 6 | **CORD** | ✅ real receipts | 1,000 (800/100/100) | `text_block(11)`, `table`(menu lines), KV groups | ✅ partial (KV flags) | ❌ no | **CC BY 4.0** (PERMISSIVE) | P0 for receipts KV | gh `clovaai/cord`; HF `wkrl/cord` | en/id | **P0** |
| 7 | **SROIE** (ICDAR'19) | ✅ real receipts | 1,000 | `text_block(11)`, 4-field KIE | ✅ partial (4 fixed keys) | ❌ no | **UNCLEAR / competition** | P1 (license risk) | gh mirrors; HF `Voxel51/scanned_receipts` | en | **P1** |
| 8 | **WildReceipt** | ✅ real receipts (photos) | 1,765 imgs / ~50k boxes / 25 cls | `text_block(11)`, KV (key/value class pairs) | ✅ **YES** (key↔value classes) | ❌ no | **UNVERIFIED** (research, via MMOCR/OpenMMLab) | P1 | HF `Theivaprakasham/wildreceipt`; MMOCR | en | **P1** |
| 9 | **DocILE** | ✅ real + synth + unlabeled | 6.7k annotated + 100k synth + ~1M unlabeled | `text_block(11)`, `table`(line items), KV localization | ✅ **YES** (KILE + LIR) | ❌ no | **GATED** (token); code MIT, **data license separate/UNVERIFIED** | P1 invoices | docile.rossum.ai (token) | en+ | **P1** |
| 10 | **Kleister-NDA / -Charity** | ✅ real long docs | NDA 540 docs; Charity 2,788 docs | `text_block(11)` only (entity values, no boxes per-token in base) | ❌ (doc-level entities) | ❌ no | **UNVERIFIED** | optional | gh `applicaai/kleister-*` | en | optional |
| 11 | **RVL-CDIP (form subset)** | ✅ real | 25k "form" class imgs | `document_page(0)` / `text_block(11)` (no field labels) | ❌ | ❌ no | research-use (IIT-CDIP/tobacco) | optional | HF `aharley/rvl_cdip` | en | optional |
| 12 | **NIST SD2/SD6 (SFRS / SFRS2)** | ⚠️ synthesized tax forms | SD2 5,590 pages; SD6 ~900 submissions | `text_block(11)`, field boxes, **tables** | partial | ⚠️ **UNVERIFIED** (tax forms have checkboxes; box labels not confirmed) | US Gov / NIST (largely open) | optional | nist.gov SD2 / SD6 | en | optional |
| 13 | **FUNSD+ / SRFUND / FUNSD-r** | ✅ real | derivatives of FUNSD | hierarchical KV links | ✅ **YES** | ❌ no | inherits FUNSD (research) | optional (KV research) | see per-entry | en/multi | optional |

Legend: **P0** = pursue now; **P1** = strong, pursue after P0; **optional** = situational.

---

## WHO ACTUALLY HAS CHECKBOX LABELS? — the verdict

This is the headline of the whole investigation, so it gets a definitive ruling.

**Short answer: YES, a real checkbox-labeled source now exists — and it is `CommonForms`.**
Almost every classic forms/receipts dataset (FUNSD, XFUND, CORD, SROIE,
WildReceipt, DocILE, Kleister) gives you **labels↔values and text regions but
NO checkbox bounding boxes.** Those are dead ends for `checkbox(10)`.

Ranked checkbox findings:

1. **CommonForms — REAL, large, the bridge.** Built by filtering Common Crawl for
   PDFs with fillable form elements; the released set is roughly 55k documents over
   450k+ pages (~500k annotated images). Its detector classes are **TextBox,
   ChoiceButton, and Signature**, where *ChoiceButton* explicitly covers
   **checkboxes/radio buttons**. The FFDNet model card confirms three widget classes
   including "ChoiceButtons (checkboxes)."
   - Sources: [arXiv abstract 2509.16506](https://arxiv.org/abs/2509.16506),
     [HF FFDNet-S card](https://huggingface.co/jbarrow/FFDNet-S),
     [Voxel51 val-subset card](https://huggingface.co/datasets/Voxel51/commonforms_val_subset),
     [HF paper page](https://huggingface.co/papers/2509.16506).
   - **Critical caveats (must read before mapping to `checkbox(10)`):**
     - Boxes come from the **PDF AcroForm widget rectangles**, not human-drawn glyph
       boxes. They mark where the fillable control *is*, which is what a detector
       needs — but the box is the *widget*, not necessarily the printed ☐ glyph.
     - **`checkbox` and `radio` are merged** into one "ChoiceButton" class. Our
       `checkbox(10)` would inherit both unless we filter (radio buttons are round;
       our renderer is square-biased — note for class-map rationale).
     - These are **blank/fillable** forms → you get **location**, not
       **checked/unchecked state**. State remains synthetic-only.
     - "Real" = real PDFs from the web; the fillable layer is digital-native, so this
       trains *location on clean digital forms*, not ticks on a phone-photo. Pair with
       augmentation for sim2real.

2. **AutoFormBench — REAL, small, evaluation-grade.** A benchmark of **407 annotated
   real-world forms** (government, healthcare, enterprise) for **form element
   detection** — element types include checkboxes. Good as a **real eval/gate set**
   for `checkbox(10)`, too small to train alone.
   - Source: [arXiv abstract](https://arxiv.org/abs/2503.29832) (preprint; access +
     exact license **UNVERIFIED** — verify before use).

3. **CheckboxQA — REAL but NO boxes.** Targets the "checkbox blind spot" in
   vision-language models via **question-answer pairs about checkbox state**, not
   bounding boxes. Useful for *state* evaluation, useless for detector training.
   - Source: [arXiv 2504.10419](https://arxiv.org/abs/2504.10419).

4. **Models, not datasets (leads only):** `wendys-llc/checkbox-detector` (a YOLO12n
   ONNX model that detects checked/unchecked boxes) and the FFDNet family are
   **trained artifacts**, not label sources — but their training data / outputs can
   bootstrap weak labels.
   - Source: [HF wendys-llc/checkbox-detector](https://huggingface.co/wendys-llc/checkbox-detector).

5. **NIST SD2 / SD6 tax forms — UNVERIFIED for checkboxes.** IRS 1040-family forms do
   contain checkboxes, and NIST provides field/box reference data, but I did **not**
   confirm that checkbox regions are individually labeled. Treat as a possible lead,
   **verify the box schema** before trusting.

**Ruling:** Close the `checkbox(10)` real-label gap with **CommonForms (train) +
AutoFormBench (real eval gate)**, filtering ChoiceButton→checkbox and documenting the
"location-only, state-still-synthetic" limitation. Everything else is noise on this charge.

---

## Best for KV-linking ("relate" layer) training — the pick

**Primary pick: FUNSD** for English forms, because it is the canonical dataset whose
annotations explicitly model **question (label) / answer (value) / header entities
and the links between them** — exactly our "relate" layer. It is small (199 forms) but
purpose-built and real/noisy.
[arXiv 1905.13538](https://arxiv.org/abs/1905.13538) ·
[project page](https://guillaumejaume.github.io/FUNSD/).

**Scale it up / go multilingual: XFUND** adds human-labeled KV pairs in 7 non-English
languages (~1,393 forms), same entity-linking task family as FUNSD.
[Papers With Code](https://paperswithcode.com/dataset/xfun) ·
[Microsoft Research](https://www.microsoft.com/en-us/research/publication/xfund-a-benchmark-dataset-for-multilingual-visually-rich-form-understanding/).

**Receipts KV with a clean license: CORD** — 1,000 receipts with hierarchical
menu/subtotal/total semantics and KV flags, released **CC BY 4.0** (the only clearly
permissive, redistribution-friendly KV-ish set here).
[HF wkrl/cord](https://huggingface.co/datasets/wkrl/cord) ·
[clovaai/cord](https://github.com/clovaai/cord).

**Invoices at scale with localization: DocILE** — 6.7k annotated business docs (+100k
synthetic, ~1M unlabeled) for **Key Information Localization & Extraction** and **Line
Item Recognition**; great for KV+table, but **token-gated** access.
[arXiv 2302.05658](https://arxiv.org/abs/2302.05658) ·
[docile.rossum.ai](https://docile.rossum.ai/).

> **Recommended KV training mix:** FUNSD + XFUND (label↔value links) → fine-tune/eval
> on CORD (permissive receipts) → optionally DocILE for invoice localization. Only
> CORD is redistribution-clean; the rest are research-use, so keep them out of any
> shipped artifact.

---

## Per-suspect case files

### 1. CommonForms — **P0 (checkbox bridge)**
- **What it gives us:** Real form-field detection data. Classes map to
  `checkbox(10)` (from ChoiceButton, after filtering radios), `signature(2)`, and
  text inputs → `text_block(11)` proxy. **No** label↔value linking.
- **Real vs synthetic:** **Real** PDFs harvested from Common Crawl; filtered from ~8M
  down to ~55k docs with fillable elements, ~450k+ pages.
  [HF Daily Papers note](https://huggingface.co/papers?q=CommonForms).
- **Annotation type:** **Form-field widget boxes** (3 classes), derived from the PDF's
  embedded AcroForm definitions.
- **Checkbox:** ✅ **YES (the find of the investigation)** — ChoiceButton class covers
  checkboxes + radio buttons. Location only; checked/unchecked state not provided.
- **License:** The **code/models are Apache-2.0** (repo release "0.2.0 — Apache-licensed
  FFDetr"); the **dataset's own license is UNVERIFIED** from the card I could read —
  the author asks non-academic users to reach out, which hints at *non-automatic*
  commercial terms. **MUST verify the HF dataset card license field before
  redistribution.** [GitHub jbarrow/commonforms](https://github.com/jbarrow/commonforms).
- **Access:** [HF `jbarrow/CommonForms`](https://huggingface.co/datasets/jbarrow/CommonForms);
  val subset mirror [`Voxel51/commonforms_val_subset`](https://huggingface.co/datasets/Voxel51/commonforms_val_subset).
- **Language(s):** Multi (paper notes diverse languages/domains).
- **Why P0:** It is the only large, real source that puts a box on checkboxes. Single
  biggest lever on our worst-covered class.

### 2. AutoFormBench — **P1 (real checkbox eval gate)**
- **Gives us:** Form element detection labels incl. checkboxes → real eval for
  `checkbox(10)` and `text_block(11)`.
- **Real vs synthetic:** **Real**, 407 forms across government/healthcare/enterprise.
- **Annotation:** form element bounding boxes.
- **Checkbox:** ✅ yes (element detection includes checkboxes).
- **License/access:** **UNVERIFIED** — preprint
  [arXiv 2503.29832](https://arxiv.org/abs/2503.29832); confirm dataset release +
  license before use.
- **Why P1:** Too small to train, ideal as an independent **real gate** alongside
  CommonForms (avoids train/test leakage on one source).

### 3. CheckboxQA — optional (state eval, no boxes)
- **Gives us:** Nothing for detection. QA pairs probing whether models read checkbox
  state. [arXiv 2504.10419](https://arxiv.org/abs/2504.10419).
- **Checkbox boxes:** ❌ none.
- **Use:** Possible future eval of *state* extraction, not detector training.

### 4. FUNSD — **P0 (KV-link anchor)**
- **Gives us:** Real noisy scanned forms with **entity boxes + Q/A/header labels +
  links** → `text_block(11)` and the "relate" layer.
- **Scale:** 199 fully annotated forms.
- **Real vs synthetic:** Real (scanned).
- **Checkbox:** ❌ no checkbox annotations.
- **License:** **Research-use.** FUNSD forms are a subset of **RVL-CDIP**, itself drawn
  from **IIT-CDIP / legacy tobacco litigation** documents → non-commercial research
  framing. Treat as **research-only, not redistributable in a product**.
  [arXiv 1905.13538](https://arxiv.org/abs/1905.13538).
- **Access:** [project page](https://guillaumejaume.github.io/FUNSD/);
  mirrors [crcresearch/FUNSD](https://github.com/crcresearch/FUNSD).
- **Why P0:** Canonical KV-linking ground truth.

### 5. XFUND — **P1 (multilingual KV)**
- **Gives us:** Human-labeled KV pairs in 7 languages; same SER + relation-extraction
  task family as FUNSD → `text_block(11)` + relate layer, multilingual.
- **Scale:** ~1,393 forms (≈ 199 × 7 languages, train+val).
- **Checkbox:** ❌ no.
- **License:** **RESEARCH-ONLY.** Tied to Microsoft's LayoutXLM line (the unilm models
  are non-commercial). Likely **CC BY-NC-SA 4.0**, but I could **not** confirm the exact
  string from the source — **UNVERIFIED exact license; treat as non-commercial.**
- **Access:** [HF `rogerdehe/xfund`](https://huggingface.co/datasets/rogerdehe/xfund),
  [gh `doc-analysis/XFUND`](https://github.com/doc-analysis/XFUND).
- **Note:** Annotation granularity is inconsistent (entity- vs line-level) — see
  [RFUND note](https://paperswithcode.com/dataset/rfund).

### 6. CORD — **P0 (permissive receipts KV)**
- **Gives us:** 1,000 Indonesian receipts with OCR boxes + ~30 semantic classes in 5
  superclasses (menu/subtotal/total etc.), line grouping, ROIs, and **KV-pair flags**
  → `text_block(11)`, receipt `table`-ish line items, partial KV.
- **Real vs synthetic:** Real photographed/scanned receipts.
- **Checkbox:** ❌ no.
- **License:** **CC BY 4.0 — PERMISSIVE** (confirmed on HF card and original repo). The
  *only* clearly redistribution-friendly KV-ish suspect.
  [HF `wkrl/cord`](https://huggingface.co/datasets/wkrl/cord) ·
  [clovaai/cord](https://github.com/clovaai/cord).
- **Why P0:** Clean license + real receipts + KV structure = safe to actually ship/train on.

### 7. SROIE (ICDAR 2019) — **P1 (license risk)**
- **Gives us:** 1,000 scanned receipts; KIE for **4 fixed keys** (company, date,
  address, total) + text boxes → `text_block(11)`, narrow KV.
- **Checkbox:** ❌ no.
- **License:** **UNCLEAR.** Competition data; GitHub mirrors carry *their own code*
  licenses (one GPL-3.0, one Apache-2.0) that do **not** govern the underlying images.
  No clean dataset license confirmed → **treat as research / verify before any
  redistribution.** [arXiv 2103.10213](https://arxiv.org/abs/2103.10213) ·
  [HF `Voxel51/scanned_receipts`](https://huggingface.co/datasets/Voxel51/scanned_receipts).
- **Why P1:** Useful real receipts, but only 4 keys and murky terms.

### 8. WildReceipt — **P1 (key↔value receipts)**
- **Gives us:** 1,765 receipt **photos**, ~50k text boxes, 25/26 categories arranged as
  **key/value class pairs** → real `text_block(11)` + KV (store-name-key/value etc.).
- **Real vs synthetic:** Real in-the-wild photos (good sim2real stress).
- **Checkbox:** ❌ no.
- **License:** **UNVERIFIED.** Released with the SDMG-R paper and distributed via
  OpenMMLab/MMOCR; commonly used for research. Confirm terms before shipping.
  [PapersWithCode](https://paperswithcode.com/dataset/wildreceipt) ·
  [HF `Theivaprakasham/wildreceipt`](https://huggingface.co/datasets/Theivaprakasham/wildreceipt) ·
  [PaddleOCR KIE datasets](https://paddlepaddle.github.io/PaddleOCR/v2.9/en/datasets/kie_datasets.html).
- **Why P1:** Best *photographed* receipt KV set; great messy `text_block` stressor.

### 9. DocILE — **P1 (invoices, gated)**
- **Gives us:** Largest business-doc set: **6.7k annotated + 100k synthetic + ~1M
  unlabeled**; tasks **KILE** (key info localization) and **LIR** (line-item rows) →
  `text_block(11)`, invoice `table`/line items, KV localization.
- **Checkbox:** ❌ no.
- **License / access:** **GATED.** Download requires a **secret token** via
  registration at docile.rossum.ai. The GitHub repo's **MIT license covers the code
  library, not the dataset** — the data terms are separate and **UNVERIFIED**; the
  test set is held out (eval via Robust Reading Competition). Do not assume MIT applies
  to images. [GitHub rossumai/docile](https://github.com/rossumai/docile) ·
  [arXiv 2302.05658](https://arxiv.org/abs/2302.05658).
- **Why P1:** Excellent for invoice KV+tables, but gating + unclear data license make
  it second to CORD/FUNSD for us.

### 10. Kleister-NDA / Kleister-Charity — optional
- **Gives us:** Long-document KIE. **Charity:** 2,788 reports, ~61,643 pages, ~21,612
  entities. **NDA:** 540 agreements, ~3,229 pages, ~2,160 entities. Document-level
  *entity values* (parties, dates, amounts) — **not** per-token field boxes in the base
  release. [arXiv 2003.02356](https://arxiv.org/abs/2003.02356) ·
  [arXiv 2105.05796](https://arxiv.org/abs/2105.05796).
- **Checkbox:** ❌ no. **KV-linking:** ❌ not in our box-pairing sense (doc-level extraction).
- **License:** **UNVERIFIED** — sources are public (EDGAR for NDAs, UK Charity
  Commission for Charity) but the repo license string wasn't confirmed.
  [gh applicaai/kleister-nda](https://github.com/applicaai/kleister-nda) ·
  [gh applicaai/kleister-charity](https://github.com/applicaai/kleister-charity).
- **Why optional:** Wrong granularity for our detector/relate layer.

### 11. RVL-CDIP (form subset) — optional
- **Gives us:** 25,000 images in the "form" class (of 400k total, 16 classes). **Page
  classification labels only** — no field labels, no KV, no checkboxes.
- **Checkbox:** ❌ no. **KV:** ❌ no.
- **License:** Research-use (IIT-CDIP / tobacco litigation lineage).
  [HF `aharley/rvl_cdip`](https://huggingface.co/datasets/aharley/rvl_cdip).
- **Why optional:** Only useful as "is this page a form?" signal, not for relate/checkbox.

### 12. NIST SD2 (SFRS) / SD6 (SFRS2) — optional (verify checkboxes)
- **Gives us:** IRS 1040-package tax forms (1988). **SD2:** 5,590 binary pages, 12 form
  types. **SD6:** ~900 simulated submissions (~6.22 form faces each), 20 form faces.
  Hand-printed entries; field/box reference data and tabular structure → `text_block(11)`,
  field boxes, `table`.
- **Real vs synthetic:** **Synthesized** — images derived/synthesized by computer with
  **no real tax data**, though they look like real hand-printed forms.
  [NIST SD2](https://www.nist.gov/srd/nistsd2.cfm) ·
  [NIST SD6](https://www.nist.gov/property-fieldsection/nist-special-database-6) ·
  [data.commerce.gov SFRS2](https://data.commerce.gov/nist-structured-forms-reference-set-binary-images-ii-sfrs2-nist-special-database-6).
- **Checkbox:** ⚠️ **UNVERIFIED** — 1040 forms contain checkboxes, but per-checkbox box
  labels are **not confirmed**. Verify the field schema before counting on it.
- **License:** NIST/US-Government dataset (generally open, low restriction) — confirm
  the specific SD2/SD6 distribution terms.
- **Why optional:** Synthesized + uncertain checkbox labels; possible niche tax-form data.

### 13. FUNSD derivatives (FUNSD+ / SRFUND / FUNSD-r) — optional (KV research)
- **FUNSD-Plus / "Noisy Scanned Documents Plus":** headers, questions (labels), answers
  (values) and their relationships for KV extraction.
  [FiftyOne card](https://docs.voxel51.com/dataset_zoo/datasets_hf/form_understanding_in_noisy_scanned_documents_plus.html).
- **SRFUND:** hierarchical structure reconstruction over FUNSD/XFUND, **8 languages** —
  richer multi-granularity KV links. [OpenReview](https://openreview.net/forum?id=66XJOENOrL).
- **FUNSD-r / CORD-r:** reading-order-revised FUNSD & CORD.
  [gh Token-Path-Prediction-Datasets](https://github.com/chongzhangFDU/Token-Path-Prediction-Datasets).
- **Checkbox:** ❌ no. **License:** inherits FUNSD/CORD (research / CC BY 4.0 respectively).
- **Why optional:** Strong for advanced KV-linking research; not needed for MVP.

---

## License usability classes (local-first / redistribution lens)

| Class | Datasets | Meaning for us |
|---|---|---|
| **PERMISSIVE** | **CORD (CC BY 4.0)** | Safe to train on and redistribute with attribution. |
| **PERMISSIVE (code only)** | CommonForms code/models (Apache-2.0), DocILE library (MIT) | The *tooling* is open; the *data* license is separate — don't conflate. |
| **RESEARCH-ONLY** | FUNSD, XFUND (non-commercial), RVL-CDIP | Use for research/benchmarks; keep out of shipped product. |
| **GATED** | DocILE (token registration), AutoFormBench (verify) | Requires sign-up/agreement; check redistribution clause. |
| **UNCLEAR / UNVERIFIED** | SROIE, WildReceipt, Kleister, CommonForms *dataset*, NIST SD2/SD6 checkbox schema, CheckboxQA | Must pin the exact license before any non-research use. |

---

## Action items (for the class-map + benchmark harness)

1. **Close the `checkbox(10)` real gap:** add **CommonForms** as the real checkbox train
   source and **AutoFormBench** as the real eval gate. Update
   `training/benchmarks/README.md` to move `checkbox(10)` off the "synthetic-only" list
   **once license is verified**. Add a class-map entry: ChoiceButton→checkbox(10) with
   radio-button filtering + "location-only, no state" comment.
2. **Stand up KV-linking ("relate") training:** FUNSD + XFUND for label↔value links;
   CORD as the permissive, shippable receipts set.
3. **License verification queue (blocking):** CommonForms *dataset* license, AutoFormBench
   release/license, SROIE, WildReceipt, Kleister, NIST SD2/SD6 checkbox schema, exact
   XFUND license string. Mark each PASS/FAIL before it touches a shipped artifact.
4. **Keep research-only data quarantined** from any redistributable model/dataset bundle
   (FUNSD, XFUND, RVL-CDIP, likely DocILE images).

> Compliance: all dataset descriptions above are paraphrased from primary sources, kept
> under 30 consecutive words per source, and attributed via inline links.
