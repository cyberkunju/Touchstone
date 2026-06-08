# Tauri Build — Edge DocGraph Engine

**Purpose:** Define the desktop local app build path using Tauri, including packaging, native commands, model bundling, storage, security, and release checks.

---

## 1. Tauri goal

The Tauri build is the serious local desktop app path.

It should provide:

- same web UI,
- local-only processing,
- better file access,
- better model packaging,
- stronger local storage control,
- optional native OCR/PDF/image/inference services,
- desktop release installers.

---

## 2. Architecture

```text
Tauri shell
  ├── web frontend
  ├── Rust backend commands
  ├── local app data storage
  ├── packaged model assets
  └── optional native runtime services
```

The domain logic must remain shared with the browser app.

---

## 3. Build commands

Development:

```bash
pnpm --filter @app/tauri tauri dev
```

Production:

```bash
pnpm --filter @app/tauri tauri build
```

Expected output:

```text
apps/tauri/src-tauri/target/release/bundle/
```

---

## 4. Prerequisites

Required:

- Rust stable
- Tauri CLI
- platform-specific build tools
- Node.js/pnpm
- web frontend build

Platform-specific prerequisites must be documented in README.

---

## 5. Same frontend rule

The Tauri app must reuse:

- UI packages,
- DocGraph,
- TemplateGraph,
- verifier,
- parsers,
- pipelines where possible,
- API schemas,
- export/import logic.

Only runtime adapters should differ.

---

## 6. Native command policy

Tauri commands must be:

- minimal,
- typed,
- validated,
- permission-scoped,
- not arbitrary shell access,
- not arbitrary filesystem access.

Examples:

```text
read_selected_file
write_export_file
load_model_asset
save_template
load_template
render_pdf_page
run_native_inference optional
```

Forbidden:

- unrestricted shell execution,
- arbitrary path writes from frontend,
- command that uploads documents,
- command that exposes encryption keys.

---

## 7. Model packaging

Tauri can bundle required models.

Recommended layout:

```text
app_data/
  models/
    yolov11n-docdet-v0/
      model.onnx
      metadata.json
    ppocrv5/
      det.onnx
      rec.onnx
      dict.txt
```

Package manifest:

```text
model-manifest.json
```

On first run:

- verify model files,
- verify checksums,
- copy to app data if needed,
- record versions.

---

## 8. Local storage

Recommended:

```text
SQLite:
  structured metadata
  DocGraph indexes
  TemplateGraph records
  corrections

Filesystem:
  page images
  crops
  model files
  descriptors
```

Optional encryption:

- use OS keychain-backed key where possible,
- encrypt sensitive records/blobs.

---

## 9. Security settings

Tauri config must enforce:

- strict CSP,
- no remote code loading,
- restricted permissions,
- safe file dialogs,
- no arbitrary shell,
- no hidden network upload,
- validated command payloads.

Tauri reduces browser-extension risk but does not remove app security requirements.

---

## 10. Native services

Add native services only after benchmark decision:

- PDFium renderer,
- native OpenCV,
- native ONNX Runtime,
- SQLite backend,
- encryption/keychain.

Each native service needs:

- interface adapter,
- tests,
- benchmark report,
- threat model review,
- build packaging check.

---

## 11. Updates

App updates must preserve:

- user templates,
- DocGraphs,
- corrections,
- model cache,
- schema migrations.

Update process must run migrations safely and keep backups where feasible.

---

## 12. Signing and notarization

For serious releases:

- sign Windows/macOS builds,
- notarize macOS if distributing publicly,
- publish checksums,
- publish release notes,
- publish model manifest.

---

## 13. Tauri tests

Test:

- app starts,
- open file,
- process synthetic document,
- save template,
- close/reopen,
- known-template extraction,
- export,
- delete data,
- no-cloud behavior,
- native command validation,
- storage migration,
- model checksum failure.

---

## 14. Tauri release checklist

- [ ] frontend production build passes
- [ ] Tauri build passes
- [ ] packaged models present or install path works
- [ ] checksums verified
- [ ] no arbitrary commands
- [ ] no document upload path
- [ ] local storage path tested
- [ ] migration tests pass
- [ ] installers tested on target OS
- [ ] release artifacts checksummed
- [ ] signing/notarization done if required

---

## 15. Final rule

Tauri is not a fork. It is the stronger local runtime for the same evidence graph product. Keep product logic shared and move only runtime/platform responsibilities into the native shell.
