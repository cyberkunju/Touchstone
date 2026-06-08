# Docdet universal detector data blueprint

## Bottom line

**Established result.** The failure mode you described is exactly the one the synthetic-data literature predicts: if the model sees synthetic documents that are too clean, too centered, too large, and too unlike phone capture statistics, it overfits to synthetic cues and does not transfer. In cut-paste detection, Dwibedi et al. showed that naïve pasting creates boundary artifacts that detectors latch onto, while blending and artifact-invariant training materially improve real-data performance; they also reported that synthetic data plus only 10% real data beat training on all real data in their cross-domain setting. In domain-randomization work, Tremblay et al. showed that synthetic-only training can transfer, but additional real fine-tuning improved over real-only training, and Structured Domain Randomization further improved transfer by modeling scene context rather than random placement alone. In other words: your v1 result is not a resolution problem, it is a data-generation and scene-prior problem. citeturn37view0turn38view1turn38view3turn36search2turn36search5

**My recommendation.** If the target is **≥0.95 real recall at high precision** on “any document in any condition,” then a **synthetic-only rebuild is not enough**. The practical SOTA recipe is a **hybrid program**: real-scene compositing onto license-clean backgrounds; photorealistic phone-capture rendering for layout/camera/light realism; class-specific symbolic generators for machine-readable elements; and then **large-scale auto-labeling of real unlabeled phone photos** with open-vocabulary teachers and masks, followed by human QA on the highest-risk slices. Public datasets are valuable as anchors, but their coverage is too narrow to define “any document” by themselves. That conclusion follows from the limited scope of even the best public identity and layout datasets: MIDV-500 provides 500 video clips over 50 ID types, MIDV-2019 extends distortions and low light, and MIDV-2020—although much richer—still focuses on 10 base identity-document types and 72,409 annotated images total. citeturn10search11turn10search1turn10search7turn10search9turn29view1

**What I would optimize for.** For a YOLOv11n browser-side detector at 640 input and a ~30 ms budget, the data program should heavily favor **detector-usable realism** over generative novelty. That means prioritizing:  
real backgrounds with hands/desks/clutter; realistic document scale priors; partial crops; glare/shadows/bad white balance; decoy negatives; and precise label validators for MRZ / barcode / QR. Diffusion can help diversify aesthetics, but it is not the first lever I would pull for this detector. That is my engineering opinion; the strongest primary-source support in the literature is still with cut-paste, structured randomization, and photorealistic rendering rather than with diffusion as the core detector-data method. citeturn37view0turn36search1turn36search2turn36search5turn40search8

## Synthetic methods ranked by transfer

The ranking below is for **your** use case: single-stage detection of universal document primitives under harsh smartphone capture conditions.

| Method family | How it works | Transfer to harsh real phone photos | Label fidelity | Cost | Best use | Primary evidence / repo status |
|---|---|---:|---:|---:|---|---|
| **Real-scene copy-paste onto real backgrounds** | Segment real/clean document assets or primitives and paste onto real backgrounds; vary object scale, truncation, occlusion, distractors, and blending | **High** when backgrounds and scale priors are right | Perfect for pasted objects | Low–medium | Fastest way to close your biggest gap: scale, clutter, partial crops, document placement, hands/desks/backgrounds | Dwibedi et al. explicitly showed that blending matters: in their ablation, **no blending** gave **65.9 mAP**, **Gaussian blurring** gave **68.9**, **Poisson** alone gave **58.4**, and re-rendering the **same placement with different blends** made the detector invariant to artifacts and improved by **8 AP points** over no blending. citeturn38view2turn38view3turn37view0 |
| **Simple Copy-Paste augmentation inside training** | Paste labeled instances between training images during augmentation | **Medium–high** as an additive method | Perfect | Low | Excellent add-on once you have any real labeled seed set | Ghiasi et al. reported that simple copy-paste improves data efficiency and helps especially on rare categories for instance segmentation; in practice this transfers well to small, rare document primitives. citeturn36search1 |
| **Structured domain randomization** | Randomize camera/light/placement, but preserve scene context and valid object supports | **High** for geometry/context if scene priors are realistic | Perfect | Medium | Strong for document-page placement, desk/hand support, mobile camera viewpoint diversity | Tremblay et al. showed synthetic-only transfer via domain randomization and gains from real fine-tune; Prakash et al. showed **Structured Domain Randomization** outperformed unstructured DR and several other synthetic baselines for real car detection, precisely because scene context mattered. citeturn36search2turn36search5turn36search16 |
| **Photorealistic 3D rendering** | Build paper/card meshes, PBR materials, HDRI lighting, camera model, render with path tracing | **High** if you need true camera/light/material realism | Perfect | Medium–high | Best for glare, bent paper, folds, lamination, hand-held camera geometry, shadows, desk interactions | BlenderProc is explicitly designed for **photorealistic** procedural rendering; its documentation and paper emphasize realism via path tracing and report reduced reality gap versus less realistic synthetic images. citeturn39search2turn40search4turn40search8 |
| **Document-specific 2D synthetic generators** | Render layouts, text, fonts, images, and print/capture artifacts in 2D | **Medium** for scans/PDFs; **medium–high** if paired with real backgrounds and phone-capture sim | Perfect | Low–medium | Excellent for tables, text blocks, checkboxes, invoices/forms; not sufficient alone for harsh phone capture | Donut’s **SynthDoG** is an official synthetic document generator under MIT; DDI-100 released **99,870** distorted document images from **6,658** unique pages under MIT; both are strong components, but neither alone solves desk/hand/glare realism. citeturn39search0turn39search14turn17view0turn17view1 |
| **Pure procedural from scratch** | Draw pages and degradations directly with PIL/OpenCV or similar | **Low** for your target domain | Perfect | Very low | Useful only as one component for structured primitives | This is the regime your v1 already demonstrated can look great synthetically and fail on MIDV-like phone photos. Dwibedi’s analysis of paste artifacts and the broader DR/SDR literature both support the same diagnosis: cheap synthetic without the right local realism and context leaves a large reality gap. citeturn37view0turn36search2turn36search5 |
| **Diffusion / ControlNet / generative image synthesis** | Sample images from a generative model, optionally conditioned by edges/layout/sketches | **Unclear as a primary detector-data method**; useful as a diversity layer | Weak unless conditioned from known structure or re-labeled | Medium–high | Secondary use only: texture/background/style diversification or teacher-assisted bootstrapping | ControlNet adds spatial conditioning to diffusion, which is useful if you already have structure. But diffusion does **not** give clean boxes “for free”; you either need structured conditioning that already knows the layout or a re-labeling pass. I did not verify a primary-source result in this pass showing diffusion beats strong copy-paste + 3D rendering for harsh document-object detection transfer. citeturn40search9turn40search12 |

**Operational conclusion.** For docdet, the winning stack is not one generator. It is a **three-engine system**:  
**engine A** for real-background copy-paste and decoys, **engine B** for 3D phone-capture physics, and **engine C** for symbolically correct primitives and clean scans/PDF renders. Everything else is support. citeturn37view0turn36search5turn40search8turn39search14turn17view0

## Real scene banks and public datasets

### Real background and scene banks

For your use case, the background bank matters almost as much as the document bank. The most useful backgrounds are **desks, tables, floors, beds, sofas, hands holding papers/cards, clutter, wallets, keyboards, laptops, monitors, car dashboards, restaurant tables, and low-light household scenes**. The table below focuses on sources with comparatively clean re-use terms.

| Source | Verified scale | License status | Commercial note | Practical use |
|---|---:|---|---|---|
| **Wikimedia Commons** | **142,735,088** freely usable media files on the verified page | Only freely licensed or public-domain media are accepted | Commercial use depends on the file’s specific license; filter to CC0 / public domain / CC BY variants you accept | Excellent long-tail source for desks, tables, floors, offices, homes, outdoors, hands, clutter; requires curation and license filtering. citeturn33search3turn33search8 |
| **Open Images V7** | **~9M** images; **~1.9M** densely annotated subset | Images are CC BY / CC BY 2.0 in official descriptions and tooling | Commercially usable with attribution obligations; not “zero-attribution” | Best large-scale search space for backgrounds and hard negatives because labels let you mine “desk,” “table,” “hand,” “laptop,” “phone,” “paper,” etc. citeturn34search2turn34search8turn34search15turn34search18turn34search11 |
| **Pixabay** | **6.1M+** assets on the verified homepage | Pixabay Content License | Broad commercial use, but recognizable logos/brands/trademarks can trigger restrictions | Very good for clean, shippable backgrounds; use for desks/tables/hands/clutter, but filter brand-heavy imagery. citeturn33search7turn33search2turn33search12turn33search17 |
| **Pexels** | Official site says **millions** of royalty-free photos/videos | Pexels License | Commercial use allowed without attribution | Good default bank for desktop and household scenes; easy to operationalize. citeturn33search20turn33search0turn33search10turn33search5 |
| **Unsplash** | Large collection; the verified older official blog reported **900k+** in 2018 | Unsplash License | Commercial use allowed, but you cannot compile a competing service | Good supplemental bank for photogenic desks/hands/lifestyle captures; less useful for scale than Open Images/Pixabay. citeturn33search1turn33search6 |
| **Burst by Shopify** | Official page says **thousands** of royalty-free images | Royalty-free / Shopify usage guidance | Commercially usable | Small but license-friendly starter bank. citeturn33search4turn33search9 |

**My recommendation.** For a **shippable** background program, start with **Pixabay + Pexels + Burst + filtered Wikimedia Commons**, and use **Open Images** when CC BY attribution is acceptable in your data-governance posture. Then add a **first-party capture bank** of internal real scenes; that first-party bank will matter most for the final recall jump. That is an engineering recommendation based on the verified license pages above. citeturn33search7turn33search0turn33search4turn33search8turn34search11

### Public labeled datasets mapped to your classes

The table below is deliberately conservative: if I did **not** verify a clean primary license page in this pass, I do **not** mark the dataset as shippable.

| Class | Best verified anchors | Size / annotations | License and commercial status | What I would actually use it for |
|---|---|---|---|---|
| **document_page** | **MIDV-500**, **MIDV-2019**, **MIDV-2020**, **SmartDoc 2017 test** | MIDV-500: **500 video clips / 50 ID types**; MIDV-2019 adds strong projective distortion and low light; MIDV-2020: **1,000 video clips + 2,000 scans + 1,000 photos**, **72,409 annotated images** with baselines for document location and face detection; SmartDoc 2017 test repo is small challenge data | MIDV licenses were not cleanly verified as commercial in this pass; SmartDoc 2017 test is **CC-BY-SA-4.0** | Use MIDV only as benchmark/seed for phone capture and boundary cases; do not rely on it as the core training distribution for “any document.” citeturn10search11turn10search1turn10search7turn10search9turn29view1turn11search1 |
| **photo** | **MIDV-2020**, **DocLayNet** | MIDV-2020 includes face-detection baselines; DocLayNet has **80,863** pages and a “Picture”/layout-level regime suitable for embedded images | MIDV commercial status unclear; DocLayNet is **CC BY 4.0** | MIDV for ID-photo fields; DocLayNet for generic embedded-photo appearance and placement. citeturn29view1turn14search0turn6view1 |
| **signature** | **CommonForms**, **CEDAR**, **GPDS-960**, **Tobacco800** | CommonForms: **~55k documents**, **>450k pages**, **486,954 rows** on HF; CEDAR: **55 writers**, **24 genuine + 24 skilled forgeries each**; GPDS-960: **960 individuals**, **24 genuine + 30 forgeries each**; Tobacco800: **1,290 document images** | CommonForms dataset is **Apache-2.0**; CEDAR license was not cleanly surfaced on the verified official page; GPDS figshare shows **CC BY 4.0**, but the dataset description also requires a signed agreement, so I would treat commercial status as **unclear** until manually checked; Tobacco800 license unclear | CommonForms is the best permissive detector-style anchor for signature fields; CEDAR/GPDS/Tobacco800 are valuable for appearance diversity and hard cases, but not clean “ship without review” assets. citeturn27view0turn28view0turn14search2turn13view2turn12search7 |
| **stamp** | **DDI-100**, **StaVer** | DDI-100: **99,870** distorted document images from **6,658** unique pages with **stamp masks**; StaVer: **400** scanned invoice images with pixel-wise stamp masks | DDI-100 is **MIT**; StaVer license not verified from a primary source in this pass | DDI-100 is a strong permissive synthetic anchor; StaVer is useful for real scanned stamps but should be treated as research-only until license is checked. citeturn17view0turn17view1turn18search11turn16search1 |
| **seal** | **ReST seal-title dataset**, **StaVer**, **DDI-100** | ReST: **10,000 real seal** images with text polygons/content; StaVer: **400** invoice pages; DDI-100 synthetic stamp masks | ReST license not verified; StaVer license unclear; DDI-100 MIT | Dedicated public “seal” data are weak and mostly research-style. Plan to generate most seal data synthetically and use ReST as a research-only realism prior. citeturn31search0turn31search1turn32view2turn18search11turn17view0 |
| **logo** | **QMUL-OpenLogo**, **Logos in the Wild**, **Tobacco800** | OpenLogo: **27,083 images / 352 classes**; Logos in the Wild: **11,054 images / 32,850 annotated boxes / 871 brands**; Tobacco800 contains a logo-bearing subset in document context | OpenLogo is explicitly **academic research only**; Logos in the Wild was publicly released but I did not verify a primary license page here; Tobacco800 license unclear | Use OpenLogo / Logos in the Wild as research-only logo appearance priors; for a privacy-first shipping product, expect to supplement with your own or licensed logo corpus. citeturn24view0turn25view0turn15search10 |
| **qr_code** | Public, license-clean, document-specific anchors were **scarce in this pass** | I verified public QR datasets exist, but did not verify a strong primary, commercial-clean document QR corpus in this pass | Not marked shippable | Treat QR as a **symbolic generation + real auto-labeling** class first, public data second. The strongest verified ingredients here are the generation/validation stack, not the public corpus. citeturn19search17turn20search13 |
| **barcode** | **InventBar / ParcelBar** and similar research corpora exist, but license was not cleanly verified here | The paper reports **527 consumer goods** and **844 post boxes** in the two proposed datasets | Research status; not marked shippable | Like QR, prioritize spec-correct generation and real self-training. citeturn21search1turn21search6 |
| **mrz_zone** | **MIDV-500 / 2019 / 2020** | Real phone-capture identity datasets with document localization and field-level use cases; MIDV-2020 is the strongest verified anchor | Commercial status unclear | Best public benchmark family for MRZ realism; still not enough by itself for global deployment. citeturn10search11turn10search1turn10search9turn29view1 |
| **table** | **DocLayNet**; important but not fully verified here: PubTables-1M, FinTabNet | DocLayNet: **80,863** pages with human layout annotations | DocLayNet is **CC BY 4.0**; PubTables-1M / FinTabNet license not verified in this pass | DocLayNet is your clean verified anchor; manually verify PubTables-1M and FinTabNet before treating them as shippable. citeturn14search0turn6view1 |
| **checkbox** | **CommonForms**; important but not fully verified here: FUNSD | CommonForms covers **Text Input / Choice Button / Signature** and has **>450k pages** | **Apache-2.0** | This is the strongest verified dataset in the entire report for checkbox-like form controls. citeturn26search2turn27view0turn28view0 |
| **text_block** | **DocLayNet**; important but license-conditional: PubLayNet; important but source-term-unclear: DocBank | DocLayNet: **80,863** pages; PubLayNet is massive and derived from PMC OA; DocBank repo is MIT but source-content terms are not a clean single license | DocLayNet **CC BY 4.0**; PubLayNet commercial status depends on source-article licensing / PMC collection; DocBank not marked shippable without source-term review | Use DocLayNet as the permissive anchor and treat PubLayNet / DocBank as “verify before shipping.” citeturn14search0turn6view1turn6view0turn15view2 |

**Important implication.** Your “ANY document” target cannot be covered by public data alone, even before licensing is considered. The public corpora split into narrow identity-document benchmarks, layout corpora, form-field corpora, and research-only authenticity corpora. That means the production pipeline must use public data as **scaffolding**, not as the final domain. citeturn10search11turn10search9turn14search0turn27view0turn24view0

## Generation and degradation recipes

### Better-than-real generation by class

**document_page.** Build page assets from real PDFs/scans and high-resolution document mockups, but do **not** stop at flat page compositing. Every sample should be spawned into one of at least three capture modes: flat scan/PDF render, real-background copy-paste, and 3D phone-capture render. Your biggest corrective prior is **document scale**: the page should frequently occupy only **20%–70%** of the frame, not near-full-frame by default. That specific recommendation is my opinion, derived from your failure mode and from the evidence that truncation/occlusion and context-aware placement materially improve transfer. Dwibedi et al. reported that adding **truncation/occlusion** improved their detector by **as much as 10 AP points**, which is directly relevant to your partial-crop miss case. citeturn38view1

**MRZ.** Generate TD1 / TD2 / TD3-like zones from a grammar-driven engine, render with OCR-B-compatible fonts, and reject any sample whose check digits or field formatting fail your validator. The **normative** source here is ICAO Doc 9303, but I did **not** verify the official standard text in this pass, so I am intentionally not reproducing field-length tables or check-digit formulas here. My recommendation is to treat MRZ generation as a compiler: sample identity fields, compile to MRZ, verify, render, then degrade through print/capture. This is mostly engineering opinion, but it is the right shape of solution for a highly structured class.  

**QR and barcode.** These are the easiest classes to make “better than real” if you insist on **spec correctness**. Use a standards-compliant generator, vary payload schema and print size, then keep only samples that decode successfully after degradation. For QR specifically, the official `node-qrcode` documentation exposes the standard error-correction levels, and BoofCV provides an Apache-2.0 QR stack that is useful as an independent validator. My recommendation is to require a **two-decoder agreement** on the final rasterized image before it enters training. That turns generation into a self-validating loop instead of a blind sampler. citeturn19search17turn20search13

**signature.** Use real signature corpora for appearance priors, but do not simply paste binary masks. For detector training, signatures need stroke thickness variation, pen-pressure irregularity, overlap with lines/text, ballpoint vs marker texture, and common signing placements. GPDS is still useful because it contains a very large writer set and an additional synthetic population; the GPDS site reports a synthetic set with **4,000 synthetic individuals**, each with **24 genuine signatures and 30 forgeries**. My recommendation is to build a vector-stroke signature synthesizer that samples from measured geometric priors of CEDAR / GPDS / Tobacco800 and then overlays on realistic document fields. citeturn13view2turn12search9turn14search2turn12search7

**stamp and seal.** Treat these as **ink-on-paper physics** problems, not logo-paste problems. The recipe should start with vector or clean raster seal masters, then add porous paper bleed, partial impression, rotational misalignment, non-uniform pressure, tilt-induced contrast loss, overlap with text/signature, and photocopy/scanner artifacts. ReST is useful because it confirms the diversity of practical seal shapes and contexts in official and financial documents; StaVer gives scanned invoice realism; DDI-100 gives permissive synthetic stamp masks. citeturn31search0turn32view2turn18search11turn17view0

**checkboxes, tables, forms, text blocks.** Here I would go all-in on program synthesis. Generate forms and business documents from HTML/CSS-to-PDF, LaTeX, or a PDF layout engine, then sample label distributions from **CommonForms** and **DocLayNet**. CommonForms is especially valuable because it is detector-native and includes the exact field primitives you care about—**Text Input, Choice Button, Signature**—at web scale and under Apache-2.0. citeturn26search2turn27view0turn28view0turn14search0turn6view1

### The degradation graph I would actually ship

**This ordered graph is my recommendation, not a field-wide standard.** The causal order should be:

**layout / page synthesis → paper/card surface modeling → geometric placement → print/paper artifacts → capture lighting → sensor / ISP artifacts → codec artifacts**

That order matters because some distortions are applied to the **physical document** and others are applied to the **captured image**. BlenderProc is the strongest verified open rendering framework in this pass for photorealistic image synthesis; DDI-100 and SynthDoG are strong verified references on the document-rendering side. citeturn39search2turn40search8turn17view0turn39search14

The most practical implementation split is:

| Stage | Best tool | What to model | Suggested parameter band |
|---|---|---|---|
| **Geometry** | Blender / BlenderProc for 3D; Kornia/OpenCV for 2D homographies | yaw, pitch, roll, distance, partial crop, page curl, fold ridge | **Opinion:** yaw/pitch up to ~60°, roll up to ~45°, visible area down to ~45%, 1–3 fold ridges, mild-to-strong curl |
| **Print / paper** | Augraphy-like transforms plus custom paper textures | paper fiber, toner variation, low ink, photocopy haze, stains, bleed-through | **Opinion:** keep most samples mild, but reserve ~10% for strong print damage; use separate priors for glossy ID cards vs matte paper pages |
| **Capture lighting** | HDRI + area lights in BlenderProc | cast shadows, specular glare on lamination, uneven illum., low light | **Opinion:** exposure shift roughly ±1.5 EV, WB shift roughly ±1200 K, direct glare on 10%–20% of laminated-card samples |
| **Sensor / ISP** | custom OpenCV / Kornia / raw-like sim | shot noise, read noise, demosaic softness, over-sharpening, denoise artifacts, motion blur | **Opinion:** motion blur lengths ~3–25 px, ISO/noise sampled by device tier, extra sharpening halos on a minority of phone images |
| **Codec** | libjpeg / browser-like transcode | JPEG blocking, chroma subsampling, repeated recompression | **Opinion:** quality from ~25–98, with a heavy tail at medium/high quality and a small but important low-quality slice |

Two implementation details matter disproportionately:

First, **glare must be geometry-aware**. A cheap additive white blob is not enough. On ID cards and laminated pages, use view-dependent specular highlights from a physically plausible surface in 3D. BlenderProc is exactly the sort of tool built for this photorealistic, path-traced role. citeturn39search2turn40search8

Second, **the same semantic object should be rendered through multiple artifact families**. Dwibedi et al. found that rendering the same placement under different blending modes makes the detector less sensitive to local artifacts. I would generalize that idea: hold the document and annotation fixed, and fork only the artifact pipeline—blend, glare, WB, blur, JPEG, shadow—so the model is forced to learn the primitive rather than the corruption. citeturn38view1turn38view3

## Mixing, auto-labeling, negatives, and evaluation

### Real and synthetic mixing

**Established result.** The literature does support the broad rule you need: **synthetic is best as a supplement or curriculum stage, not as the terminal domain**. Dwibedi et al. reported that synthetic data combined with **10% real** outperformed the model trained on **all real** in their cross-domain experiment, and domain-randomization work similarly showed that synthetic plus real fine-tuning outperformed real-only training. citeturn37view0turn36search2turn36search5

**My recommendation.** I would train docdet in four stages:

1. **Synthetic warm start.** Train first on a large synthetic pool dominated by copy-paste and 3D phone-capture renders.  
2. **Mixed training.** Move to a mixed sampler with **roughly 60:40 synthetic:real** at the image level, but over-sample real phone captures in the hardest regimes.  
3. **Real-heavy fine-tune.** Finish with **real > synthetic**, roughly **70:30 real:synthetic**, plus hard negatives.  
4. **Self-training refreshes.** Periodically add new auto-labeled real captures and repeat short real-heavy fine-tunes.

Those exact ratios are my engineering opinion. I am **not** aware of a universal primary-source ratio that should be treated as law for document-primitive detection. But the curriculum direction—synthetic first, real last—is well supported by the papers above. citeturn37view0turn36search2turn36search5

### How much real data is enough

Here I want to be explicit: **there is no defensible “enough” number for “ANY document.”** For a bounded business domain, a few thousand real pages can be enough when paired with large synthetic support. For your target, the bottleneck is not only document type coverage but also **capture-condition coverage**. My working target would be:

- **document_page:** at least **20k–50k** real phone photos across conditions before expecting near-ceiling robustness,  
- **photo / signature / stamp / logo / text_block / table / checkbox:** a few thousand verified real instances each can go very far when the synthetic generator is strong,  
- **MRZ / barcode / QR:** because these are structured and validator-friendly, the synthetic generator will carry more of the burden, but you still need substantial real phone-capture validation slices.

Those are deployment-oriented opinions, not established universal thresholds.

### Auto-labeling at scale

The strongest verified open-toolchain in this pass is:

- **Grounding DINO** for text-prompted open-set box proposals, with official **Apache-2.0** code and a repo that explicitly highlights automated dataset annotation and Grounded-SAM integrations,  
- **SAM 2** for mask refinement and box/polygon extraction, with official **Apache-2.0** code plus a BSD-licensed third-party component,  
- **Florence-2** for promptable visual reasoning under **MIT**,  
- **Qwen2.5-VL** for structured image understanding and visual localization under **Apache-2.0**,  
- **InternVL2.5** for another strong multimodal verifier under **MIT**. citeturn41view0turn42view0turn42view1turn43view0turn42view2

The workflow I would ship is:

**proposal phase.** Run Grounding DINO with a prompt ensemble per class, not a single prompt. For example, for `document_page`, use prompts like “document, paper, ID card, passport, driver license, invoice, receipt, form, contract, certificate, statement” and weakly synonymous variants. For `stamp` and `seal`, use separate prompt families. Use low thresholds here to maximize recall. citeturn41view0

**shape phase.** For `document_page`, `photo`, `table`, `stamp`, `seal`, and some `logo` cases, pass proposals through SAM 2 to get masks, then derive both axis-aligned boxes for YOLO and retained polygons/quads for evaluation and QA. Using polygons here is important even if your student detector is box-based, because it gives you boundary-aware validation for page localization. citeturn42view0

**semantic verification phase.** Use Florence-2, Qwen2.5-VL, or InternVL2.5 to answer narrow verification prompts such as: “Is this region a handwritten signature?”, “Does this region contain a QR code?”, “Return the object type among {stamp, seal, logo, photo, text block},” or “Give a bounding box for the MRZ zone.” Qwen2.5-VL’s model card explicitly states support for **visual localization** and **structured outputs** on documents like invoices and forms, which is useful for verifier prompts. citeturn42view1turn43view0turn42view2

**class-specific validators.**  
For `qr_code` and `barcode`, decode it; reject non-decodable examples unless you are intentionally mining a “visually present but undecodable” slice.  
For `mrz_zone`, apply regex and check-digit validation.  
For `checkbox`, enforce geometric priors and nearby-label consistency.  
For `table`, reject proposals without row/column or box-structure evidence.  
For `signature`, reject proposals with too much printed glyph regularity.  

This validator stage is not directly from a single paper; it is my implementation recommendation and is, in my view, the highest-ROI engineering step for your pipeline.

**noise control.** Accept labels only when either:  
the detector confidence is very high, or at least **two independent teachers agree** spatially and semantically. In practice I would use teacher agreement, decode success, and validator success to create a risk score, then spend human QA budget on the riskiest slices. That lets you scale unlabeled-real ingestion without poisoning the student with easy-to-avoid label noise.

### Hard negatives and decoys

Your detector needs a dedicated **confuser program**. The most important negatives are not random backgrounds; they are **things that look document-like**:

screenshots, tablets/monitors showing a document, book pages, magazines, posters, flyers, playing cards, credit cards, business cards, receipts pinned among clutter, sticky notes, whiteboards, packaging labels, menus, newspaper pages, and folded non-document paper scraps.

**My recommendation** is to keep **20%–30%** of the mixed training stream as hard negatives or negative-rich scenes, and to maintain a separate **confuser validation split** whose only job is to track false positives. That fraction is opinion, not an established number from a primary source.

### Evaluation and gates

The evaluation stack I would use is:

- **real-only held-out domains**, split by **capture session / device / environment / document family**, never by frame only; MIDV-style video benchmarks are especially vulnerable to leakage if frames from the same clip cross splits,  
- **recall at deployment confidence**, because your product goal is not just mAP,  
- **page boundary accuracy** using retained polygons/quads for `document_page`,  
- **small-object metrics** for `qr_code`, `barcode`, `checkbox`, `signature`, `stamp`, and `logo`,  
- **false positives per image / per page**, especially on confusers,  
- **slice dashboards** for cluttered desk, hand-held card, glare, low light, shadow, motion blur, partial crop, and non-document decoys.

**My gate suggestion** is: do not promote a model if the **sim-to-real gap** is still visible after week one. Specifically, compare synthetic-val recall to a tiny but carefully curated real “nasty 500” slice from the beginning of the project. If the gap is large, stop scaling training and fix the generator.

## Pitfalls that create fake success

The anti-patterns below are the ones most likely responsible for a detector that looks almost perfect on synthetic validation and collapses on MIDV-like reality.

| Anti-pattern | Why it breaks transfer | Fix |
|---|---|---|
| **Documents too large / too centered / too clean** | The detector learns an unreal document-size prior and fails on partial crops and cluttered scenes | Force a realistic frame-occupancy prior and oversample partial documents |
| **Procedural backgrounds instead of real scenes** | Pixel statistics, textures, and clutter are wrong | Paste onto real desks, hands, floors, household scenes, and hard negatives |
| **Naïve compositing** | Boundary artifacts become the easiest cue | Use multiple blends and artifact-invariant training as in Dwibedi et al. citeturn38view1turn38view3 |
| **No context-aware placement** | Documents appear in impossible poses/supports | Use structured randomization and 3D rendering with realistic supports/poses citeturn36search5turn40search8 |
| **No glare / shadow / ISP realism** | Phone capture is not modeled | Use a physical or quasi-physical capture stage, not only post-hoc blur/noise |
| **No hard negatives** | Precision collapses on books, cards, screens, posters | Build a dedicated decoy corpus |
| **No class validators** | QR/barcode/MRZ labels become noisy, and the student memorizes junk | Decode, regex-check, and reject |
| **Random train/val split across near-duplicate videos** | Metrics are inflated | Split by capture source, device, clip, and environment |
| **Treating public datasets as sufficient coverage** | Public corpora are narrow and license-messy | Use them as scaffolding, then scale on first-party unlabeled real data |

## Recommended blueprint

### The plan I would execute first

**Phase one: build the real-scene backbone.**  
Collect and curate a **background / confuser bank** from license-friendly public sources and first-party captures. Add a dedicated **hands bank** and **desk-clutter bank**. Mine Open Images for contextual scene diversity and use Pexels / Pixabay / Wikimedia / Burst where commercial cleanliness matters more than annotation richness. This phase is boring, but it is the highest-impact correction to the failure you reported. citeturn34search2turn34search11turn33search7turn33search0turn33search4turn33search8

**Phase two: replace the single procedural generator with three generators.**  
Run **engine A** for copy-paste on real scenes, **engine B** for 3D phone-capture rendering with paper/card materials and HDRI lighting, and **engine C** for symbolic/layout generation of machine-readable and form-heavy classes. Pull implementation ideas from Donut/SynthDoG for layout/text synthesis and from BlenderProc for photorealistic rendering. DDI-100 is a useful permissive reference for distorted-document augmentation design. citeturn39search0turn39search14turn39search2turn40search8turn17view0

**Phase three: seed with permissive public detectors’ data.**  
Start the real-labeled seed set with the highest-confidence verified assets: **DocLayNet** for layout/text/table/picture; **CommonForms** for checkbox/signature/form fields; **DDI-100** for stamp-like artifacts; and the **MIDV family** for ID-document phone captures and MRZ-adjacent realism. Treat OpenLogo, ReST, StaVer, CEDAR, GPDS, and Tobacco800 as research-only or manually reviewed inputs until licenses are cleared. citeturn14search0turn6view1turn27view0turn28view0turn17view0turn10search11turn10search9turn24view0turn31search0turn18search11turn14search2turn13view2turn12search7

**Phase four: auto-label real unlabeled phone photos.**  
Use Grounding DINO → SAM 2 → VLM verifier → class validators → human QA. In my view, this is the single most important piece if the goal is **≥0.95 recall**. The public datasets and synthetic engines get you to the neighborhood; unlabeled-real self-training gets you across the street. citeturn41view0turn42view0turn42view1turn43view0turn42view2

### The concrete dataset shape I would target

The numbers below are **my recommendations**, not literature-derived constants.

| Pool | Target volume | Notes |
|---|---:|---|
| **Public permissive seed** | ~**100k–300k** pages / images after curation | Mostly DocLayNet, CommonForms, DDI-100, plus vetted subsets of background banks |
| **Synthetic engine A** | **2M–4M** images | Real-background copy-paste with realistic scale, occlusion, truncation, hard negatives |
| **Synthetic engine B** | **2M–4M** images | 3D phone-capture renderings for glare, fold, curl, desk/hand geometry |
| **Synthetic engine C** | **1M–2M** images | Clean scans/PDF renders and symbolic primitives: MRZ, barcode, QR, forms, tables |
| **Real unlabeled phone captures** | **100k–500k** images/pages | This is the critical production domain |
| **Real human-QA labels** | **10k–30k** images/pages** minimum** | Focus annotation budget on harsh slices and underperforming classes |

That total may sound large, but you explicitly said training compute is unconstrained. For a nano detector, data diversity will matter far more than model size scaling.

### The training curriculum I would use

**Stage A.** Pretrain on the synthetic tri-engine mixture with a strong emphasis on `document_page`, `text_block`, `table`, `checkbox`, `signature`, `stamp`, `photo`, and machine-readable elements. Use a high hard-negative rate from day one.  

**Stage B.** Mix in the permissive real public corpora and a small manually labeled internal nasty set. Use copy-paste augmentation inside training as well as offline generated data. citeturn36search1turn37view0

**Stage C.** Run teacher auto-labeling on large unlabeled real phone corpora. Filter heavily. Distill into YOLOv11n via real-heavy fine-tune.  

**Stage D.** Perform slice-based error mining every training cycle: cluttered desk, glossy ID glare, folded contracts, motion blur, low light, partial crop, screenshots, book pages, posters, and playing/credit/business cards.  

If you execute this faithfully, I would expect the biggest jump not from higher resolution or from a different detector, but from the combination of **real placement priors + real unlabeled self-training + machine-readable validators**.

## Open questions and limitations

Several important assets or claims are **not** marked shippable because I did not verify their primary license pages in this pass. That includes **PubTables-1M, FinTabNet, FUNSD, OWLv2, GLIP, the ICAO 9303 normative MRZ text, several barcode/QR datasets, StaVer licensing, ReST licensing, MIDV commercial re-use terms, and parts of the SmartDoc / SIDTD / DocXPand ecosystem**. Where those assets are industry-important, I called them out but did not overstate their shipping status.  

A second limitation is that the literature gives strong support for **families** of synthetic methods and curricula, but not a universal, paper-backed rule for exact **real:synthetic batch ratios** in document-primitive detection. The ratio choices in this report are therefore labeled as **engineering recommendations**, not established constants.  

The highest-confidence takeaway remains unchanged despite those gaps: **procedural-only generation is the wrong center of gravity for docdet**. The right center of gravity is **real-scene compositing, photorealistic capture simulation, and aggressively scaled real unlabeled self-training with validator-controlled noise**. citeturn37view0turn36search2turn36search5turn40search8turn41view0turn42view0