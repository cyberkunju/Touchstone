# Synthetic Document Engines, Corpora, Teachers & Degradation Tools — R&D Dossier

> Mission: "build it or buy it — and can we make it more REAL?" Our hand-rolled generator
> (`training/synthgen/`) produces decent-but-non-photorealistic docs across passport /
> license / invoice / form / certificate / statement categories with a 12-class detector
> label set (`docdet-v0`). The strategic problem is the **sim2real gap** wrecking our
> real-bad-passport performance.
>
> This dossier scouts three levers:
> - **(A) Generators / engines + pre-generated corpora** — can we replace or augment our generator?
> - **(B) Offline "teacher" models** — run locally to pseudo-label REAL documents (distillation bridge to real accuracy). Teachers NEVER ship to the edge, so their size/latency is irrelevant; only **what they can label** and **weight licensing/gating** matter.
> - **(C) Degradation simulators** — cheap realism upgrades to bolt onto OUR generator.
>
> **Our detector classes referenced below** (`docdet-v0`, stable IDs): `document_page`,
> `photo`, `signature`, `stamp`, `seal`, `logo`, `qr_code`, `barcode`, `mrz_zone`,
> `table`, `checkbox`, `text_block` (`training/synthgen/config.py`).
>
> **License is classified two ways**, as the brief demands:
> 1. **TOOL/WEIGHTS license** — can we run the generator/model at all? (PERMISSIVE = MIT/Apache/BSD; COPYLEFT = GPL/AGPL/LGPL; NON-COMMERCIAL = CC-NC / research-only / gated; GATED = click-through/registered weights).
> 2. **OUTPUT license** — are the GENERATED images/labels encumbered, or are they ours to keep and ship?
>
> Where a license could not be confirmed from source it is marked **UNVERIFIED**.
>
> _Source descriptions paraphrased for licensing compliance (≤30 consecutive words/source); all claims linked inline._

---

## Summary Table

### A. Synthetic generators / engines

| # | Name | Type | Produces (our-class relevance) | Realism | Scale/throughput | TOOL license | OUTPUT license | Access | Verdict | Priority |
|---|------|------|-------------------------------|---------|------------------|--------------|----------------|--------|---------|----------|
| 1 | **SynthDoG** (Donut) | generator | Full-page docs w/ text layout; weak on `photo`/`mrz_zone`/`stamp`/`seal` semantics | Medium (paper-on-background, synthetic text) | High, on-the-fly | **MIT** | **Yours (unencumbered)** | [GitHub clovaai/donut](https://github.com/clovaai/donut), [pip synthdog](https://pypi.org/project/synthdog/) | **Borrow ideas** (multilingual text rendering) | P1 |
| 2 | **DocLayout-YOLO generator** → **DocSynth300K** | generator + corpus | Layout regions → maps loosely to `text_block`/`table`/`photo`(figure) | Medium (diverse layouts, not photoreal capture) | 300K pre-gen images | **AGPL-3.0** (copyleft) | **UNVERIFIED** (tied to AGPL repo) | [GitHub opendatalab/DocLayout-YOLO](https://github.com/opendatalab/DocLayout-YOLO) | **Borrow ideas** (layout diversity); AGPL blocks shipping | P1 |
| 3 | **TextRecognitionDataGenerator (TRDG)** | generator | Cropped text-line images → feeds OCR / `text_block`, `mrz_zone` line synthesis | Low (text crops, not full docs) | High, on-the-fly | **MIT** | **Yours** | [GitHub Belval/TRDG](https://github.com/Belval/TextRecognitionDataGenerator), [pip trdg](https://pypi.org/project/trdg/) | **Adopt** (MRZ/field text-line minting) | P1 |
| 4 | **SynthTIGER** (NAVER) | generator | Text-line images, refined SynthText successor → OCR / `text_block` | Low–Medium | High | **MIT** | **Yours** | [arXiv 2107.09313](https://arxiv.org/abs/2107.09313) | **Borrow ideas** | optional |
| 5 | **SynthText** (VGG) | generator | Text composited into natural scenes → scene-text, weak doc fit | Medium (scene text) | 800K pre-gen images | code permissive; **dataset research-only** | **Research-only (UNVERIFIED)** | [GitHub ankush-me/SynthText](https://github.com/ankush-me/SynthText) | **Ignore** for docs | optional |
| 6 | **SynthText3D** | generator | Scene text from 3D engine (Unreal) → realistic lighting/occlusion ideas | Medium-High (3D lighting) | Engine-bound | **UNVERIFIED** | UNVERIFIED | [GitHub MhLiao/SynthText3D](https://github.com/MhLiao/SynthText3D) | **Borrow ideas** (lighting only) | optional |
| 7 | **DocXPand generator** | generator | ID/passport templates on real backgrounds → `document_page`, `photo`, `mrz_zone`, fields | Medium-High (ID-specific) | ~25k pre-gen ref set | **MIT** (generator) | **Yours** (dataset itself is CC-BY-NC-SA) | [GitHub QuickSign/docxpand](https://github.com/QuickSign/docxpand) | **Adopt** (ID-specific, see `ids_passports.md` #4) | **P0** |
| 8 | **DocSim** (AI4Bharat) | generator | Templated text docs w/ ground truth | Low-Medium | On-the-fly | **GPL-3.0** (copyleft) | **UNVERIFIED** | [GitHub AI4Bharat/DocSim](https://github.com/AI4Bharat/DocSim) | **Ignore** (GPL + we already do this) | optional |
| 9 | **genalog** (Microsoft) | generator + degrade | Synthetic "analog/scanned" text docs + degradations | Medium | On-the-fly | **MIT** | **Yours** | [microsoft.github.io/genalog](https://microsoft.github.io/genalog/) | **Borrow ideas** | optional |

### B. Pre-generated corpora at scale

| # | Name | Type | Gives us | Realism | Scale | License (data) | Access | Verdict | Priority |
|---|------|------|----------|---------|-------|----------------|--------|---------|----------|
| 10 | **DocSynth300K** | corpus | Layout regions (figure/table/text) | Medium | ~300K imgs | **UNVERIFIED** (AGPL repo) | [HF/opendatalab](https://github.com/opendatalab/DocLayout-YOLO) | **Borrow** (pretraining only) | P1 |
| 11 | **SynthTabNet** (IBM) | corpus | `table` structure + cell content, 4 visual styles | Medium | ~600K imgs | **UNVERIFIED** (verify; sibling FinTabNet is CDLA-Permissive) | [GitHub IBM/SynthTabNet](https://github.com/IBM/SynthTabNet) | **Adopt** for `table` teacher pretrain | P1 |
| 12 | **DocXPand-25k** | corpus | ID `document_page`/`photo`/fields | Medium-High | ~25K imgs | **CC-BY-NC-SA-4.0** (research-only) | [GitHub QuickSign/docxpand](https://github.com/QuickSign/docxpand) | **Borrow** (regenerate via MIT tool instead) | P1 |
| 13 | **IDNet** | corpus | Synthetic ID + tamper/fraud labels | Medium | ~837K imgs / 490GB | **UNVERIFIED** | HF `cactuslab/IDNet-2025` | **Borrow** (see `ids_passports.md` #5) | P1 |

### C. Teacher models for offline pseudo-labeling / distillation

| # | Model | Size | Can label (our-class relevance) | WEIGHTS license/gating | Access | Verdict | Priority |
|---|-------|------|--------------------------------|------------------------|--------|---------|----------|
| 14 | **DocLayout-YOLO** | ~‎nano/small | **Boxes**: layout → `text_block`, `table`, `photo`(figure) | **AGPL-3.0** (copyleft — offline-only OK, never ship) | [GitHub](https://github.com/opendatalab/DocLayout-YOLO), HF | **Adopt** (layout box teacher) | **P0** |
| 15 | **Qwen2.5-VL-7B-Instruct** | 7B | **Text + KV + tables + boxes (grounding)**; reads MRZ text, fields | **Apache-2.0** ✅ | [HF Qwen/Qwen2.5-VL-7B-Instruct](https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct) | **Adopt** (primary KV/text/MRZ teacher) | **P0** |
| 16 | **Qwen2.5-VL-72B** | 72B | Same, higher accuracy | **Qwen license** (commercial OK if <100M MAU; not pure-OSS) | [GitHub QwenLM/Qwen2.5-VL](https://github.com/QwenLM/Qwen2.5-VL) | **Borrow** (accuracy ceiling runs) | P1 |
| 17 | **Qwen2.5-VL-3B** | 3B | Same | **Qwen Research License — NON-COMMERCIAL** ⚠️ | HF | **Ignore** (NC blocks commercial distillation) | optional |
| 18 | **GOT-OCR2.0** | ~580M | **Text/OCR**: plain+formatted doc OCR, tables, formulas → `text_block`, `mrz_zone`, `table` | **Apache-2.0** ✅ | [HF stepfun-ai/GOT-OCR2_0](https://huggingface.co/stepfun-ai/GOT-OCR2_0) | **Adopt** (lightweight OCR teacher) | **P0** |
| 19 | **Florence-2 (base/large)** | 0.23B/0.77B | **Boxes + OCR + grounding + region captions** → `text_block`, `photo`, detection seeds | **MIT** ✅ | [HF microsoft/Florence-2-large](https://huggingface.co/microsoft/Florence-2-large) | **Adopt** (cheap box+OCR teacher) | **P0** |
| 20 | **GLM-OCR** (Zhipu) | ~0.9B | **Text/doc parsing**, SOTA OmniDocBench small-model → `text_block`, `table`, `mrz_zone` | **MIT** ✅ (GLM family MIT) | [HF zai-org/GLM-OCR](https://huggingface.co/zai-org/GLM-OCR) | **Adopt/eval** (tiny, permissive OCR teacher) | P1 |
| 21 | **Donut** | ~200M | **KV/parse** (OCR-free doc parsing) → field JSON, weak boxes | **MIT** ✅ | [HF clovaai/donut](https://github.com/clovaai/donut) | **Borrow** (KV parse only) | P1 |
| 22 | **LayoutLMv3** | base/large | Token-level layout + KV (needs OCR boxes in) → `text_block`, KV | **CC-BY-NC-SA-4.0 — NON-COMMERCIAL** ⚠️ | [HF microsoft/layoutlmv3-base](https://huggingface.co/microsoft/layoutlmv3-base) | **Ignore** (NC license) | optional |
| 23 | **DiT** (Document Image Transformer) | base/large | Backbone for layout **detection** (w/ Cascade R-CNN) + doc classification | **UNVERIFIED** (microsoft/unilm; code MIT, weights unclear) | [HF microsoft/dit-base](https://huggingface.co/microsoft/dit-base) | **Borrow** (backbone, not turnkey teacher) | optional |
| 24 | **InternVL3 / InternVL2.5** | 1B–78B | **Text + KV + grounding boxes** | Code MIT; **weights inherit base LLM** (larger = Qwen/Tongyi license) ⚠️ | [HF OpenGVLab/InternVL](https://huggingface.co/OpenGVLab) | **Borrow** (small sizes only; check base) | optional |
| 25 | **PaliGemma / PaliGemma 2** | 3B | **OCR + detection + segmentation + VQA** | **Gemma license — GATED + custom use terms** ⚠️ | [HF google/paligemma2](https://huggingface.co/google/paligemma2-3b-mix-448), [Gemma terms](https://ai.google.dev/gemma/terms) | **Ignore** (gated + custom restrictions) | optional |

### D. Degradation / capture-realism simulators

| # | Name | Type | Adds | TOOL license | OUTPUT | Access | Verdict | Priority |
|---|------|------|------|--------------|--------|--------|---------|----------|
| 26 | **Augraphy** | degradation | 26+ print/scan/fax/ink/paper degradations (label-preserving) | **MIT** ✅ | **Yours** | [GitHub sparkfish/augraphy](https://github.com/sparkfish/augraphy), [pip](https://pypi.org/project/Augraphy/) | **Adopt** (drop-in realism) | **P0** |
| 27 | **DocCreator** | generator + degrade | Paper texture, bleed-through, ink degradation, 3D page mesh | **LGPL** | **Yours** (GT generated) | [GitHub DocCreator/DocCreator](https://github.com/DocCreator/DocCreator) | **Borrow ideas** (bleed-through, 3D mesh) | P1 |
| 28 | **ocrodeg** (NVlabs) | degradation | OCR-focused distortions (blur, ruling, random warps) | check repo (UNVERIFIED) | Yours | [GitHub NVlabs/ocrodeg](https://github.com/NVlabs/ocrodeg) | **Borrow ideas** | optional |
| 29 | **genalog** (Microsoft) | degradation | Scanned-analog noise + text degradation | **MIT** ✅ | Yours | [microsoft.github.io/genalog](https://microsoft.github.io/genalog/) | **Borrow ideas** | optional |

---

## Per-Item Dossiers

### A. Generators / Engines

#### 1. SynthDoG — Donut's synthetic document generator
- **Type:** generator (on-the-fly). Renders text from a corpus over background/paper images, with layout heuristics, to train OCR-free understanding ([clovaai/donut](https://github.com/clovaai/donut), [pip synthdog](https://pypi.org/project/synthdog/)).
- **Produces / our-class fit:** full-page text documents — strong for `text_block` and generic `document_page`. It does **not** semantically model `photo`, `mrz_zone`, `stamp`, `seal`, `barcode`, `qr_code` — it's a text-layout renderer, not an ID engine.
- **Realism:** Medium. Synthetic glyphs over paper textures; not photoreal phone-capture.
- **License (both ways):** code is **MIT** ([donut-python PyPI: MIT](https://pypi.org/project/donut-python/1.0.1)). **Outputs are unencumbered — ours to ship.**
- **Verdict:** **Borrow ideas.** Its multilingual corpus-driven text rendering and background compositing are worth mirroring, but our `synthgen` already does category-aware layout it cannot. Don't replace; cherry-pick the i18n text engine.
- **Priority:** P1.

#### 2. DocLayout-YOLO generator → DocSynth300K
- **Type:** generator + 300K pre-generated corpus. A "mesh"-style synthetic pipeline that maximizes **layout diversity** to pretrain a layout detector ([arXiv 2410.12628](https://arxiv.org/abs/2410.12628), [OpenReview](https://openreview.net/forum?id=k0X4m9GAQV)).
- **Produces / our-class fit:** layout element boxes (text, table, figure, title) — maps loosely to `text_block`, `table`, and `photo` (figure). No ID-document semantics.
- **Realism:** Medium — diverse layouts, but born-digital rendering, not capture-degraded.
- **License:** the repo/model are **AGPL-3.0** ([GitHub opendatalab/DocLayout-YOLO — AGPL-3.0](https://github.com/opendatalab/DocLayout-YOLO)). AGPL is strong copyleft: fine to run **offline** as a teacher, but **cannot be embedded/shipped** in a closed product, and outputs/derived-weights provenance must be tracked. DocSynth300K data license is **UNVERIFIED** — treat as tied to the AGPL repo.
- **Verdict:** **Borrow ideas** for layout diversity + **adopt as offline box teacher** (see #14). Do not ship.
- **Priority:** P1 (corpus), P0 (as teacher).

#### 3. TextRecognitionDataGenerator (TRDG)
- **Type:** generator for **text-line crops** ([Belval/TRDG](https://github.com/Belval/TextRecognitionDataGenerator), [pip trdg](https://pypi.org/project/trdg/1.5.0/)).
- **Produces / our-class fit:** rendered text-line images with fonts, skew, distortions, backgrounds. Directly useful to **mint MRZ lines** (OCR-B font), field labels/values for `text_block`, and OCR-recognizer training crops. Not full-document.
- **Realism:** Low at doc level (crops), but flexible per-line distortion.
- **License:** **MIT** ([fork confirms MIT](https://github.com/afifmansor/TextRecognitionDataGenerator-1); [trdg PyPI: MIT](https://pypi.org/project/trdg/1.5.0/)). **Outputs ours.**
- **Verdict:** **Adopt** as a focused sub-tool — feed our `mrz.py` and field synthesis with TRDG-rendered OCR-B/MRZ text lines and varied fonts to widen text realism cheaply.
- **Priority:** P1.

#### 4. SynthTIGER (NAVER)
- **Type:** generator, an engineered successor to SynthText/MJSynth for text recognition; reportedly beats the MJ+ST combo on STR ([arXiv 2107.09313](https://arxiv.org/abs/2107.09313)).
- **Our-class fit:** OCR/`text_block` text-line synthesis. **MIT** licensed → outputs ours.
- **Verdict:** **Borrow ideas** (its text-shape/color/texture sampling), overlaps TRDG. Optional.

#### 5. SynthText (VGG)
- **Type:** generator — composites text into natural scene photos with geometry/lighting awareness ([ankush-me/SynthText](https://github.com/ankush-me/SynthText)). ~800K image corpus, ~8M word instances ([dataset note](https://vercel.hyper.ai/en/datasets/4917)).
- **Our-class fit:** scene-text detection, **poor fit for documents** (no doc layout, no ID semantics).
- **License:** generator code permissive; the **packaged 800K dataset is research/non-commercial — UNVERIFIED exact terms.**
- **Verdict:** **Ignore** for our document use case.

#### 6. SynthText3D
- **Type:** generator synthesizing scene text from a 3D engine (Unreal), giving physically-plausible illumination, occlusion, perspective ([ar5iv 1907.06007](https://ar5iv.labs.arxiv.org/html/1907.06007), [MhLiao/SynthText3D](https://github.com/MhLiao/SynthText3D)).
- **Our-class fit:** scene text, not docs — but the **lighting/illumination modeling** is the valuable idea for closing sim2real on glare/shadow.
- **License:** **UNVERIFIED.**
- **Verdict:** **Borrow ideas** (lighting realism only). Optional.

#### 7. DocXPand generator (ID-specific) — also covered in `ids_passports.md` #4
- **Type:** ID/passport generator compositing templates onto real backgrounds with field annotations ([arXiv 2407.20662](https://arxiv.org/abs/2407.20662v1), [QuickSign/docxpand](https://github.com/QuickSign/docxpand)).
- **Our-class fit (best of the generators for us):** `document_page`, `photo`, `mrz_zone`, plus field-level boxes — directly our weak passport area.
- **License (the key nuance):** **generator is MIT**, but the published **DocXPand-25k dataset is CC-BY-NC-SA-4.0** (non-commercial + viral). So: **run the MIT generator ourselves → outputs are ours**, sidestepping the NC-SA dataset license.
- **Verdict:** **Adopt** — best path to a redistributable, ID-specific synthetic corpus with MRZ + portrait semantics.
- **Priority:** **P0.**

#### 8. DocSim (AI4Bharat)
- **Type:** templated random-text document generator with ground truth ([AI4Bharat/DocSim](https://github.com/AI4Bharat/DocSim)).
- **License:** **GPL-3.0** (copyleft).
- **Verdict:** **Ignore** — duplicates what our `synthgen` already does, and GPL adds friction.

#### 9. genalog (Microsoft) — also a degradation tool (#29)
- **Type:** generates synthetic "analog/scanned" text docs and applies text degradations ([microsoft.github.io/genalog](https://microsoft.github.io/genalog/)).
- **License:** **MIT**, outputs ours.
- **Verdict:** **Borrow ideas** for scanned-analog noise; overlaps Augraphy which is stronger.

---

### B. Pre-generated corpora

#### 10. DocSynth300K
- ~300K diverse synthetic layout pages used to pretrain DocLayout-YOLO ([arXiv 2410.12628](https://arxiv.org/abs/2410.12628)). Good for **layout-detector pretraining** (`text_block`/`table`/`photo`-figure), weak on capture realism and silent on ID semantics. Data license **UNVERIFIED** (AGPL repo). **Borrow** for pretrain only.

#### 11. SynthTabNet (IBM)
- ~600K synthetic table images across **four visual appearance styles** with structure + cell annotations ([IBM/SynthTabNet](https://github.com/ibm/synthtabnet)). Directly feeds a **`table` teacher** and our table pipeline. License **UNVERIFIED** — verify before redistribution (IBM's sibling FinTabNet is **CDLA-Permissive** per [HF FinTabNet.c](https://huggingface.co/datasets/bsmock/FinTabNet.c), but do not assume SynthTabNet matches). **Adopt** for table-teacher pretraining pending license check.
- **Priority:** P1.

#### 12. DocXPand-25k
- ~25K NC-SA ID images (see #7 / `ids_passports.md` #4). **Borrow** — but prefer regenerating via the MIT generator to avoid CC-BY-NC-SA.

#### 13. IDNet
- ~837K synthetic IDs with fraud/tamper labels ([arXiv 2408.01690](https://arxiv.org/abs/2408.01690)); details and license caveats in `ids_passports.md` #5. **Borrow** for tamper primitives.

---

### C. Teacher models (offline pseudo-labeling) — edge-irrelevant by design

> Teachers run on our GPUs to label REAL documents (phone-captured passports, scans),
> producing pseudo-labels we distill into the shipped edge models. They are **never
> deployed**, so model size/latency does not matter — only **labeling capability** and
> **weight licensing/gating** (a teacher's license can still taint pseudo-labels and
> downstream weights, so we screen it).

#### 14. DocLayout-YOLO — layout BOX teacher
- **Labels:** bounding boxes for layout regions → seeds `text_block`, `table`, and `photo`(figure). Fast, runs on modest GPU.
- **Weights license:** **AGPL-3.0** ([GitHub](https://github.com/opendatalab/DocLayout-YOLO)). Offline-only use is acceptable; **do not ship the model or link it into the product**. Treat AGPL as a provenance flag on any weights trained directly on its outputs — prefer it as a *box proposer* cross-checked by a permissive teacher.
- **Verdict:** **Adopt** for offline box pseudo-labels on real docs. **P0.**

#### 15. Qwen2.5-VL-7B-Instruct — primary KV/text/MRZ teacher
- **Labels:** transcribes text, reads **MRZ lines**, extracts **key-value fields**, parses **tables**, and supports **visual grounding (boxes)** — the broadest single labeler for our needs ([HF Qwen2.5-VL-7B](https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct), [GitHub](https://github.com/QwenLM/Qwen2.5-VL)).
- **Weights license:** **Apache-2.0** for the **7B** specifically — confirmed clean for commercial distillation ([The Batch / DeepLearning.AI: 7B is Apache-2.0; 3B non-commercial; 72B <100M MAU](https://deeplearning.ai/the-batch/alibaba-debuts-qwen2-5-vl-a-powerful-family-of-open-vision-language-models)).
- **Verdict:** **Adopt** as the primary VLM teacher for passport/ID field + MRZ pseudo-labels. **P0.**

#### 16. Qwen2.5-VL-72B — accuracy-ceiling teacher
- Same capabilities, higher accuracy. **License: Qwen/Tongyi Qianwen** — commercial use permitted only **under 100M monthly active users** ([The Batch](https://deeplearning.ai/the-batch/alibaba-debuts-qwen2-5-vl-a-powerful-family-of-open-vision-language-models), [Tongyi Qianwen LICENSE](https://huggingface.co/Qwen/Qwen2-72B/blob/main/LICENSE)). Not pure OSS. **Borrow** for occasional high-accuracy labeling/agreement checks. P1.

#### 17. Qwen2.5-VL-3B — **avoid**
- Capable but under a **Qwen Research License (non-commercial)** ([The Batch](https://deeplearning.ai/the-batch/alibaba-debuts-qwen2-5-vl-a-powerful-family-of-open-vision-language-models)). NC taints commercial pseudo-labels. **Ignore.**

#### 18. GOT-OCR2.0 — lightweight OCR teacher
- **Labels:** plain + formatted document OCR, plus tables, formulas, charts → strong for `text_block`, `mrz_zone` text, `table` content ([HF stepfun-ai/GOT-OCR2_0](https://huggingface.co/stepfun-ai/GOT-OCR2_0)).
- **Weights license:** **Apache-2.0** ([model card license tag](https://huggingface.co/XiaHan19/GOT-OCR2_0)). Clean.
- **Verdict:** **Adopt** as the compact, permissive OCR transcription teacher (~580M). **P0.**

#### 19. Florence-2 (base/large) — cheap box + OCR + grounding teacher
- **Labels:** detection boxes, region captions, OCR, and phrase grounding from prompts → seeds `text_block`/`photo` boxes and OCR ([HF microsoft/Florence-2-large](https://huggingface.co/microsoft/Florence-2-large)).
- **Weights license:** **MIT**, commercial-OK ([Roboflow: Florence-2 is MIT](https://blog.roboflow.com/florence-2-ocr/), [LICENSE](https://huggingface.co/microsoft/Florence-2-base-ft/blob/main/LICENSE)). Tiny (0.23B/0.77B).
- **Verdict:** **Adopt** as a permissive multi-task box+OCR teacher; pairs well with Qwen for cross-agreement. **P0.**

#### 20. GLM-OCR (Zhipu) — tiny permissive OCR teacher
- **Labels:** document parsing/OCR; ~0.9B params reportedly topping OmniDocBench among small models ([HF zai-org/GLM-OCR](https://huggingface.co/zai-org/GLM-OCR), [z.ai docs](https://docs.z.ai/guides/vlm/glm-ocr)) → `text_block`, `table`, `mrz_zone` text.
- **Weights license:** GLM family is **MIT** ([StableLearn: GLM under MIT](https://www.stable-learn.com/en/glm-45-usage-tech-reports/)) — confirm the GLM-OCR repo's own LICENSE tag, marked **verify-before-rely**.
- **Verdict:** **Adopt/eval** as a tiny, fast, permissive OCR teacher. P1.

#### 21. Donut — KV/parse teacher
- **Labels:** OCR-free document parsing to structured JSON (KV) → field hypotheses, weak on boxes ([clovaai/donut](https://github.com/clovaai/donut)). **MIT.** **Borrow** for KV parse where fine-tuned variants exist. P1.

#### 22. LayoutLMv3 — **avoid (license)**
- Token-level layout + KV given OCR boxes, strong on form/receipt understanding ([researchgate](https://www.researchgate.net/publication/360030234)). **Weights are CC-BY-NC-SA-4.0 — non-commercial** ([HF microsoft/layoutlmv3-base license tag](https://huggingface.co/microsoft/layoutlmv3-base/tree/main)). NC + ShareAlike taints commercial distillation. **Ignore.**

#### 23. DiT (Document Image Transformer) — backbone, not turnkey
- A BERT-like masked-image-modeling encoder pretrained on 42M doc images (IIT-CDIP); used as a **detection backbone** (Cascade R-CNN) for layout and for doc classification ([HF microsoft/dit-base](https://huggingface.co/microsoft/dit-base), [dit-finetuned-rvlcdip](https://huggingface.co/microsoft/dit-base-finetuned-rvlcdip)). Not a standalone labeler — needs a detection head. License **UNVERIFIED** (microsoft/unilm code is MIT; weight terms unclear). **Borrow** if we build a custom layout detector. Optional.

#### 24. InternVL3 / InternVL2.5 — capable, license depends on size
- Strong open VLM family (text, KV, grounding boxes) ([OpenGVLab/InternVL](https://github.com/OpenGVLab/InternVL)). **Code MIT, but weights inherit the base LLM**: larger checkpoints embed Qwen/InternLM and carry **Qwen/Tongyi license** terms ([InternVL2_5-78B LICENSE references Qwen](https://huggingface.co/OpenGVLab/InternVL2_5-78B-MPO/blob/main/LICENSE)). **Borrow** small variants after confirming the base model's license. Optional.

#### 25. PaliGemma / PaliGemma 2 — **avoid (gated + custom terms)**
- Versatile OCR + detection + segmentation + VQA ([HF google/paligemma2-3b-mix-448](https://huggingface.co/google/paligemma2-3b-mix-448)). **Weights are GATED behind the Gemma license** with custom use restrictions and click-through acceptance ([Gemma terms](https://ai.google.dev/gemma/terms)); several fine-tunes are tagged "research purposes only." Too much licensing friction vs. Apache/MIT alternatives. **Ignore.**

---

### D. Degradation / capture-realism simulators

#### 26. Augraphy — the realism upgrade for OUR generator
- **Type:** a document-specific augmentation library producing print/scan/fax/photocopy/ink-bleed/paper-texture distortions; ~26 augmentations purpose-built for documents ([sparkfish/augraphy](https://github.com/sparkfish/augraphy), [arXiv 2208.14558](https://ar5iv.labs.arxiv.org/html/2208.14558), [arXiv 2502.06132 notes 26 augmentations](https://arxiv.org/html/2502.06132v1)).
- **Why it matters:** it simulates exactly the **office/scan/print artifacts our `augment.py` lacks** — ink bleed-through, toner specks, dirty rollers, paper fibers, dithering — which are core to the sim2real gap on real captured docs.
- **License:** **MIT** ([pip Augraphy](https://pypi.org/project/Augraphy/8.2.6/)) → **outputs ours**, drop-in.
- **Integration:** our `augment.py` already does geometry (perspective/curl/rotate) + photometric (glare/shadow/blur/jpeg). Augraphy is **complementary, not overlapping** — chain it as a photometric stage on the composited frame **before** our JPEG/exposure ops, keeping geometry (and thus labels) untouched.
- **Verdict:** **Adopt.** Highest realism-per-effort. **P0.**

#### 27. DocCreator
- **Type:** DIAR tool generating synthetic ground-truthed document images with degradation models — paper texture, **bleed-through**, ink degradation, and a **3D page-mesh warp** ([DocCreator/DocCreator](https://github.com/DocCreator/DocCreator), [MDPI](https://www.mdpi.com/2313-433X/3/4/62/xml)).
- **License:** **LGPL** ([AUR doccreator-git: LGPL](https://aur.archlinux.org/packages/doccreator-git)) — dynamic-link/offline use fine; outputs ours.
- **Verdict:** **Borrow ideas** — port its **bleed-through and 3D mesh warp** concepts into `augment.py` (our `curl` is only a 1D sinusoid; a real mesh bend is more convincing). P1.

#### 28. ocrodeg (NVlabs)
- OCR-focused degradations: blur, random ruling, fibrous noise, elastic warps ([NVlabs/ocrodeg](https://github.com/NVlabs/ocrodeg)). License **UNVERIFIED**. **Borrow ideas** (elastic warps). Optional.

#### 29. genalog (Microsoft)
- MIT analog-scan noise + text degradation ([microsoft.github.io/genalog](https://microsoft.github.io/genalog/)). Overlaps Augraphy; **borrow ideas** only. Optional.

---

## Upgrade OUR Generator With These 3 Things

Our `synthgen` is already strong on **category-aware layout + label-preserving geometry**
(`augment.py`: perspective, curl, rotate, glare, shadow, blur, jpeg, fold, stain). The
gap is **material/print realism** and **ID-specific fidelity**. Three high-leverage,
license-clean additions:

1. **Bolt on Augraphy (MIT) as a photometric stage — DO THIS FIRST.** It adds the
   print/scan/photocopy/ink-bleed/paper-fiber artifacts we don't model, the dominant
   sim2real gap on real captured/scanned docs. Chain Augraphy on the composited RGB frame
   **after** geometry and **before** our final JPEG/exposure ops so annotation polygons
   stay pixel-accurate (Augraphy's ink/paper ops are geometry-preserving). ~1 day of
   integration, outputs fully ours. ([sparkfish/augraphy](https://github.com/sparkfish/augraphy), MIT)

2. **Mint realistic MRZ + field text with TRDG (MIT), and adopt DocXPand's MIT ID
   generator for passport fidelity.** TRDG renders OCR-B MRZ lines and varied-font field
   values that beat our current text rendering for `mrz_zone`/`text_block`; DocXPand's
   MIT generator gives template-accurate ID/passport layouts with `photo` + `mrz_zone` +
   field boxes — run it locally so outputs are ours (avoiding its CC-BY-NC-SA dataset
   license). Directly targets our real-bad-passport weakness.
   ([Belval/TRDG](https://github.com/Belval/TextRecognitionDataGenerator), [QuickSign/docxpand](https://github.com/QuickSign/docxpand))

3. **Upgrade page geometry + bleed-through, borrowing from DocCreator (LGPL).** Replace
   our 1D sinusoidal `curl` with a **2D mesh warp** and add **bleed-through** (faint
   mirror of verso content) and stronger **paper-texture/lighting** — DocCreator
   demonstrates all three. Reimplement the concepts in our MIT/own code to keep outputs
   clean (don't link LGPL into the shipped generator if avoidable).
   ([DocCreator](https://github.com/DocCreator/DocCreator))

(Honorable mention: SynthText3D's physically-based **lighting** is the right north star
for glare/shadow realism if we later want a 3D render path — idea only, license UNVERIFIED.)

---

## Best Offline TEACHER for Pseudo-Labeling Real Passports/Docs

**Recommendation: a permissive multi-teacher ensemble, anchored on Qwen2.5-VL-7B (Apache-2.0).**

No single model labels everything we need (boxes + OCR + MRZ + KV + tables). Stack
permissive teachers and take cross-agreement:

- **Primary — Qwen2.5-VL-7B-Instruct (Apache-2.0):** field key-values, MRZ transcription,
  table parse, and visual grounding. **The 7B size specifically is Apache-2.0** — the
  cleanest capable VLM for commercial distillation. ([HF](https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct), [The Batch](https://deeplearning.ai/the-batch/alibaba-debuts-qwen2-5-vl-a-powerful-family-of-open-vision-language-models))
- **OCR transcription — GOT-OCR2.0 (Apache-2.0)** and/or **GLM-OCR (MIT, ~0.9B)** for
  high-fidelity text/`mrz_zone`/`table` content, cross-checking Qwen. ([GOT-OCR2_0](https://huggingface.co/stepfun-ai/GOT-OCR2_0), [GLM-OCR](https://huggingface.co/zai-org/GLM-OCR))
- **Box seeds — Florence-2 (MIT)** for detection/grounding boxes (`text_block`, `photo`),
  plus **DocLayout-YOLO** for layout boxes **offline only**. ([Florence-2](https://huggingface.co/microsoft/Florence-2-large))

**License gotchas (be blunt):**
- ✅ Clean for commercial distillation: **Qwen2.5-VL-7B (Apache-2.0)**, **GOT-OCR2.0
  (Apache-2.0)**, **Florence-2 (MIT)**, **GLM-OCR (MIT — confirm repo tag)**, **Donut (MIT)**.
- ⚠️ **DocLayout-YOLO is AGPL-3.0** — run offline as a label proposer only; never ship it,
  and don't let it be the *sole* source of any shipped weights (cross-validate with a
  permissive teacher so pseudo-labels aren't AGPL-derived in spirit).
- ⚠️ **Qwen2.5-VL-72B** = Qwen license (OK only under 100M MAU); **Qwen2.5-VL-3B** =
  non-commercial — avoid the 3B, use the 72B only for occasional accuracy ceilings.
- ⛔ **LayoutLMv3 (CC-BY-NC-SA, non-commercial)** and **PaliGemma (gated Gemma license +
  research-only fine-tunes)** — exclude from the commercial pipeline.
- General: pseudo-labels generated by a model can inherit license constraints. Anchoring
  on **Apache/MIT** teachers keeps the distilled edge weights clean; use AGPL/Qwen-licensed
  teachers only as cross-checks, never as the lone labeler.

---

## Licensing Landmines (quick reference)

- **AGPL-3.0 (DocLayout-YOLO, DocSynth300K-adjacent):** strong network-copyleft. Offline
  research use OK; shipping or sole-sourcing weights from it is risky. Keep it quarantined
  to the labeling stage.
- **CC-BY-NC-SA-4.0 (DocXPand-25k dataset, LayoutLMv3 weights):** non-commercial + viral
  ShareAlike. **For DocXPand, escape via the MIT generator** (regenerate → outputs ours).
  For LayoutLMv3 there is no escape — exclude.
- **Qwen / Tongyi Qianwen license (Qwen 72B tier, large InternVL):** commercial-OK-with-
  caveats (MAU caps), not OSI-open. Acceptable as offline teacher under our scale; document it.
- **Qwen Research License (Qwen2.5-VL-3B):** non-commercial — exclude from commercial use.
- **Gemma license (PaliGemma):** gated weights + custom prohibited-use terms — exclude.
- **GPL-3.0 / LGPL (DocSim / DocCreator):** copyleft; borrow *ideas* and reimplement rather
  than linking into shipped code.
- **UNVERIFIED (DocSynth300K, SynthTabNet, IDNet, SynthText dataset, SynthText3D, ocrodeg,
  DiT weights):** confirm exact terms (and any click-through) before redistribution; safe
  for internal training experiments with attribution.
- ✅ **Cleanest tools/outputs:** Augraphy (MIT), TRDG (MIT), SynthDoG/Donut (MIT),
  SynthTIGER (MIT), genalog (MIT), DocXPand *generator* (MIT) — outputs are ours to ship.

---

_Sources cross-verified against GitHub LICENSE files, Hugging Face model/dataset cards,
PyPI metadata, arXiv/OpenReview papers, and vendor docs. Where a LICENSE could not be
confirmed from source it is marked UNVERIFIED. Content was rephrased for compliance with
licensing restrictions (≤30 consecutive words per source; inline attribution)._
