# Tauri Packaging Path — Edge DocGraph Engine

**Purpose:** Define the serious-app path using Tauri: same frontend, local shell, Rust/native backend options, model packaging, file access, storage, and migration from browser prototype.

---

## 1. Why Tauri is recommended for serious v1

The pure browser/PWA path is excellent for prototype and distribution, but serious local document intelligence benefits from a desktop/mobile shell.

Tauri provides:

- same web frontend,
- local app packaging,
- Rust backend commands,
- native file access,
- model bundling,
- stronger storage control,
- native libraries later,
- smaller footprint than Electron-style heavy shells.

---

## 2. Architecture

```text
Tauri App
  ├── Web Frontend
  │   ├── document viewer
  │   ├── form renderer
  │   ├── evidence UI
  │   └── template UI
  │
  ├── Rust Backend
  │   ├── file system service
  │   ├── model storage service
  │   ├── PDFium service optional
  │   ├── OpenCV/native image service optional
  │   ├── ONNX Runtime native optional
  │   ├── SQLite service
  │   └── encryption/key service
  │
  └── Local Storage
      ├── app data dir
      ├── model files
      ├── templates
      ├── document artifacts
      └── SQLite database
```

---

## 3. Same frontend rule

Frontend should remain reusable:

```text
Browser services
  ↔ interface layer
  ↔ domain code
  ↔ UI

Tauri services
  ↔ same interface layer
  ↔ same domain code
  ↔ same UI
```

Do not fork product logic.

Use service adapters:

```ts
interface StorageService {}
interface PdfService {}
interface InferenceService {}
interface FileSystemService {}
```

Browser and Tauri implement the same interfaces.

---

## 4. Tauri backend candidates

### 4.1 File service

Use for:

- open files
- save exports
- choose directories
- persistent local data
- avoid browser file limitations

### 4.2 PDF service

Use PDFium if:

- PDF.js quality insufficient,
- native rendering improves OCR,
- large PDFs need better memory control.

### 4.3 Image service

Use native OpenCV if:

- OpenCV.js too slow/heavy,
- dewarp/deskew quality needs improvement,
- memory control needed.

### 4.4 Inference service

Use native ONNX Runtime if:

- browser ONNX Runtime Web too limited,
- WebGPU unavailable,
- native acceleration better,
- model conversion issues exist.

### 4.5 Storage service

Use:

- SQLite
- filesystem blobs
- encrypted local storage
- model file cache

---

## 5. Packaging models

Tauri can package required models with app.

Layout:

```text
app_data/
  models/
    yolov11n_doc/0.1.0/model.onnx
    ppocrv5_det/0.1.0/model.onnx
    ppocrv5_rec/0.1.0/model.onnx
  templates/
  documents/
  db.sqlite
```

Benefits:

- offline from install,
- no first-use model download,
- checksum validation,
- stable model versions.

---

## 6. Browser-to-Tauri migration path

Phase 1:

```text
browser app
  + IndexedDB/OPFS
  + ONNX Runtime Web
```

Phase 2:

```text
add service interfaces
  + browser adapters
```

Phase 3:

```text
Tauri shell
  + same frontend
  + file/storage adapter
```

Phase 4:

```text
native PDF/image/inference adapters if benchmarks justify
```

---

## 7. Command interface

Example Tauri command contracts:

```ts
type TauriCommand =
  | "read_file"
  | "write_export"
  | "load_model_file"
  | "render_pdf_page"
  | "run_native_inference"
  | "save_template"
  | "load_template";
```

Frontend should call through service wrappers, not raw command names everywhere.

---

## 8. Security model

Tauri security rules:

- minimal command surface,
- validate all paths,
- no arbitrary shell execution,
- no remote code loading,
- strict CSP,
- no document upload,
- explicit export locations,
- least privilege permissions.

Never expose unrestricted filesystem access to frontend.

---

## 9. Local storage strategy

Tauri storage:

```text
SQLite:
  documents metadata
  DocGraph metadata
  templates
  indexes
  jobs

Filesystem:
  models
  page images
  crops
  thumbnails
  descriptors

Optional:
  encrypted blobs
```

---

## 10. Performance benefits

Tauri may improve:

- large PDF rendering,
- image preprocessing,
- model loading,
- file I/O,
- storage reliability,
- memory control,
- offline packaging.

But every native path must be benchmarked against browser path.

---

## 11. Mobile path

Tauri v2 includes mobile direction, but mobile document intelligence is harder.

Mobile concerns:

- memory limits,
- camera capture,
- model size,
- thermal throttling,
- platform permissions,
- smaller UI.

Recommended:

```text
desktop serious v1 first
mobile later after model/runtime budgets proven
```

---

## 12. Update strategy

App updates may include:

- frontend code
- backend binary
- model manifest
- models
- template schema migrations

Rules:

- preserve user templates,
- migrate storage safely,
- keep old templates recoverable,
- do not silently change model behavior without version tracking.

---

## 13. Build outputs

Target:

- Windows
- macOS
- Linux

Later:

- Android/iOS if viable.

---

## 14. Testing Tauri path

Test:

- open files
- process document
- save templates
- offline model loading
- export
- storage migration
- native PDF render if used
- native inference if used
- permission restrictions
- app update

---

## 15. Tauri invariants

1. Same frontend/domain logic as browser.
2. Native commands are minimal and typed.
3. No arbitrary filesystem or shell exposure.
4. Models are versioned and checksummed.
5. Templates survive updates.
6. Native paths are benchmark-driven.
7. Local-only promise remains true.
8. Browser prototype remains useful.

---

## 16. Reference

- Tauri start: https://v2.tauri.app/start/
- Tauri architecture: https://v2.tauri.app/concept/architecture/

---

## 17. Final statement

Tauri is the serious-app path: same UI, stronger local runtime. Build the browser version cleanly with service interfaces so the project can move into Tauri without rewriting the product.
