# Browser Support — Edge DocGraph Engine

**Purpose:** Define practical browser support expectations, Chrome/Edge/Firefox/Safari realities, PWA limitations, feature detection, and graceful degradation.

---

## 1. Browser support philosophy

Do not assume all browsers behave equally.

The runtime must feature-detect:

- WebGPU
- WebAssembly features
- SharedArrayBuffer/crossOriginIsolated
- OffscreenCanvas
- OPFS
- workers
- ImageBitmap
- PDF rendering behavior
- storage quota behavior

Support should be based on capability, not browser name alone.

---

## 2. Recommended support tiers

### Tier 1 — Best browser path

Use for development and primary browser support.

Likely target:

- Chromium-based browsers where WebGPU/worker/OPFS paths are strongest.

### Tier 2 — Supported with limitations

Browsers that can run the app but may use slower runtime modes or reduced features.

Possible limitations:

- WebGPU unavailable/unstable
- weaker OffscreenCanvas behavior
- storage behavior differences
- slower WASM

### Tier 3 — View/review only or unsupported

Browsers/devices where:

- required APIs missing,
- model runtime fails,
- memory too low,
- storage unavailable,
- security isolation impossible.

---

## 3. Feature detection checklist

Run at startup:

```ts
type RuntimeCapabilities = {
  workers: boolean;
  moduleWorkers: boolean;
  offscreenCanvas: boolean;
  imageBitmap: boolean;
  opfs: boolean;
  webgpu: boolean;
  wasm: boolean;
  sharedArrayBuffer: boolean;
  crossOriginIsolated: boolean;
  indexedDB: boolean;
};
```

Use this to choose runtime plan.

---

## 4. WebGPU reality

WebGPU can provide acceleration but should not be assumed.

Rules:

- feature-detect `navigator.gpu`,
- test a small inference,
- handle device lost,
- keep WASM mode allowed where model policy permits,
- record runtime mode in evidence/performance logs.

Do not promise WebGPU across all browsers.

---

## 5. WASM reality

WASM is the broad compatibility path.

Consider:

- threaded WASM may require cross-origin isolation,
- SIMD support varies,
- performance differs significantly,
- memory limits vary.

Feature-detect and benchmark.

---

## 6. SharedArrayBuffer and isolation

If runtime uses threaded WASM/SharedArrayBuffer:

- document must be secure context,
- document must be cross-origin isolated,
- COOP and COEP headers are required,
- third-party resources must comply with CORS/CORP.

Detect:

```ts
if (!crossOriginIsolated) {
  // choose non-threaded mode or show limitation
}
```

---

## 7. OffscreenCanvas support

Feature-detect:

```ts
const hasOffscreenCanvas = typeof OffscreenCanvas !== "undefined";
```

Check contexts:

```ts
new OffscreenCanvas(1, 1).getContext("2d")
```

If not available:

- use regular canvas for light operations,
- reduce workload,
- rely more on Tauri/native path for serious workloads.

---

## 8. OPFS support

OPFS is preferred for large local files/models.

Feature-detect:

```ts
const hasOpfs = !!navigator.storage?.getDirectory;
```

If missing:

- use IndexedDB Blob storage fallback where acceptable,
- reduce cache expectations,
- recommend Tauri packaged app for serious use.

---

## 9. Safari considerations

Safari support should be validated carefully.

Potential concerns:

- WebGPU availability/stability,
- OPFS behavior,
- worker/canvas differences,
- memory pressure,
- PWA storage behavior.

Do not declare full Safari support without actual benchmark tests.

---

## 10. Firefox considerations

Firefox support should be validated carefully.

Potential concerns:

- WebGPU availability/stability depending version/platform,
- ONNX Runtime Web execution provider compatibility,
- OffscreenCanvas behavior,
- OPFS behavior,
- performance.

Use WASM path where WebGPU is not reliable.

---

## 11. Chrome/Edge considerations

Chromium is likely the strongest browser path for early prototype because:

- WebGPU maturity tends to be better,
- OPFS support is strong,
- worker APIs are strong,
- PWA tooling is mature.

Still feature-detect and benchmark.

---

## 12. PWA limitations

PWA can provide:

- offline app shell,
- model caching,
- local processing,
- install-like experience.

Limitations:

- storage may be cleared,
- file system access limited,
- memory limits vary,
- background processing limited,
- device/browser update can change behavior,
- large model downloads can be awkward,
- advanced headers must be configured correctly.

Tauri reduces many of these limitations.

---

## 13. Browser support matrix

Maintain a tested matrix:

| Browser | OS | WebGPU | WASM | OPFS | OffscreenCanvas | Status | Notes |
|---|---|---|---|---|---|---|---|
| Chrome latest | Windows/macOS/Linux | test | test | test | test | target | benchmark |
| Edge latest | Windows/macOS | test | test | test | test | target | benchmark |
| Firefox latest | Windows/macOS/Linux | test | test | test | test | limited/target after tests | benchmark |
| Safari latest | macOS/iOS | test | test | test | test | limited/target after tests | benchmark |

Do not fill with assumptions; fill from CI/manual testing.

---

## 14. Runtime capability UI

If feature missing:

```text
Hardware acceleration is unavailable. The app will use a slower local runtime.
```

If storage missing:

```text
This browser cannot cache large local model files reliably. Use the desktop app for best performance.
```

If isolation missing:

```text
Advanced local acceleration is unavailable because security isolation headers are not enabled.
```

---

## 15. Testing plan

For each browser:

- load app
- upload image
- run detector
- run OCR
- parse QR
- save template
- reload offline
- process known template
- export
- clear storage
- memory stress test

---

## 16. CI and manual testing

Automated browser testing can cover:

- app boot
- feature detection
- worker availability
- storage API availability
- basic UI flows

Manual device testing required for:

- model inference performance,
- WebGPU stability,
- memory behavior,
- camera/photo workflows,
- large PDFs.

---

## 17. Tauri recommendation

Because browser support can vary, Tauri should be the serious-app path:

- same frontend,
- local shell,
- better file/model storage,
- native backend options,
- less dependency on browser PWA quirks.

---

## 18. References

- Web Workers: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API
- OffscreenCanvas: https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas
- OPFS: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
- SharedArrayBuffer: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer
- COOP: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy
- COEP: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy

---

## 19. Final browser support rule

Browser support must be capability-tested, not guessed. Build the browser/PWA path, but keep the serious production path ready through Tauri so the project is not hostage to browser-specific runtime limits.
