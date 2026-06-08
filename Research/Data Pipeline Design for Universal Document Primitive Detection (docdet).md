# Data Pipeline Design for Universal Document Primitive Detection (docdet)

## 1. Problem recap and requirements

docdet aims to detect 12 document primitives (document_page, photo, signature, stamp, seal, logo, qr_code, barcode, mrz_zone, table, checkbox, text_block) on arbitrary document types under harsh smartphone capture conditions, with a YOLOv11n-scale detector deployed in-browser/Tauri via ONNXRuntime Web (WASM/WebGPU). The v1 system trained on purely procedural 2D synthetic data shows severe sim2real failure (MIDV-500 mAP@50 ≈0.355, recall ≈0.36 at conf 0.25) despite synthetic mAP@50 ≈0.982, confirming a large domain gap.

The goal is to redesign the full data pipeline—synthetic generation, real data, mixing, and auto-labeling—so that a YOLOv11n‑class model can reach ≥0.95 recall at high precision on real data.


## 2. Taxonomy of synthetic-data methods for detection

### 2.1 Fully procedural 2D rendering

**How it works.** Procedural engines render documents directly in 2D using graphics primitives (PIL/OpenCV) and analytic effects (noise, blur, perspective transforms, JPEG artifacts) without a 3D scene or real backgrounds. DDI‑100 is an example: it takes 6 658 unique real document pages and renders >100 000 distorted images with various geometric transforms, background textures, text and stamp masks, and bounding boxes.[^1][^2][^3]

**Transfer quality.** Procedural pipelines that do not incorporate real backgrounds, realistic paper/ink texturing, or camera ISP are typically sufficient for robustness to basic affine distortions and print–scan degradations, but not for smartphone photo realism (desk clutter, hands, complex lighting, ISP noise). DDI‑100, although synthetic, is built on real pages and backgrounds and has been validated to support text detection/OCR models on real data; the authors show “high-quality performance on real data” for TD/OCR models trained on DDI‑100, partly because they start from real documents and natural backgrounds. Purely analytic synthetic scenes (like your v1) lack these statistics.[^3][^1]

**Cost and tooling.** Pure 2D procedural generation is cheap (CPU‑only, no 3D assets) and easy to scale, but its domain gap is high for smartphone captures.

**When to use.**
- As a cheap pretraining stage for robustifying to blur, noise, print–scan artifacts.
- For classes where shape is simple and appearance is less sensitive (e.g., checkboxes, simple tables) but only if complemented by real-background compositing and strong degradations.


### 2.2 Copy‑paste / cut‑paste on real backgrounds

#### 2.2.1 Cut, Paste and Learn

Dwibedi et al. propose “Cut, Paste and Learn” for instance detection by cutting real object masks and pasting them onto random scene images. They show that ensuring only patch‑level realism at the pasted objects (via blending, truncation, occlusion) is sufficient for strong detection performance, even if global scene semantics are inconsistent. In cross‑domain settings, their synthetic data plus 10 % real data outperforms using all real data.[^4][^5]

Key tricks:[^5][^4]
- Poisson blending and other boundary smoothing methods reduce edge artifacts and significantly improve detector performance vs naive pasting.
- Truncation ensures at least 25 % of the object is inside the frame, which improves robustness to partial crops.
- Occlusion is simulated by overlapping pasted instances with IOU up to 0.75.

#### 2.2.2 Simple Copy‑Paste

Ghiasi et al. systematically study Copy‑Paste for instance segmentation (and detection) and find that randomly pasting objects is “good enough” and yields consistent AP gains across strong baselines.[^6][^7]

Empirical results:[^7][^6]
- On COCO instance segmentation, Copy‑Paste + self‑training yields 57.3 box AP and 49.1 mask AP, improving a 54.8‑box‑AP baseline by +2.5 box AP and +2.2 mask AP.
- On LVIS, Copy‑Paste improves rare‑class AP by +2.3 to +2.6 mask AP and, when combined with repeat‑factor sampling, yields +8.7 AP on low‑shot categories.
- In a low‑data regime (10 % of COCO), Copy‑Paste yields +10 box AP.

**Blending methods.** Cut‑Paste and Copy‑Paste implementations typically rely on:
- Alpha matting / feathering at boundaries.
- Poisson blending to harmonize lighting and color.[^5]
- Multi‑scale (pyramidal) blending when compositing large objects.

These methods directly improve detection performance by suppressing low‑level edge artifacts that detectors otherwise overfit to.[^4][^5]

**Transfer quality.** For object detection in natural scenes, cut‑paste methods plus a moderate amount of real data consistently improve real‑world AP vs real‑only training, especially for rare classes and low‑data regimes. For documents, DocXPand‑25k effectively uses a similar paradigm: synthetic IDs composed on ~5 800 real backgrounds, matched in color and lighting to real reference images, with resulting localization IoU ≈95.4 % for ID bounding boxes.[^8][^9][^6][^7][^4]

**Cost and tooling.**
- Requires real background photo banks and high‑quality foreground masks (from clean templates, vector renderers, or segmentation masks in datasets like DDI‑100 and DocLayNet).[^10][^3]
- Scaling to millions of images is straightforward; Poisson blending is GPU‑friendly.

**When to use.**
- For your problem, cut‑paste onto real background photos should be the primary synthetic generator for document_page, photo, stamps/seals, logos, QR/barcodes, and MRZs.
- It is particularly effective for simulating partial crops, occlusions, and varied scale distributions.


### 2.3 Physics‑based degradation: Augraphy and related pipelines

Augraphy is a Python library designed specifically for document image augmentation, simulating printing, scanning, faxing, paper textures, ink bleed, folds, and other physical processes.[^11][^12][^13][^14]

**Key capabilities.**
- Pipelines split document into “ink” and “paper” layers; both are independently augmented then merged.[^12]
- Ink degradations: ink bleed, ghosting, toner splatter, low‑resolution printing, etc.[^15][^12]
- Paper degradations: textures, stains, wrinkles, folds, and physical deformations.[^12][^15]
- Capture artifacts: lighting gradients, shadows, blur, noise; version 2+ roadmap includes augmentations mimicking camera‑phone distortions.[^14][^11]

Augraphy is released under the MIT license, making it straightforward to integrate into commercial pipelines.[^16]

**Transfer quality.** The Augraphy paper shows that augmentations based on real document processes (print, scan, fax, aging) enable denoisers and binarizers trained on synthetic data to perform well on real noisy scans. While the paper focuses on denoising, the same distortions are highly relevant for document detection in non‑ideal scans and mild camera captures.[^13]

**When to use.**
- As a mid‑stage in the pipeline: start from a clean composed page (from vector templates + cut‑paste backgrounds), run Augraphy to simulate realistic paper/ink; then optionally feed the result into a 3D capture model or direct perspective transforms.


### 2.4 3D rendering with Blender/BlenderProc and domain randomization

BlenderProc is a procedural Blender pipeline capable of rendering realistic images with path‑traced lighting, physical materials, camera intrinsics, and multiple output modalities (RGB, depth, normals, segmentation, optical flow). It supports common 3D dataset formats (ShapeNet, 3D‑FRONT) and allows explicit control over camera parameters, lens distortions, and HDRI environment maps for realistic lighting.[^17][^18]

**Domain randomization vs photorealism.**
- Photo‑realistic Neural Domain Randomization (PNDR) combines neural rendering with randomization, achieving state‑of‑the‑art zero‑shot sim2real for 6D object detection and depth estimation.[^19]
- PNDR’s learned deferred renderer (RenderNet) is reported as ≈1 600× faster than traditional ray‑tracing while retaining photorealism.[^19]
- A domain‑randomized synthetic dataset can outperform simple fine‑tuning on limited real data: one study reports ≈25 % mAP improvement over a fine‑tuned baseline using synthetic data with randomized shapes, poses, and realism.[^20]
- Another domain‑randomization‑based sim2real pipeline for YOLOv4 achieves 86.32 % and 97.38 % mAP@50 in zero‑shot and one‑shot transfer respectively on an industrial object dataset of 190 real images.[^21]

**For documents.** A 3D pipeline can model:
- True page geometry: perspective, curling, page bending.
- Lighting: shadows cast by hands or surrounding objects, specular highlights on laminated IDs.
- Camera optics: focal length, lens distortion, depth of field, motion blur.
- Background clutter via 3D assets and random HDRI environment maps.[^18][^22]

**Cost and tooling.**
- Highest initial engineering cost (asset creation: paper meshes, hand meshes, desk/room scenes) and offline rendering time.
- Once built, can generate richly varied labeled data with perfect 3D bounding boxes (projected to 2D) and control over object scales and partial crops.

**When to use.**
- For critical sim2real robustness on smartphone captures with strong perspective, bending, and complex lighting, a 3D component is highly recommended.
- Should be used for MRZ zones, passports/IDs, and realistic desk/hand scenes where the 2D compositing model breaks down.


### 2.5 Generative methods: diffusion, GANs, VLM‑guided synthesis

**Layout‑conditioned synthetic layouts.** DocLayout‑YOLO introduces DocSynth‑300K, a synthetic document layout corpus created via a Mesh‑candidate BestFit algorithm: building pages as a 2D bin‑packing problem using component pools (tables, figures, text blocks) mostly derived from M⁶Doc. Pretraining on DocSynth‑300K then fine‑tuning on real datasets yields consistent mAP gains: e.g., on the D⁴LA benchmark, AP50 improves from 81.7 to 82.4 and mAP from 69.8 to 70.3. On DocStructBench, DocSynth pretraining gives mAP 82.1 vs 81.0 with PubLayNet pretraining and 81.6 with DocBank.[^23][^24][^22][^25]

These results show that synthetic layout distributions, if aligned to real distributions and combined with real fine‑tuning, meaningfully improve downstream layout detection.

**Diffusion‑based document synthesis.** DocXPand‑25k uses Stable Diffusion to generate identity document photos and synthetic backgrounds, combined with vector templates and realistic compositing to match real ID appearance. The dataset emphasizes background diversity via 5 800 real photos/scans, and the authors report ID localization IoU ≈95.4 % using their SDL‑Net locator.[^9][^8]

**GANs / diffusion for per‑class content.** Generative models can synthesize realistic faces (ID photos), signatures, and stamps, but they typically do not expose bounding boxes directly; labels must be derived from the generation process (e.g., known locations in the template) or via teacher detectors.

**Transfer quality.** Synthetic layout pretraining (DocSynth‑300K) plus real fine‑tuning improves mAP by ≈1–3 points across multiple document layout benchmarks, demonstrating that realistic synthetic layouts significantly help generalization when combined with real data.[^22][^25]

**When to use.**
- Use generative models primarily to expand the variability of content inside known templates (faces, signatures, photo backgrounds) while keeping geometry and labels controlled.
- Avoid using fully unconstrained generative images for training detectors, as labels can be noisy and geometry unpredictable.


### 2.6 Relative ranking for real‑world transfer (opinion)

**This subsection reflects expert judgement synthesized from the cited works; explicit rankings are not directly reported in the literature.**

For document primitive detection under smartphone conditions, a pragmatic ranking by expected sim2real transfer (holding engineering effort fixed) is:

1. **Copy‑paste on real backgrounds + Augraphy‑style degradation.** Strong evidence from general object detection (Cut‑Paste, Copy‑Paste, DocXPand‑25k) and document denoising suggests this approach yields large gains with moderate effort.[^8][^6][^13][^4]
2. **3D rendering with domain randomization + HDRI.** For strong geometric and lighting robustness, 3D pipelines plus domain randomization can nearly close the sim2real gap in other domains; expected to be similarly powerful for documents.[^21][^19]
3. **Layout‑conditioned synthetic corpora (DocSynth‑style).** Proven to yield ~+1–3 mAP gains when combined with real fine‑tuning.[^25][^22]
4. **Pure 2D procedural pipelines without real backgrounds.** Useful for pretraining but insufficient alone for robust smartphone performance (as seen in your v1 results).


## 3. Real background and scene banks (license‑clean)

For cut‑paste and 3D rendering, you need large, license‑permissive collections of background scenes representing desks, hands, tables, floors, walls, cafes, etc. This section focuses on sources where derivative works and commercial use are allowed or can be obtained.

### 3.1 Public datasets and repositories

- **Open Images V7.** Contains >9 M images with object bounding boxes and other annotations. Images are largely from Flickr and subject to CC‑BY and similar licenses; the overall dataset is released under a “Creative Commons Attribution 4.0 International License (CC BY 4.0)” with attribution requirements for each image. You can filter for scene categories (e.g., “desk”, “office”, “table”) and crop backgrounds.[^26][^27]
- **PubLayNet page images.** PubLayNet provides 360 k document page images with layout annotations, under CDLA‑Permissive‑1.0. While not backgrounds per se, they can serve as “desk clutter” context or as pseudo‑backgrounds when compositing smaller primitives.[^28]
- **DDI‑100 backgrounds.** DDI‑100 uses 5 659 different images as document backgrounds, all built from public‑domain documents and textures. The GitHub repository is MIT‑licensed; the exact data license is less clearly documented, but an issue suggests the dataset is intended for open research use, potentially MIT. Legal review is advised before commercial use.[^2][^29][^3]

### 3.2 Stock/background photo sources (commercial)

This report focuses on open datasets, but in practice, purchasing or licensing curated background packs (from stock providers that offer explicit ML training rights) is straightforward and highly recommended.

**Opinion.** For a production privacy‑first system, combining:
- 50 k–100 k CC‑BY/CC‑0 backgrounds from Open Images and similar sources, plus
- 10 k–20 k proprietary, licensed office/home backgrounds
will materially reduce the domain gap for desk/hand environments.


## 4. Real labeled datasets by class

The following table summarizes major public datasets relevant to your 12 classes, emphasizing license and commercial suitability.

### 4.1 Summary table

| Class | Key datasets | Size / labels | License / use | Notes |
|------|--------------|---------------|--------------|-------|
| document_page | PubLayNet[^28], DocLayNet[^10][^30], DocBank[^31][^32][^33], M⁶Doc[^23], DocSynth‑300K (synthetic)[^22][^25] | PubLayNet: 360 k pages with layout boxes[^28]; DocLayNet: 80 863 pages, 11 classes[^10]; DocBank: 500 k pages[^31][^32][^33]; M⁶Doc: 9 080 pages, 237 116 instances across 74 categories[^23] | PubLayNet: CDLA‑Permissive‑1.0 (commercial OK with attribution)[^28][^34]; DocLayNet: CDLA‑Permissive‑1.0[^30][^35]; DocBank: Apache‑2.0 (commercial‑friendly)[^33]; M⁶Doc: GitHub repo under Apache‑2.0 (check)[^23] | Excellent for document_page, table, text_block, logo, figure etc. Mostly PDF/scans, limited smartphone capture. |
| identity docs / document_page in the wild | MIDV‑500[^36][^37][^38], MIDV‑2019[^38], MIDV‑2020[^39][^40][^41][^42], SmartDoc[^43][^44], SIDTD[^45] | MIDV‑500: 500 video clips of 50 ID types[^36][^38]; MIDV‑2020: 1 000 clips, 2 000 scans, 1 000 photos, 72 409 annotated images[^39][^40][^42]; SmartDoc: smartphone document captures for OCR[^43][^44]; SIDTD: forged ID/video dataset w/ doc bounding boxes[^45] | MIDV datasets and SmartDoc: research‑only, require license agreement; typically non‑commercial research.[^44][^41] SIDTD: research dataset under CVC terms[^45] | Critical for real smartphone capture; use as evaluation and possibly pretraining if license permits. |
| signature | Tobacco‑800 signature ground truth[^46][^47], CEDAR[^48][^49], GPDS synthetic[^50][^51] | Tobacco‑800: 1 290 pages; v2.0 ground truth includes signatures and logos[^46]; CEDAR: 24 genuine + 24 forged signatures per 55 users (2 640 images)[^48][^49]; GPDS: up to 4 000 signers, 24 genuine + 30 forgeries per signer[^50] | Tobacco‑800: research dataset (TC‑11) — research‑only, non‑commercial.[^46] CEDAR/GPDS: research datasets; licenses restrict commercial use without permission.[^48][^50][^49][^51] | Use for signature appearance modeling and synthetic generator validation. |
| stamp/seal | DDI‑100 stamp masks[^1][^2][^3], StaVer (Stamp Verification)[^52] | DDI‑100: >100 000 images, includes stamp masks and stamp detection task[^1][^3]; StaVer: 400 scanned invoices with stamps and pixel‑wise stamp ground truth[^52] | DDI‑100: GitHub repo suggests open research use, potentially MIT; confirm before commercial.[^2][^29]; StaVer: distributed via Kaggle and GTS AI; typically non‑exclusive research license[^52] | DDI‑100 is strong for synthetic stamp/seal modeling; StaVer gives real‑scan stamps. |
| logo | Tobacco‑800 logos[^46], DocLayNet’s title/figure classes[^10], generic logo datasets | Tobacco‑800 groundtruth v2.0 includes logo locations[^46]; DocLayNet includes “figure”, “image”, “caption”, “title” and similar classes that can be repurposed for logo‑like elements[^10] | Tobacco‑800 research‑only[^46]; DocLayNet CDLA‑Permissive‑1.0[^30][^35] | Combine with synthetic logo renderings (vector logos, random colors). |
| qr_code / barcode | BarBeR[^53][^54], Kaggle barcode/QR sets[^55], small QR datasets | BarBeR: 8 748 real images, 9 818 barcodes (8 062 linear, 1 756 2D) with polygon annotations[^53]; custom Kaggle dataset: 31 078 barcode/QR images, YOLOv8s achieves 97.1 % accuracy[^55]; small synthetic QR code sets exist but often clean.[^56] | BarBeR: AGPL‑3.0, requiring copyleft for derivatives; problematic for proprietary commercial models.[^54]; Kaggle datasets vary — many CC‑BY‑NC or custom; must check per dataset.[^55] | Use BarBeR and Kaggle for research and generator validation; rely on on‑the‑fly synthetic QR/barcode generation for commercial training. |
| table | PubTables‑1M[^57], PubLayNet[^28], DocLayNet[^10], DocBank[^31][^32][^33] | PubTables‑1M detection split: 575 305 images, 683 056 objects (table, rotated table)[^57]; 947 642 tables for TSR[^57]; PubLayNet, DocLayNet, DocBank sizes above | PubTables‑1M: CDLA‑Permissive‑2.0[^57][^34]; PubLayNet/DocLayNet/DocBank licenses as above[^28][^30][^33][^34] | Primary real data source for table detection. |
| checkbox | CommonForms[^58][^59][^60], FUNSD[^61][^62] | CommonForms: ~55 k documents, >450 k pages; 3 field types: text_input, choice_button (checkbox/radio), signature[^58][^60]; validation subset: 10 000 images, 34 643 field instances (30.7 % choice_button)[^60]; FUNSD: 199 noisy scanned forms, key/value annotations.[^61][^62] | CommonForms: not yet finalized, but authors aim for open release; check license on release (likely commercial‑friendly). FUNSD: research‑only, non‑commercial.[^62] | Critical for checkbox and signature boxes; docdet can map `choice_button`→`checkbox` class. |
| text_block | PubLayNet, DocLayNet, DocBank, M⁶Doc | See counts above.[^28][^10][^31][^23][^32][^33] | Licenses as above. | Use to train a generic text_block detector; docdet can treat all “Text”/“Paragraph”/“Body text” as text_block. |


## 5. Class‑specific synthetic generation recipes

This section describes “better‑than‑real” synthetic generation strategies per class, designed to exploit specifications and existing datasets.

### 5.1 MRZ (mrz_zone)

MRZs follow ICAO Doc 9303 specifications.[^63][^64][^65]

Key constraints (TD1/TD2/TD3):
- TD1 documents: two MRZ lines of 30 characters each; TD2: two lines of 36 chars; TD3 (passport): two lines of 44 chars.[^64][^65][^63]
- Character set is OCR‑B, upper‑case Latin letters, digits, and filler `<`.
- Fields include document code, issuing state, name, document number + check digit, nationality, birth date + check digit, sex, expiry date + check digit, optional data with check digit.[^63]

**Generation recipe.**
- Use an open ICAO‑compliant MRZ generator library (several permissive‑licensed ones exist) or implement your own based on Doc 9303 structure.[^63]
- Use OCR‑B (open fonts exist) at appropriate DPI (≈300 dpi for printed, 72–150 dpi for on‑screen) and fixed line height corresponding to MRZ zone dimensions.[^65][^63]
- Implement correct check digit computation (weighted sums mod 10 over digits and character codes).[^63]
- Render onto ID templates (see DocXPand: nine ID designs across TD1/TD2/TD3) and onto independent MRZ stripes (for partial crops).[^9][^8]

**Opinion.** Synthetic MRZs can be more diverse than real training MRZs due to random personal data; as long as the generator strictly adheres to ICAO field formats and check digit rules, detectors trained on them should generalize very well.


### 5.2 Barcodes and QR codes

Use a high‑quality barcode/QR generation library (e.g., Zxing, `qrcode`, `python-barcode`) with support for multiple symbologies and error‑correction levels.

**Barcode recipes.**
- Linear symbologies: Code‑128, Code‑39, EAN‑13, EAN‑8, UPC‑A, Interleaved‑2‑of‑5.[^66]
- 2D symbologies: QR Code (ECC L/M/Q/H), DataMatrix, PDF417.[^66]
- Content: realistic payloads (URLs, IDs, random strings). Kaggle barcode/QR datasets with ~31 078 images show YOLOv8s detection accuracy of 97.1 % when trained with tailored data, indicating that synthetic + moderate real is sufficient.[^55]

**Rendering and degradation.**
- Render at high resolution and then downsample with Gaussian blur, perspective distortion, and motion blur to simulate handheld capture.[^15]
- Embed into document pages via cut‑paste on real backgrounds.
- Ensure each synthetic code is scannable by an off‑the‑shelf decoder during QA.


### 5.3 Signatures

Leverage:
- CEDAR and GPDS datasets for style priors (signature shapes).[^48][^50][^49][^51]
- Stroke‑based synthetic signature generators that simulate pen trajectories using Bezier curves and velocity‑dependent thickness (numerous academic methods; the GPDS dataset itself is synthetic for many users).[^50]

**Recipe.**
- Train a variational autoencoder or diffusion model on binarized signature images (from CEDAR/GPDS; research only) for research experiments, but for commercial training rely on parametric stroke generators that do not reuse dataset content.
- Randomize pen color, thickness, ink bleed (via Augraphy’s ink bleed augmentation), slant, and scale.[^14][^15]
- Place signatures onto plausible regions (bottom of page, near “Signature:” labels, near stamps) using heuristics or layout priors from Tobacco‑800.[^47][^46]


### 5.4 Stamps and seals

DDI‑100 includes 99 stamp images and corresponding stamp masks across >100 000 images, with explicit support for stamp detection tasks. StaVer provides 400 real invoices with stamps and binary stamp masks.[^52][^1][^3]

**Recipe.**
- Build a stamp template library from public‑domain stamp images and synthetic vector designs.
- Use Augraphy’s ink bleed and noise augmentations to simulate fuzzy edges and overlapping text; the DDI‑100 stamp masks and StaVer ground truths can be used to calibrate size and opacity distributions.[^52][^3]
- Apply cut‑paste with partial overlap onto signatures and text to simulate common real‑world stamp behavior (overlapping signatures, text, or logos).[^52]


### 5.5 Checkboxes and forms

CommonForms treats form fields as objects of types `text_input`, `choice_button` (checkbox/radio), and `signature`, with ~450 000 pages and hundreds of thousands of annotated fields. The validation subset alone has 34 643 fields, of which 30.7 % are `choice_button`.[^58][^60]

**Recipe.**
- Use CommonForms as the primary real dataset for checkbox detection: map `choice_button` → `checkbox`.
- For synthetic forms, adopt a DocSynth‑style layout engine with components: labels (text), text fields (rectangles), checkboxes (squares), and signature lines.[^24][^22]
- Render vector checkboxes with different fill states (empty, checkmark, cross, mixed) and sizes; embed them in forms with realistic spacing and alignment.


### 5.6 Tables

PubTables‑1M detection and TSR splits provide highly diverse table geometry: 575 305 images and 683 056 labeled table objects, with 52.7 % complex tables. DocSynth‑300K uses pools of table elements from M⁶Doc to synthesize layouts.[^57][^23][^24][^22]

**Recipe.**
- Use PubTables‑1M as the primary real dataset for table detection.[^57]
- For synthetic tables, use a layout engine that randomizes:
  - Row/column counts and merged cells.
  - Border styles (none, light, heavy, partial), shading, and header rows.
  - Alignment with surrounding text blocks.


### 5.7 Text blocks, logos, and photos

These are best modeled via a combination of:
- Real layout datasets (PubLayNet, DocLayNet, DocBank, M⁶Doc).[^31][^28][^10][^23]
- Synthetic layout engines (DocSynth‑300K).[^24][^22][^25]
- Generative content (faces via Stable Diffusion, logos via vector libraries).[^8][^9]

**Recipe.**
- For text_block, treat all body text, paragraph, list, and caption regions as candidate text_block boxes.
- For photo, embed faces and scene photos (DocXPand uses Stable Diffusion for ID photos, combined with uniform sampling of ethnic origins).[^8]
- For logo, place small vector logos or generated symbols in top corners or near headers, echoing Tobacco‑800 and StaVer invoice layouts.[^46][^52]


## 6. Realistic capture and degradation pipeline

A realistic pipeline should approximate the full imaging chain:
1. Layout and content generation (synthetic or real base).
2. Print/paper and ink physics.
3. Geometry (bending, folding, perspective).
4. Optical capture (lighting, shadows, lens, focus, motion).
5. Sensor/ISP (demosaicing, noise, sharpening, white balance).
6. Codec (JPEG/HEIC compression).

### 6.1 Geometry

- Use Augraphy’s page warping and folding augmentations for mild non‑flat pages.[^13][^12][^15]
- For strong bends, creases, and 3D deformations (e.g., folded passports, bent receipts), use Blender/BlenderProc with paper meshes and physically‑based deformation (simple cloth simulations or displacement maps).[^17][^18]
- Apply homographies and partial crops (enforcing at least 25 % visible object area as in Cut‑Paste) to simulate partially visible documents and off‑screen cropping.[^5]

### 6.2 Print/paper and ink

- Use Augraphy’s ink and paper pipelines to model different paper textures (high‑quality, low‑quality, recycled), ink bleed, toner loss, and paper aging stains.[^12][^13][^15]
- Random parameter ranges (opinion, informed by Augraphy docs):[^15]
  - Ink bleed radius: 1–3 px at 300 dpi.
  - Paper texture contrast: 0.05–0.25 relative to mean luminance.
  - Stain opacity: 0.1–0.4.
  - Fold line width: 1–5 px, with associated shading.

### 6.3 Capture: lighting and camera

- Use HDRI maps in BlenderProc for realistic indoor lighting: office, home, restaurant.[^18]
- Add lighting gradients and directional light stripes via Augraphy’s LightingGradient augmentation.[^15]
- Simulate shadows of hands and other objects by adding 3D hand/arm meshes and occluders in Blender, or by overlaying hand masks from real captures.

### 6.4 Sensor and ISP

While precise ISP modeling is complex, approximate via:
- Random Gaussian and Poisson noise tuned to ISO levels typical of smartphone cameras.
- White balance shifts: small hue rotations and color temperature changes.
- Sharpening and ringing: unsharp masking + slight haloing.
- Motion blur and rolling shutter: linear and radial blur kernels aligned with simulated motion.

The domain randomization literature shows that randomizing rendering parameters (textures, lighting, camera position) in a physically‑based renderer can yield strong sim2real transfer, with mAP@50 up to 86.32 % (zero‑shot) and 97.38 % (one‑shot) on real YOLOv4 object detection when trained on synthetic images only plus one real image per class.[^21]

### 6.5 Codec

- Compress with JPEG quality uniformly sampled from 20–98 and optionally HEIC‑like compression for high‑efficiency encoders.
- Add random chroma subsampling artifacts.


## 7. Real + synthetic mixing and curriculum

### 7.1 Ratios and training schedules

Evidence from multiple domains:
- Cut, Paste and Learn: synthetic data plus only 10 % of real data can outperform using all real data on cross‑domain detection tasks.[^4]
- Copy‑Paste: in low‑data regime, adding copy‑paste augmentation yields +10 box AP when using 10 % of COCO data.[^7]
- DocLayout‑YOLO: DocSynth‑300K pretraining followed by fine‑tuning on real layout datasets yields +1–3 mAP improvements compared to real‑only pretraining.[^22][^25]
- Domain‑randomized synthetic + limited real: YOLOv4 domain‑randomization method achieves 86.32 % and 97.38 % mAP@50 in zero‑shot and one‑shot few‑shot transfers, respectively, on real industrial images.[^21]

**Opinionated mixing strategy for docdet.**

1. **Stage 1: Synthetic‑only pretraining.**
   - Train YOLOv11n on a large synthetic corpus (e.g., 3–5 M images) with heavy domain randomization and Augraphy/3D pipelines.
   - Objective: learn geometry, scale, and generic appearance priors for all 12 classes.

2. **Stage 2: Mixed real+synthetic training.**
   - Use approximately 1:1 to 1:2 real:synthetic ratio in minibatches once a sufficient real set is available (see Section 8 on auto‑labeling), emphasizing under‑represented real classes with oversampling.
   - Keep synthetic data diversified but slightly reduced in frequency over time (e.g., from 80 % synthetic to 50 % synthetic over training, via curriculum scheduling).

3. **Stage 3: Real‑only fine‑tuning.**
   - Final epochs (last 10–20 % of training budget) on real‑only data, focusing on target domains (e.g., smartphone photos). This consolidates real statistics without catastrophic forgetting of synthetic priors.

### 7.2 Domain adaptation techniques for one‑stage detectors

Although YOLO‑style models lack explicit domain adaptation modules by default, several techniques are applicable:

- **BatchNorm adaptation.** Re‑estimate BatchNorm statistics on real images (no labels) before deployment; this is simple and can reduce domain shift.
- **Adversarial feature alignment.** Introduce a domain classifier on intermediate feature maps and use a gradient reversal layer to make features invariant between synthetic and real domains.
- **Self‑training / pseudo‑labeling.** Use the current model or a stronger teacher (Section 8) to pseudo‑label unlabeled real images, filter high‑confidence detections, and mix them into training; Copy‑Paste gains combine well with self‑training on COCO and objects365, giving +2.9 AP overall compared to baseline.[^7]

**Opinion.** For a resource‑constrained detector like YOLOv11n, focus on BN adaptation and self‑training rather than heavy adversarial heads to keep inference complexity unchanged.

### 7.3 How much real data is “enough”?

There is no universal number, but practical evidence suggests:
- For industrial object detection, ≈200 real images can be sufficient for high mAP when combined with domain‑randomized synthetic training.[^21]
- For layout detection, DocSynth‑300K + tens of thousands of real pages yields good mAP across multiple real benchmarks.[^25][^22]

**Opinion.** For docdet, target (order‑of‑magnitude):
- 20–50 k real smartphone images of identity documents and receipts (with auto‑labeled primitives).
- 50–100 k real scans/PDF renders from all document categories.
- Ensure each class sees at least several tens of thousands of instances during training (for rare classes like mrz_zone, stamp, qr_code, that may require heavy synthetic oversampling).


## 8. Auto‑labeling real unlabeled documents at scale

To fully exploit unlimited unlabeled real documents, combine open‑vocabulary detectors, segmentation models, and vision‑language models as teachers.

### 8.1 Open‑vocabulary object detectors

- **Grounding DINO.** Open‑set detector combining DINO with grounded pre‑training and text prompts. Achieves 52.5 AP on COCO zero‑shot detection without training on COCO.[^67]
- **GLIP.** Reformulates object detection as phrase grounding; pre‑trained on 24 M grounded image captions, enabling detection of millions of visual concepts via natural language prompts.[^68]
- **OWLv2.** Improved open‑vocabulary detection with OWL‑ST self‑training; improves LVIS rare AP from 31.2 % to 44.6 % using web‑scale pseudo‑labels.[^69]

Use these models with prompts such as “passport”, “identity card”, “signature”, “stamp”, “logo”, “table”, “QR code”, “barcode”, “checkbox”, and “photo” to obtain coarse bounding boxes on real images.

### 8.2 Segmentation to sharpen boxes

- **SAM/SAM2.** Segment Anything models can generate high‑quality segmentation masks either prompted by points or boxes. Applying SAM on regions around teacher boxes allows refining object contours; tight bounding boxes are then obtained from masks.

### 8.3 VLM teachers for semantics

Vision‑language models (e.g., Florence‑2, Qwen‑VL, InternVL) can be used to validate or refine candidate labels by answering questions like “Is there a stamp in this region?” given a cropped image.

### 8.4 Label noise control and human QA

Following GLIP/OWLv2/Copy‑Paste + self‑training paradigms:[^68][^69][^7]

1. Run open‑vocabulary detectors on a large pool of unlabeled images.
2. Filter detections by confidence and size (e.g., keep >0.6 confidence, remove tiny boxes below area threshold depending on class).
3. Use SAM to refine boxes and compute simple shape metrics (e.g., rectangularity for QR/barcode, aspect ratio for document_page).
4. For each image, produce a candidate label set and an uncertainty score (fraction of low‑confidence or overlapping boxes).
5. Send a stratified sample of images (especially ones with low confidence or new domains) to human annotators for QA and correction.
6. Use human‑verified labels as a high‑quality subset for evaluation and as seeds for further self‑training.

### 8.5 Distillation to YOLOv11n

- Train YOLOv11n with a combination of ground‑truth (human‑labeled) and teacher labels, optionally using a distillation loss that encourages YOLO outputs to match teacher logits for both positive and negative regions.
- Use higher teacher confidence thresholds for small classes (mrz_zone, barcode, qr_code) to reduce noise.


## 9. Hard negatives and decoys

To suppress false positives, include large numbers of negatives where objects resemble your classes.

**Confuser categories (opinion):**
- Screenshots and on‑screen documents (PDF viewer, browser).
- Book and magazine pages, posters, business cards, playing cards.
- Non‑document printed materials: product packaging, labels, flyers.
- Visual patterns resembling QR/barcodes (geometric logos, grids).

Target hard‑negative fraction:
- Opinion: 10–30 % of training images should contain no positive docdet classes, with particular emphasis on classes that cause false positives (e.g., posters vs document_page, patterns vs qr_code/barcode).

Use Open Images, COCO, and web‑scraped photos as hard‑negative sources, with only background label.


## 10. Evaluation and gating

### 10.1 Benchmarks per class

- **document_page (identity docs).** MIDV‑500, MIDV‑2019, MIDV‑2020, SmartDoc, SIDTD.[^36][^43][^45][^39][^38][^41]
- **document_page (generic).** PubLayNet, DocLayNet, DocStructBench (academic layout).[^28][^10][^22][^25]
- **signature.** Tobacco‑800 signatures, CEDAR, GPDS synthetic.[^49][^51][^47][^48][^50][^46]
- **stamp/seal.** DDI‑100 stamp masks, StaVer.[^1][^3][^52]
- **qr_code/barcode.** BarBeR, Kaggle barcode/QR datasets.[^53][^55]
- **table.** PubTables‑1M, DocLayNet/DocBank tables.[^32][^10][^57]
- **checkbox.** CommonForms (choice_button).[^60][^58]
- **text_block.** DocLayNet, DocBank, PubLayNet.[^10][^31][^28]

### 10.2 Leakage‑free splits

- Respect original dataset train/val/test splits (e.g., DocLayNet provides predefined splits to avoid stylistic leakage).[^10]
- For MIDV/MIDV‑2020, create splits by document type and scene (e.g., hold out a subset of document types and backgrounds entirely for test).[^39][^41]

### 10.3 Metrics beyond mAP

- **Recall at deployment confidence threshold.** Report per‑class recall at your intended deployment confidence (e.g., 0.25 or 0.5), as your current MIDV recall 0.36 at 0.25 is the key problem.
- **Boundary IoU for document_page.** Use strict IoU thresholds (0.75–0.9) for document_page to ensure tight alignment, since cropping errors hurt downstream OCR.
- **Small‑object AP.** Separate AP for small objects (e.g., qr_code, barcode, checkbox) using standard COCO small/medium/large buckets.
- **Latency and model size.** Ensure that ONNXRuntime Web models run within 30 ms at 640–960 input on target hardware.


## 11. Reference pipelines and repos

- **Augraphy.** MIT‑licensed library for realistic document degradations (pipelines, ink/paper separation, folds, blur, lighting gradients).[^16][^13][^14][^12]
- **BlenderProc.** Procedural Blender pipeline for photorealistic rendering with path tracing, HDRI, and multiple output modalities.[^17][^18]
- **DocXPand.** Synthetic identity document generator and DocXPand‑25k dataset; uses vector templates, Stable Diffusion faces, real backgrounds, and color/luminance matching.[^9][^8]
- **DocLayout‑YOLO / DocSynth‑300K.** Synthetic layout corpus and YOLO‑based layout detector; provides scripts to convert DocSynth‑300K (parquet) to YOLO format and pretrain.[^24][^22][^25]
- **DDI‑100.** Distorted document images dataset, synthetic but built on real documents, with text and stamp masks, and background textures.[^2][^3][^1]
- **CommonForms.** Large‑scale form field detection dataset and FFDNet models for detecting text, choice buttons, and signature fields.[^59][^58][^60]


## 12. Pitfalls and anti‑patterns

Based on the above evidence and your v1 experience, the main anti‑patterns are:

1. **Synthetic‑only training on purely procedural images.** Leads to excellent synthetic mAP but poor real performance due to mismatched statistics (paper, ink, backgrounds, lighting, ISP). DDI‑100 mitigates this by basing synthesis on real pages and backgrounds.[^3][^1]
2. **Full‑frame, clean documents only.** Training on mostly full‑page, centered documents prevents the model from learning partial crops, multi‑doc scenes, and small scale objects.
3. **No real backgrounds or clutter.** Without desks, hands, and surrounding objects, detectors overfit to clean backgrounds and fail under clutter.
4. **Over‑weak or unrealistic degradations.** Toy degradations (simple motion blur, uniform noise) do not match real smartphone artifacts; Augraphy and 3D rendering provide more realistic degradations.[^13][^12]
5. **Ignoring rare classes.** Classes like mrz_zone, stamp, qr_code, barcode, checkbox are rare in real data; failing to oversample or synthetically augment them causes poor recall.
6. **Ignoring hard negatives.** Without confuser content, the detector may fire on posters, books, or arbitrary rectangular regions.
7. **License‑blind training.** Using research‑only datasets (e.g., MIDV‑2020, Tobacco‑800) for commercial model training without proper licensing is a legal risk.[^44][^41][^46]


## 13. Final recommended blueprint (opinionated)

This section proposes a concrete, implementation‑ready plan to take YOLOv11n from ≈0.36 recall on MIDV‑500 to ≥0.95 recall at high precision on real documents. All numbers and sources for datasets are cited; the prioritization and exact hyperparameters are expert opinion.

### 13.1 Data sources and target sizes (order‑of‑magnitude)

**Real (research‑only) for benchmarking and pretraining (non‑commercial):**
- MIDV‑500, MIDV‑2019, MIDV‑2020: ≈72 409 annotated images in MIDV‑2020 plus 500 clips in MIDV‑500; use for evaluation and R&D experiments.[^40][^38][^36][^39]
- SmartDoc: smartphone capture dataset for document OCR.[^43][^44]
- Tobacco‑800 signatures/logos: 1 290 images.[^46]
- CEDAR, GPDS signatures: 2 640 + tens of thousands of synthetic signatures.[^51][^48][^50][^49]
- DDI‑100: >100 000 distorted images, stamp and text masks.[^1][^3]
- StaVer: 400 invoices with stamps.[^52]
- BarBeR: 8 748 images, 9 818 barcodes.[^54][^53]

**Real (permissive, commercial‑friendly):**
- PubLayNet: 360 k pages.[^28]
- DocLayNet: 80 863 pages.[^30][^10]
- DocBank: 500 k pages, Apache‑2.0.[^33][^31][^32]
- PubTables‑1M detection: 575 305 images, 683 056 tables.[^57]
- CommonForms (check license when finalized), with ~55 k docs and 450 k pages, 34 643 annotated fields in validation subset.[^58][^60]
- M⁶Doc: 9 080 pages with 237 116 instances across 74 categories; GitHub suggests open‑source license.[^23]
- Open Images V7 backgrounds and other CC‑BY data for backgrounds.[^27][^26]

**Synthetic (to be generated):**
- DocSynth‑style layout corpus for general documents: 300 k–1 M pages (DocSynth‑300K is a good starting target).[^22][^25][^24]
- Identity documents: 200 k–500 k pages using DocXPand‑like templates and MRZ/barcode generators.[^9][^8]
- Synthetic barcodes/QR codes: millions of instances composited into documents and backgrounds.


### 13.2 Synthetic pipeline graph (implementation)

1. **Layout generator (2D).**
   - Use a DocSynth‑like Mesh‑candidate BestFit algorithm to sample page layouts from element pools (text_block, table, logo, photo, signature, stamp, checkbox, qr_code, barcode, mrz_zone).[^25][^24][^22]
   - Element pools drawn from M⁶Doc and real datasets, augmented synthetically for rare categories (<100 elements) using flips, crops, and geometric/noise augmentations.[^23][^24]

2. **Content renderers per element.**
   - Text blocks: render with multiple fonts, sizes, languages; optionally overlay real scanned text from DocBank and PubLayNet.[^31][^28]
   - MRZ: ICAO‑compliant generator for TD1/2/3; embed into ID templates.[^64][^65][^63]
   - Signatures: synthetic stroke generator + Augraphy ink bleed.[^14][^15]
   - Stamps: vector or raster templates + DDI‑style stamp masks for generating textures.[^3]
   - QR/barcodes: library‑generated, scannable codes with realistic payloads.[^55]
   - Checkboxes: vector squares with random mark types, shapes, and sizes; align with labels and text.[^60][^58]

3. **Document compositing (copy‑paste).**
   - Paste full pages or patches onto real backgrounds from Open Images and other scene banks using Poisson blending and alpha feathering.[^26][^4][^5]
   - Randomly sample scale, rotation, translation, and truncation (ensuring at least 25 % of each document_page is visible to encourage robustness to partial views).[^5]
   - Overlay hands or objects (from separate segmentation datasets) for occlusions.

4. **Augraphy printing/paper/ink stage.**
   - Apply Augraphy pipelines with randomized ink/paper parameters: texture, stains, folds, ink bleed, ghosting.[^12][^13][^15]

5. **3D capture stage (BlenderProc).**
   - Map the 2D page to a 3D paper mesh, configure camera intrinsics, lens distortion, depth of field, and HDRI lighting.[^18][^17]
   - Place documents on 3D desks with other objects; animate camera and document motion for motion blur and slight misalignment.
   - Render multiple output modalities (RGB, segmentation) and project 3D bounding boxes to 2D annotations.[^17]

6. **ISP and codec.**
   - Apply noise, white balance jitter, vignetting, sharpening, motion blur, and JPEG/HEIC compression.


### 13.3 Training curriculum

**Phase A: Synthetic pretraining.**
- Train YOLOv11n from scratch on 2–5 M synthetic images spanning all document and primitive types, with aggressive domain randomization.
- Use large image sizes (640–960) matching deployment.

**Phase B: Mixed training with auto‑labeled real data.**
- Collect a large unlabeled corpus of real documents (scans and smartphone photos, including your own) — aim for ≥100 k images.
- Run Grounding DINO/GLIP/OWLv2 to obtain pseudo‑labels for your 12 classes (with synonyms).[^67][^69][^68]
- Refine boxes with SAM; filter by high confidence and plausible shapes.
- Manually QA a stratified subset (e.g., 5–10 k images) and correct labels.
- Train YOLOv11n on synthetic + pseudo‑labeled + human‑labeled real, using per‑class weights to emphasize rare real classes.

**Phase C: Real‑only fine‑tuning and BN adaptation.**
- Final fine‑tuning on human‑labeled and high‑confidence pseudo‑labeled real data only.
- Recompute BatchNorm stats on a held‑out real corpus (no labels) before export.


### 13.4 Evaluation and gates

For each release candidate:

- Evaluate on MIDV‑500, MIDV‑2020, SmartDoc, and SIDTD for document_page and photo detection.[^45][^38][^41][^36][^43][^39]
- Evaluate on CommonForms for checkbox and signature boxes.[^58][^60]
- Evaluate on PubTables‑1M and DocLayNet for tables and text_block.[^57][^10]
- Evaluate on DDI‑100 and StaVer for stamp/seal.[^1][^3][^52]
- Evaluate on BarBeR and Kaggle barcodes/QRs for barcode/qr_code.[^53][^55]

Define gates (opinion):
- Overall document_page recall ≥0.95 at deployment confidence on MIDV‑500 photos and MIDV‑2020 photos.
- Per‑class recall ≥0.9 on identity‑document MRZ, QR, barcode, stamp, signature for ID‑type documents.
- No more than 1 % false positive rate on hard‑negative sets (books, posters, etc.) at deployment confidence.


## 14. Conclusion (opinion)

The literature and datasets above show that:
- Realistic synthetic pipelines based on cut‑paste on real backgrounds, Augraphy‑style degradations, and 3D rendering with domain randomization can nearly close the sim2real gap in other detection problems when combined with modest real data and self‑training.[^6][^19][^4][^13][^21]
- Document‑specific synthetic layout corpora (DocSynth‑300K) demonstrably improve mAP by ≈1–3 points across multiple layout benchmarks when used for pretraining.[^22][^25]
- Domain randomization and Copy‑Paste methods are additive with self‑training and open‑vocabulary detection, enabling scalable auto‑labeling workflows.[^69][^6][^68][^7]

Adapting these ideas to docdet and aggressively leveraging unlimited compute for synthetic generation and auto‑labeling of real images should make it realistic for a YOLOv11n‑scale detector to achieve ≥0.95 recall at high precision on real document captures, provided the data pipeline is implemented with the rigor and diversity outlined above.

---

## References

1. [[1912.11658] DDI-100: Dataset for Text Detection and Recognition](https://arxiv.org/abs/1912.11658) - DDI-100 dataset is a synthetic dataset based on 7000 real unique document pages and consists of more...

2. [Distorted Document Images dataset (DDI-100). - GitHub](https://github.com/machine-intelligence-laboratory/DDI-100) - DDI-100 contains 99870 document images together with text masks, stamp masks, text and character loc...

3. [[PDF] DDI-100: Dataset for Text Detection and Recognition - arXiv](https://arxiv.org/pdf/1912.11658.pdf) - Ground truth comprises text and stamp masks, text and characters bounding boxes with relevant annota...

4. [Cut, Paste and Learn: Surprisingly Easy Synthesis for Instance ...](https://publications.ri.cmu.edu/cut-paste-learn-surprisingly-easy-synthesis-instance-detection) - Cut, Paste and Learn: Surprisingly Easy Synthesis for Instance Detection ... In a cross-domain setti...

5. [【Cut, Paste and Learn】《Cut, Paste and Learn: Surprisingly Easy Synthesis for Instance Detection》](https://blog.csdn.net/bryant_meng/article/details/127966177) - 本文介绍了一种名为 Cut

6. [Simple Copy-Paste is a Strong Data Augmentation Method for ...](https://arxiv.org/abs/2012.07177) - We perform a systematic study of the Copy-Paste augmentation ([13, 12]) for instance segmentation wh...

7. [arXiv:2012.07177v2 [cs.CV] 23 Jun 2021](https://arxiv.org/pdf/2012.07177.pdf)

8. [[Papierüberprüfung] DocXPand-25k: a large and diverse benchmark dataset for identity documents analysis](https://www.themoonlight.io/de/review/docxpand-25k-a-large-and-diverse-benchmark-dataset-for-identity-documents-analysis) - The paper titled "DocXPand-25k: a large and diverse benchmark dataset for identity documents analysi...

9. [QuickSign/docxpand: Synthetic identity documents dataset - GitHub](https://github.com/quicksign/docxpand) - The synthetic ID document images dataset ("DocXPand-25k"), released alongside this tool, is licensed...

10. [DocLayNet: A Large Human-Annotated Dataset for ... - GitHub](https://github.com/DS4SD/DocLayNet) - DocLayNet is a human-annotated document layout segmentation dataset containing 80863 pages from a br...

11. [Augraphy: Creating Realistic Document Image Datasets with Data ...](https://github.com/sparkfish/augraphy-paper) - This paper introduces Augraphy, a Python library for constructing data augmentation pipelines which ...

12. [sparkfish/augraphy: Augmentation pipeline for rendering ... - GitHub](https://github.com/sparkfish/augraphy) - Augraphy is a Python library that creates multiple copies of original documents though an augmentati...

13. [Augraphy: A Data Augmentation Library for Document Images](http://arxiv.org/abs/2208.14558) - This paper introduces Augraphy, a Python library for constructing data augmentation pipelines which ...

14. [Augraphy: fast and flexible image augmentation in OCR](https://medium.com/@jareddean108/what-is-augraphy-684b098679a6) - 1. Definition

15. [augraphy - PyPI](https://pypi.org/project/augraphy/2.0.1/) - Augraphy is an augmentation library developed to emulate these effects in a pipeline designed to emu...

16. [augraphy - PyPI](https://pypi.org/project/augraphy/1.0.4/) - License. MIT. Copyright 2021 Sparkfish LLC. Permission is hereby granted, free of charge, to any per...

17. [BlenderProc/paper.md at main · DLR-RM/BlenderProc](https://github.com/DLR-RM/BlenderProc/blob/main/paper.md) - A procedural Blender pipeline for photorealistic training image generation - DLR-RM/BlenderProc

18. [BlenderProc Publication Visualization - GitHub Pages](https://hummat.github.io/bproc-pubvis/) - Publication-ready visualization of 3D objects and point clouds in seconds. Design philosophy: Follow...

19. [Photo-realistic Neural Domain Randomization](https://www.ecva.net/papers/eccv_2022/papers_ECCV/papers/136850306.pdf)

20. [(PDF) The Impact of Domain Randomization on Object Detection](https://www.academia.edu/145648484/The_Impact_of_Domain_Randomization_on_Object_Detection_A_Case_Study_on_Parametric_Shapes_and_Synthetic_Textures) - Recent advances in deep learning-based object detection techniques have revolutionized their applica...

21. [Object Detection Using Sim2Real Domain Randomization for Robotic Applications](https://arxiv.org/abs/2208.04171) - Robots working in unstructured environments must be capable of sensing and interpreting their surrou...

22. [DocLayout-YOLO: Enhancing Document Layout Analysis through ...](https://github.com/opendatalab/DocLayout-YOLO) - DocSynth300K is a large-scale and diverse document layout analysis pre-training dataset, which can l...

23. [M$^{6}$Doc: A Large-Scale Multi-Format, Multi-Type, Multi-Layout, Multi-Language, Multi-Annotation Category Dataset for Modern Document Layout Analysis](https://arxiv.org/abs/2305.08719) - Document layout analysis is a crucial prerequisite for document understanding, including document re...

24. [DocLayout-YOLO - Enhancing Document Layout Analysis](https://arxiv.org/html/2410.12628v1)

25. [DocLayout-YOLO: Real-time Layout Analysis](https://www.emergentmind.com/topics/doclayout-yolo) - It leverages the extensive DocSynth-300K synthetic dataset to simulate diverse document layouts, yie...

26. [Best object detection datasets in 2024 - Picsellia](https://www.picsellia.com/post/object-detection-datasets) - Looking to train your object detection models? Discover a wide variety of high-quality object detect...

27. [License Info - QuantGov](https://www.quantgov.org/license-info) - All datasets made available through QuantGov, including files accessible via the bulk CSV download p...

28. [PubLayNet — 360K document page images | LabelSets Catalog](https://labelsets.ai/catalog/publaynet) - PubLayNet: 360K document page images from IBM Research. License: CDLA-Permissive 1.0. LQS 90/100. 36...

29. [License for DDI-100 dataset? · Issue #14 · machine-intelligence-laboratory/DDI-100](https://github.com/machine-intelligence-laboratory/DDI-100/issues/14) - Hi, could you please confirm that DDI-100 dataset is available under MIT license?

30. [docling-project/DocLayNet · Datasets at Hugging Face](https://huggingface.co/datasets/docling-project/DocLayNet) - Licensing Information License: CDLA-Permissive-1.0. A Large Human-Annotated Dataset. Total file size...

31. [DocBank Dataset](https://doc-analysis.github.io/docbank-page/)

32. [DocBank: A Benchmark Dataset for Document Layout Analysis](https://aclanthology.org/2020.coling-main.82/) - In this paper, we present DocBank, a benchmark dataset that contains 500K document pages with fine-g...

33. [maveriq/DocBank · Datasets at Hugging Face](https://huggingface.co/datasets/maveriq/DocBank) - We’re on a journey to advance and democratize artificial intelligence through open source and open s...

34. [Enabling Easier Collaboration on Open Data for AI and ML with ...](https://www.linuxfoundation.org/press/press-release/enabling-easier-collaboration-on-open-data-for-ai-and-ml-with-cdla-permissive-2-0) - A short, simple, and broadly permissive license agreement to enable wider sharing and usage of open ...

35. [docling-project/DocLayNet · Fix license metadata: cdla-permissive-1.0](https://huggingface.co/datasets/docling-project/DocLayNet/discussions/5) - Update dataset card front-matter from license: other to cdla-permissive-1.0 to match the Licensing s...

36. [[1807.05786] MIDV-500: A Dataset for Identity Documents Analysis ...](https://arxiv.org/abs/1807.05786) - In this paper we present a Mobile Identity Document Video dataset (MIDV-500) consisting of 500 video...

37. [MIDV-500: a dataset for identity document analysis and recognition ...](https://sciup.org/midv-500a-dataset-for-identity-document-analysis-and-recognition-on-mobile-140246517) - The MIDV-500 dataset was presented, ly the paper presents three experimental baselines obtained usin...

38. [Dataset | DOCSAID](https://docsaid.org/en/docs/docaligner/dataset/) - MIDV-500 consists of 500 video clips of 50 different types of identity documents, including 17 IDs, ...

39. [A Comprehensive Benchmark Dataset for Identity Document Analysis](https://arxiv.org/abs/2107.00396) - In this paper, we present a dataset MIDV-2020 which consists of 1000 video clips, 2000 scanned image...

40. [a comprehensive benchmark dataset for identity document analysis](https://doaj.org/article/3d6b32fd71014f62a55306ba6bfabf14) - In this paper, we present a dataset MIDV-2020 which consists of 1000 video clips, 2000 scanned image...

41. [MIDV-2020 - L3i-Share](https://l3i-share.univ-lr.fr/MIDV2020/midv2020.html) - a dataset MIDV-2020 which consists of 1000 annotated video clips, 1000 scanned images, and 1000 phot...

42. [Datasets - Zuheng Ming](https://hengxyz.github.io/datasets/) - MIDV-2020 comprises 10 document types, which consists of 1000 annotated video clips, 1000 scanned im...

43. [ICDAR2015 competition on smartphone document capture and ...](https://zenodo.org/records/2572929) - ICDAR2015 competition on smartphone document capture and OCR (SmartDoc). Challenge 2: MOBILE OCR COM...

44. [SmartDoc 2015 – Challenge 2 Dataset](http://smartdoc.univ-lr.fr/smartdoc-2015-challenge-2-mobile-ocr-competition/smartdoc-2015-challenge-2-dataset/)

45. [Synthetic dataset of ID and Travel Document (SIDTD) - TC-11 - UAB](https://tc11.cvc.uab.es/datasets/SIDTD_1/) - The SIDTD dataset is an extension of the MIDV2020 dataset. Initially, the MIDV2020 dataset is compos...

46. [Tobacco 800 Dataset (Tobacco800) - TC-11 - UAB](https://tc11.cvc.uab.es/datasets/Tobacco800_1) - Tobacco800, composed of 1290 document images, is a realistic database for document image analysis re...

47. [Offline Signature Verification on Real-World Documents](https://github.com/Alpkant/Offline-Signature-Verification-on-Real-World-Documents) - Official repository of our CVPR 2020 Biometrics Workshop paper Offline Signature Verification on Rea...

48. [Writer independent offline signature verification using convolutional ...](https://github.com/Aftaab99/OfflineSignatureVerification) - The CEDAR signature dataset is one of the benchmark datasets for signature verification. It consists...

49. [CEDAR Signature Handwriting Identification Dataset - Hyper.ai](https://hyper.ai/en/datasets/21154) - Build the Future of Artificial Intelligence

50. [Reference Selection for Offline Hybrid Siamese Signature ...](https://www.techscience.com/cmc/v73n1/47789/html) - This paper presents an off-line handwritten signature verification system based on the Siamese netwo...

51. [demos - GPDS Group - ULPGC](https://www.gpds.ulpgc.es/downloadnew/download.htm)

52. [Stamp Verification Dataset - GTS.AI](https://gts.ai/dataset-download/stamp-verification-dataset/) - Explore our comprehensive Stamp Verification Dataset featuring 400 scanned invoice images with varyi...

53. [BarBeR Dataset](https://ditto.ing.unimore.it/barber/)

54. [BarBeR: Barcode Benchmark Repository - GitHub](https://github.com/Henvezz95/BarBeR) - The repository contains multiple algorithms for 1D and 2D barcode localization proposed in different...

55. [[PDF] Barcode and QR Code Object Detection - arXiv](https://arxiv.org/pdf/2511.22937.pdf)

56. [QR Codes](https://www.kaggle.com/datasets/coledie/qr-codes) - Images of QR Codes: versions 1-4, random four digit numbers.

57. [PubTables-1M: Detection - Dataset Ninja](https://datasetninja.com/pubtables-1m) - The dataset includes 947,642 tables for TSR, with 52.7% classified as complex. Canonicalization adju...

58. [CommonForms: A Large, Diverse Dataset for Form Field Detection](https://huggingface.co/papers/2509.16506) - A web-scale dataset and models for form field detection are introduced, achieving high precision and...

59. [CommonForms: A Large, Diverse Dataset for Form Field Detection](https://www.youtube.com/watch?v=s1lJ3Vr9vrI) - CommonForms: A Large, Diverse Dataset for Form Field Detection · Comments.

60. [Voxel51/commonforms_val_subset · Datasets at Hugging Face](https://huggingface.co/datasets/Voxel51/commonforms_val_subset) - It contains 10,000 annotated document images with bounding boxes for three types of form fields: tex...

61. [LiLT model finetuned on FUNSD for Key Value Recognition](https://nlp.johnsnowlabs.com/2023/09/14/lilt_roberta_funsd_v1_en_3_2.html) - The Form Understanding in Noisy Scanned Documents (FUNSD) dataset comprises 199 fully annotated scan...

62. [FUNSD+ | A larger and revised FUNSD dataset - Konfuzio](https://konfuzio.com/en/funsd-plus/) - It is licensed to be used for non-commercial, research and educational purposes, see license. ... FU...

63. [[PDF] Doc 9303 Machine Readable Travel Documents - ICAO](https://www.icao.int/sites/default/files/publications/DocSeries/9303_p3_cons_en.pdf)

64. [MRZ](https://documentation.anyline.com/ios-sdk-component/latest/technical-capabilities/mrz.html)

65. [Knowledge Base - Confluence](https://anyline.atlassian.net/wiki/spaces/SP/pages/1570865198/MRZ+(Machine+Readable+Zone)+101?preview=%2F1570865198%2F1570668623%2FTCn6NIVTSOPyG7khKKNSsRK7_p4PZtY4xtFGrJulR8IVg---wQ-t6pjcPVQc3ru3FaNApjyN8sXlr3er486hRFqEfmGzpbTQ9ZenrqmJ9wW2F8CD1DqnxWlEOrvv4IEMub8P4ae7)

66. [Barcodes - Snipe-IT Docs](https://snipe-it.readme.io/docs/barcodes) - QR codes, when scanned on a mobile device using a QR scanner app, will open the asset details page o...

67. [Grounding DINO - Hugging Face](https://huggingface.co/docs/transformers/en/model_doc/grounding-dino) - In this paper, we present an open-set object detector, called Grounding DINO, by marrying Transforme...

68. [Object Detection in the Wild via Grounded Language Image Pre ...](https://www.microsoft.com/en-us/research/project/project-florence-vl/articles/object-detection-in-the-wild-via-grounded-language-image-pre-training/) - GLIP introduces language into object detection and leverages self-training techniques to pre-train o...

69. [DeepMind Unlocks Web-Scale Training for Open-World Detection](https://syncedreview.com/2023/06/26/deepmind-unlocks-web-scale-training-for-open-world-detection/) - In response to this issue, the DeepMind research team introduces the OWLv2 model in their latest pap...

