# Catalog: Real Document-Layout & Table Datasets

**Registrar:** Office of the Chief Archivist
**Purpose:** Source datasets for the universal document-primitive detector — two `docdet` classes: **`text_block` (id 11)** and **`table` (id 9)** — plus the real-world layout benchmark backbone.
**Methodology:** Every entry verified against a primary source (dataset page, paper, or HF/GitHub repo) with inline citation. Unverified figures are labeled **UNVERIFIED**. Each license is stated exactly and classified for a **local-first, would-be-open-source** project as **PERMISSIVE / RESEARCH-ONLY / GATED / UNCLEAR**.
**Compliance note:** All descriptions are paraphrased from sources (≤30 consecutive words per source), attributed via inline links. Content was rephrased for compliance with licensing restrictions.

> **Usability classes, defined for *our* project (local-first, intends to open-source):**
> - **PERMISSIVE** — license allows commercial use, redistribution, and model training with no obligation beyond attribution (e.g., CDLA-Permissive, Apache-2.0, CC-BY-4.0). Safe for an open-source product.
> - **RESEARCH-ONLY** — non-commercial / academic-use-only terms. Usable to research and prototype, **not** to ship in a commercial or unrestricted-open-source product.
> - **GATED** — requires registration, click-through agreement, or manual approval before download; redistribution restricted.
> - **UNCLEAR** — no explicit license file found, or terms are ambiguous; treat as "do not ship until clarified."

---

## 1. Summary Table

| # | Dataset | docdet class | Box granularity | Real / Synthetic | Scale | Annotation richness | License | Usability | Domain | Photo-match? | Priority |
|---|---------|-------------|-----------------|------------------|-------|---------------------|---------|-----------|--------|-----------|----------|
| 1 | **DocLayNet** | text_block + table | region-level bbox | Real (human-annotated) | 80,863 pages, 11 classes | bbox (+ polygon/cell provided in COCO) , reading order | CDLA-Permissive-1.0 | **PERMISSIVE** | general (6 categories) | Clean PDFs/scans | **P0** |
| 2 | **PubLayNet** | text_block + table | region-level bbox | Real (auto-matched) | ~360K pages, 5 classes | bbox + polygon segmentation | CDLA-Permissive-1.0 | **PERMISSIVE** | scientific | Clean PDFs | **P0** |
| 3 | **DocBank** | text_block + table | token-level (fine) | Real (weak supervision) | 500K pages, 12 units | token bbox (fine-grained) | Apache-2.0 | **PERMISSIVE** | scientific (arXiv) | Clean PDFs | P1 |
| 4 | **PRImA Layout** | text_block + table | region polygon | Real (scanned) | ~305–478 pages | polygon regions, reading order | PRImA non-commercial | **RESEARCH-ONLY** | magazines/scientific | Scanned, some real | P1 |
| 5 | **ReadingBank** | text_block (order) | word bbox + order | Real (weak supervision) | 500K images | reading-order + word bbox | (MIT code) data UNCLEAR | **UNCLEAR** | general (Word docs) | Clean digital | optional |
| 6 | **M⁶Doc** | text_block + table | region bbox | Real (incl. photos!) | 9,080 pages, 74 labels, 237,116 inst. | bbox, fine label taxonomy | research/academic | **RESEARCH-ONLY** (GATED) | multi: mag/book/paper/exam | **Some real photos** | P1 |
| 7 | **DocStruct** | text_block (form) | region/line | Real (forms/receipts) | ~ form set | hierarchy + bbox | research-only | **RESEARCH-ONLY** | forms/receipts | Scanned forms | optional |
| 8 | **RVL-CDIP** | (classification only) | none (whole-image label) | Real (scanned, noisy) | 400,000 images, 16 classes | image-level class only | data UNCLEAR (IIT-CDIP/legal-archive origin) | **UNCLEAR** | general/noisy scans | **Noisy real scans** (no boxes) | optional |
| 9 | **PubTables-1M** | table (fine) | region + cell/row/col | Real (PMC) | ~948K tables | bbox + full cell/row/col structure | CDLA-Permissive (per HF: 2.0) | **PERMISSIVE** | scientific | Clean PDFs | **P0** (tables) |
| 10 | **FinTabNet** | table (fine) | region + cell/row/col | Real (financial PDFs) | ~89K–113K tables | bbox + cell structure | CDLA-Permissive | **PERMISSIVE** | financial | Clean PDFs | **P0** (tables) |
| 11 | **PubTabNet** | table (structure) | cell bbox + HTML | Real (PMC) | 568K table images | cell bbox + HTML structure | CDLA-Permissive-1.0 | **PERMISSIVE** | scientific | Clean PDFs | P1 |
| 12 | **SciTSR** | table (structure) | cell + adjacency | Real (PDF) | 15,000 tables | cell content + structure relations | MIT | **PERMISSIVE** | scientific | Clean PDFs | P1 |
| 13 | **TableBank** | table (detection + structure) | region bbox (det) + HTML (struct) | Real (weak supervision) | 417K tables | detection bbox; structure as HTML | Apache-2.0 | **PERMISSIVE** | general (Word/LaTeX) | Clean digital | P1 |
| 14 | **ICDAR-2013 table comp.** | table | region bbox + cells | Real (PDF) | small (~150 tables) | bbox + cell structure | research/competition | **RESEARCH-ONLY** | gov/business PDFs | Clean PDFs | optional (eval) |
| 15 | **ICDAR-2019 cTDaR** | table | region bbox + cells | Real (modern + archival) | ~thousands imgs (A+B) | bbox (TRACK A) + structure (TRACK B) | research/competition | **RESEARCH-ONLY** | modern + **historical handwritten** | **Some archival/photo-like** | P1 (eval) |
| 16 | **TabRecSet** | table (full) | **polygon** + cell logical | Real (**camera-taken**) | 38.1K tables (bi-lingual) | polygon body + cell spatial+logical + text | CC-BY-4.0 | **PERMISSIVE** | **in-the-wild** (invoices, exams, photos) | **YES — real photos** | **P0** (photo tables) |
| 17 | **WTW (Wired Table in the Wild)** | table (structure) | cell + corner points | Real (**photo/scan/web**) | ~14.5K images **(UNVERIFIED exact)** | cell structure parsing (wired) | **UNCLEAR** (no clear license file) | **UNCLEAR** | **photographed wired tables** | **YES — real photos** | P1 (photo tables) |

---

## 2. Per-Dataset Registrar Records

### LAYOUT / `text_block` datasets

#### 1. DocLayNet  —  **P0**
- **docdet class served:** `text_block` (Text, Title, Section-header, List-item, Caption, etc.) **and** `table` (Table is one of the 11 classes). Region-level bounding boxes (page-object detection). COCO export also carries polygon and cell data.
- **Real vs synthetic:** Real, **human-annotated** (its distinguishing virtue vs. auto-labeled peers).
- **Scale:** 80,863 unique pages across 6 document categories, 11 layout classes. ([HF: ds4sd/DocLayNet README](https://huggingface.co/datasets/ds4sd/DocLayNet/blob/main/README.md), [GitHub DS4SD/DocLayNet](https://github.com/DS4SD/DocLayNet))
- **Annotation richness:** bbox per region; 11 classes (Caption, Footnote, Formula, List-item, Page-footer, Page-header, Picture, Section-header, Table, Text, Title). ([HF: DILHTWD model card](https://huggingface.co/DILHTWD/documentlayoutsegmentation_YOLOv8_ondoclaynet))
- **Exact license:** **CDLA-Permissive-1.0** (Community Data License Agreement – Permissive – 1.0). Published by Deep Search / IBM Research. ([HF: pierreguillou/DocLayNet-base README](https://huggingface.co/datasets/pierreguillou/DocLayNet-base/blob/main/README.md))
- **Usability:** **PERMISSIVE** — CDLA-Permissive permits commercial use, redistribution, and model training with no downstream obligation on the trained model. Safe to open-source against.
- **Access:** HF `ds4sd/DocLayNet` (also `pierreguillou/DocLayNet-base|large`); GitHub `DS4SD/DocLayNet`.
- **Domain:** General — financial reports, manuals, scientific articles, laws/regulations, patents, government tenders. The most domain-diverse of the layout sets.
- **Suitability:** Born-digital and scanned PDF pages, clean. **Not** photographed-in-the-wild. But it is the gold-standard for region-level `text_block`+`table` and its 11-class taxonomy maps directly onto our scheme.
- **Why P0:** Permissive license + human annotation + 11-class taxonomy aligned with our `text_block(11)`/`table(9)` need = the backbone training set.

#### 2. PubLayNet  —  **P0**
- **docdet class served:** `text_block` (text, title, list) **and** `table`; also figure. Region-level bbox + polygon segmentation masks.
- **Real vs synthetic:** Real pages, annotations auto-generated by matching PDF and XML of PubMed Central articles.
- **Scale:** Over 360,000 document images; ~350K train / 11K val commonly used; 5 categories (text, title, list, table, figure). ([ResearchGate: PubLayNet paper](https://www.researchgate.net/publication/336288174_PubLayNet_Largest_Dataset_Ever_for_Document_Layout_Analysis), [PaddleOCR layout datasets](https://paddlepaddle.github.io/PaddleOCR/main/en/datasets/layout_datasets.html))
- **Annotation richness:** bbox + polygon segmentation (COCO format).
- **Exact license:** Annotations under **CDLA-Permissive-1.0**; underlying images derive from the PMC Open Access subset (NIH/NLM, Creative Commons), redistributed by IBM under the repo's stated license as derivative work. ([GitHub issue #7 — license terms](https://github.com/ibm-aur-nlp/PubLayNet/issues/7), [GitHub ibm-aur-nlp/PubLayNet](https://github.com/ibm-aur-nlp/PubLayNet))
- **Usability:** **PERMISSIVE** — CDLA-Permissive-1.0. Note the PMC-OA provenance: source articles are CC-licensed; cataloged as permissive for our purposes. (Verify per-article CC variant only if you redistribute the source images themselves.)
- **Access:** GitHub `ibm-aur-nlp/PubLayNet`; mirrored on HF.
- **Domain:** Scientific (biomedical) articles only — visually homogeneous, two-column.
- **Suitability:** Clean born-digital PDFs. Huge scale, great for `table` and `text_block` pre-training, but domain-narrow and not photographic.
- **Why P0:** Scale + permissive license. Pair with DocLayNet for diversity.

#### 3. DocBank  —  **P1**
- **docdet class served:** `text_block` (paragraph, title, section, abstract, list, caption…) and `table`. **Token-level** fine-grained annotation (finer than region boxes).
- **Real vs synthetic:** Real arXiv pages, **weak supervision** from LaTeX source.
- **Scale:** 500K pages (400K train / 50K val / 50K test); 12 semantic unit types; e.g., 24,517 Table instances, 497,607 Paragraph instances. ([HF: liminghao1630/DocBank](https://huggingface.co/datasets/liminghao1630/DocBank), [GitHub DocBank README](https://raw.githubusercontent.com/doc-analysis/DocBank/master/README.md), [arXiv 2006.01038](https://ar5iv.labs.arxiv.org/html/2006.01038))
- **Annotation richness:** Fine-grained **token-level** bounding boxes; MS-COCO-format region annotation also provided on the dataset homepage.
- **Exact license:** **Apache-2.0** (repo states "We update the license to Apache-2.0"). ([GitHub DocBank README](https://raw.githubusercontent.com/doc-analysis/DocBank/master/README.md))
- **Usability:** **PERMISSIVE** — Apache-2.0 is permissive; commercial + redistribution allowed with attribution/notice. (Underlying content is arXiv papers; for *image* redistribution be mindful of per-paper arXiv licenses, but the dataset itself is Apache-2.0.)
- **Access:** HF `liminghao1630/DocBank`; GitHub `doc-analysis/DocBank` (+ `DocBankLoader` to convert to detection format).
- **Domain:** Scientific (arXiv), English.
- **Suitability:** Clean born-digital PDFs. Token-level granularity is richer than we strictly need for region `text_block`, but convertible to region boxes.
- **Why P1:** Permissive + huge, but domain-narrow and clean-only; secondary to DocLayNet/PubLayNet for region detection.

#### 4. PRImA Layout Analysis  —  **P1**
- **docdet class served:** `text_block` (text regions) and `table` (table regions), plus image/graphic/separator. Polygon regions.
- **Real vs synthetic:** Real **scanned** documents — one of the first real-world layout datasets.
- **Scale:** ~305 images of magazines and scientific articles in the classic set (later expanded sets exist, ~478). **UNVERIFIED** exact count for the version you download. ([ResearchGate figure referencing PRImA's 305 images](https://www.researchgate.net/figure/Magazine-page-examples_fig3_220860345))
- **Annotation richness:** Polygon region outlines + region types + reading order (PAGE XML).
- **Exact license:** PRImA Research Lab terms — **academic / non-commercial use** (registration via the PRImA dataset portal). **UNVERIFIED** exact text; tools are on [GitHub PRImA-Research-Lab](https://github.com/PRImA-Research-Lab).
- **Usability:** **RESEARCH-ONLY** — treat as non-commercial until the portal terms are confirmed.
- **Access:** PRImA dataset portal (registration); PAGE-XML format.
- **Domain:** Magazines + scientific articles, **scanned** (real paper origin).
- **Suitability:** Closer to "real scanned" than PDF-native sets; polygon regions are high quality. Small scale; better for evaluation/fine-tuning than bulk training. Not phone-photo-in-the-wild.
- **Why P1:** Real scans + polygon `text_block` regions are valuable, but small and non-commercial.

#### 5. ReadingBank  —  optional
- **docdet class served:** Reading-**order** for `text_block` (word boxes + sequence), not a detection-box dataset.
- **Real vs synthetic:** Real Word documents, weak supervision.
- **Scale:** 500,000 document images with reading order, text, and layout. ([Microsoft Research: LayoutReader](https://www.microsoft.com/en-us/research/publication/layoutreader-pre-training-of-text-and-layout-for-reading-order-detection/), [HF: maveriq/readingbank loader](https://huggingface.co/datasets/maveriq/readingbank/blob/main/readingbank.py))
- **Annotation richness:** Word-level bbox + reading-order index. No region/class labels.
- **Exact license:** Code under MIT (LayoutReader/unilm); the **dataset redistribution terms are not clearly stated** as an open data license. **UNCLEAR**.
- **Usability:** **UNCLEAR** — usable for research; confirm data terms before shipping.
- **Access:** GitHub `doc-analysis/ReadingBank`; HF mirrors (`maveriq/readingbank`, `zilongwang/ReadingBank`).
- **Domain:** General (Word docs), clean digital.
- **Suitability:** Useful only if/when we add a **reading-order** capability; does not provide `text_block` detection boxes or photos.
- **Why optional:** Out of scope for box detection; revisit for reading-order features.

#### 6. M⁶Doc  —  **P1**
- **docdet class served:** `text_block` (many sub-types) **and** `table`. Region bbox with a very fine 74-label taxonomy.
- **Real vs synthetic:** Real, **manually annotated**, deliberately including realistic/non-PDF documents (the authors note most prior sets are PDF-only and generalize poorly to real-world). ([arXiv 2305.08719](https://ar5iv.labs.arxiv.org/html/2305.08719))
- **Scale:** 9,080 manually annotated pages, 74 annotation label types, 237,116 instances; Chinese + English. ([CVPR 2023 M⁶Doc](https://openaccess.thecvf.com/content/CVPR2023/html/Cheng_M6Doc_A_Large-Scale_Multi-Format_Multi-Type_Multi-Layout_Multi-Language_Multi-Annotation_Category_Dataset_CVPR_2023_paper.html))
- **Annotation richness:** Region bbox + rich label taxonomy. Multi-format (scanned, photographed, born-digital, PPT-like).
- **Exact license:** Released by SCUT HCII Lab via [GitHub HCIILAB/M6Doc](https://github.com/HCIILAB/M6Doc) — **academic / agreement-based** access. **UNVERIFIED** exact text; historically distributed by request/agreement.
- **Usability:** **RESEARCH-ONLY (likely GATED)** — request-based academic release; do not assume commercial rights.
- **Access:** GitHub `HCIILAB/M6Doc` (download by agreement); partial HF mirror `tuandunghcmut/M6Doc`.
- **Domain:** Multi-type: magazines, books, papers, exam papers, newspapers — **including photographed and scanned real documents**.
- **Suitability:** One of the few layout sets with **real photographed/scanned variety**, closest to our "messy real" target among the layout sets. Modest scale; gated license limits product use.
- **Why P1:** Best real-photo *layout* coverage, but research-only/gated.

#### 7. DocStruct  —  optional
- **docdet class served:** `text_block`-style structure for **forms/receipts** (hierarchical key-value structure), not region detection per se.
- **Real vs synthetic:** Real form/receipt images.
- **Scale / details:** **UNVERIFIED** — "DocStruct" refers to a multimodal form-structure method/dataset; scale and split not independently confirmed here.
- **Annotation richness:** Hierarchical structure + region/line associations.
- **Exact license:** **RESEARCH-ONLY** (academic) — **UNVERIFIED** exact terms.
- **Usability:** **RESEARCH-ONLY** pending verification.
- **Domain:** Forms / receipts (scanned).
- **Suitability:** Tangential to region `text_block`/`table` detection; relevant only if we add form-structure parsing.
- **Why optional:** Off the main detection path; verify before any use.

#### 8. RVL-CDIP  —  optional (diversity only)
- **docdet class served:** **None for detection** — whole-image **classification** (16 document types). No boxes.
- **Real vs synthetic:** Real, **noisy low-resolution grayscale scans** from a legal-archive corpus (IIT-CDIP).
- **Scale:** 400,000 grayscale images, 16 classes (25,000 each); 320K train / 40K val / 40K test; largest dimension ≤1000 px. ([HF: rvl_cdip dataset_infos](https://huggingface.co/datasets/rvl_cdip/blob/main/dataset_infos.json), [paperswithcode RVL-CDIP](https://paperswithcode.com/dataset/rvl-cdip))
- **Annotation richness:** Image-level class label only (letter, form, email, invoice, resume, etc.).
- **Exact license:** Derives from IIT-CDIP (tobacco-litigation legal archive). No clean open-data license; common HF mirrors tag license as "other"/unspecified. **UNCLEAR**.
- **Usability:** **UNCLEAR** — usable for research/benchmarking; provenance is a legal-document archive, redistribution terms ambiguous.
- **Access:** CMU page (`aharley/rvl-cdip`); HF mirrors.
- **Domain:** General, **genuinely noisy real scans** (faxes, photocopies).
- **Suitability:** No bounding boxes → cannot train `text_block`/`table` detection. Valuable only as a source of **realistic visual noise/domain diversity** for augmentation or as a classification backbone. Closest to "messy real" *visually*, but unusable for our box task as-is.
- **Why optional:** No boxes; diversity/augmentation reference only.

---

### TABLE datasets

#### 9. PubTables-1M  —  **P0 (tables)**
- **docdet class served:** `table` at **both** region level (table detection) **and** fine level (table structure: rows, columns, cells, headers, spanning cells).
- **Real vs synthetic:** Real, from PubMed Central scientific articles.
- **Scale:** Nearly one million tables (~948K). ([arXiv 2110.00061](https://ar5iv.labs.arxiv.org/html/2110.00061), [HF: bsmock/pubtables-1m](https://huggingface.co/datasets/bsmock/pubtables-1m))
- **Annotation richness:** Detection bbox + full **cell/row/column** structure with header and location info; addresses annotation consistency/over-segmentation.
- **Exact license:** **CDLA-Permissive** (Microsoft release; HF mirror of the related FinTabNet.c work tags CDLA-Permissive-2.0; PubTables-1M is distributed under CDLA-Permissive). ([HF: bsmock/FinTabNet.c README noting CDLA-Permissive lineage](https://huggingface.co/datasets/bsmock/FinTabNet.c/blob/main/README.md))
- **Usability:** **PERMISSIVE** — CDLA-Permissive; commercial + redistribution + model training allowed.
- **Access:** HF `bsmock/pubtables-1m`; Microsoft `table-transformer` repo.
- **Domain:** Scientific.
- **Suitability:** Clean born-digital PDF tables. The single best **permissive** source for full table **structure** (rows/cols/cells), and strong for table **detection** boxes. Not photographic.
- **Why P0:** The permissive backbone for `table(9)` detection + structure.

#### 10. FinTabNet  —  **P0 (tables)**
- **docdet class served:** `table` region + **cell/row/column** structure (financial tables).
- **Real vs synthetic:** Real, from financial report PDFs (IBM).
- **Scale:** More than 100,000 financial tables (commonly cited ~89K pages / ~112K tables). ([OpenReview: hierarchical table structure, citing IBM FinTabNet](https://openreview.net/forum?id=B393CzcykVJ))
- **Annotation richness:** Cell, row, and column bounding boxes (extracted via deep learning); the `FinTabNet.c` variant adds cleaned cell structure. ([HF: bsmock/FinTabNet.c](https://huggingface.co/datasets/bsmock/FinTabNet.c))
- **Exact license:** **CDLA-Permissive** (original FinTabNet); `FinTabNet.c` HF card tags **cdla-permissive-2.0**. ([HF: bsmock/FinTabNet.c README](https://huggingface.co/datasets/bsmock/FinTabNet.c/blob/main/README.md))
- **Usability:** **PERMISSIVE** — CDLA-Permissive.
- **Access:** IBM FinTabNet page; HF `bsmock/FinTabNet.c`.
- **Domain:** **Financial** (the key non-scientific table domain).
- **Suitability:** Clean born-digital PDFs but **financial** layouts (dense, multi-level headers) — valuable domain diversity vs scientific tables. Not photographic.
- **Why P0:** Permissive + financial-domain tables complement PubTables-1M's scientific bias.

#### 11. PubTabNet  —  **P1**
- **docdet class served:** `table` **structure** (HTML) + cell bounding boxes. Not primarily a detection (whole-page table-locating) set.
- **Real vs synthetic:** Real, from PMC Open Access (commercial-use collection).
- **Scale:** 568K+ table images with HTML structure. ([HF: ajimeno/PubTabNet README](https://huggingface.co/datasets/ajimeno/PubTabNet/blob/main/README.md), [arXiv 1911.10683](https://arxiv.org/abs/1911.10683))
- **Annotation richness:** Cell content + structure as HTML; cell bbox in later versions.
- **Exact license:** **CDLA-Permissive-1.0** (IBM); images from PMC OA commercial-use subset. ([GitHub ibm-aur-nlp/PubTabNet](https://github.com/ibm-aur-nlp/PubTabNet))
- **Usability:** **PERMISSIVE** — CDLA-Permissive-1.0.
- **Access:** GitHub `ibm-aur-nlp/PubTabNet`; HF `ajimeno/PubTabNet`, `apoidea/pubtabnet-html`.
- **Domain:** Scientific.
- **Suitability:** Clean PDFs; excellent for table **structure recognition** (HTML/cells), overlaps PubTables-1M. Use if we add a structure-recognition head; for pure detection PubTables-1M is preferred.
- **Why P1:** Permissive structure data, but redundant with PubTables-1M for detection.

#### 12. SciTSR  —  **P1**
- **docdet class served:** `table` **structure** — cell content + adjacency (row/col relations).
- **Real vs synthetic:** Real, from scientific PDFs.
- **Scale:** 15,000 tables with structure labels. ([GitHub Academic-Hammer/SciTSR](https://github.com/Academic-Hammer/SciTSR), [arXiv 1908.04729](https://arxiv.org/abs/1908.04729))
- **Annotation richness:** Cell bbox + content + structure relations; includes a "complex" subset.
- **Exact license:** **MIT** (repo license). 
- **Usability:** **PERMISSIVE** — MIT.
- **Access:** GitHub `Academic-Hammer/SciTSR`.
- **Domain:** Scientific.
- **Suitability:** Clean PDFs; permissive and clean structure labels, good complex-table coverage. Mid-scale.
- **Why P1:** Permissive structure set; smaller than PubTables-1M but useful for complex-table evaluation.

#### 13. TableBank  —  **P1**
- **docdet class served:** `table` **detection** (region bbox) + table **structure** (HTML).
- **Real vs synthetic:** Real, **weak supervision** from Word and LaTeX documents online.
- **Scale:** 417K labeled tables (detection); structure subset is HTML. LaTeX (≈187K train) + Word (≈73K train) image splits. ([HF: liminghao1630/TableBank](https://huggingface.co/datasets/liminghao1630/TableBank), [arXiv 1903.01949](https://ar5iv.labs.arxiv.org/html/1903.01949), [PaddleOCR layout datasets](https://paddlepaddle.github.io/PaddleOCR/main/en/datasets/layout_datasets.html))
- **Annotation richness:** Detection bbox; structure as HTML token sequence (no per-cell bbox).
- **Exact license:** **Apache-2.0** (doc-analysis release, same family as DocBank). ([GitHub doc-analysis/TableBank](https://github.com/doc-analysis/TableBank))
- **Usability:** **PERMISSIVE** — Apache-2.0.
- **Access:** HF `liminghao1630/TableBank`; GitHub `doc-analysis/TableBank`.
- **Domain:** General (Word/LaTeX-sourced).
- **Suitability:** Clean digital docs. Large, permissive, good for **table detection** boxes; structure is coarse (HTML, no cell bbox). Not photographic.
- **Why P1:** Permissive detection scale; complements PubTables-1M (different source distribution).

#### 14. ICDAR-2013 Table Competition  —  optional (eval)
- **docdet class served:** `table` region + cell structure.
- **Real vs synthetic:** Real PDFs (EU/US government & business reports).
- **Scale:** Small — on the order of ~150 tables / ~67 documents. **UNVERIFIED** exact count.
- **Annotation richness:** Region bbox + cell structure (adjacency).
- **Exact license:** Competition/research use. **RESEARCH-ONLY**.
- **Usability:** **RESEARCH-ONLY** — benchmark/eval, not training-scale.
- **Domain:** Government/business PDFs, clean.
- **Suitability:** Classic **evaluation** benchmark; too small to train. Clean PDFs.
- **Why optional:** Use only as a standard eval set.

#### 15. ICDAR-2019 cTDaR  —  **P1 (eval)**
- **docdet class served:** `table` — TRACK A = table **detection** (region bbox); TRACK B = table **structure recognition** (B.1 given region, B.2 from scratch).
- **Real vs synthetic:** Real, includes **modern** documents and **historical/archival handwritten** tables.
- **Scale:** Thousands of images across modern + archival subsets (A and B). **UNVERIFIED** exact totals. ([GitHub cndplab-founder/ICDAR2019_cTDaR](https://github.com/cndplab-founder/ICDAR2019_cTDaR), [Zenodo cTDaR record](https://zenodo.org/record/3239032))
- **Annotation richness:** Detection bbox (TRACK A) + cell structure / adjacency (TRACK B); a supplement adds modern adjacency relations.
- **Exact license:** Competition/research release (GitHub + Zenodo). **RESEARCH-ONLY** — **UNVERIFIED** exact license text.
- **Usability:** **RESEARCH-ONLY** — strong eval, modest training value.
- **Access:** GitHub `cndplab-founder/ICDAR2019_cTDaR`; Zenodo `record/3239032`.
- **Domain:** Modern docs **and historical archival** (handwritten ledgers) — visually closer to "real/degraded" than born-digital PDFs.
- **Suitability:** The **archival/historical** subset adds genuine degradation and irregular tables — partially matches our "messy real" target. Good evaluation set.
- **Why P1:** Real archival diversity for `table` eval; license limits product training.

#### 16. TabRecSet  —  **P0 (real-photo tables)**
- **docdet class served:** `table` end-to-end — table **detection** (polygon body), **structure** (cell spatial + logical), and text content.
- **Real vs synthetic:** Real, **camera-taken and scanned in the wild**.
- **Scale:** 38.1K tables, bi-lingual (20.4K English + 17.7K Chinese). ([arXiv 2303.14884](https://ar5iv.labs.arxiv.org/html/2303.14884), [Nature Sci Data, PMC9950383](https://pmc.ncbi.nlm.nih.gov/articles/PMC9950383/))
- **Annotation richness:** **Polygon** table-body spatial annotation (not just bbox/quadrilateral), cell spatial + logical structure, and text content — complete TD+TSR+TCR labels.
- **Exact license:** **CC-BY-4.0** (Nature Scientific Data article; data released under Creative Commons Attribution 4.0). ([Nature article 10.1038/s41597-023-01985-8 via PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC9950383/))
- **Usability:** **PERMISSIVE** — CC-BY-4.0 (attribution only). Commercial + redistribution OK with attribution.
- **Access:** GitHub `MaxKinny/TabRecSet`.
- **Domain:** **In-the-wild** — scanned to camera-taken; documents, Excel tables, exam papers, financial invoices; border-complete and border-incomplete, rotated/distorted.
- **Suitability:** **Directly matches our "messy real photo" target** — camera-taken, distorted, irregular tables with polygon + cell-logical labels. The standout permissive real-photo table set.
- **Why P0:** Permissive license **and** genuine in-the-wild photographs — exactly the gap our detector must cover.

#### 17. WTW — Wired Table in the Wild  —  **P1 (real-photo tables)**
- **docdet class served:** `table` **structure** (wired tables) + detection; cell structure parsing via corner/cell points.
- **Real vs synthetic:** Real, multiple scenes — **photos, scanned files, web pages**.
- **Scale:** ~14,581 images (commonly cited) — **UNVERIFIED** exact count from primary repo. ([ICCV 2021 paper](https://www.openaccess.thecvf.com/content/ICCV2021/html/Long_Parsing_Table_Structures_in_the_Wild_ICCV_2021_paper.html), [GitHub wangwen-whu/WTW-Dataset](https://github.com/wangwen-whu/WTW-Dataset))
- **Annotation richness:** Cell structure parsing for **wired** (ruled) tables; cell quadrilateral/corner annotations. Wireless/borderless tables out of scope by design.
- **Exact license:** **No clear license file found** in the official repo. **UNCLEAR**.
- **Usability:** **UNCLEAR** — usable for research; confirm terms before any product/open-source shipping.
- **Access:** GitHub `wangwen-whu/WTW-Dataset`.
- **Domain:** **Photographed** + scanned + web wired tables.
- **Suitability:** **Strong real-photo match** for wired/ruled tables (the common camera case). Limited to wired tables and license is unclear.
- **Why P1:** Excellent real-photo wired-table structure data, but license ambiguity blocks P0 until clarified.

---

## 3. Verdict — Best for Table Detection on Real Photos

For our **"messy real photo"** target, born-digital PDF table sets (PubTables-1M, FinTabNet, PubTabNet, TableBank, SciTSR, DocBank) are domain-mismatched — they are clean, axis-aligned, high-DPI renders. The real-photo contenders are:

1. **TabRecSet — top pick (P0).** Genuinely camera-taken/in-the-wild, polygon + cell-logical annotations, **CC-BY-4.0 (PERMISSIVE)**. It is the only real-photo table set here that is both photographic *and* safely licensable for an open-source product. Covers rotation/distortion/border-incomplete tables.
2. **WTW (P1).** Real photographed **wired** tables with cell-structure parsing — great visual match, but **license UNCLEAR** and limited to ruled tables. Use for research/fine-tuning; clarify license before shipping.
3. **ICDAR-2019 cTDaR archival subset (P1, eval).** Adds degraded/historical realism for evaluation; research-only.
4. **M⁶Doc (P1).** Best *layout* set with real photographed pages (includes `table` regions), but research-only/gated.

**Recommended real-photo table strategy:** Pre-train table detection on the large permissive PDF sets (**PubTables-1M + FinTabNet + TableBank**) for box/structure priors, then **fine-tune and evaluate on TabRecSet (and WTW where license permits)** to bridge to photographs. Augment heavily with perspective warp, blur, lighting, and JPEG noise to simulate the photo domain.

**Top picks summary:**
- **`text_block (11)` training:** **DocLayNet (P0)** + **PubLayNet (P0)** — both **CDLA-Permissive (PERMISSIVE)**. Add **DocBank (P1, Apache-2.0)** for token-level depth and **M⁶Doc (P1, research-only)** for real-photo layout variety.
- **`table (9)` training:** **PubTables-1M (P0, CDLA-Permissive)** + **FinTabNet (P0, CDLA-Permissive)** for clean structure/detection, then **TabRecSet (P0, CC-BY-4.0)** for the real-photo bridge. **TableBank (Apache-2.0)** and **SciTSR (MIT)** as permissive supplements; **WTW** for wired photos pending license check.

---

## 4. Caveat — The Clean-PDF vs Real-Photo Domain Gap (read this honestly)

Most "layout" and "table" benchmarks in this catalog are **born-digital PDFs or clean scans**, *not* photographs of paper. This matters because our detector targets messy real-world images. The honest breakdown:

- **Born-digital / clean PDF (domain-MISMATCHED to photos):** PubLayNet, DocBank, PubTables-1M, FinTabNet, PubTabNet, SciTSR, TableBank, ICDAR-2013. These render text crisply, with perfect axis alignment, uniform lighting, no perspective skew, no blur, no shadows, no page curl. A model trained only on these tends to **overfit to clean renders** and degrade sharply on phone photos.
- **Scanned-real (partial match):** DocLayNet (mix of digital + scanned), PRImA (scanned magazines/articles), RVL-CDIP (noisy grayscale scans, but **no boxes**), ICDAR-2019 cTDaR archival (historical degradation). These add some noise/skew but are still flatbed-style, not handheld photos.
- **True in-the-wild photographs (domain-MATCHED):** **TabRecSet** (camera-taken) and **WTW** (photos/scans/web) for tables; **M⁶Doc** includes some photographed pages for layout. These are the scarce, valuable assets.

**Implications for the build:**
1. **Do not benchmark only on clean PDF sets** — a high mAP on PubLayNet/PubTables-1M will *overstate* real-photo performance. Always report a separate real-photo metric (TabRecSet / WTW / a held-out photo set).
2. **Bridge the gap with augmentation:** perspective/homography warp, page curl, non-uniform lighting and shadows, motion/defocus blur, JPEG compression, and moiré — applied to the clean sets to simulate capture conditions.
3. **Reserve the real-photo sets for fine-tuning + evaluation**, not just training, so we measure the gap rather than hide it.
4. **License reality check:** the permissive backbone (DocLayNet, PubLayNet, PubTables-1M, FinTabNet, PubTabNet, SciTSR, TableBank, DocBank, TabRecSet) is shippable; the best *real-photo layout* set (M⁶Doc) and one real-photo table set (WTW) are **research-only/unclear** and must not be baked into an open-source release until terms are confirmed.

*The junior researcher who wrote "DocLayNet is big" is hereby directed to read this section in full.*
