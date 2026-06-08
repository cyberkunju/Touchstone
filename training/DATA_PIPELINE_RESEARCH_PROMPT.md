# Research Prompt — Ultimate Training-Data Pipeline for a Universal Document-Primitive Detector

> Paste everything below the line into your deep-research tool (GPT/Claude deep
> research, Perplexity, Gemini, etc.). It is self-contained. Answer it as an
> exhaustive, cited technical report.

---

## ROLE
You are a senior computer-vision research engineer specializing in document
intelligence, synthetic data generation, and sim2real transfer for object
detection. You have shipped production document-understanding models. Give me a
rigorous, citation-backed, implementation-ready report — not a blog summary.
Prefer primary sources (papers, official repos, dataset cards, licenses). When
you state a number (mAP, mixing ratio, image count), cite where it came from.
Flag anything that is your opinion vs established result.

## MISSION
I am building **docdet** — a *universal* document-primitive object detector that
must work on ANY document (passports, national IDs, driver licenses, invoices,
receipts, forms, certificates, bank statements, contracts, letters) in ANY
condition (clean scans, PDFs, and especially **bad real-world smartphone photos**:
tilted, cluttered desk/hand backgrounds, glare, shadow, motion blur, partial
crops, low light, folds).

**Detector:** YOLOv11n (nano, ~2.6M params), single-stage.
**Classes (12):** `document_page, photo, signature, stamp, seal, logo, qr_code,
barcode, mrz_zone, table, checkbox, text_block`.
**Deployment:** exported to **ONNX, run fully in-browser** (onnxruntime-web /
WASM+WebGPU) and in a Tauri desktop app. **100% local, privacy-first — no images
ever leave the device.** Input size 640 (possibly 960). CPU/edge inference budget
~30ms.
**Training compute:** assume **NO limits** (cloud A100/H100/MI300X, large storage,
large teacher models for auto-labeling are all on the table).

## WHAT WENT WRONG (the problem to solve)
Our v1 used a **pure procedural generator** (PIL/OpenCV: documents drawn from
scratch, pasted on *procedural* math-gradient/noise backgrounds, with hand-rolled
blur/glare/shadow/fold/jpeg augmentations). Result:
- Synthetic-vs-synthetic test: mAP@50 = **0.982** (looked great).
- **REAL benchmark (MIDV-500, real phone photos of IDs): mAP@50 = 0.355, recall
  = 0.36** at conf 0.25. Best case (flat doc on a table) only 0.63 recall; worst
  (partially clipped) 0.14. Bumping input to 960 did nothing → it's a true
  **domain/distribution gap**, not resolution.

Root cause hypothesis: procedural pixel statistics (paper texture, ink, lighting,
camera ISP noise, real scene backgrounds, real security features) don't match
reality, and we trained **synthetic-only** with documents that were too large /
near-full-frame / too clean. I need the data pipeline rebuilt to the absolute
state of the art so the model hits **≥0.95 recall on real in-the-wild documents
at high precision.**

---

## DELIVER A REPORT COVERING ALL OF THE FOLLOWING

### 1. Taxonomy of synthetic-data methods (ranked by real-world transfer)
For each method give: how it works, expected sim2real quality, cost/complexity,
tooling/repos, and when to use it. Cover at minimum:
- Procedural/programmatic rendering (our v1) — what it's good/bad for.
- **Copy-paste / cut-paste-learn** compositing of real or rendered foreground
  objects onto **real scene backgrounds** (cite "Cut, Paste and Learn", "Simple
  Copy-Paste", instaboost, etc.). Blending methods (alpha matting, Poisson/
  seamless cloning, Gaussian/Laplacian pyramid blend) and which actually helps
  detection vs hurts.
- **Augraphy** and similar physics-based document degradation pipelines — full
  capability list, recommended augmentation graph, and realistic config presets.
- **3D rendering** (Blender/BlenderProc, Unity, Mitsuba): paper mesh + bend/curl,
  physically-based materials, real lighting/HDRI environments, camera ISP/sensor
  models. Existing doc-specific 3D pipelines if any.
- **Generative models**: diffusion (latent/SD fine-tunes, ControlNet for layout-
  conditioned generation), GANs, and document-specific generators. Can they make
  *labeled* detection data (boxes), and how (layout-conditioned generation)?
- **Domain randomization** (NVIDIA-style) vs **photorealism** — current evidence
  on which wins for document detection, and hybrid strategies.

### 2. Real backgrounds & scene banks (shippable licenses)
Where to get large, license-clean banks of **real photographic backgrounds**
representing where documents are actually photographed (desks, tables, hands,
floors, keyboards, indoor clutter). List datasets/sources, sizes, licenses
(prefer permissive/commercial-OK), and download access. Include scene datasets
repurposable as backgrounds.

### 3. Real labeled datasets PER CLASS (the real-data mix)
For EACH of the 12 classes, list the best public datasets that provide real,
labeled instances, with: size, annotation type (bbox/polygon/mask), domain,
**exact license** (and whether it permits commercial/shippable model training),
and access link. Specifically chase the hard ones:
- `document_page` boundary in the wild: MIDV-500/2019/2020, SmartDoc-QA,
  DocXPand, SIDTD, and any newer ID-in-the-wild sets.
- `photo` (face portrait region), `mrz_zone`: ID/passport datasets.
- `signature`: signature detection/verification datasets (Tobacco-800, CEDAR,
  GPDS, DocSignatures, etc.).
- `stamp`/`seal`: stamp detection sets (DDI-100, StaVer, etc.).
- `qr_code`/`barcode`: real barcode/QR detection datasets; also note that these
  can be *generated perfectly* with real encoders — cover both.
- `table`: PubTables-1M, FinTabNet, TableBank, ICDAR cTDaR, DocLayNet.
- `checkbox`: CommonForms, FUNSD, RVL-CDIP forms, and any checkbox-specific sets.
- `text_block`/layout: DocLayNet, PubLayNet, DocBank, M6Doc, ReadingBank.
Flag clearly which are **research-only** (usable for a research/eval model but
NOT shippable) vs **permissive/commercial**.

### 4. Class-specific "perfect generation" recipes
For classes where synthesis can be *better than real*, give the canonical recipe:
- **MRZ**: ICAO 9303 TD1/TD2/TD3 exact spec, OCR-B font, check-digit algorithms,
  realistic value distributions.
- **Barcodes/QR**: which libraries generate spec-correct, scannable codes
  (Code128, PDF417, QR, DataMatrix, Aztec) with real payloads; how to composite
  realistically.
- **Signatures**: online signature synthesis, real ink stroke models, GPDS-synth.
- **Stamps/seals**: procedural circular/rectangular stamp synthesis with ink
  bleed, rotation, partial impressions.
- **Checkboxes/tables/forms**: programmatic form layout engines.

### 5. Realistic capture-degradation pipeline (the physics)
Define the *ideal ordered augmentation graph* from clean document → realistic
captured photo: geometry (perspective/homography, 3D paper bend, fold), then
print/paper artifacts (Augraphy), then capture (lighting/HDRI, glare, shadow,
white balance, exposure), then sensor/ISP (demosaic, noise model, motion blur,
rolling shutter), then codec (JPEG/HEIC). Give concrete parameter ranges and
which library does each step best. Cite camera-ISP simulation work.

### 6. Real + synthetic MIXING strategy
This is critical. Provide evidence-based guidance on:
- Optimal **real:synthetic ratios** for detection sim2real (cite studies).
- **Curriculum / staged training**: synthetic pretrain → real fine-tune vs mixed
  from start vs progressive. What the literature shows works best.
- **Domain-adaptation** techniques applicable to one-stage detectors (feature
  alignment, adversarial DA, pseudo-labeling/self-training, BN adaptation).
- How much real data is "enough" per class to close the gap.

### 7. Auto-labeling real unlabeled documents (scale the real set)
How to cheaply turn large unlabeled real-document image pools into labeled
detection data: open-vocabulary detectors (**Grounding DINO, GLIP, OWLv2**),
**SAM/SAM2** for masks→boxes, large VLM teachers (**Qwen2.5-VL, InternVL,
Florence-2**) for layout, and **knowledge distillation** from a heavy teacher to
our YOLOv11n student. Give a concrete auto-label + human-in-the-loop QA workflow
and quality-control checks (label noise handling, confidence thresholds, CLIP
filtering).

### 8. Hard negatives & decoys
What non-document and confuser content to include so the model doesn't over-fire
(blank scenes, screenshots, book pages, posters, business cards, credit cards,
playing cards, magazines). Recommended hard-negative fraction.

### 9. Evaluation & gates (so we never fool ourselves again)
- Best **real** benchmark sets to gate on per class, and how to build a held-out
  real test split without leakage.
- Metrics beyond mAP that matter for our downstream use (recall at deployment
  conf, boundary IoU for `document_page`, small-object AP).
- How to detect and quantify a sim2real gap early.

### 10. Concrete reference pipelines & repos to copy
Point me to the actual open-source pipelines / papers whose data recipe I should
clone (e.g. DocXPand generator, SynthDoG/Donut data, DocLayNet tooling, Augraphy
recipes, BlenderProc examples). Prioritize MIT/Apache/permissive.

### 11. Pitfalls & anti-patterns
List the top mistakes that cause exactly our failure (synthetic looks great, real
fails), and how to avoid each.

### 12. Final recommended blueprint
Synthesize everything into a single prioritized, end-to-end blueprint: the exact
data sources, generation methods, degradation graph, mixing ratio, auto-labeling
plan, and training curriculum you would use to take a YOLOv11n from 0.36 → ≥0.95
real recall — ordered by impact-per-effort, with rough dataset sizes and a note
on what's shippable (permissive) vs research-only.

## OUTPUT FORMAT
- Structured by the 12 sections above, with tables for datasets (name | classes |
  size | annotation | license | commercial-OK | link).
- Every nontrivial claim cited.
- End with the prioritized blueprint and a one-paragraph "if you only do 3 things"
  summary.
- Call out licensing risk explicitly anywhere a source is research-only.
