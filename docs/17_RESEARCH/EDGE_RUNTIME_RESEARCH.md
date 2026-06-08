# Edge Runtime Research

**Purpose:** Review ONNX Runtime Web, WebGPU, WASM, WebNN, Tauri, and local storage/runtime choices.

**Review date:** 2026-06-05

---

## 1. Decision summary

Current runtime recommendation:

```text
Prototype/lightweight web path:
  PWA + Web Workers + ONNX Runtime Web + WASM/WebGPU + IndexedDB/OPFS

Serious v1 path:
  Tauri + same frontend + local packaged models + optional native ONNX/OpenCV/PDFium
```

The product must not depend on cloud processing.

---

## 2. ONNX Runtime Web

### What it offers

ONNX Runtime Web supports running ONNX models in JavaScript environments. Official docs describe execution paths including WebAssembly, WebGPU, WebGL, and WebNN, with WASM supporting all ONNX operators while WebGPU/WebGL/WebNN support subsets.

Reference:

- https://onnxruntime.ai/docs/tutorials/web/

### Strengths

- Best practical browser inference abstraction.
- Works with Web Workers.
- Supports WASM CPU path.
- Supports WebGPU/WebNN paths where available.
- Fits ONNX export strategy.

### Risks

- WebGPU/WebNN operator coverage can be incomplete.
- Model export must be tested.
- Memory handling is fragile for large models.
- Browser differences matter.
- Threaded/SIMD WASM may need COOP/COEP.

### Verdict

Core browser inference runtime.

---

## 3. WebGPU

### What it offers

WebGPU provides modern GPU access in browsers, but MDN marks it as limited availability/not baseline because it does not work in all widely used browsers.

Reference:

- https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API

### Strengths

- Potential acceleration for model inference.
- Useful for modern Chromium and improving browsers.
- Important for local AI in browser.

### Risks

- Browser support varies.
- Device support varies.
- Memory crashes/device lost possible.
- ONNX model op support may vary.
- Cannot be the only runtime path.

### Verdict

Preferred acceleration where available, but not sole dependency.

---

## 4. WASM

### Strengths

- Most reliable browser inference fallback path.
- ONNX Runtime Web says WASM supports all ONNX operators.
- Works on more devices than WebGPU.
- Predictable CPU path.

### Risks

- Slower than GPU.
- Threading/SIMD may require cross-origin isolation.
- Heavy models may be too slow.
- Battery/thermal concerns.

### Verdict

Core compatibility path.

---

## 5. WebNN

### What it is

The W3C WebNN specification defines a hardware-agnostic web API for neural network inference using OS/hardware ML capabilities.

Reference:

- https://www.w3.org/TR/webnn/

### Strengths

- Long-term promising standard.
- Can access OS/hardware ML acceleration.
- Important future runtime.

### Risks

- Still evolving.
- Browser support and production maturity vary.
- ONNX Runtime Web WebNN path may be experimental depending version.
- Not a v1 dependency.

### Verdict

Future research path, not core v1.

---

## 6. Web Workers

### Why required

Workers keep the UI responsive while running:

- PDF rendering,
- image normalization,
- OCR,
- detection,
- segmentation,
- parsing,
- table extraction,
- storage.

### Verdict

Mandatory architecture component.

---

## 7. OffscreenCanvas

### Role

Useful for worker-side:

- crop generation,
- resize,
- thumbnails,
- preprocessing,
- model input preparation.

### Verdict

Use where available; feature-detect.

---

## 8. IndexedDB and OPFS

### IndexedDB

Good for:

- structured records,
- DocGraph metadata,
- TemplateGraph,
- corrections,
- indexes.

### OPFS

Good for:

- model files,
- page images,
- crops,
- large artifacts.

### Risks

- Browser storage quota varies.
- Data can be cleared.
- Not a perfect security boundary.
- Encryption/storage policy needed.

### Verdict

Core browser storage stack.

---

## 9. Tauri

### What it offers

Tauri uses a web frontend rendered in a WebView with Rust/backend capabilities and is designed for small local apps across desktop and mobile platforms.

References:

- https://v2.tauri.app/start/
- https://v2.tauri.app/concept/architecture/

### Strengths

- Same frontend as web app.
- Better local file/model packaging.
- Stronger local storage options.
- Optional native ONNX/OpenCV/PDFium.
- Desktop offline app path.
- Reduces some browser/PWA limitations.

### Risks

- Requires install.
- Native build complexity.
- Mobile path is harder.
- Security command surface must be strict.

### Verdict

Serious v1 path.

---

## 10. Runtime decision matrix

| Runtime option | Status | Reason |
|---|---|---|
| ONNX Runtime Web + WASM | Core | broadest browser compatibility |
| ONNX Runtime Web + WebGPU | Core acceleration path | faster where available |
| WebNN | Future bucket | promising but not v1 dependency |
| Browser PWA | Prototype/lightweight path | easy distribution |
| Tauri | Serious v1 path | stronger local app |
| Electron | Rejected for now | heavier than Tauri |
| Cloud inference | Rejected core | violates local/no-cloud requirement |

---

## 11. Final runtime rule

The runtime must be selected for **local reliability**, not hype.

Final architecture:

```text
Browser:
  ONNX Runtime Web + WASM/WebGPU + Workers + OPFS/IndexedDB

Tauri:
  same frontend + packaged models + optional native acceleration
```

Nothing in the core pipeline may require cloud document processing.
