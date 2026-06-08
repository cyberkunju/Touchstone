# PDF Pipeline — Edge DocGraph Engine

**Purpose:** Define how PDFs are handled locally: page parsing, embedded text extraction, page rendering, scanned-vs-digital behavior, and optional PDFium quality rendering.

---

## 1. Pipeline goal

The PDF pipeline converts a PDF into page records, embedded text evidence where available, and rendered page images for visual/model processing.

It must treat digital PDFs and scanned PDFs differently.

---

## 2. High-level flow

```text
PDF file
  → parse PDF locally
  → determine page count
  → create PageRecords
  → for each page:
      → extract embedded text if available
      → render page image
      → create PDF evidence/artifacts
      → route to image normalization
```

---

## 3. Core tools

### Baseline

- PDF.js

Use for:

- local PDF parsing
- page count
- page rendering
- embedded text extraction
- page dimensions

### Quality bucket

- PDFium WASM

Use only when:

- PDF.js rendering harms OCR/detection quality
- high-fidelity rasterization is required
- benchmark proves benefit

---

## 4. Digital PDF vs scanned PDF

### 4.1 Digital PDF

Contains embedded text, fonts, vectors, and sometimes images.

Processing strategy:

```text
extract embedded text first
render page image second
combine embedded text and visual evidence in DocGraph
```

Embedded text is evidence, not final truth.

### 4.2 Scanned PDF

Contains page images without useful embedded text.

Processing strategy:

```text
render page image
run image normalization
run OCR/detector/parsers
```

### 4.3 Hybrid PDF

Contains both embedded text and scanned/visual regions.

Processing strategy:

```text
extract embedded text
render page
run visual extraction
merge into DocGraph
```

---

## 5. Page creation

For every PDF page, create:

```ts
type PdfPageRecord = {
  id: string;
  documentId: string;
  pageIndex: number;
  sourceType: "pdf_page";
  pdfWidth: number;
  pdfHeight: number;
  rotation?: number;
  renderedImageId?: string;
  embeddedTextEvidenceIds: string[];
};
```

---

## 6. Embedded text extraction

Embedded text should create evidence records.

```ts
type PdfTextEvidence = {
  id: string;
  source: "pdf_embedded_text";
  pageId: string;
  text: string;
  boxNorm?: NormalizedBox;
  fontName?: string;
  fontSize?: number;
  confidence?: 1.0;
};
```

Important:

- keep PDF text separate from OCR evidence
- preserve coordinates when possible
- do not assume embedded text is correct
- some PDFs have hidden or incorrect text layers

---

## 7. PDF rendering

### 7.1 Render resolution

Choose based on downstream need.

Suggested:

- preview render: low/medium DPI
- OCR/detection render: 200–300 DPI equivalent
- high-quality retry: higher DPI or PDFium path

Avoid rendering huge pages at excessive resolution by default.

### 7.2 Render artifact

```ts
type RenderedPageArtifact = {
  id: string;
  pageId: string;
  kind: "pdf_render";
  engine: "pdfjs" | "pdfium";
  widthPx: number;
  heightPx: number;
  scale: number;
  blobRef: string;
};
```

---

## 8. Coordinate mapping

PDF coordinates, rendered pixels, normalized page coordinates, and viewer coordinates differ.

The pipeline must store transforms:

```text
pdf coordinate space
  → rendered pixel space
  → normalized page space
  → viewer space
```

Coordinate bugs will break evidence and templates.

---

## 9. Embedded images

If PDF extraction exposes embedded images, store them as possible evidence/artifacts. However, the main visual pipeline should still process the rendered page because layout context matters.

Potential embedded image uses:

- extract original photo/logos at better quality
- compare to rendered crop
- improve asset export

This is P2 unless needed.

---

## 10. PDF text and OCR merge strategy

When both embedded text and OCR exist:

- keep both evidence records
- align by geometry
- prefer embedded text only if coordinates and text are reliable
- use OCR when embedded text is missing/incorrect
- verifier can compare both

Example conflict:

```text
embedded text: "Total 1200"
OCR text: "Total 1700"
status: conflict/needs_review
```

---

## 11. Scanned PDF detection

Signals:

- no embedded text
- embedded text extremely sparse
- page contains one large image
- OCR finds text not present in embedded layer
- PDF text boxes are hidden/off-page

Output:

```ts
type PdfPageKind = "digital" | "scanned" | "hybrid" | "unknown";
```

---

## 12. Multi-page handling

Rules:

- process page-by-page
- allow cancellation
- show progress per page
- avoid rendering all pages at high DPI at once
- store page statuses independently

Multi-page documents may have:

- repeated headers
- continued tables
- page-level templates
- mixed scanned/digital pages

---

## 13. PDF quality issues

Possible issues:

- low render DPI
- anti-aliased text hurting OCR
- hidden text mismatch
- vector lines not captured well
- huge pages causing memory pressure
- rotated pages
- embedded images at low quality

Mitigation:

- render with proper scale
- use PDFium quality bucket when needed
- run quality analyzer
- preserve embedded text evidence
- page-by-page memory control

---

## 14. PDFium quality path

Use PDFium path when benchmarked.

Flow:

```text
PDF page
  → PDFium render
  → high-quality page image
  → normalization/extraction
```

Promotion criteria:

- improves OCR CER/WER
- improves detector recall
- improves table line quality
- acceptable load time and memory
- works in target runtime

---

## 15. Error handling

Errors:

- password protected
- corrupt PDF
- unsupported PDF feature
- render failure
- too many pages
- memory error

Behavior:

- show clear message
- process pages that can be processed if safe
- do not crash entire app when one page fails
- preserve structured error

---

## 16. Output contract

```ts
type PdfPipelineResult = {
  documentId: string;
  pages: PageRecord[];
  renderedArtifacts: RenderedPageArtifact[];
  embeddedTextEvidence: PdfTextEvidence[];
  pageKinds: Record<string, PdfPageKind>;
  warnings: string[];
};
```

---

## 17. Tests

Test PDFs:

- simple digital PDF
- scanned PDF
- hybrid PDF
- rotated PDF
- multi-page PDF
- PDF with hidden text
- corrupt PDF
- huge PDF
- password-protected PDF

Assertions:

- no network calls
- page count correct
- render artifact exists
- embedded text evidence exists when expected
- page kind classified
- coordinates map to normalized space

---

## 18. Pipeline invariants

1. PDFs are processed locally.
2. Embedded text is evidence, not truth.
3. Rendered image is created for visual/model tasks.
4. Page coordinate mappings are preserved.
5. Multi-page documents are processed safely.
6. PDFium is optional quality path, not required baseline.
7. PDF pipeline does not generate final form fields directly.

---

## 19. Final summary

The PDF pipeline converts PDFs into local page images and text evidence while preserving coordinate mappings. Digital PDFs use embedded text as evidence; scanned PDFs use OCR and visual extraction. PDF.js is baseline, PDFium is a quality bucket, and all outputs flow into image normalization and DocGraph construction.
