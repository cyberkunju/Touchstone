# PWA Build — Edge DocGraph Engine

**Purpose:** Define the browser/PWA offline build path, service worker strategy, model caching, local storage, runtime capabilities, and limitations.

---

## 1. PWA goal

The PWA build is the browser-distributed local-first app.

It should support:

- installable web app,
- offline app shell,
- local document processing,
- model caching,
- local templates,
- local corrections,
- no document upload,
- export/import by user action.

---

## 2. PWA reality

A PWA is useful, but not as predictable as a desktop app.

Limitations:

- storage quota varies,
- storage can be cleared by browser/user,
- WebGPU support varies,
- memory limits vary,
- background processing may be throttled,
- file system access is limited,
- Safari/iOS behavior differs,
- SharedArrayBuffer/threaded WASM needs isolation headers.

Therefore:

```text
PWA = excellent prototype and lightweight deployment path.
Tauri = serious packaged local app path.
```

---

## 3. Build command

Recommended:

```bash
pnpm --filter @app/web build
```

Output:

```text
apps/web/dist/
```

---

## 4. PWA assets

Required:

```text
manifest.webmanifest
icons
service worker
offline shell
model manifest
runtime capability page
```

Optional:

```text
demo synthetic files
docs links
release notes
```

Do not cache user documents with service worker.

---

## 5. Service worker strategy

The service worker may cache:

- app shell,
- static JS/CSS,
- icons,
- documentation shell,
- model manifest,
- model files if same-origin and policy allows.

The service worker must not cache:

- uploaded documents,
- rendered pages,
- OCR text,
- DocGraph,
- evidence crops,
- exported packages,
- user corrections.

Sensitive data belongs in app-controlled IndexedDB/OPFS, not generic HTTP cache.

---

## 6. Offline model strategy

Options:

### Option A — cache on first use

Pros:

- smaller initial app load,
- only downloads needed models.

Cons:

- first extraction needs network,
- offline use requires prior cache.

### Option B — pre-cache core models

Pros:

- works offline after install,
- predictable.

Cons:

- large install,
- model update complexity.

Recommended:

```text
PWA v1: lazy model download + OPFS cache.
Tauri v1: bundle required models.
```

---

## 7. OPFS and IndexedDB

Use:

```text
OPFS:
  models
  large artifacts
  document images/crops

IndexedDB:
  metadata
  DocGraph
  TemplateGraph
  corrections
  indexes
```

Feature detect both.

If OPFS unavailable:

- reduce capability,
- use IndexedDB Blob path only if acceptable,
- recommend desktop app for serious use.

---

## 8. Runtime capability detection

At startup, detect:

```ts
type RuntimeCapabilities = {
  webgpu: boolean;
  wasm: boolean;
  workers: boolean;
  offscreenCanvas: boolean;
  indexedDB: boolean;
  opfs: boolean;
  sharedArrayBuffer: boolean;
  crossOriginIsolated: boolean;
};
```

Show limitations honestly.

---

## 9. Cross-origin isolation

If using SharedArrayBuffer/threaded WASM:

Required headers:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Also ensure all embedded resources comply with CORS/CORP.

---

## 10. Content Security Policy

Use strict CSP.

Example baseline:

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval';
  worker-src 'self' blob:;
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data:;
  font-src 'self';
  connect-src 'self';
  object-src 'none';
  base-uri 'self';
  frame-ancestors 'none';
```

If model downloads use a release CDN, explicitly list it and verify checksums.

---

## 11. PWA install UX

Show install only when:

- browser supports it,
- app shell loaded,
- model/runtime limitations known.

Do not imply install means guaranteed permanent storage.

---

## 12. Offline behavior

When offline:

- app shell should load,
- cached models should work,
- local templates should work,
- extraction should work if models available,
- export should work.

If model missing:

```text
Required local model is not available offline. Connect once to download it or use the desktop app.
```

---

## 13. PWA testing

Test:

- fresh online load,
- install,
- reload offline,
- model cached extraction,
- missing model offline warning,
- service worker update,
- cache clear behavior,
- no document HTTP cache,
- no-cloud extraction,
- storage quota failure.

---

## 14. PWA release checklist

- [ ] app shell builds
- [ ] service worker registered
- [ ] offline shell works
- [ ] model cache works
- [ ] documents not cached by service worker
- [ ] no-cloud network test passes
- [ ] CSP configured
- [ ] COOP/COEP configured if needed
- [ ] runtime capability UI works
- [ ] update flow tested

---

## 15. Final rule

The PWA must be private by architecture, not by hope. Cache app/model assets, never user documents, and always tell the user when browser limits reduce local runtime capability.
