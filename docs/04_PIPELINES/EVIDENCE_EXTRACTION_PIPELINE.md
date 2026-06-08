# Evidence Extraction Pipeline — Edge DocGraph Engine

**Purpose:** Define the multi-pass extraction flow that produces evidence from normalized pages: detection, OCR, visual assets, parsers, tables, and validators.

---

## 1. Pipeline goal

The evidence extraction pipeline turns normalized pages into evidence records. It does not create final truth. It supplies the DocGraph with observations.

Evidence producers include:

- detector
- OCR
- segmentation
- barcode parser
- MRZ parser
- table engine
- face detector
- quality analyzer
- template projection
- user correction later

---

## 2. High-level flow

```text
NormalizedPage
  → extraction planning
  → detector pass
  → OCR pass
  → visual asset pass
  → code parser pass
  → MRZ pass
  → table pass
  → portrait verification
  → evidence normalization
  → DocGraph input
```

---

## 3. Extraction planning

Before running modules, decide mode:

```ts
type ExtractionMode =
  | "unknown_document"
  | "known_template"
  | "new_template_version"
  | "manual_region";
```

Planning considers:

- template match
- page quality
- document type hints
- available models
- user requested actions
- device performance
- page count

Unknown documents run broader extraction. Known templates run ROI-first extraction.

---

## 4. Evidence producer ordering

Recommended unknown-document order:

1. page quality already available
2. detector pass
3. full-page/context OCR
4. OCR detected text blocks
5. code parser on detected code regions
6. MRZ OCR/parser if MRZ zone exists
7. table reconstruction on detected tables
8. visual asset crop extraction
9. segmentation only where needed
10. portrait face check
11. evidence normalization

Ordering can be adjusted by scheduler.

---

## 5. Detector pass

Input:

- normalized page image

Output:

- DetectionEvidence[]

Classes:

- document_page
- photo
- signature
- stamp
- seal
- logo
- qr_code
- barcode
- mrz_zone
- table
- checkbox
- text_block

Post-processing:

- confidence filtering
- class-aware NMS
- coordinate mapping
- evidence creation

---

## 6. OCR pass

OCR modes:

- full_page
- text_block
- roi
- mrz
- table_cell
- rotated

Unknown mode:

- full-page OCR for context
- text-block OCR for better local reading
- special OCR on MRZ/table/small regions

Known mode:

- projected ROI OCR first
- broader OCR only if validation fails

---

## 7. Visual asset pass

For visual detections:

1. create raw crop
2. classify asset type from detector
3. optionally run segmentation
4. store crop/mask artifacts
5. create VisualAssetEvidence
6. create portrait face check if photo

Assets:

- photo
- signature
- stamp
- seal
- logo
- emblem
- flag
- symbol

---

## 8. Code parser pass

Use zxing-wasm on:

- detected QR/barcode regions
- projected code ROIs in known templates
- optional whole-page low-res scan if detector misses codes

Output:

- CodeEvidence
- decoded payload
- code type
- source region

---

## 9. MRZ pass

Triggered by:

- detector finds MRZ zone
- template expects MRZ
- OCR lines match MRZ-like pattern

Flow:

```text
MRZ region
  → crop
  → high-res OCR
  → normalize MRZ text
  → parse TD1/TD2/TD3
  → check digits
  → evidence records
```

---

## 10. Table pass

Triggered by:

- detector finds table
- template expects table
- OCR/layout suggests table

Flow:

```text
table region
  → line detection
  → OCR boxes
  → row/column clustering
  → cell creation
  → header inference
  → numeric/date parsing
  → validation
```

If geometry fails:

- create review-first table
- optionally run SLANet_plus trial

---

## 11. Portrait verification

Triggered by:

- `photo` detection
- template photo field
- user-selected photo region

Flow:

```text
photo crop
  → MediaPipe Face Detector
  → face presence evidence
  → verifier uses result
```

No face recognition.

---

## 12. Evidence normalization

All outputs become standard evidence records.

Required fields:

- id
- documentId
- pageId
- source
- coordinates if applicable
- confidence if available
- model/parser version
- createdAt
- provenance

Example:

```json
{
  "id": "ocr_123",
  "source": "ocr",
  "pageId": "page_1",
  "text": "Invoice No.",
  "boxNorm": [0.12, 0.18, 0.26, 0.21],
  "confidence": 0.94,
  "modelName": "pp-ocrv5-mobile",
  "modelVersion": "0.1.0"
}
```

---

## 13. Evidence merging policy

Do not merge evidence destructively.

If PDF embedded text and OCR text overlap:

- keep both
- create relationship
- verifier can prefer or compare

If detector and template both identify region:

- keep both
- create `template_projected_from` relationship later

If user correction changes a region:

- keep old region evidence
- add correction evidence

---

## 14. Error handling

Module failure should produce structured error.

Examples:

- OCR failed on ROI
- code parser found no payload
- MRZ checksum failed
- table geometry failed

Not all failures are operational errors. Some are evidence uncertainty.

---

## 15. Performance rules

- run heavy work in workers
- lazy-load models
- avoid unnecessary segmentation
- process pages sequentially when memory constrained
- batch OCR crops
- cancel jobs when user cancels
- reuse normalized image buffers carefully
- transfer buffers where possible

---

## 16. Output contract

```ts
type EvidenceExtractionResult = {
  documentId: string;
  pageId: string;
  evidence: EvidenceRecord[];
  artifacts: ArtifactRecord[];
  warnings: ExtractionWarning[];
  moduleResults: Record<string, ModuleResultSummary>;
};
```

---

## 17. Tests

Test with:

- page with text only
- passport-like page
- invoice with table/QR
- form with checkbox/signature
- low-quality page
- page with no document
- page with overlapping assets

Assertions:

- evidence created for each module
- coordinates valid
- model versions present
- errors structured
- no final form fields created directly

---

## 18. Invariants

1. Evidence extraction produces evidence only.
2. No module directly confirms fields.
3. Coordinates must be normalized.
4. Model/parser version must be recorded.
5. Low confidence is preserved, not hidden.
6. Missing parser output is not crash.
7. User-visible uncertainty starts here.

---

## 19. Final summary

The evidence extraction pipeline is the sensory layer of the system. It observes the page through local models and parsers, normalizes all outputs into evidence, and passes them into the DocGraph. It does not decide truth.
