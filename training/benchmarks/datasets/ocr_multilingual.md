# OCR Datasets — Multilingual & Document Expedition Log

> Field log for the DocuTract "read" layer. We ship **PP-OCRv5** (multilingual) as the
> recognizer and need: (a) text **detection** sets to validate/finetune word/line
> localization, (b) text **recognition** sets for CER/WER across scripts, (c)
> **document-specific** OCR (not just scene text), and (d) explicit **multilingual** coverage.
>
> Scope note: our current corpus is Latin-heavy. This log deliberately over-weights
> non-Latin scripts and document-text (vs scene-text) coverage.
>
> **License taxonomy used here**
> - **PERMISSIVE** — open license usable in a local-first / open-source-leaning product (CC BY, MIT, Apache, BSD, CC0). Attribution still required for CC BY.
> - **RESEARCH-ONLY** — non-commercial / academic-use terms, or competition terms restricting use. Usable for internal eval/finetune, *not* for redistribution in a product without checking.
> - **GATED** — requires registration, signed agreement, or payment (e.g. LDC catalog).
> - **UNCLEAR** — license not clearly stated on official source; treat as RESEARCH-ONLY until confirmed.
> - **NC** suffix = explicitly non-commercial (CC BY-NC / NC-SA).
>
> Every row is verified against the linked ICDAR/competition page, dataset paper, or
> official repo. Items not yet confirmed are tagged **UNVERIFIED** inline.
> Content paraphrased for licensing compliance (≤30 consecutive words/source; sources linked inline).

---

## 1. Summary table

| Dataset | Task | Scripts / languages | Scene vs Doc | Scale | Annotation | License | Doc-OCR relevance | Priority |
|---|---|---|---|---|---|---|---|---|
| **ICDAR2017 MLT (RRC-MLT-17)** | Detection + script ID | 9 langs / 6 scripts (Latin, Arabic, Chinese, Japanese, Korean, Bangla) | Scene | ~18k imgs | Word quad boxes + script label | RESEARCH-ONLY (competition) | Low–med (multiscript proxy) | **P1** |
| **ICDAR2019 MLT (RRC-MLT-19)** | Det + recog + e2e + script ID | 10 langs / 7 scripts (+ Hindi/Devanagari) | Scene | 20k real + 277k synth | Word boxes + transcriptions + script | RESEARCH-ONLY (competition) | Med (best multiscript benchmark) | **P0** |
| **TextOCR** | Det + recog + e2e | English (Latin) | Scene | 28k imgs, ~0.9–1M words | Polygons + transcriptions | PERMISSIVE (CC BY 4.0) | Med (dense, many words/img) | **P1** |
| **HierText** | Det + hierarchical layout | Mostly Latin (multi present) | Scene + doc-like (Open Images) | ~11.6k imgs, ~1.2M words | Word/line/paragraph polygons + transcriptions | PERMISSIVE (CC BY-SA 4.0) | **High** (line/para structure ≈ documents) | **P0** |
| **Union14M** | Recognition benchmark | English (Latin) | Scene | 4M labeled + 10M unlabeled | Word crops + transcriptions | Mixed (code MIT; data per-source) | Low–med | **P1** |
| **COCO-Text** | Det + recog | English (Latin) | Scene | 63k imgs, ~145k instances | Word boxes + transcriptions | PERMISSIVE (annotations CC BY 4.0) | Low | optional |
| **ICDAR2015 Incidental** | Det + recog + e2e | English (Latin) | Scene | 1,500 imgs | Word quad boxes + transcriptions | RESEARCH-ONLY (competition) | Low (localization sanity) | **P1** |
| **Total-Text** | Det + recog + e2e | Mostly English (Latin) | Scene (curved) | 1,555 imgs, ~11k instances | Polygon boxes + transcriptions | RESEARCH-ONLY / UNCLEAR | Low | optional |
| **SCUT-CTW1500** | Detection (+recog) | English + some Chinese | Scene (curved) | 1,500 imgs, ~10k lines | Line-level polygons | RESEARCH-ONLY / UNCLEAR | Low | optional |
| **SynthText** | Det + recog (synthetic) | English (Latin) | Synthetic scene | 800k imgs, ~8M words | Word/char boxes + transcriptions | RESEARCH-ONLY (VGG non-commercial) | Low (pretrain only) | **P1** |
| **MJSynth / Synth90k** | Recognition (synthetic) | English (Latin) | Synthetic crops | ~9M word crops | Transcriptions (filename) | RESEARCH-ONLY (VGG non-commercial) | Low (pretrain only) | optional |
| **KHATT** | Recognition (handwritten) | Arabic | **Document** (handwritten pages/paragraphs) | 1,000 writers, ~9,327 lines | Page/para/line images + transcriptions | RESEARCH-ONLY (free for research; LDC variant GATED) | **High** (Arabic doc OCR) | **P0** |
| **MADCAT** | Det + recog (handwritten) | Arabic | **Document** | Large (multi-phase) | Line/token coords + transcripts + translation | **GATED** (LDC, paid) | High but gated | optional |
| **Bharat Scene Text (IITJ)** | Det + recog + e2e + script ID | 13+ Indic langs | Scene | Large-scale (newest Indic set) | Boxes + transcriptions + script | UNCLEAR (check repo) | Med (Indic proxy) | **P1** |
| **IIIT-Indic STR** | Recognition | Devanagari, Telugu, Malayalam (+more) | Scene + synthetic | ~27k+ real word imgs; synth larger | Word crops + transcriptions | RESEARCH-ONLY / UNCLEAR | Med (Indic CER) | **P1** |
| **ICDAR2019 ArT** | Det + recog | English + Chinese | Scene (arbitrary-shape) | ~10k+ imgs | Polygons + transcriptions | RESEARCH-ONLY (competition) | Low | optional |
| **RCTW-17** | Det + e2e | Chinese | Scene | 12,263 imgs | Quad boxes + transcriptions | RESEARCH-ONLY (competition) | Low–med | optional |
| **ICDAR2019 ReCTS** | Det + recog + e2e | Chinese (signboards) | Scene | ~25k imgs | Char + line boxes + transcriptions | RESEARCH-ONLY (competition) | Low | optional |
| **ICDAR2019 LSVT** | Det + recog (partial labels) | Chinese street view | Scene | ~450k imgs (50k full, 400k weak) | Boxes + transcriptions (partial) | RESEARCH-ONLY (competition) | Low | optional |
| **CASIA-HWDB** | Recognition (handwritten) | Chinese | **Document** (handwriting) | ~3.9M char samples, ~5,090 pages | Char + text-line segmentation + transcripts | RESEARCH-ONLY (academic agreement) | **High** (CJK doc/handwriting) | **P1** |
| **HKR (Kazakh+Russian)** | Recognition (handwritten) | Cyrillic (Russian, Kazakh) | **Document** (filled forms) | ~1,500 forms, ~63k sentences | Line/word images + transcriptions | RESEARCH-ONLY / UNCLEAR | Med (Cyrillic doc) | **P1** |
| **XFUND** | Form understanding (KIE) + boxes + text | 7 langs (ZH, JA, ES, FR, IT, DE, PT) | **Document** (forms) | ~199 forms × 7 langs | Boxes + transcriptions + KV labels | RESEARCH-ONLY (CC BY-NC-SA 4.0 — UNVERIFIED exact) | **High** (multilingual doc forms) | **P0** |
| **DDI-100** | Det + recog | Russian (Cyrillic) printed docs | **Document** (synthetic-augmented) | ~100k imgs from 7k pages | Text/stamp masks + char/word boxes + text | RESEARCH-ONLY / UNCLEAR (MIT-ish — verify) | **High** (Cyrillic printed doc) | **P1** |
| **PP-OCR / PaddleOCR training sets** | Det + recog | Multilingual (PP-OCRv5: 100+ langs) | Mixed scene + doc | Large (mixed real + synthetic) | Boxes + transcriptions | Models Apache-2.0; some training data proprietary/synthetic | Med (matches our recognizer) | **P1** |
| FUNSD / SROIE *(counted elsewhere)* | Det + recog + KIE | English | **Document** (forms/receipts) | small | Boxes + transcriptions + KV | RESEARCH-ONLY | High but English-only | (noted) |

---

## 2. Per-dataset detail

### ICDAR2017 MLT — RRC-MLT-2017
- **Task:** Multi-lingual scene text **detection** + script identification.
- **Scripts:** 9 languages across 6 scripts (Arabic, Latin, Chinese, Japanese, Korean, Bangla). A landmark for multiscript localization.
- **Scene vs doc:** Scene text. Useful as a multiscript localization proxy, not document layout.
- **Scale/annotation:** ~18k images, word-level quadrilateral boxes + per-word script labels.
- **License:** RESEARCH-ONLY — competition/registration terms via the Robust Reading site.
- **Access:** RRC portal; paper [IEEE](https://ieeexplore.ieee.org/document/8270168).
- **Doc relevance:** Weak proxy (scene), but the only easy way to validate detector behavior across Arabic/CJK/Bangla simultaneously.
- **Priority: P1** — superseded by MLT-2019 but still cited as a detection baseline.

### ICDAR2019 MLT — RRC-MLT-2019
- **Task:** Detection, cropped-word script classification, joint detect+script, and **end-to-end** detect+recognize ([arXiv:1907.00945](https://arxiv.org/abs/1907.00945)).
- **Scripts:** 10 languages / 7 scripts — adds Hindi (Devanagari) vs the 2017 edition; covers Arabic, Latin, Chinese, Japanese, Korean, Bangla, Devanagari.
- **Scene vs doc:** Scene. Best single multiscript benchmark we have.
- **Scale/annotation:** 20,000 real images + a 277k synthetic set; word boxes + transcriptions + script labels.
- **License:** RESEARCH-ONLY — competition terms.
- **Access:** RRC portal; paper [arXiv](https://arxiv.org/abs/1907.00945), [HF mirror](https://huggingface.co/papers/1907.00945).
- **Doc relevance:** Medium. The most balanced cross-script CER/WER and detection benchmark; the synthetic split helps finetune non-Latin recognition.
- **Priority: P0** — anchor benchmark for multilingual detection + recognition.

### TextOCR
- **Task:** Arbitrary-shaped detection + recognition + end-to-end ([Facebook Research](https://research.facebook.com/publications/textocr-towards-large-scale-end-to-end-reasoning-for-arbitrary-shaped-scene-text/)).
- **Scripts:** English / Latin only.
- **Scene vs doc:** Scene (built on TextVQA images), but **densely** annotated — many words per image, closer to a busy document than most scene sets.
- **Scale/annotation:** ~28k images, ~0.9–1M word annotations; polygons + transcriptions.
- **License:** **PERMISSIVE** — CC BY 4.0 ([HF mirror](https://huggingface.co/datasets/yunusserhat/TextOCR-Dataset)).
- **Access:** [HF](https://huggingface.co/datasets/yunusserhat/TextOCR-Dataset); original via Meta TextOCR site.
- **Doc relevance:** Medium — dense Latin recognition + permissive license make it good for product-safe finetune, but Latin-only.
- **Priority: P1** — the best permissively-licensed dense word recognition set for Latin.

### HierText
- **Task:** Hierarchical text **detection** + layout (word → line → paragraph); pairs with the ICDAR 2023 Hierarchical Text competition.
- **Scripts:** Predominantly Latin; some other scripts present (not a balanced multiscript set).
- **Scene vs doc:** Mixed — drawn from Open Images, but the **line/paragraph hierarchy is the closest public analog to document layout** among "in the wild" sets.
- **Scale/annotation:** ~11.6k images, ~1.2M words, with word/line/paragraph polygons + transcriptions ([repo](https://github.com/google-research-datasets/hiertext), [Open Images extended](http://storage.googleapis.com/openimages/web/extended.html)).
- **License:** **PERMISSIVE** — CC BY-SA 4.0 (annotations); images per Open Images terms. *(SA = share-alike obligation if redistributing derived annotations.)*
- **Access:** [GitHub](https://github.com/google-research-datasets/hiertext).
- **Doc relevance:** **High** — the line/paragraph grouping directly exercises our reading-order and layout logic.
- **Priority: P0** — top permissive choice for validating line/paragraph structure.

### Union14M
- **Task:** Large-scale real-data **recognition** benchmark + training set ([arXiv:2307.08723](https://ar5iv.labs.arxiv.org/html/2307.08723), [project](https://union14m.github.io/)).
- **Scripts:** English / Latin.
- **Scene vs doc:** Scene; emphasizes hard real-world cases (curved, occluded, low-res).
- **Scale/annotation:** ~4M labeled + ~10M unlabeled word images; transcriptions.
- **License:** Code MIT ([repo](https://github.com/Mountchicken/Union14M)); underlying images inherit per-source licenses — treat aggregate as **Mixed / RESEARCH-ONLY** for redistribution.
- **Access:** [GitHub](https://github.com/Mountchicken/Union14M). Used to train [OpenOCR](https://huggingface.co/topdu/OpenOCR).
- **Doc relevance:** Low–medium (Latin scene), but excellent for stress-testing recognizer robustness.
- **Priority: P1** — robustness stress test for Latin recognition.

### COCO-Text
- **Task:** Detection + recognition on MS COCO images ([arXiv:1601.07140](https://arxiv.org/abs/1601.07140)).
- **Scripts:** English / Latin.
- **Scene vs doc:** Scene (incidental text in everyday photos).
- **Scale/annotation:** 63k images, ~145k text instances; word boxes + transcriptions.
- **License:** **PERMISSIVE** — annotations CC BY 4.0 per the [Cornell SE(3) page](https://vision.cornell.edu/se3/coco-text/); images per COCO terms.
- **Access:** [Cornell](https://vision.cornell.edu/se3/coco-text/), [API repo](https://github.com/andreasveit/coco-text).
- **Doc relevance:** Low — incidental scene text; weak document proxy.
- **Priority: optional.**

### ICDAR2015 Incidental Scene Text (Challenge 4)
- **Task:** Detection + recognition + end-to-end on incidental (unposed) text.
- **Scripts:** English / Latin.
- **Scale/annotation:** 1,500 images (1,000 train / 500 test); word-level quadrilateral boxes + transcriptions.
- **License:** RESEARCH-ONLY — competition terms (RRC portal).
- **Doc relevance:** Low; classic localization sanity check.
- **Priority: P1** — universal detection baseline; small and quick to run.

### Total-Text
- **Task:** Detection + recognition + e2e; introduced **curved** text alongside horizontal/multi-oriented ([IJDAR](https://link.springer.com/article/10.1007/s10032-019-00334-z), [repo](https://github.com/cs-chan/Total-Text-Dataset)).
- **Scripts:** Mostly English / Latin.
- **Scale/annotation:** 1,555 images, ~11k instances; polygon boxes + transcriptions.
- **License:** **UNCLEAR / RESEARCH-ONLY** — repo does not state a clear product license; treat as research.
- **Doc relevance:** Low (curved scene text).
- **Priority: optional** — useful for curved-text detector regression only.

### SCUT-CTW1500
- **Task:** Curved-text **detection** (recognition added later).
- **Scripts:** English + some Chinese ([abs](https://ui.adsabs.harvard.edu/abs/2017arXiv171202170Y/abstract)).
- **Scale/annotation:** 1,500 images, ~10k+ text annotations; **line-level** polygons (note: line, not word).
- **License:** **UNCLEAR / RESEARCH-ONLY**.
- **Doc relevance:** Low.
- **Priority: optional.**

### SynthText (SynthText-in-the-Wild)
- **Task:** Synthetic detection + recognition pretraining set.
- **Scripts:** English / Latin (community Cyrillic/other ports exist, e.g. [SynthText-Russian](https://github.com/datanomica/SynthText-Russian)).
- **Scale/annotation:** 800k images, ~8M synthetic word instances; word + char boxes + transcriptions ([overview](https://vercel.hyper.ai/en/datasets/4917)).
- **License:** **RESEARCH-ONLY** — VGG non-commercial research terms.
- **Doc relevance:** Low (pretraining only); the generation *pipeline* is reusable to synthesize document-style multilingual data.
- **Priority: P1** — primary detection/recog pretraining corpus; pipeline reuse for non-Latin synthesis.

### MJSynth / Synth90k
- **Task:** Synthetic **recognition** crops; ~9M images from a 90k English lexicon ([researchgate fig](https://www.researchgate.net/figure/a-MJSynth-MJ-b-SynthText-ST_fig2_369715560)).
- **Scripts:** English / Latin only.
- **License:** **RESEARCH-ONLY** — VGG non-commercial.
- **Doc relevance:** Low; Latin-only pretraining.
- **Priority: optional** (Union14M / real data preferred for finetune).

### KHATT (KFUPM Handwritten Arabic Text)
- **Task:** Offline **handwritten Arabic** recognition (line/paragraph).
- **Scripts:** Arabic.
- **Scene vs doc:** **Document** — scanned handwritten pages at 200/300/600 dpi.
- **Scale/annotation:** 1,000 writers; ~2,000 random + 2,000 fixed paragraphs; ~9,327 lines; verified ground truth at page/paragraph/line levels ([KFUPM](https://pure.kfupm.edu.sa/en/publications/khatt-arabic-offline-handwritten-text-database), [project site](http://khatt.ideas2serve.net/)).
- **License:** **RESEARCH-ONLY** — free for research via the project site; an [LDC variant](https://catalog.ldc.upenn.edu/LDC2015T23) is **GATED**.
- **Doc relevance:** **High** — premier public Arabic document/handwriting OCR set.
- **Priority: P0** — anchor for Arabic document recognition.

### MADCAT (Arabic handwritten documents)
- **Task:** Handwritten Arabic document recognition with line/token coordinates + transcripts + English translations ([LDC2012T15](https://catalog.ldc.upenn.edu/LDC2012T15)).
- **Scripts:** Arabic. Genres: newswire, weblog, newsgroup.
- **License:** **GATED** — LDC catalog (membership/fee).
- **Doc relevance:** High, but access cost makes it secondary for a local-first/open project.
- **Priority: optional** (only if LDC access already exists).

### Bharat Scene Text Dataset (IIT Jodhpur / Bhashini)
- **Task:** Detection, script ID, cropped-word recognition, end-to-end — for **Indian languages** ([HF paper](http://huggingface.co/papers/2511.23071), [repo](https://github.com/Bhashini-IITJ/BharatSceneTextDataset)).
- **Scripts:** 13+ Indic languages/scripts (Devanagari, Bangla, Tamil, Telugu, Kannada, Malayalam, Gujarati, etc.).
- **Scene vs doc:** Scene. Newest large-scale Indic set.
- **License:** **UNCLEAR** — verify on repo before product use.
- **Doc relevance:** Medium (Indic recognition proxy; our biggest script gap after Latin/CJK).
- **Priority: P1** — best current Indic coverage; pair with toolkit [IndicPhotoOCR](https://github.com/Bhashini-IITJ/IndicPhotoOCR).

### IIIT-Indic STR (Devanagari/Telugu/Malayalam + IIIT-ILST)
- **Task:** Recognition benchmarks for Indic scripts ([arXiv:2104.04437](https://ar5iv.labs.arxiv.org/html/2104.04437), [arXiv:2403.08007](https://arxiv.org/html/2403.08007)).
- **Scripts:** Devanagari, Telugu, Malayalam (and related IIIT sets); ~27k+ real word images plus larger synthetic.
- **Scene vs doc:** Scene + synthetic word crops. IIIT also runs document/historical work via [IHDIA](https://ihdia.iiit.ac.in/) and the [NLTM OCR](https://ilocr.iiit.ac.in/) program (printed + handwritten across 13 Indic languages).
- **License:** **RESEARCH-ONLY / UNCLEAR** per source.
- **Doc relevance:** Medium; IHDIA/NLTM are the document-OCR angle for Indic.
- **Priority: P1** — Indic CER/WER, plus IHDIA for printed Devanagari documents.

### ICDAR2019 ArT (Arbitrary-Shaped Text)
- **Task:** Detection + recognition of arbitrary-shaped (curved) text; English + Chinese ([dataset overview](https://vercel.hyper.ai/en/datasets/15809)).
- **Scale/annotation:** ~10k+ images; polygons + transcriptions. Combines Total-Text + CTW1500 + new data.
- **License:** RESEARCH-ONLY — competition terms.
- **Doc relevance:** Low.
- **Priority: optional.**

### RCTW-17 (Reading Chinese Text in the Wild)
- **Task:** Chinese text localization + end-to-end ([arXiv:1708.09585](https://arxiv.org/abs/1708.09585v2)).
- **Scale/annotation:** 12,263 annotated images; quad boxes + transcriptions.
- **License:** RESEARCH-ONLY — competition terms.
- **Doc relevance:** Low–medium (Chinese scene).
- **Priority: optional.**

### ICDAR2019 ReCTS (Reading Chinese Text on Signboard)
- **Task:** Chinese detection + recognition + e2e on signboards ([arXiv:1912.09641](http://arxiv.org/abs/1912.09641)).
- **Scale/annotation:** ~25k images; character- and line-level boxes + transcriptions.
- **License:** RESEARCH-ONLY — competition terms.
- **Doc relevance:** Low.
- **Priority: optional.**

### ICDAR2019 LSVT (Large-scale Street View Text)
- **Task:** Chinese detection + recognition with **partial labeling** ([arXiv:1909.07741](http://arxiv.org/abs/1909.07741)).
- **Scale/annotation:** ~450k images (≈50k fully annotated + ≈400k weakly labeled).
- **License:** RESEARCH-ONLY — competition terms.
- **Doc relevance:** Low.
- **Priority: optional** (large weak-label pool for semi-supervised CJK).

### CASIA-HWDB (Online/Offline Chinese Handwriting)
- **Task:** Handwritten Chinese character + **text-line** recognition ([CASIA DB home](https://nlpr.ia.ac.cn/databases/handwriting/home.html)).
- **Scripts:** Chinese (7,185 characters + 171 symbols).
- **Scene vs doc:** **Document** / handwriting — ~5,090 pages, ~1.35M character samples; ~3.9M isolated-character samples.
- **License:** **RESEARCH-ONLY** — academic-use agreement (free for research).
- **Access:** [CASIA](https://nlpr.ia.ac.cn/databases/handwriting/Offline_database.html); recognition baseline e.g. [PyLaia model](https://huggingface.co/Teklia/pylaia-casia-hwdb2).
- **Doc relevance:** **High** — CJK document/handwriting recognition.
- **Priority: P1** — anchor for Chinese handwritten document OCR.

### HKR — Handwritten Kazakh & Russian
- **Task:** Offline **handwritten** Cyrillic recognition ([Springer](https://link.springer.com/article/10.1007/s11042-021-11399-6)).
- **Scripts:** Cyrillic (≈95% Russian, ≈5% Kazakh; 33 shared chars + 9 Kazakh-specific).
- **Scene vs doc:** **Document** — LaTeX-generated forms filled by ~200 writers; ~1,500 forms, ~63k sentences, ~716k symbols.
- **License:** **RESEARCH-ONLY / UNCLEAR** — verify before product use.
- **Doc relevance:** Medium–high (Cyrillic document/handwriting).
- **Priority: P1** — primary Cyrillic document recognition set. Complementary: [HWR200](https://huggingface.co/datasets/AntiplagiatCompany/HWR200) (200-writer Russian), and a [synthetic Cyrillic post-OCR set](https://arxiv.org/abs/2311.15896v1).

### XFUND (Multilingual Form Understanding)
- **Task:** Multilingual visually-rich **form** understanding — boxes + transcriptions + key-value labels ([Microsoft](https://www.microsoft.com/en-us/research/publication/xfund-a-benchmark-dataset-for-multilingual-visually-rich-form-understanding/), [repo](https://github.com/doc-analysis/XFUND)).
- **Scripts/langs:** 7 languages — Chinese, Japanese, Spanish, French, Italian, German, Portuguese.
- **Scene vs doc:** **Document** (real forms). The strongest *multilingual document* set on this list.
- **Scale/annotation:** ~199 forms per language; boxes + transcriptions + KV pairs.
- **License:** **RESEARCH-ONLY** — commonly distributed CC BY-NC-SA 4.0 (**UNVERIFIED** exact terms; the NC clause is the key constraint). Pairs with English [FUNSD](#).
- **Access:** [GitHub](https://github.com/doc-analysis/XFUND), [HF](https://huggingface.co/datasets/FrancophonIA/XFUND).
- **Doc relevance:** **High** — multilingual forms with text + layout; directly mirrors our use case (minus Arabic/Indic/Cyrillic).
- **Priority: P0** — best multilingual document benchmark for forms.

### DDI-100 (Distorted Document Images)
- **Task:** Document text **detection + recognition** ([paper](https://www.researchgate.net/publication/338228310_DDI-100_Dataset_for_Text_Detection_and_Recognition)).
- **Scripts:** Russian (Cyrillic) printed documents.
- **Scene vs doc:** **Document** — synthetic augmentation over 7,000 real unique pages → 100k+ images.
- **Annotation:** Text + stamp masks, character/word bounding boxes + transcriptions.
- **License:** **RESEARCH-ONLY / UNCLEAR** (repo states MIT-style in places — verify).
- **Doc relevance:** **High** — one of few Cyrillic *printed-document* OCR sets with boxes.
- **Priority: P1** — Cyrillic printed-document detection + recognition.

### PaddleOCR / PP-OCR training data (matches our recognizer)
- **Task:** Detection + recognition; PP-OCRv5 targets multi-scenario, multi-text-type ([PP-OCRv5 multilingual](https://paddlepaddle.github.io/PaddleOCR/main/en/version3.x/algorithm/PP-OCRv5/PP-OCRv5_multi_languages.html), [PaddleOCR 3.0 report](https://arxiv.org/html/2507.05595)).
- **Scripts:** PP-OCRv5 supports 5 core text types (Simplified/Traditional Chinese, English, Japanese, Pinyin) with multilingual recognition across **100+ languages** (Korean, Spanish, French, German, Italian, Russian, Thai, Greek, etc.).
- **Scene vs doc:** Mixed; PP-OCRv4_server_rec_doc explicitly adds Chinese **document** data and 15,000+ characters.
- **License:** **Models Apache-2.0**; underlying training data is partly proprietary/synthetic — not fully redistributable.
- **Doc relevance:** Medium — aligns finetune format/charset with our deployed recognizer.
- **Priority: P1** — use the official label format + language dictionaries; do not assume training data is open.

### FUNSD / SROIE (overlap — counted elsewhere)
- English **document** forms (FUNSD) and receipts (SROIE) with boxes + transcriptions + KIE. RESEARCH-ONLY. High document relevance but **English-only**, so they do not advance multilingual coverage. Noted to avoid double-counting; see existing benchmark logs. (No deep dive here.)

---

## 3. Multilingual coverage map

**Well covered (multiple sets, including some document/handwriting):**
- **Latin / English** — saturated: TextOCR (CC BY), COCO-Text (CC BY), ICDAR2015, Total-Text, SynthText, MJSynth, Union14M, HierText.
- **Chinese (Han)** — strong: RCTW-17, ReCTS, ArT, LSVT (scene) + **CASIA-HWDB** (document/handwriting). PP-OCRv5 native.
- **Japanese / Korean** — covered via MLT-2017/2019 + PP-OCRv5.
- **Arabic** — covered for *handwriting/document*: **KHATT** (research-free) + MADCAT (gated) + MLT scene presence.

**Moderate (usually scene-only, or single-source, or research-locked):**
- **Cyrillic / Russian** — **HKR** + **DDI-100** + HF handwriting sets. Mostly handwriting/synthetic; printed-doc detection thin but DDI-100 helps.
- **Devanagari & other Indic** — **Bharat Scene Text**, **IIIT-Indic**, IHDIA/NLTM. Mostly scene + synthetic; document-printed Indic is emerging (IHDIA).
- **Bangla** — present in MLT-2017/2019 + Bharat/IIIT.

**Gaps (weak or no good annotated detection/recognition data we found):**
- **Thai, Khmer, Burmese, Lao, Sinhala, Tibetan, Ethiopic/Amharic** — supported by PP-OCRv5 inference but **no strong public annotated detection/recognition document sets** identified. Thai especially: recognizer support exists, evaluation data does not.
- **Printed Arabic documents with boxes** — scarce/gated (MADCAT gated; KHATT is handwriting). Printed-Arabic *scene* exists via MLT but printed-doc localization data is thin.
- **RTL document layout** beyond Arabic handwriting — under-served.
- **Cyrillic printed-document detection** at scale — only DDI-100 (synthetic-augmented).
- **Low-resource African scripts (N'Ko, Vai, Adlam)** — effectively absent.
- **Commercially-clean (permissive) non-Latin document data** — the biggest practical gap: nearly all non-Latin document sets are RESEARCH-ONLY, NC, or GATED.

---

## 4. Best for **document OCR** (not scene text) — picks

Ranked by directness to messy multilingual *documents* (not scene photos):

1. **XFUND** — *best multilingual document pick.* Real forms in 7 languages with boxes + transcriptions + KV. Caveat: likely NC license (eval/finetune internally, not redistribution); no Arabic/Indic/Cyrillic.
2. **HierText** — *best permissive pick.* CC BY-SA, word/line/paragraph hierarchy exercises layout + reading order; mostly Latin though.
3. **KHATT** — *best Arabic document pick.* Research-free handwritten Arabic with page/para/line ground truth.
4. **CASIA-HWDB** — *best CJK document/handwriting pick.* Page-level + line-level Chinese handwriting.
5. **DDI-100** — *best Cyrillic printed-document pick.* Masks + char/word boxes + text on distorted pages.
6. **PP-OCR doc training format** — align our finetune to PP-OCRv4_server_rec_doc charset/labels (Apache-2.0 models) even though raw data isn't open.

**Practical program for DocuTract:**
- Detection finetune/validation: **HierText** (permissive, layout) + **MLT-2019** (multiscript) + **ICDAR2015** (sanity).
- Recognition CER/WER by script: **MLT-2019** (broad), **KHATT** (Arabic), **CASIA-HWDB** (Chinese), **HKR/DDI-100** (Cyrillic), **Bharat/IIIT** (Indic), **TextOCR** (permissive Latin).
- Document forms (closest to product): **XFUND** + FUNSD/SROIE (English, already counted).
- Fill script gaps (Thai/Khmer/etc.) with **synthetic generation** (SynthText-style pipeline) since annotated real data is missing.

**License reality check:** of the document/multilingual sets, only **HierText (CC BY-SA)**, **TextOCR (CC BY)**, and **COCO-Text (CC BY)** are cleanly permissive — and all three are Latin-heavy. Every strong non-Latin document set (KHATT, CASIA-HWDB, XFUND, DDI-100, MLT, Bharat) is **RESEARCH-ONLY, NC, GATED, or UNCLEAR**. For a local-first / open product, treat non-Latin document data as eval/finetune-only and lean on synthetic generation + PP-OCRv5's permissive models for shippable coverage.
