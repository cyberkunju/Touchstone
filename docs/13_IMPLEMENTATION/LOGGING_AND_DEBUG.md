# Logging and Debug — Edge DocGraph Engine

**Purpose:** Define local-only debug logs, graph inspection, model traces, performance logging, no sensitive leaks, and developer tooling.

---

## 1. Logging principle

Logs are local and safe by default.

Logs must help developers debug without leaking:

- OCR text
- field values
- MRZ
- QR/barcode payloads
- document images
- crops
- signatures/photos
- correction values
- encryption keys

---

## 2. Log levels

```ts
type LogLevel = "debug" | "info" | "warn" | "error";
```

Production default:

```text
info/warn/error only, redacted
```

Developer mode:

```text
debug allowed locally, still redacted unless explicit unsafe mode
```

---

## 3. Safe log structure

```ts
type LogEvent = {
  id: string;
  level: LogLevel;
  event: string;
  createdAt: number;
  documentId?: DocumentId;
  pageId?: PageId;
  jobId?: JobId;
  taskId?: TaskId;
  safeDetails?: Record<string, unknown>;
};
```

---

## 4. Forbidden log content

Never log:

- raw OCR text
- extracted values
- MRZ lines
- decoded QR/barcode payloads
- table cell text
- user correction before/after values
- image bytes
- crop previews
- local encryption keys
- passphrases
- full file paths if sensitive
- full imported/exported package contents

---

## 5. Allowed log content

Allowed:

- status counts
- model ID/version
- duration
- task type
- field type
- validator ID
- error code
- memory warning level
- page count
- artifact size
- runtime mode
- redaction status

Example:

```json
{
  "event": "ocr_completed",
  "safeDetails": {
    "pageId": "page_1",
    "lineCount": 42,
    "durationMs": 831,
    "modelId": "ppocrv5-rec-v0"
  }
}
```

---

## 6. Local-only rule

No default remote logging.

If remote telemetry is ever introduced:

- opt-in only,
- no document data,
- no extracted values,
- no templates/corrections,
- separate privacy review.

---

## 7. Debug panels

Developer debug UI may show:

- DocGraph structure
- node counts
- evidence IDs
- validator results
- model versions
- task timings
- template scores
- alignment diagnostics

Default developer mode should redact values.

Unsafe full debug mode must require explicit action and warning.

---

## 8. Graph inspector

Graph inspector should show:

- nodes
- edges
- evidence links
- hypotheses
- validations
- conflicts
- patches
- selected field provenance

Value display modes:

```text
redacted
summary
full local unsafe
```

Default:

```text
redacted
```

---

## 9. Performance logs

Performance logs should include:

- task duration
- model load time
- inference time
- OCR ROI count
- table count
- memory warning
- runtime mode

No sensitive values.

---

## 10. Model debug traces

Model trace can include:

- model ID
- model version
- input shape
- output shape
- postprocessing thresholds
- number of detections
- runtime provider
- latency

Do not include image tensors or OCR text.

---

## 11. Validator debug

Validator debug can include:

- validator ID
- target field type
- pass/warn/fail
- severity
- reason code
- evidence IDs

Avoid raw values unless unsafe local mode.

---

## 12. Exporting debug packages

Before export:

```text
This debug package may include sensitive document data. Use redacted export unless you are sure.
```

Default:

- redacted
- no raw image/crops
- no raw values
- include schema/model/runtime info

Full debug export:

- explicit warning
- optional encryption
- user-controlled only

---

## 13. Log retention

Logs should be:

- session-limited by default,
- size-limited,
- clearable,
- redacted,
- excluded from normal export unless selected.

---

## 14. Redaction utility

All logs pass through sanitizer.

```ts
interface LogSanitizer {
  sanitize(event: LogEvent): LogEvent;
}
```

Sanitizer should remove suspicious keys:

- value
- text
- mrz
- payload
- crop
- image
- raw
- password
- key
- secret

---

## 15. Tests

Test:

- logs do not include raw values,
- sanitizer catches forbidden keys,
- debug export default redacted,
- unsafe export warning appears,
- performance logs value-free,
- model logs value-free,
- error logs safe.

---

## 16. Final logging rule

If a log would be dangerous in a GitHub issue, it should not be produced by default. Debugging must be useful, local, and redacted unless the user explicitly chooses otherwise.
