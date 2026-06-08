# Security Headers — Edge DocGraph Engine

**Purpose:** Define COOP/COEP/CSP requirements for SharedArrayBuffer, WASM threading, cross-origin isolation, model security, workers, and safe local processing.

---

## 1. Why security headers matter

This app runs sensitive document processing locally in the browser.

It may need:

- WebAssembly
- WASM threading
- SharedArrayBuffer
- workers
- local model files
- strict isolation
- no third-party script access

Security headers are part of the runtime architecture, not deployment decoration.

---

## 2. Cross-origin isolation

Some high-performance browser features require cross-origin isolation.

To enable cross-origin isolation, serve the app with:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

or COEP credentialless where intentionally supported/tested:

```http
Cross-Origin-Embedder-Policy: credentialless
```

Recommended starting point:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

---

## 3. Why COOP

COOP controls browsing context group isolation.

Use:

```http
Cross-Origin-Opener-Policy: same-origin
```

Purpose:

- isolate top-level document from cross-origin opener relationships,
- support cross-origin isolation conditions,
- reduce XS-Leak-style risks.

---

## 4. Why COEP

COEP controls embedding/loading cross-origin resources.

Use:

```http
Cross-Origin-Embedder-Policy: require-corp
```

Purpose:

- require cross-origin resources to explicitly permit loading through CORP/CORS,
- support cross-origin isolation,
- protect powerful memory-sharing features.

---

## 5. SharedArrayBuffer requirement

If using SharedArrayBuffer/threaded WASM:

Requirements:

- secure context,
- cross-origin isolated,
- COOP/COEP configured,
- third-party resources compliant,
- feature detection.

Runtime check:

```ts
if (!crossOriginIsolated) {
  // disable threaded WASM or show limitation
}
```

---

## 6. Content Security Policy

Start strict.

Example baseline:

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval';
  worker-src 'self' blob:;
  child-src 'self' blob:;
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data:;
  font-src 'self';
  connect-src 'self';
  media-src 'self' blob:;
  object-src 'none';
  base-uri 'self';
  form-action 'none';
  frame-ancestors 'none';
```

Adjust based on bundler/runtime requirements.

Notes:

- `wasm-unsafe-eval` may be needed for WASM in some environments.
- Avoid remote scripts.
- Avoid broad `connect-src *`.
- If models are downloaded from release CDN, explicitly list that origin and verify checksums.
- In strict local-first mode, model assets should be same-origin or packaged.

---

## 7. Worker headers

Workers must be loaded from allowed sources.

CSP:

```http
worker-src 'self' blob:
```

If using module workers, ensure bundler output and CSP match.

---

## 8. Model asset headers

If models are same-origin:

```http
Cross-Origin-Resource-Policy: same-origin
```

If models are served from another trusted origin under COEP require-corp, resources need CORS/CORP configured correctly.

Recommended for simplicity:

```text
Serve app and model assets from same origin.
```

---

## 9. PDF and document safety

Uploaded documents are user-selected local files.

Rules:

- do not execute embedded scripts,
- do not load remote PDF resources,
- sanitize file names,
- treat PDFs/images as untrusted input,
- parse/render in worker where possible,
- avoid injecting document text as HTML.

---

## 10. Barcode payload safety

QR/barcode payloads may contain URLs or malicious-looking text.

Rules:

- never auto-open URL,
- render as escaped text,
- do not execute payload,
- do not fetch payload,
- show safety warning.

---

## 11. Third-party scripts

Avoid third-party scripts entirely.

Reasons:

- documents are sensitive,
- third-party scripts can inspect DOM/memory,
- COEP may block them,
- privacy promise depends on isolation.

If analytics is ever added, it must not receive document content, OCR text, file names, or sensitive metadata.

---

## 12. Network policy

Default:

```http
connect-src 'self'
```

If model download from release host:

```http
connect-src 'self' https://trusted-model-host.example
```

No document upload endpoints should be required.

---

## 13. Development vs production

Development servers often lack correct headers.

Local dev must support:

- COOP
- COEP
- CSP testing
- worker assets
- WASM assets
- model files

Vite/dev server should be configured to send headers for testing runtime isolation.

---

## 14. Example Vite headers

Example concept:

```ts
server: {
  headers: {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp"
  }
}
```

Production must configure equivalent headers at hosting/server layer.

---

## 15. Tauri security

In Tauri:

- CSP still matters,
- disable remote code loading,
- restrict commands,
- validate file paths,
- avoid shell execution,
- use least privilege permissions.

Tauri reduces some browser header needs but does not remove app security requirements.

---

## 16. Runtime checks

At startup, check:

```ts
type SecurityRuntimeCheck = {
  secureContext: boolean;
  crossOriginIsolated: boolean;
  sharedArrayBufferAvailable: boolean;
  cspLikelyOk: boolean;
  workerLoadOk: boolean;
  wasmLoadOk: boolean;
};
```

Show warnings only if feature impact exists.

---

## 17. Header test checklist

- [ ] COOP present
- [ ] COEP present
- [ ] crossOriginIsolated true when needed
- [ ] SharedArrayBuffer available when expected
- [ ] workers load
- [ ] WASM loads
- [ ] models load
- [ ] no blocked app-critical assets
- [ ] third-party resources not required
- [ ] CSP blocks inline/untrusted scripts where possible

---

## 18. Failure messages

Isolation missing:

```text
Advanced local acceleration is unavailable because security isolation headers are not enabled.
```

Worker blocked:

```text
A local processing worker could not start. Check browser security settings or use the desktop app.
```

Model blocked:

```text
A local model file was blocked by browser security policy.
```

---

## 19. Security invariants

1. Serve app and models from trusted origins.
2. Use COOP/COEP when SharedArrayBuffer/threaded WASM is needed.
3. Use strict CSP.
4. Avoid third-party scripts.
5. Do not auto-open barcode URLs.
6. Do not inject OCR/document text as HTML.
7. Do not require document upload.
8. Validate Tauri commands and paths.
9. Test headers in development and production.
10. Security settings must not be weakened to make demos easier.

---

## 20. References

- COOP: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy
- COEP: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy
- SharedArrayBuffer: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer
- Web Workers: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API

---

## 21. Final statement

Security headers are part of the edge runtime contract. A local document intelligence app must be isolated, strict, worker-safe, WASM-safe, and free from third-party code paths that could compromise sensitive documents.
