# Device Test Matrix — Edge DocGraph Engine

**Purpose:** Define device/browser/runtime combinations for testing low-end Android, mid laptops, desktops, Safari/Firefox/Chrome, PWA, and Tauri.

---

## 1. Device matrix goal

The product must run on edge devices. Therefore testing must cover real devices, not only developer machines.

---

## 2. Device classes

### Low

Examples:

- low-end Android phone
- older laptop
- low-memory Chromebook
- browser without stable WebGPU

Expected behavior:

- process one page at a time,
- small OCR batches,
- no default segmentation,
- slower but stable,
- clear memory warnings.

### Medium

Examples:

- midrange laptop
- modern Android/iPad/tablet
- mainstream desktop browser

Expected behavior:

- normal extraction,
- ROI-first known template fast,
- moderate batching,
- conditional segmentation.

### High

Examples:

- modern desktop/laptop
- strong GPU/WebGPU
- Tauri desktop app

Expected behavior:

- faster extraction,
- larger batches,
- better multi-page handling,
- still no silent errors.

---

## 3. Browser matrix

Test:

| Browser | Required |
|---|---|
| Chrome latest | yes |
| Edge latest | yes |
| Firefox latest | yes, capability-dependent |
| Safari latest | yes, capability-dependent |
| Android Chrome | yes |
| iOS Safari | exploratory unless PWA support targeted |

---

## 4. Runtime matrix

Test:

- browser/PWA WebGPU
- browser/PWA WASM
- Tauri desktop
- Tauri native backend if implemented

For each:

- model loading
- workers
- storage
- document processing
- template save
- export

---

## 5. Capability matrix

Record:

```json
{
  "deviceId": "medium_laptop_001",
  "browser": "Chrome",
  "webgpu": true,
  "wasm": true,
  "opfs": true,
  "offscreenCanvas": true,
  "crossOriginIsolated": true,
  "indexedDB": true
}
```

---

## 6. Test scenarios per device

Run:

1. upload passport image
2. upload invoice with table/QR
3. upload generic form
4. process unknown document
5. save template
6. process repeated known template
7. edit/correct fields
8. export with statuses
9. clear local data
10. run security smoke tests

---

## 7. Device performance records

Record:

- total latency
- per-stage latency
- model load time
- memory warning
- crash/failure
- UI responsiveness
- browser/runtime mode
- model versions

---

## 8. Low-end acceptance

Low-end device does not need to be fast, but must be safe.

Acceptable:

- slower processing
- reduced batching
- disabled optional segmentation
- review-first UI

Not acceptable:

- UI freeze with no recovery
- memory crash without message
- wrong confirmed values
- storage corruption
- template corruption

---

## 9. Safari/Firefox reality

Safari/Firefox support must be capability-tested.

Do not assume:

- WebGPU availability,
- OPFS behavior,
- OffscreenCanvas behavior,
- ONNX Runtime Web behavior,
- memory performance.

Mark support level based on tests.

---

## 10. Tauri device testing

Tauri tests:

- Windows
- macOS
- Linux

For each:

- open file
- process document
- model load
- save template
- export
- storage migration
- no-cloud behavior
- native services if used

---

## 11. Matrix report

```json
{
  "deviceMatrixRun": {
    "date": "2026-06-05",
    "devices": [
      {
        "name": "Low Android",
        "status": "limited_pass",
        "failures": [],
        "notes": "WASM path only; segmentation disabled."
      }
    ]
  }
}
```

---

## 12. Final rule

A feature is not edge-ready until it has been tested on weak devices, mainstream browsers, and the serious Tauri path. Developer laptop success is not enough.
