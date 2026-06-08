# Error Handling — Edge DocGraph Engine

**Purpose:** Define internal errors, user-facing errors, recovery behavior, severity levels, error boundaries, and safe error logging.

---

## 1. Error handling principle

Errors must be:

- typed
- recoverable where possible
- user-actionable
- safe to log
- free of sensitive raw values
- connected to pipeline/job context
- visible when they affect trust

Do not throw random strings.

---

## 2. Error categories

```ts
type ErrorCategory =
  | "runtime"
  | "pipeline"
  | "model"
  | "ocr"
  | "parser"
  | "verifier"
  | "template"
  | "storage"
  | "security"
  | "privacy"
  | "ui"
  | "unknown";
```

---

## 3. Base error type

```ts
type AppError = {
  id: string;
  code: string;
  category: ErrorCategory;
  severity: "info" | "warning" | "error" | "critical";
  recoverable: boolean;
  userMessage: string;
  developerMessage: string;
  safeDetails?: Record<string, unknown>;
  causedBy?: string;
  createdAt: number;
};
```

Rules:

- `userMessage` must be safe and understandable.
- `developerMessage` must not include raw sensitive values.
- `safeDetails` must be redacted.

---

## 4. Severity levels

### info

Non-problem status.

### warning

Task completed with limitations.

Example:

- WebGPU unavailable; using WASM mode.
- OCR confidence low.

### error

Task failed but app can continue.

Example:

- one page failed to render.
- model load failed.

### critical

Trust/security/release-blocking issue.

Example:

- export would strip statuses.
- no-cloud violation.
- template corruption risk.
- encrypted data tamper detected.

---

## 5. User-facing error mapping

Internal error:

```ts
{
  code: "model_load_failed",
  developerMessage: "ONNX session creation failed for model yolov11n-docdet-v0"
}
```

User message:

```text
A local model could not be loaded on this device. Try refreshing, using a smaller document, or using the desktop app.
```

Do not expose internal stack traces in normal UI.

---

## 6. Common error codes

Runtime:

- `worker_start_failed`
- `worker_crashed`
- `out_of_memory`
- `webgpu_unavailable`
- `wasm_init_failed`

Model:

- `model_not_found`
- `model_checksum_failed`
- `model_load_failed`
- `inference_failed`
- `tensor_shape_mismatch`

Pipeline:

- `unsupported_file_type`
- `pdf_render_failed`
- `image_decode_failed`
- `normalization_failed`
- `pipeline_cancelled`

Storage:

- `indexeddb_failed`
- `opfs_failed`
- `storage_quota_exceeded`
- `migration_failed`
- `delete_failed`

Security:

- `import_manifest_invalid`
- `import_path_traversal`
- `encrypted_record_tampered`
- `xss_sanitization_failed`

Template:

- `template_match_ambiguous`
- `template_false_match_risk`
- `template_save_blocked`
- `template_migration_failed`

---

## 7. Recoverability

Each error must say whether it is recoverable.

Examples:

| Error | Recoverable |
|---|---|
| unsupported file type | yes |
| storage quota exceeded | yes |
| model checksum failed | yes, redownload |
| corrupted encrypted record | maybe |
| no-cloud violation in code path | no, release blocker |
| critical silent error found in test | no, release blocker |

---

## 8. Error boundaries

UI should have error boundaries for:

- main workspace
- document viewer
- form renderer
- evidence drawer
- template save modal

Error boundary should not erase current document/corrections if avoidable.

---

## 9. Pipeline error behavior

Pipeline should:

- fail task, not entire app where possible,
- preserve completed evidence,
- mark affected fields as needs_review/missing when appropriate,
- show user action,
- allow retry/cancel.

Example:

```text
QR parser failed
  → code region still exists
  → status needs_review
  → user can manually inspect
```

---

## 10. Model error behavior

If optional model fails:

- mark feature unavailable,
- continue core pipeline if safe.

If required OCR/detector fails:

- show extraction failure,
- allow manual region creation if possible,
- do not hallucinate output.

---

## 11. Storage error behavior

If save fails:

- keep current session state if possible,
- warn user,
- do not claim saved,
- offer export or retry if safe.

Storage full:

```text
Local storage is full. Delete old documents/templates or free space, then try again.
```

---

## 12. Security error behavior

Security errors should be strict.

Examples:

- path traversal import → reject import
- encrypted record tamper → block read
- model checksum failure → delete/reload model
- XSS unsafe content → render escaped text or block unsafe rendering

Do not continue in unsafe mode silently.

---

## 13. Sensitive data in errors

Forbidden:

```ts
developerMessage: `MRZ failed: ${rawMrz}`
```

Allowed:

```ts
developerMessage: "MRZ checksum validation failed for document number field."
safeDetails: { fieldType: "mrz_document_number" }
```

---

## 14. Error display

User-facing error should include:

- short title
- clear message
- action
- affected area
- retry option where applicable

Example:

```text
Model could not run
A local extraction model could not run on this device.
Try a smaller document or use the desktop app.
```

---

## 15. Testing

Test:

- every error code maps to user message,
- no sensitive values in error payload,
- recoverable errors show action,
- critical errors block unsafe operation,
- pipeline cancellation,
- worker crash recovery,
- storage quota error,
- import security errors.

---

## 16. Final error rule

Errors are part of trust. A failed model, parser, template, or validator must produce safe visible uncertainty or a clear failure—not hidden bad data.
