# Identity Document & Passport Datasets — Intel Dossier

> Mission: source datasets of real (and high-quality synthetic) identity documents —
> passports, national ID cards, driver's licenses, residence permits, visas — to fix
> our biggest weakness: **real-world bad-passport detection** (phone captures, glare,
> rotation, motion blur, partial crops, low light).
>
> Scope of our doc-detector classes referenced below: `document_page`, `photo`
> (portrait/face-on-ID), `mrz_zone`. We also note whether **field-level** and **quad**
> (4-corner) boxes exist, since those feed template alignment + ROI extraction.
>
> Licensing is classified as: **PERMISSIVE** (CC-BY / MIT / Apache / CDLA-Permissive),
> **RESEARCH-ONLY** (academic / non-commercial), **GATED** (request/agreement), or
> **UNCLEAR/RISKY**. Where a license could not be confirmed from source, it is marked
> **UNVERIFIED**.
>
> _Note: source descriptions below were paraphrased for compliance with licensing
> restrictions; all claims are linked to their origin._

---

## Summary Table

| # | Dataset | Gives us (classes / boxes) | Real vs Synthetic | Size & variety | Annotation | License class (exact) | Access | Priority |
|---|---------|----------------------------|-------------------|----------------|------------|-----------------------|--------|----------|
| 1 | **MIDV-500** | `document_page` + `photo` + `mrz_zone`; quad corners, field boxes, face | **Real source docs** (public-domain samples) captured on phone video | 500 clips, 50 doc types (17 ID, 14 passport, 13 DL, 6 other) | quad + field-level + face bbox | RESEARCH-ONLY / **UNCLEAR** for redistribution ("public domain or public copyright") | FTP `ftp://smartengines.com/midv-500/` | **P0** |
| 2 | **MIDV-2019** | same as MIDV-500, harder captures | Real source docs | Extension of MIDV-500 with distorted + low-light clips | quad + field-level | RESEARCH-ONLY / **UNCLEAR** (same as MIDV-500) | FTP `ftp://smartengines.com/midv500/extra/` (via midv500 tooling) | **P0** |
| 3 | **MIDV-2020** | `document_page` + `photo` + `mrz_zone`; quad, field, face | **Mock docs**, real capture conditions; synthetic faces + fields | 1000 unique docs: 1000 clips + 2000 scans + 1000 photos | quad + field-level + face + text | RESEARCH-ONLY / **UNCLEAR** | FTP `ftp://smartengines.com/midv-2020` + `l3i-share.univ-lr.fr` | **P0** |
| 4 | **DocXPand-25k** | `document_page` + fields + (MRZ as field); generated on real backgrounds | **Synthetic** (templates over real scenes) | ~25k images, multiple FR/EU ID + passport templates | field-level + class | **RESEARCH-ONLY** (CC-BY-NC-SA 4.0); generator code **MIT** | GitHub `QuickSign/docxpand` (releases v1.0.0) | **P0** |
| 5 | **IDNet** | `document_page` + fraud/tamper labels | **Synthetic** | ~837,060 images / ~490 GB; 20 types (10 US states + 10 EU) | field + forgery/tamper class | **UNVERIFIED** (research release) | Zenodo (multi-part) + HF `cactuslab/IDNet-2025` | P1 |
| 6 | **MIDV-Holo** | `document_page`; hologram/OVD + presentation-attack labels | **Synthetic** passports/ID cards on video | 700 clips (300 genuine + 400 attack) | quad + attack-type labels | **RESEARCH-ONLY** (Smart Engines public release) | Smart Engines (request/FTP) | P1 |
| 7 | **DLC-2021** | `document_page`; liveness / recapture / copy attack labels | Real docs recaptured (screen, print, copy) | 1424 video clips, real-world conditions | clip-level forensics labels | **RESEARCH-ONLY** (Zenodo, UNVERIFIED exact) | Zenodo `record/6586764` | P1 |
| 8 | **SIDTD** | `document_page` + forgery labels; built on MIDV-2020 | **Synthetic** (forged variants) | ID + travel docs, forged/genuine pairs | field + forgery class | **RESEARCH-ONLY** (UNVERIFIED exact) | GitHub `Oriolrt/SIDTD_Dataset` + Nature paper | P1 |
| 9 | **BID Dataset** (Brazilian IDs) | `document_page` + `photo` + fields | **Real-style** Brazilian IDs (RG/CNH/CPF), faces masked | First public BR ID set (thousands of imgs) | field-level + segmentation | RESEARCH-ONLY / **UNVERIFIED** exact license | GitHub `ricardobnjunior/Brazilian-Identity-Document-Dataset` | P1 |
| 10 | **MIDV-UP** | `document_page` + fields; broad capture scenarios | **Synthetic** (no real PII) | ~9,000 fully annotated synthesized images | field-level | RESEARCH-ONLY / **UNVERIFIED** | Smart Engines (request) | P1 |
| 11 | **ud-biometrics/passport-dataset** | `document_page` + `photo` | **Synthetic** | 100,000+ passport images, 100+ countries | layout + photo | **UNCLEAR/RISKY** (vendor; sample gated) | HF `ud-biometrics/passport-dataset` | optional |
| 12 | **ud-synthetic/{usa,french,indian}-passports** | `document_page` + `mrz_zone` (as metadata) + `photo` | **Synthetic** | ~1k each; per-field + MRZ metadata | field metadata (JSON) | **UNCLEAR/RISKY** (vendor) | HF `ud-synthetic/*-passports` | optional |
| 13 | **UniDataPro / ud-biometrics — synthetic-printed-brazilian-passports** | `document_page` + `photo` + fields | **Synthetic** | 96 rows (sample) | field + bbox | **RISKY** (CC-BY-NC-ND-4.0 — ND blocks derivatives) | HF datasets | optional |
| 14 | **MRZ text-detection set** (TrainingDataPro/UniqueData) | `mrz_zone` + text detection boxes | **Synthetic/generated** | 80 rows (sample) | bbox + OCR text | **RISKY** (CC-BY-NC-ND-4.0) | HF `TrainingDataPro/ocr-generated-machine-readable-zone-mrz-text-detection` | optional |
| 15 | **synthetic_cards** (sugiv) | `document_page` (DL + credit cards) | **Synthetic** | 15,110 images | field metadata for VLM | **UNVERIFIED** | HF `sugiv/synthetic_cards` | optional |
| 16 | **Passport & ID MASK-RCNN set** (iAmmarTahir) | `document_page`; instance segmentation | **Real** scraped passports/IDs | 500+ images, many countries | COCO segmentation | **UNVERIFIED** (no explicit license) | GitHub `iAmmarTahir/MASK-RCNN-Dataset` | optional |
| 17 | **Roboflow `passport_codes` + ID search** | `document_page` + `mrz_zone` (code1/code2) + field regions | Mixed (real uploads) | ~2k imgs; many community ID sets | bbox | **UNCLEAR/RISKY** (per-project, varies) | Roboflow Universe | optional |
| 18 | **Selfie-and-ID Dataset** | `photo` (face-on-ID ↔ selfie reID) | Real selfies + doc photos | Large reID pair set | identity pairs | **UNCLEAR/RISKY** (vendor) | GitHub `Trainingdata-datamarket/Selfie-and-ID-Dataset` | optional |
| 19 | **ML_IDCard_Segmentation** (tobiassteidle) | `document_page` segmentation (built on MIDV-500) | Derived from MIDV | MIDV-derived masks | segmentation masks | inherits MIDV terms | GitHub `tobiassteidle/ML_IDCard_Segmentation_Pytorch` | optional |

---

## Per-Dataset Detail

### 1. MIDV-500 — the canonical real-doc-in-the-wild set
- **What it gives us:** `document_page` quad corners per frame, `photo` (portrait) region, and text **field-level** boxes; usable to train detection + quad regression + MRZ-zone localization. Includes 14 passport types and 13 driver's licenses, so direct passport coverage.
- **Real vs synthetic:** Real source documents — the underlying samples are public-domain / open-license specimen documents, filmed on two mobile phones in 5 capture conditions ([arXiv 1807.05786](https://arxiv.org/abs/1807.05786v2), [PyPI midv500](https://pypi.org/project/midv500/0.2.0/)).
- **Size & variety:** 500 video clips across 50 document types — 17 ID cards, 14 passports, 13 driving licences, 6 other ([PyPI](https://pypi.org/project/midv500/0.2.0/)).
- **Annotation:** Quadrangle coordinates + field boxes + face/photo; community tooling converts to COCO segmentation ([fcakyon/midv500](https://github.com/fcakyon/midv500), [ternaus/midv-500-models](https://github.com/ternaus/midv-500-models)).
- **License:** Authors state source images are "in public domain or distributed under public copyright licenses" ([ResearchGate](https://www.researchgate.net/publication/326437168_MIDV-500_A_Dataset_for_Identity_Documents_Analysis_and_Recognition_on_Mobile_Devices_in_Video_Stream)). This is **not a standard SPDX license** — fine for training experiments, but **redistribution rights are UNCLEAR**. Treat as RESEARCH-ONLY.
- **Access:** FTP `ftp://smartengines.com/midv-500/`; pip `midv500` helper for download + COCO conversion.
- **Realism/difficulty:** 5 conditions including rotation, partial crop, low light, glare, and held-in-hand — exactly our failure modes.
- **Priority:** **P0** — only widely-available set with *real passport pages* captured under bad conditions.

### 2. MIDV-2019 — the "hard captures" expansion
- Extends MIDV-500 with clips shot on higher-res phones featuring **strong projective distortion** and **low lighting** ([ar5iv 1910.04009](https://ar5iv.labs.arxiv.org/html/1910.04009), [docsaid dataset notes](https://docsaid.org/en/docs/docaligner/dataset/)).
- Same annotation structure and same license posture as MIDV-500 (RESEARCH-ONLY / redistribution UNCLEAR).
- Access via the same `midv500` tooling (extra split) / Smart Engines FTP.
- **Priority:** **P0** — this is the single closest match to "real bad passport" (skew + low light on real doc pages).

### 3. MIDV-2020 — volume + rich annotation
- 1000 **unique mock** identity documents, each with unique generated face + unique field values, delivered as 1000 video clips + 2000 scans + 1000 photos ([ResearchGate](https://www.researchgate.net/publication/359393635_MIDV-2020_a_comprehensive_benchmark_dataset_for_identity_document_analysis)).
- Rich annotation: quad, field-level boxes, faces, text values — strong for `document_page` + `photo` + field training.
- **License:** same MIDV "public copyright" posture → RESEARCH-ONLY / redistribution **UNCLEAR**.
- **Access:** `ftp://smartengines.com/midv-2020` and `http://l3i-share.univ-lr.fr` ([DeepAI](https://deepai.org/publication/midv-2020-a-comprehensive-benchmark-dataset-for-identity-document-analysis)).
- **Caveat:** capture conditions are realistic but documents are mock, so it improves robustness/volume more than true real-passport fidelity.
- **Priority:** **P0** — best annotation richness + passport count for scaling training.

### 4. DocXPand-25k — large synthetic, and a permissive *generator*
- ~25k synthetic ID images composited from templates onto real-world backgrounds; covers multiple French/EU ID and passport-style templates with field annotations ([arXiv 2407.20662](https://arxiv.org/abs/2407.20662v1), [GitHub QuickSign/docxpand](https://github.com/QuickSign/docxpand)).
- **License (critical nuance):** the **dataset** is **CC-BY-NC-SA 4.0** (non-commercial + share-alike → RESEARCH-ONLY, viral), but the **generator software is MIT** ([arXiv 2407.20662](https://arxiv.org/abs/2407.20662v1)). That means we can **self-generate our own permissive dataset** from the MIT generator and sidestep the NC-SA restriction. High leverage.
- **Priority:** **P0** — large scale, field-level boxes, and an open generator we can re-run locally.

### 5. IDNet — massive synthetic fraud/tamper corpus
- ~837,060 synthetic ID images (~490 GB) spanning 20 document types from 10 US states + 10 EU countries, built for fraud/tamper detection ([arXiv 2408.01690](https://arxiv.org/abs/2408.01690)).
- Distributed in multi-part archives on Zenodo ([Zenodo part 6](https://zenodo.org/records/13855175)) and mirrored on HF ([`cactuslab/IDNet-2025`](https://huggingface.co/datasets/cactuslab/IDNet-2025)).
- **License: UNVERIFIED** — could not confirm exact terms from source; treat as RESEARCH-ONLY until checked.
- **Priority:** P1 — enormous for tamper/forgery primitives, less for raw real-capture detection.

### 6. MIDV-Holo — hologram / presentation-attack
- Synthetic passports and ID cards filmed on video with custom holographic security elements: 300 genuine clips + 400 presentation-attack clips ([ResearchGate](https://www.researchgate.net/publication/373232277_MIDV-Holo_A_Dataset_for_ID_Document_Hologram_Detection_in_a_Video_Stream), [Smart Engines](https://smartengines.com/news-events/smart-engines-secures-u-s-patent-for-advanced-document-verification-technology-using-smartphones/)).
- Used as a public benchmark alongside MIDV-2020 for hologram verification ([arXiv 2404.17253](https://arxiv.org/abs/2404.17253?context=cs.CV)).
- **Priority:** P1 — valuable for OVD/liveness, secondary for plain detection.

### 7. DLC-2021 — document liveness / recapture
- 1424 video clips in real-world conditions for ID document forensics: originals vs unlaminated color/grey copies vs screen recaptures ([PubMed](https://pubmed.ncbi.nlm.nih.gov/35877624/), [Zenodo](https://zenodo.org/records/6586764), [MDPI J. Imaging](https://www.mdpi.com/2313-433X/8/7/181)).
- **License:** Zenodo release, RESEARCH-ONLY, **exact terms UNVERIFIED**.
- **Priority:** P1 — anti-spoofing/liveness primitives; real capture variety useful.

### 8. SIDTD — synthetic ID + travel docs for forgery detection
- Synthetic ID/travel-document set built to train + evaluate forged-ID detectors, since real ID datasets cannot be published due to PII ([Nature s41597-024-04160-9](https://www.nature.com/articles/s41597-024-04160-9), [GitHub Oriolrt/SIDTD_Dataset](https://github.com/Oriolrt/SIDTD_Dataset)). Derived from MIDV-2020 base.
- **License:** RESEARCH-ONLY, exact terms **UNVERIFIED**.
- **Priority:** P1 — forgery primitives + genuine/forged pairs.

### 9. BID Dataset — Brazilian identity documents
- First public dataset of Brazilian ID documents (RG, CNH, CPF variants), with faces/PII masked for privacy, field-level + segmentation annotations ([GitHub ricardobnjunior](https://github.com/ricardobnjunior/Brazilian-Identity-Document-Dataset), [ResearchGate sample](https://www.researchgate.net/figure/BID-Dataset-Image-Sample_fig4_346680364)).
- **License:** RESEARCH-ONLY in practice, **exact license UNVERIFIED** (could not pull LICENSE text from the repo). Confirm a usage agreement before redistribution.
- **Priority:** P1 — adds non-MIDV national-ID diversity; faces masked limits `photo` class use.

### 10. MIDV-UP — newer synthetic capture-scenario set
- ~9,000 fully annotated synthesized images with no real personal data, spanning flatbed scans → photos → video, with natural shadows/glare/perspective ([Smart Engines](https://smartengines.com/news-events/smart-engines-expands-id-document-scanning-and-authentication-capabilities-to-iran-and-pakistan/)).
- **License:** RESEARCH-ONLY / **UNVERIFIED**; Smart Engines request.
- **Priority:** P1 — clean synthetic with realistic distortions.

### 11–18. Hugging Face / Roboflow / GitHub satellite sets (optional)
- **ud-biometrics/passport-dataset** — 100,000+ synthetic passports from 100+ countries ([HF](https://huggingface.co/datasets/ud-biometrics/passport-dataset)); vendor sample, license **UNCLEAR/RISKY**.
- **ud-synthetic/usa-passports, french-passports, indian-passports** — ~1k each, per-field + **MRZ metadata** ([HF usa](https://huggingface.co/datasets/ud-synthetic/usa-passports), [french](https://huggingface.co/datasets/ud-synthetic/french-passports), [indian](https://huggingface.co/datasets/ud-synthetic/indian-passports)); license **UNCLEAR/RISKY**.
- **synthetic-printed-brazilian-passports** (UniDataPro / ud-biometrics) — 96-row sample, **CC-BY-NC-ND-4.0** → **RISKY** (ND blocks derivative datasets/possibly model weights) ([HF](https://huggingface.co/datasets/UniDataPro/synthetic-printed-brazilian-passports)).
- **MRZ text-detection** (TrainingDataPro/UniqueData) — 80-row `mrz_zone` + OCR sample, **CC-BY-NC-ND-4.0** → RISKY ([HF](https://huggingface.co/datasets/TrainingDataPro/ocr-generated-machine-readable-zone-mrz-text-detection)).
- **sugiv/synthetic_cards** — 15,110 synthetic DLs + credit cards for VLM fine-tuning, license **UNVERIFIED** ([HF](https://huggingface.co/datasets/sugiv/synthetic_cards)).
- **iAmmarTahir/MASK-RCNN-Dataset** — 500+ **real** scraped passports/IDs with COCO segmentation, **no explicit license (UNVERIFIED)** ([GitHub](https://github.com/iAmmarTahir/MASK-RCNN-Dataset)).
- **Roboflow Universe** — community `passport_codes` (~2k, MRZ code regions) and many ID sets; per-project licenses vary, mostly **UNCLEAR/RISKY** ([Roboflow passport_codes](https://universe.roboflow.com/passportscodes/passport_codes), [ID search](https://universe.roboflow.com/search?q=class:id%20card)).
- **Selfie-and-ID Dataset** — face-on-ID ↔ selfie reID pairs for `photo` class ([GitHub](https://github.com/Trainingdata-datamarket/Selfie-and-ID-Dataset)); vendor, **UNCLEAR/RISKY**.

---

## TOP 3 to Ingest First

1. **MIDV-500 + MIDV-2019** (treat as one ingest) — the only readily-available corpus with **real passport pages** filmed under glare, skew, low light, and partial crop. This is the most direct lever on real-bad-passport detection. Build `document_page` quad + `photo` + `mrz_zone` labels from the provided field/quad ground truth. _License caveat: train-only; do not redistribute the raw images._
2. **MIDV-2020** — biggest richly-annotated capture set (clips + scans + photos, 1000 docs incl. passports). Use for volume, field-level supervision, and capture-condition augmentation. Same train-only caveat.
3. **DocXPand** — run the **MIT-licensed generator** locally to mint our own large, field-annotated, *redistributable* synthetic ID/passport set, avoiding the dataset's CC-BY-NC-SA restriction. Best path to an open-source-clean training corpus.

---

## Licensing Landmines

- **MIDV family ("public domain or public copyright"):** This is a prose claim about the *source specimen images*, not a standard SPDX license on the *packaged dataset*. Safe for internal training/experiments; **redistribution of the bundle is UNCLEAR** — do not ship MIDV images inside an open-source release. ([MIDV-500](https://www.researchgate.net/publication/326437168_MIDV-500_A_Dataset_for_Identity_Documents_Analysis_and_Recognition_on_Mobile_Devices_in_Video_Stream))
- **DocXPand CC-BY-NC-SA 4.0:** Non-Commercial blocks commercial use and Share-Alike is viral (derivatives must carry the same license). **But the generator is MIT** — self-generated outputs are clean. Prefer generating over redistributing. ([arXiv 2407.20662](https://arxiv.org/abs/2407.20662v1))
- **CC-BY-NC-ND-4.0 on several HF synthetic passport/MRZ sets:** the **ND (No-Derivatives)** clause is the trap — building a derived dataset, or arguably distributing model weights trained on them, may violate it. Avoid for a redistributable/open-source pipeline. ([brazilian-passports](https://huggingface.co/datasets/UniDataPro/synthetic-printed-brazilian-passports), [MRZ set](https://huggingface.co/datasets/TrainingDataPro/ocr-generated-machine-readable-zone-mrz-text-detection))
- **IDNet, SIDTD, DLC-2021, MIDV-UP, MIDV-Holo, BID:** licenses are RESEARCH-ONLY or **UNVERIFIED**. Confirm exact terms (and any click-through agreement) before any redistribution; safe to use for training experiments with attribution.
- **Vendor HF sets (ud-biometrics / ud-synthetic / UniDataPro):** these are marketing samples of larger paid corpora; license fields are inconsistent and full sets are gated. Treat as **UNCLEAR/RISKY** — verify per-repo before relying on them.
- **Roboflow Universe / scraped GitHub sets (MASK-RCNN-Dataset):** community uploads frequently have **no explicit or inconsistent license** and may contain real PII scraped from the web — high legal + privacy risk. Use only with verified terms.

---

_Sources cross-verified across arXiv, Nature, MDPI, PubMed, Zenodo, Hugging Face, GitHub,
and the dataset authors' pages where possible. Content was rephrased for compliance with
licensing restrictions._
