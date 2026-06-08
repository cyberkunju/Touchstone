# OffscreenCanvas — Edge DocGraph Engine

**Purpose:** Define worker-side rendering and image operations using OffscreenCanvas, plus fallbacks and integration with normalization, cropping, overlays, and performance.

---

## 1. Why OffscreenCanvas matters

OffscreenCanvas allows canvas operations without depending directly on the DOM and can run inside workers.

This is useful for:

- image resizing
- crop generation
- preprocessing
- page rendering steps
- overlay raster export
- thumbnail creation
- avoiding UI thread blocking

---

## 2. Use cases in this project

Use OffscreenCanvas for:

- decoding/raster manipulation where available
- resizing page images
- drawing crops
- generating thumbnails
- applying simple preprocessing
- converting ImageBitmap to canvas data
- preparing model input buffers
- rendering debug overlays in worker

Do not use it as the only image processing engine if operations require OpenCV-style algorithms.

---

## 3. Architecture

```text
UI thread
  → creates canvas or receives viewer image
  → transfers control if needed
  → sends ImageBitmap/ImageRef to worker

image.worker
  → OffscreenCanvas
  → draw image
  → crop/resize/preprocess
  → output ImageBitmap / Blob / ArrayBuffer / OPFS artifact
```

---

## 4. Transfer patterns

### 4.1 Transfer canvas

```ts
const canvas = document.querySelector("canvas")!;
const offscreen = canvas.transferControlToOffscreen();
worker.postMessage({ canvas: offscreen }, [offscreen]);
```

Use for worker-owned rendering surfaces.

### 4.2 Create OffscreenCanvas inside worker

```ts
const canvas = new OffscreenCanvas(width, height);
const ctx = canvas.getContext("2d");
```

Use for image operations and crops.

---

## 5. Image processing operations

Supported 2D operations:

- drawImage
- resize
- crop
- canvas pixel read/write
- convertToBlob
- createImageBitmap

For heavier operations:

- use OpenCV.js/custom WASM,
- use WebGL/WebGPU where justified,
- keep interface behind `ImageProcessingService`.

---

## 6. Crop generation

Flow:

```text
ImageRef + NormalizedBox
  → resolve image
  → convert normalized box to pixels
  → draw crop to OffscreenCanvas
  → output CropArtifact
```

Crop output:

```ts
type CropArtifact = {
  id: string;
  pageId: string;
  sourceImageId: string;
  boxNorm: NormalizedBox;
  widthPx: number;
  heightPx: number;
  blobRef: string;
};
```

---

## 7. Model input preparation

Model input preparation often needs:

- resize
- letterbox
- normalize pixel values
- channel reorder
- typed array output

Do this in worker.

Flow:

```text
image/crop
  → OffscreenCanvas resize
  → ImageData
  → Float32Array/Uint8Array tensor buffer
  → ONNX Runtime input tensor
```

---

## 8. Avoid repeated readbacks

Reading pixels from canvas can be expensive.

Rules:

- avoid repeated `getImageData`,
- process once per needed output,
- cache intermediate resized images,
- batch crop generation where possible,
- release buffers after tensor creation.

---

## 9. Viewer overlays

The interactive viewer can use:

- DOM/SVG overlays on main thread for accessibility,
- OffscreenCanvas for static/debug raster overlays,
- separate overlay layer for performance.

Do not render all interactive overlays as inaccessible canvas-only graphics.

---

## 10. Fallback strategy

If OffscreenCanvas unavailable or limited:

- use regular canvas on main thread only for light operations,
- reduce workload,
- move more work to WASM/native in Tauri,
- show runtime capability warning if needed.

The app must feature-detect.

```ts
const hasOffscreen = typeof OffscreenCanvas !== "undefined";
```

---

## 11. Browser differences

OffscreenCanvas support and supported contexts can vary. Feature-detect:

- OffscreenCanvas existence
- 2D context support
- WebGL context support if used
- convertToBlob support
- ImageBitmap transfer behavior

Do not hard-assume full behavior across browsers.

---

## 12. Memory management

OffscreenCanvas can hold large pixel buffers.

Rules:

- create per task,
- set width/height to 0 when done if needed,
- release ImageBitmap,
- do not keep full-resolution canvases alive,
- do not duplicate page images unnecessarily.

---

## 13. Error handling

Errors:

- context creation failed
- image draw failed
- out of memory
- unsupported operation
- blob conversion failed

Return structured RuntimeError.

---

## 14. Tests

Test:

- crop generation
- resize accuracy
- normalized coordinate mapping
- model input buffer shape
- thumbnail generation
- memory cleanup
- fallback path
- worker transfer path

---

## 15. OffscreenCanvas invariants

1. Use worker-side canvas for heavy image operations where supported.
2. Keep interactive accessible overlays outside canvas-only rendering.
3. Feature-detect support.
4. Avoid repeated pixel readback.
5. Release large buffers.
6. Convert all crop coordinates from DocGraph normalized coordinates.

---

## 16. Reference

- OffscreenCanvas: https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas

---

## 17. Final statement

OffscreenCanvas is a performance tool, not the architecture itself. Use it to keep image operations off the main thread, but preserve accessibility, coordinate correctness, and memory discipline.
