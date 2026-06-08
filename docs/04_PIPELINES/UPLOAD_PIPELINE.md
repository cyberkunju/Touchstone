# Upload Pipeline — Edge DocGraph Engine

**Purpose:** Define how files enter the system, how PDFs/images are detected, how pages are created, how jobs begin, and how privacy is preserved from the first user action.

---

## 1. Pipeline goal

The upload pipeline converts a user-selected file into safe local document/page records without extracting semantics yet.

It must answer:

```text
What file did the user provide?
Is it supported?
Is it an image or PDF?
How many pages exist?
What page artifacts must be created?
Can processing continue locally?
```

The upload pipeline must not perform deep OCR, detection, form generation, template learning, or verification. It only creates the starting state for downstream pipelines.

---

## 2. High-level flow

```text
User selects file
  → validate file
  → classify file type
  → create DocumentRecord
  → create page creation job
  → route to PDF pipeline or image pipeline
  → create PageRecord(s)
  → enqueue normalization/template pre-check
```

---

## 3. Input sources

Supported initial sources:

- drag-and-drop upload
- file picker upload
- local file path in Tauri future mode
- pasted image from clipboard, later
- camera capture, later

Supported file types for v1:

- PNG
- JPEG/JPG
- WebP
- PDF

Rejected initially:

- DOCX
- XLSX
- PPTX
- TIFF multipage unless explicitly added
- encrypted/password PDF unless user support is built
- archives
- unknown binaries

---

## 4. Privacy rules

The upload pipeline must enforce:

1. no file upload to server,
2. no remote OCR,
3. no external telemetry containing file metadata or content,
4. no third-party script inspection of file,
5. no auto-persistence of sensitive file without user/flow decision.

The file should be treated as sensitive immediately.

---

## 5. File validation

### 5.1 Basic validation

Check:

- file exists
- non-zero size
- size below configured max
- MIME type if available
- extension if available
- magic bytes where possible

### 5.2 Size policy

Initial recommended limits should be configurable.

Example:

```ts
type UploadLimits = {
  maxImageBytes: number;
  maxPdfBytes: number;
  maxPdfPagesForAutoProcess: number;
  maxTotalPixels: number;
};
```

If file is too large:

- do not crash
- show friendly error or page-selection flow
- explain local memory constraints

### 5.3 Unsupported file behavior

Unsupported files should produce:

```ts
type UploadError = {
  kind: "unsupported_file_type";
  message: string;
  allowedTypes: string[];
};
```

---

## 6. File type detection

Do not rely only on extension.

Detection order:

1. magic bytes
2. MIME type
3. extension fallback
4. decoder attempt if ambiguous

Examples:

```text
%PDF → pdf
PNG signature → image/png
JPEG SOI → image/jpeg
RIFF WEBP → image/webp
```

---

## 7. DocumentRecord creation

Create a DocumentRecord before page processing.

```ts
type DocumentRecord = {
  id: string;
  name: string;
  fileType: "image" | "pdf";
  originalMimeType: string;
  sizeBytes: number;
  status:
    | "uploaded"
    | "creating_pages"
    | "normalizing"
    | "extracting"
    | "review"
    | "complete"
    | "error";
  pageIds: string[];
  createdAt: number;
  updatedAt: number;
};
```

Rules:

- document ID generated locally
- file name should be sanitized for display
- do not expose local path in browser
- status updates must be evented to UI

---

## 8. PageRecord creation

For images:

```text
one file → one PageRecord
```

For PDFs:

```text
one file → many PageRecords
```

PageRecord:

```ts
type PageRecord = {
  id: string;
  documentId: string;
  pageIndex: number;
  sourceType: "image" | "pdf_page";
  originalWidthPx?: number;
  originalHeightPx?: number;
  renderedWidthPx?: number;
  renderedHeightPx?: number;
  canonicalWidth?: number;
  canonicalHeight?: number;
  originalImageId?: string;
  renderedImageId?: string;
  normalizedImageId?: string;
  status: "created" | "rendered" | "normalized" | "error";
};
```

---

## 9. Image upload path

```text
image file
  → decode image
  → create image artifact
  → create PageRecord
  → enqueue image normalization
```

Initial image artifact:

```ts
type ImageArtifact = {
  id: string;
  pageId: string;
  kind: "original_image";
  blobRef: string;
  widthPx: number;
  heightPx: number;
  mimeType: string;
};
```

---

## 10. PDF upload path

```text
PDF file
  → create DocumentRecord
  → route to PDF pipeline
  → parse page count
  → create PageRecord per page
  → render/extract page data lazily
```

Important:

- Do not render all pages at max DPI immediately.
- Use page-by-page or lazy processing.
- For huge PDFs, ask user to select pages or process sequentially.

---

## 11. Upload job model

```ts
type UploadJob = {
  id: string;
  documentId: string;
  fileRef: string;
  fileType: "image" | "pdf";
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  errors: UploadError[];
};
```

Progress stages:

- validating
- identifying
- creating document
- creating pages
- queued for normalization

---

## 12. UI behavior

During upload:

- show local-only message
- show file name and size
- show validation progress
- show page count for PDFs
- show first page/image preview when available
- show error clearly if unsupported

User-facing messages:

```text
Processing locally. Your document is not uploaded.
```

For bad file:

```text
This file type is not supported yet. Please upload a PNG, JPEG, WebP, or PDF.
```

For large file:

```text
This file is large and may exceed local memory limits. Select pages or reduce file size.
```

---

## 13. Error handling

### 13.1 Unsupported type

Stop before processing.

### 13.2 Decode failure

Show error and keep document status failed.

### 13.3 PDF parse failure

Show PDF-specific error.

### 13.4 Too many pages

Offer page selection or sequential processing.

### 13.5 Storage error

If temporary storage fails, keep in-memory state if possible and warn user.

---

## 14. Security considerations

Potential threats:

- malicious PDF
- oversized image causing memory exhaustion
- filename injection
- crafted image decoder crash
- hidden remote references in PDF
- EXIF metadata privacy leakage

Mitigations:

- local sandboxed parsing
- size limits
- sanitize file names
- avoid executing embedded scripts
- do not load external PDF resources
- strip or ignore unsafe metadata in exports unless user chooses

---

## 15. Output contract

The upload pipeline outputs:

```ts
type UploadPipelineResult = {
  document: DocumentRecord;
  pages: PageRecord[];
  nextPipeline: "pdf_pipeline" | "image_normalization_pipeline";
  warnings: string[];
};
```

---

## 16. Tests

Unit tests:

- file type detection
- unsupported file rejection
- size limit behavior
- document ID creation
- page record creation

Integration tests:

- upload image
- upload single-page PDF
- upload multi-page PDF
- corrupted file
- oversized file
- unsupported file

Privacy test:

- ensure no network request is made during upload.

---

## 17. Pipeline invariants

1. Upload never sends document content to server.
2. Upload never creates final fields.
3. Upload never runs model inference.
4. Every file becomes a DocumentRecord or a structured error.
5. Every page becomes a PageRecord before downstream processing.
6. Large files must not crash the app.
7. User must know processing is local.

---

## 18. Final summary

The upload pipeline is the safe entry gate. It validates files, creates document/page records, routes inputs to PDF or image processing, preserves privacy, and prepares the system for normalization and evidence extraction.
