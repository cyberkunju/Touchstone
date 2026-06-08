# Model and Library Licenses

**Purpose:** Track licenses and obligations for YOLO, PaddleOCR, MediaPipe, zxing-wasm/ZXing, ONNX Runtime, PDF.js, OpenCV, Tauri, and other model/runtime components.

---

## 1. License source of truth

The source of truth is:

1. actual dependency lockfile,
2. actual model artifacts shipped,
3. official upstream license files,
4. release package contents.

This document is a curated engineering map, not legal advice.

---

## 2. Ultralytics YOLO11 / YOLOv11n

Current project selection:

```text
YOLOv11n document detector
YOLOv11n-seg experimental segmentation bucket
```

License expectation:

```text
AGPL-3.0 or Ultralytics Enterprise license
```

Implication:

- If project is open-sourced under AGPL-compatible terms, AGPL path may fit.
- If someone wants proprietary/closed distribution, Enterprise licensing may be required.
- If project remains fully open-source and accepts AGPL obligations, licensing may be acceptable.

Required docs:

- include AGPL license notice if distributing,
- document model provenance,
- document trained weights license,
- document modifications.

Official reference:

- https://docs.ultralytics.com/models/yolo11/
- https://www.ultralytics.com/license

---

## 3. PaddleOCR / PP-OCRv5

Project use:

```text
OCR candidate/core OCR stack
```

Expected license:

```text
Apache-2.0 for PaddleOCR project code
```

Important:

- verify exact model artifact license,
- verify dependency licenses,
- verify browser export/conversion artifacts,
- note any AGPL transitive dependency concerns if bundling optional tools.

Official reference:

- https://github.com/PaddlePaddle/PaddleOCR/blob/main/LICENSE
- https://paddlepaddle.github.io/PaddleOCR/

---

## 4. MediaPipe

Project use:

```text
possible lightweight image/vision utility or research bucket component
```

Expected license:

```text
Apache-2.0
```

Official reference:

- https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE

---

## 5. ZXing / zxing-wasm

Project use:

```text
QR/barcode decoding
```

License action:

```text
verify exact package license from installed package and repository before release
```

Reason:

- ZXing family projects are generally open-source,
- package/repository/license metadata can differ,
- zxing-wasm and zxing-js are not identical artifacts.

Required:

- record exact package name,
- record version,
- record license from package,
- include notice if required.

References:

- https://github.com/zxing-js/library
- https://zxing-js.github.io/library/
- https://github.com/Sec-ant/zxing-wasm

---

## 6. ONNX Runtime Web

Project use:

```text
browser inference runtime
```

Expected license:

```text
MIT
```

Action:

- verify package version license from lockfile,
- include notice if required.

Reference:

- https://github.com/microsoft/onnxruntime
- https://onnxruntime.ai/

---

## 7. PDF.js

Project use:

```text
browser PDF parsing/rendering
```

Expected license:

```text
Apache-2.0
```

Action:

- verify bundled version,
- include notices.

Reference:

- https://github.com/mozilla/pdf.js

---

## 8. OpenCV / OpenCV.js

Project use:

```text
image normalization, geometry, deskew, table lines
```

Expected license:

```text
Apache-2.0
```

Action:

- verify exact OpenCV.js build/license,
- include notice.

Reference:

- https://opencv.org/license/

---

## 9. Tauri

Project use:

```text
desktop local app shell
```

Expected license:

```text
Apache-2.0/MIT ecosystem depending crate/package
```

Action:

- generate Rust crate license report,
- include third-party notices.

Reference:

- https://github.com/tauri-apps/tauri

---

## 10. Experimental models

For every experimental model:

```text
LayoutLM/LayoutXLM
Donut
doc foundation models
EfficientSAM
SlimSAM
SLANet_plus
public YOLO DocLayNet models
```

Before use:

- verify license,
- verify model weights license,
- verify dataset license,
- verify commercial/open-source compatibility,
- benchmark edge runtime,
- update decision log.

---

## 11. License metadata schema

```json
{
  "component": "yolov11n-docdet-v0",
  "type": "model",
  "version": "0.1.0",
  "upstream": "Ultralytics YOLO11",
  "license": "AGPL-3.0-or-enterprise",
  "sourceUrl": "https://docs.ultralytics.com/models/yolo11/",
  "redistributed": true,
  "obligations": ["include license", "provide source under AGPL if applicable"],
  "reviewStatus": "needs_legal_review"
}
```

---

## 12. Release checklist

- [ ] lockfile license scan complete
- [ ] model artifact licenses reviewed
- [ ] notices generated
- [ ] AGPL implications documented
- [ ] experimental bucket licenses marked
- [ ] no unknown-license artifact shipped
- [ ] legal review completed if needed

---

## 13. Final rule

No model or library ships without license metadata. If license is unclear, the component stays experimental and is not included in release builds.
