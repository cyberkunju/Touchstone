# Visual Assets — Real-Box Dataset Hunt for the Synthetic-Only Classes

**Mission:** find *real* (non-synthetic, document-context, bounding-box-annotated) datasets for the
six docdet-v0 classes that today have **no real-label source** and are therefore "synthetic-only
validated":

> `signature(2)`, `stamp(3)`, `seal(4)`, `logo(5)`, `qr_code(6)`, `barcode(7)`
> (+ `checkbox(10)` — owned by the forms agent, out of scope here.)

**Appraiser's rules used below**
- *Real vs synthetic* — judged honestly. "Real scans" > "synthetic distortions of real pages" > "fully synthetic render".
- *Annotation* — we need **BOXES** (or masks we can box). Many famous "signature/stamp/seal" sets are
  **verification / classification** sets (genuine-vs-forgery, identity) with **no localization** — those are
  fakes to us, flagged explicitly.
- *Document-context vs generic-scene* — a street/product logo or a grocery barcode is a **weaker proxy**
  than the same artifact sitting on a scanned document. Called out per item.
- *License class* — PERMISSIVE / RESEARCH-ONLY / GATED / UNCLEAR + the exact license.
  Roboflow Universe licenses vary wildly per dataset; each must be verified, never assumed.

> Compliance note: all source descriptions below are paraphrased; every claim carries an inline link.
> Content was rephrased for compliance with licensing restrictions.

---

## 1. Summary table — the loot

| Class | Best real-box dataset | Real? | Boxes? | Doc-context? | License (class) | Verdict |
|---|---|---|---|---|---|---|
| **signature (2)** | [tech4humans/signature-detection](https://huggingface.co/datasets/tech4humans/signature-detection) (Tobacco-800 + RF100 signatures) | Real scans | ✅ bbox | ✅ documents | **Apache-2.0 (PERMISSIVE)** | ✅ **REAL BOXES** |
| **stamp (3)** | [DDI-100](https://github.com/machine-intelligence-laboratory/DDI-100) (stamp masks) + [StaVer](http://www.madm.eu/downloads) | Real-page based / real scans | ✅ mask→box | ✅ documents | **MIT (PERMISSIVE)** / research | ✅ **REAL BOXES** |
| **seal (4)** | Roboflow seal/stamp sets + [Chinese-Seal Dataset](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5079459); PP-OCR seal det proves feasibility | Real | ✅ bbox (verify) | ✅ documents | **UNCLEAR / RESEARCH** | ⚠️ **PARTIAL — boxes exist, clean license doesn't** |
| **logo (5)** | [IIIT-AR-13K](https://arxiv.org/abs/2008.02569) (logo boxes on annual reports) — doc-context; [LogoDet-3K](https://github.com/Wangjing1551/LogoDet-3K-Dataset) for scale | Real | ✅ bbox | ✅ docs (IIIT-AR-13K) / ❌ generic (LogoDet) | **UNCLEAR / RESEARCH** | ✅ **REAL BOXES** (license needs sign-off) |
| **qr_code (6)** | [ABBYY barcode_detection_benchmark](https://github.com/abbyy/barcode_detection_benchmark) (ZVZ-real/synth, incl. QR/Aztec/DataMatrix) | Real + synth | ✅ bbox/mask | ✅ document scans | **Apache-2.0 (PERMISSIVE)** | ✅ **REAL BOXES** |
| **barcode (7)** | [ABBYY barcode_detection_benchmark](https://github.com/abbyy/barcode_detection_benchmark) (ZVZ-real 921 imgs: doc scans + wild) | Real + synth | ✅ bbox/mask | ✅ document scans | **Apache-2.0 (PERMISSIVE)** | ✅ **REAL BOXES** |

**Headline:** 4 of 6 classes (signature, stamp, qr_code, barcode) can move off synthetic-only **with
permissive licenses today**. `logo` can too, but the best document-context source has an unclear license.
`seal` is the one that effectively **stays stuck** on synthetic/research-only unless we accept
unclear-license Roboflow/Chinese-seal sets or fold it into `stamp`.

---

## 2. Per-artifact appraisal

### 2.1 SIGNATURE → docdet class 2

**P0 — `tech4humans/signature-detection`** (Hugging Face)
- which class: signature(2)
- real vs synthetic: **real** — built from Tobacco-800 (scanned tobacco-industry documents, from the IIT
  CDIP collection) + the RF100 `signatures-xc8up` set, unified in Roboflow.
  [HF card](https://huggingface.co/datasets/tech4humans/signature-detection),
  [model card detail](http://huggingface.co/tech4humans/conditional-detr-50-signature-detector).
- scale: 2,819 document images (train 1,980 / val 420 / test 419), COCO JSON, 640px.
- annotation: **bounding boxes** of signatures (single class `signature`). This is true detection, not verification.
- license: **Apache-2.0 → PERMISSIVE** (stated explicitly on the dataset card's License section).
- access: HF `tech4humans/signature-detection`; original Roboflow project `tech-ysdkk/signature-detection-hlx8j`.
- doc-context: ✅ yes — scanned documents/letters.
- PRIORITY: **P0**. Permissive, document-context, ready-to-train boxes. This single dataset closes the
  signature gap.

**P0 (second source) — IIIT-AR-13K**
- [arXiv:2008.02569](https://arxiv.org/abs/2008.02569) / [Springer](https://link.springer.com/chapter/10.1007/978-3-030-57058-3_16).
- ~13k annual-report pages with bounding boxes for five classes including **signature** and **logo**.
- Real, manually annotated, document-context (business documents). Annotation = boxes.
- license: **UNCLEAR / RESEARCH-USE** — distributed via the authors' project page; no explicit
  redistributable license confirmed. Verify before commercial use. Still excellent for *measurement*.
- PRIORITY: **P0 for eval**, especially because it gives signature + logo boxes in one real doc set.

**Supporting / proxies (note, don't rely on):**
- [Ultralytics/Signature](https://huggingface.co/datasets/Ultralytics/Signature) — has signature boxes but
  only ~135 images and **AGPL-3.0 (RESEARCH/COPYLEFT)** — too small and license-encumbering. Optional only.
- Tobacco-800 itself ([PapersWithCode](https://paperswithcode.com/dataset/tobacco-800)) — the canonical
  source; the tech4humans set already repackages it with boxes under a clean license, so prefer that.
- ⚠️ **Verification traps (NOT detection):** CEDAR, GPDS, MCYT, SigComp'11 are signature *verification*
  corpora (genuine vs forgery, cropped signature images) — **no document-region boxes**. Worthless for our
  box-detection need. [example](https://github.com/jadevaibhav/Signature-verification-using-deep-learning).

**Signature verdict: ✅ REAL BOXES AVAILABLE, PERMISSIVE.**

---

### 2.2 STAMP → docdet class 3

**P0 — DDI-100 (Distorted Document Images)**
- [GitHub](https://github.com/machine-intelligence-laboratory/DDI-100) /
  [paper](https://paperswithcode.com/dataset/ddi-100).
- real vs synthetic: **hybrid** — 100k+ images synthesized by distorting **7,000 real unique document
  pages**; strong document context even though augmentation is synthetic.
- scale: 100,000+ images. annotation: **stamp masks** (+ text masks, char/word boxes) → masks convert
  cleanly to stamp bounding boxes.
- license: **MIT → PERMISSIVE** (confirmed in the repo
  [LICENSE](https://github.com/machine-intelligence-laboratory/DDI-100/blob/master/LICENSE)).
- access: GitHub repo (download links there).
- doc-context: ✅ yes — document pages.
- PRIORITY: **P0**. The permissive license + stamp masks make this the anchor for the stamp class.

**P0 (real scans) — StaVer (Stamp Verification dataset, DFKI/madm)**
- [DFKI/madm downloads](http://www.madm.eu/downloads) /
  [paper](https://link.springer.com/chapter/10.1007%2F978-3-319-20125-2_11).
- real vs synthetic: **real** — 400 scanned invoice documents (printed, stamped, scanned at 200 dpi),
  stamps of varied shape/color, some overlapping signatures/text, some pages with none or several.
  [GTS mirror description](https://gts.ai/dataset-download/stamp-verification-dataset/).
- annotation: **segmentation masks** of stamps → boxes derivable. Despite the name "verification", it ships
  pixel-level stamp ground truth (this is localization, not just genuine/forgery).
- license: **RESEARCH-USE** (DFKI/madm dataset release; typically requires acknowledgment, not openly
  redistributable). Verify terms on the madm page before redistribution.
- doc-context: ✅ yes — invoices.
- PRIORITY: **P0 for eval**, P1 for training redistribution (license caution).

**Evidence the combo trains a real stamp detector:**
[MDPI Appl. Sci. 2025, "YOLOv8/9/10/11 for Stamp Detection in Scanned Documents"](https://www.mdpi.com/2076-3417/15/6/3154/xml)
trains/evaluates on **StaVer + DDI-100** with mAP — confirms both yield usable detection boxes.

**Optional Roboflow:**
- [customsapp/stamps-annotation](https://universe.roboflow.com/customsapp/stamps-annotation) — stamp boxes;
  **verify per-dataset license on Universe** (varies wildly).
- HF [bilal01/stamp-verification](https://huggingface.co/datasets/bilal01/stamp-verification) — small
  (~60 rows), segmentation-oriented; optional.

**Stamp verdict: ✅ REAL BOXES AVAILABLE, PERMISSIVE (DDI-100 MIT) + research-use real scans (StaVer).**

---

### 2.3 SEAL → docdet class 4 (the hard one)

Seal (red/circular official seal) is the **most exposed** class. It overlaps visually with stamp, and the
dedicated seal corpora are mostly Chinese-seal research sets with unclear redistribution terms or are
recognition/segmentation rather than clean detection releases.

**Candidates:**
- **Chinese-Seal Dataset (CSD)** — [SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5079459).
  Built for seal detection/segmentation/recognition with color (red/blue/black) and difficulty attributes.
  Real seals. License: **UNCLEAR / RESEARCH** — no confirmed open license; access via authors.
- **PP-OCR seal detection** — [PP-OCRv4_server_seal_det](https://huggingface.co/PaddlePaddle/PP-OCRv4_server_seal_det)
  evaluated on a PaddleX test set of ~500 circular-stamp images; the *models/toolkit* are
  **Apache-2.0** ([PaddleOCR 3.0](https://arxiv.org/abs/2507.05595)) but the **training/test seal dataset
  itself is not published as a redistributable box dataset**. Proves feasibility, doesn't hand us data.
- **Roboflow Universe seal sets** — e.g. [osu/SEAL_C4](https://universe.roboflow.com/osu/seal_c4),
  and historical-document layout sets that include a *stamp/seal* zone class
  ([Roboflow100-VL macro-segmentation](https://universe.roboflow.com/roboflow100vl-full/macro-segmentation-kaer8-nnld)).
  Boxes exist; **license must be checked per dataset** (often CC BY 4.0, sometimes unspecified).
- **Diffusion seal-generation paper** — [arXiv:2310.00546](https://arxiv.org/html/2310.00546v3) — notes the
  *real* seal dataset is very limited, which is exactly our problem; their solution is to **synthesize** seals.

- which class: seal(4)
- real vs synthetic: real seals exist (CSD, Roboflow) but the well-licensed pipeline points back to synthesis.
- annotation: boxes obtainable (Roboflow) / masks (CSD) — but no clean permissive doc-seal detection release confirmed.
- doc-context: ✅ (Chinese contracts/invoices) where it exists.
- license: **UNCLEAR / RESEARCH** across the board.
- PRIORITY: **P1**. Pragmatic option: either (a) accept an UNCLEAR-license Roboflow seal set for *eval only*,
  (b) merge seal into the stamp class for real-box training and keep seal-vs-stamp separation synthetic, or
  (c) keep seal synthetic-only and document the gap.

**Seal verdict: ⚠️ PARTIAL — real boxes are obtainable but a clean, permissive, redistributable
document-seal detection set was NOT found. Stays effectively synthetic-only for training unless we accept
research/unclear licenses or fold seal into stamp.**

---

### 2.4 LOGO → docdet class 5 (judge document vs generic scene carefully)

The famous logo benchmarks are **generic-scene / product-brand** logos — a weak proxy for a logo sitting on
a scanned document. The document-context source is the rarer, more valuable find.

**P0 (document-context) — IIIT-AR-13K**
- [arXiv:2008.02569](https://arxiv.org/abs/2008.02569) /
  [Springer](https://link.springer.com/chapter/10.1007/978-3-030-57058-3_16).
- ~13k annual-report pages, manual boxes for table/figure/natural-image/**logo**/signature.
- real, document-context (business reports). annotation = **boxes**. Logo here is a *document* logo. ✅
- license: **UNCLEAR / RESEARCH** — verify with authors before redistribution.
- PRIORITY: **P0** — the only strong *document-logo* box source found; also doubles for signature.

**P1 (scale, but generic scene) — LogoDet-3K**
- [GitHub](https://github.com/Wangjing1551/LogoDet-3K-Dataset) /
  [ACM TOMM](https://dl.acm.org/doi/10.1145/3466780).
- 158,652 images, 3,000 logo classes, ~194k–200k boxed logo objects. Huge.
- annotation: **boxes** (full annotation). real.
- doc-context: ❌ **generic scene / product & brand logos in the wild**, not documents — weaker proxy.
- license: **UNCLEAR / RESEARCH** — repo carries no explicit open license; paper frames it as academic.
- PRIORITY: **P1** — great for pretraining logo "is there a logo" recall; not document-representative.

**Other generic-scene logo sets (optional, weak proxies):**
- FlickrLogos-32/47, Logos-in-the-Wild, OpenLogo/QMUL-OpenLogo — all **natural-scene** brand logos,
  mostly **RESEARCH-ONLY**, not document context. Use only as auxiliary pretraining. (Brand-logo HF sets
  like [brand-eye](https://huggingface.co/datasets/haydarkadioglu/brand-eye-dataset) are automotive/scene.)
- Note: StaVer invoices and DocLayNet contain logos visually, but they are **not separately boxed as logos**
  (DocLayNet "Picture" lumps all figures; not a logo label).

**Logo verdict: ✅ REAL BOXES AVAILABLE. Document-context boxes via IIIT-AR-13K (license needs sign-off);
LogoDet-3K adds massive scale but is generic-scene. No permissive, document-context logo set confirmed —
best doc source is research/unclear.**

---

### 2.5 QR_CODE → docdet class 6

**P0 — ABBYY `barcode_detection_benchmark` (ZVZ-real / ZVZ-synth)**
- [GitHub](https://github.com/abbyy/barcode_detection_benchmark) /
  [Springer paper](https://link.springer.com/chapter/10.1007/978-3-030-57058-3_34) (Zharkov et al.).
- real vs synthetic: **both** — a synthetic set covering many symbologies (Code128, EAN13, DataMatrix,
  Aztec, **QR**, …) **plus a real test set of 921 images that explicitly includes document scans** and
  in-the-wild photos.
- annotation: **boxes / segmentation masks**. detection-grade.
- license: **Apache-2.0 → PERMISSIVE** (repo license).
- doc-context: ✅ yes — the real split includes document scans (rare and exactly what we want).
- PRIORITY: **P0** — permissive + 2D codes (QR/Aztec/DataMatrix) + document scans. Closes QR.

**Supporting QR sets (mostly in-the-wild photos, CC BY 4.0):** Szentandrási, Dubská, Bodnár Syn10k,
QR-DN1.0, SmartEngines — all catalogued with licenses in
[BenSouchet/barcode-datasets](https://github.com/BenSouchet/barcode-datasets). These are **generic-scene**
QR (phone photos), weaker doc proxies, but CC BY 4.0 and useful for augmentation.

**QR verdict: ✅ REAL BOXES AVAILABLE, PERMISSIVE (Apache-2.0), with genuine document scans.**

---

### 2.6 BARCODE → docdet class 7

**P0 — ABBYY `barcode_detection_benchmark`** (same as QR above)
- [GitHub](https://github.com/abbyy/barcode_detection_benchmark), **Apache-2.0**.
- ZVZ-real 921 images incl. **document scans**; many 1D + 2D symbologies; boxes/masks.
- doc-context: ✅. PRIORITY: **P0**. Single permissive set covers both barcode + qr_code.

**Strong supporting catalog — [BenSouchet/barcode-datasets](https://github.com/BenSouchet/barcode-datasets)**
(verified license per entry):
- **InventBar** (527 imgs) & **ParcelBar** (844 imgs) — **CC BY 4.0**, rotated-rect boxes; but indoor
  consumer-goods / parcel labels = **generic scene**, weaker doc proxy.
  [paper/PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9696533/pdf/sensors-22-08788.pdf),
  [download](https://cmu.to/BenchmarkBarcodeDatasets).
- **DEAL/KAIST**, **Arte-Lab**, **Muenster** (CC BY-NC-ND — non-commercial, careful), **SmartEngines**
  (CC BY 4.0, document-scan oriented synthetic), **SBD** (CC BY 4.0, 100k synthetic). Licenses range
  CC BY 3.0/4.0 → CC BY-NC-ND (avoid the NC-ND ones for redistribution).
- **BARBER** aggregate benchmark — [unimore ditto](https://ditto.ing.unimore.it/barber/) — 12 merged public
  sets, 8,748 images / 9,818 barcodes, unified VGG annotations (verify aggregate license per source).
- Kaggle [Barcode Detection Annotated Dataset](https://www.kaggle.com/datasets/whoosis/barcode-detection-annotated-dataset) — CC BY 4.0, 708 imgs.

**Barcode verdict: ✅ REAL BOXES AVAILABLE, PERMISSIVE (Apache-2.0 doc scans + multiple CC BY sets).**

---

## 3. Blunt verdict — who escapes synthetic-only, who stays stuck

| Class | Can get REAL boxes? | Best path | License reality |
|---|---|---|---|
| **signature (2)** | ✅ **YES** | tech4humans/signature-detection (+ IIIT-AR-13K for eval) | **PERMISSIVE (Apache-2.0)** — clean escape |
| **stamp (3)** | ✅ **YES** | DDI-100 (masks→boxes) + StaVer real scans | **PERMISSIVE (MIT)** for DDI-100; StaVer research-use |
| **qr_code (6)** | ✅ **YES** | ABBYY ZVZ benchmark (incl. doc scans) | **PERMISSIVE (Apache-2.0)** — clean escape |
| **barcode (7)** | ✅ **YES** | ABBYY ZVZ + CC BY sets (InventBar/ParcelBar/BARBER) | **PERMISSIVE (Apache-2.0 / CC BY)** — clean escape |
| **logo (5)** | ✅ **YES (caveat)** | IIIT-AR-13K (doc-context) ; LogoDet-3K (scale, generic) | **UNCLEAR / RESEARCH** — boxes exist, no permissive doc set |
| **seal (4)** | ⚠️ **BARELY** | Roboflow/CSD seal sets (eval), or fold into stamp | **UNCLEAR / RESEARCH** — no clean permissive doc-seal set |

**Bottom line for the detector team:**
- **4 classes escape cleanly with permissive licenses:** signature, stamp, qr_code, barcode. These should be
  promoted off "synthetic-only validated" — wire real-label eval (and optionally training) now.
- **logo** can escape for *measurement* using IIIT-AR-13K (document logos) and LogoDet-3K (scale), but
  **no permissive, document-context logo box set was found** — treat the license as a blocker for
  redistributing training data; eval is fine.
- **seal stays effectively stuck on synthetic.** Real seal boxes only come from research/unclear-license
  Chinese-seal sets or per-dataset-verify Roboflow sets. Pragmatic options: (a) eval-only on an
  unclear-license set, (b) merge seal→stamp for real-box training, or (c) keep seal synthetic and document
  the residual gap. The literature itself ([arXiv:2310.00546](https://arxiv.org/html/2310.00546v3)) confirms
  real seal data is scarce and resorts to synthesis.

**Partner handoff (checkbox(10)):** out of scope here; forms agent should look at FUNSD/XFUND-style form sets
and Roboflow checkbox sets (license-verify each) — no permissive checkbox-box source surfaced during this hunt.

---

## 4. Provenance & licensing caveats (dealer's fine print)
- **Roboflow Universe licenses vary per dataset** — every Universe link above must be license-checked
  individually before redistribution; RF100 member sets are commonly CC BY 4.0 but not universally.
- **"Verification" ≠ "detection."** CEDAR/GPDS/MCYT/SigComp (signatures) and many "stamp/seal verification"
  sets are classification/authentication corpora with **no boxes** — excluded as fakes for our purpose.
- **Research-use / UNCLEAR** items (IIIT-AR-13K, LogoDet-3K, StaVer, CSD) are fine for **internal eval /
  measurement** but require author/license sign-off before shipping training data or models trained on them
  commercially. Confirm before relying on them past the benchmark gate.
- All dataset descriptions paraphrased; ≤30 consecutive words per source; attributed via inline links.
