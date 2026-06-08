# 04 — Pipelines

**Purpose:** Define every processing pipeline end to end. Each pipeline consumes typed input and emits **EvidenceRecords** or graph mutations — never final form values directly. Shared rules: run heavy work in workers, preserve raw values, map all coordinates to normalized page space, treat low confidence as evidence (not failure), support cancellation.

---

## 1. Upload

`file → validate → detect type → DocumentRecord → PageRecord(s) → route to PDF or image`.

- Accept PNG/JPEG/WebP/PDF. Detect type by magic bytes, then MIME, then extension.
- Enforce size/page limits (configurable); never crash on huge files — offer page selection or sequential processing.
- Sanitize file name for display; never expose local path in browser; treat the file as sensitive immediately.
- Output: `DocumentRecord` + `PageRecord[]` + `nextPipeline`. Never run OCR/detection here. Never upload.

## 2. PDF

Handle digital and scanned PDFs differently. Baseline PDF.js; PDFium WASM as a quality trial when PDF.js rasterization harms OCR.

- **Digital:** extract embedded text (with coordinates) as `pdf_text` evidence; also render a page image for visual/model tasks. Embedded text is evidence, not truth — it still flows through the graph and can conflict with OCR.
- **Scanned:** render page image → treat as image input.
- Process page-by-page; never high-DPI-render all pages at once. Store PDF→render→normalized coordinate transforms. Ignore embedded scripts/remote resources. Classify each page `digital | scanned | hybrid | unknown`.

## 3. Image normalization

`raw image → quality pre-check → orientation → boundary → perspective → deskew → contrast normalize → canonical page → quality report + transforms`.

- Canonical width 1000, proportional height. Preserve original; store normalized separately.
- Quality signals (each `good|warning|bad`): blur (variance of Laplacian), glare (saturated-pixel ratio), contrast (luminance stddev), resolution (megapixels), crop completeness, perspective severity, orientation confidence. `safeToExtract` is false if blur/glare/resolution is `bad`.
- Do not over-warp on low-confidence corners; bad warping destroys OCR. If unusable, request rescan and refuse to confirm critical fields.

## 4. Evidence extraction (orchestration)

Plan mode first: `unknown_document | known_template | new_template_version | manual_region`. Unknown runs broad discovery; known runs ROI-first.

Recommended unknown ordering: quality (already done) → detector → full-page/block OCR → code parser (on detected code regions) → MRZ (if zone) → table reconstruct (on detected tables) → asset crops → conditional segmentation → face check → normalize all outputs into EvidenceRecords → feed DocGraph. The scheduler may reorder by document type, quality, and device class.

## 5. OCR

Modes: `full_page | text_block | roi | mrz | table_cell | rotated`.

- Output text + normalized coordinates + confidence + mode + model version; preserve raw text; store normalized candidate separately; keep alternatives when available.
- Known templates: ROI-first; batch crops; upscale small fields; high-res ROI for tiny IDs/dates.
- Compute reading order from geometry (y then x, column detection, table structure), not OCR order alone.
- Retry strategy for low-confidence critical fields: expand ROI → upscale → adjust contrast → rotate → search nearby; record retries as provenance.
- OCR never creates final fields; it produces `text_word`/`text_line`/`text_block` nodes.

## 6. Visual assets

`detector/ROI box → raw crop → optional segmentation → asset evidence → VisualAssetNode → asset hypothesis`.

- Crop expansion defaults: photo 1–3%, signature 5–10%, stamp/seal 5–10%, logo 3–5%. Clamp to page.
- Segmentation is **conditional** (overlapping/irregular assets, export, template requirement, user request); never full-page by default; lazy-load the model.
- Store both raw crop and refined/mask crop. Photo → run face presence (MediaPipe); no recognition, no identity matching.

## 7. Barcode / QR

`code region → preprocess (rotate/upscale/contrast) → zxing-wasm decode → CodeEvidence → node → optional payload parse → cross-field check`.

- Targets: QR, PDF417, Data Matrix, Code 128, EAN, Aztec where supported. Report actual decoded type.
- **Never auto-open URLs.** Render payloads as escaped text. No network fetch of payload.
- Visible-but-undecodable → `needs_review`. Payload that disagrees with a printed field → `conflict` (never silently overwrite).

## 8. MRZ

`zone → crop (high-res) → OCR → normalize OCR-B confusions (context-aware, recorded) → detect TD1/TD2/TD3 → parse fields → validate check digits → cross-check visible fields`.

- Preserve raw lines and normalized lines separately. Common confusions only in MRZ context: O↔0, I↔1, B↔8, S↔5, Z↔2, space/punct→`<`.
- Check-digit algorithm: weights `[7,3,1]` repeating; char values `0-9→0..9`, `A-Z→10..35`, `<→0`; `sum % 10`. Validate document number, DOB, expiry, optional data, composite.
- **A failed critical check digit must block confirmation** (`invalid`). Valid MRZ disagreeing with a visible field → `conflict`. MRZ is highly sensitive — never log raw.

## 9. Table

`region → geometric reconstruction → OCR cell assignment → header inference → value typing → validation`. If geometry fails, try SLANet_plus (bucket); normalize its output into the same node schema; never bypass correction UI.

- Bordered: line detection → intersections → grid → assign OCR boxes to cells. Borderless: cluster OCR boxes by y (rows) then x (columns).
- Represent as `table` + `table_row`/`table_column`/`table_cell` nodes (preserve structure; never flatten).
- Arithmetic validators: line-item sum = subtotal; subtotal + tax − discount = total; opening + credits − debits = closing. Mismatch → `conflict` with calculation details. Uncertain structure → `needs_review`.

## 10. Form generation

`DocGraph + hypotheses + validations (+ template context) → FormSchema + FormValues`.

- Render from hypotheses only. Include status, confidence reasons, evidence link, correction controls. Group into sections (template sections, spatial groups, or document-type defaults).
- Create expected fields even when missing (status `missing`) for known templates. Prioritize the review queue: conflict → invalid → missing → needs_review → unsupported → confirmed.
- A field with no evidence must be explicitly `user_created`.

## 11. Correction

`user action → CorrectionEvent → UserCorrectionEvidence → DocGraph patch → re-verify affected validators → update form → optional template save/update/version`.

- Kinds: label/value/type/region edits, asset crop/type, add/delete/merge/split field, table cell/structure, checkbox state, conflict resolution, template decision.
- Preserve original evidence; mark `userEdited`; user value still passes validators (an invalid user value stays `invalid`/`user_overridden` with audit). Re-run only affected validators. Never silently update a template.

## 12. Known-template extraction (fast path)

`match (multi-signal) → align (global + local correction) → project ROIs (expanded) → ROI-first extract by field type → verify → fill → drift/version decision`. ROI expansion by type and alignment uncertainty; search-nearby repair on ROI failure (bounded, auditable). **Never copy old template values** — always extract current document evidence. Detail in [07_TEMPLATE_ENGINE.md](07_TEMPLATE_ENGINE.md).

## 13. Error and uncertainty handling

Separate **operational errors** (PDF render failed, model load failed, OOM, worker crash) from **evidence uncertainty** (low confidence, glare, checksum fail, undecodable code). Operational errors → structured `AppError` + recovery; evidence uncertainty → status (`needs_review`/`missing`/`conflict`/`invalid`) with reasons. A recoverable module failure (e.g. barcode undecodable) must not abort the whole pipeline; preserve completed evidence and mark affected fields. See [06_VERIFICATION.md](06_VERIFICATION.md) and [11_IMPLEMENTATION.md](11_IMPLEMENTATION.md).
