# Export and Import Security — Edge DocGraph Engine

**Purpose:** Define safe export/import of form data, evidence packages, templates, debug packages, and training/correction data.

---

## 1. Export/import risk

Exports can leak sensitive data even if the app never uploads anything.

Risks:

- user shares unredacted passport data,
- evidence package contains crops/signatures/MRZ,
- template export reveals layout/issuer/vendor,
- training export contains real PII,
- debug package contains OCR text,
- imported template package contains malicious or corrupt content,
- imported package attempts path traversal,
- oversized package causes memory/storage issues.

Export/import needs strict controls.

---

## 2. Export types

Supported export categories:

```text
form_values_export
confirmed_only_export
docgraph_export
evidence_package_export
template_export
training_correction_export
debug_package_export
```

Each has different risk.

---

## 3. Form values export

Contains fields and values.

Rules:

- include statuses by default,
- include evidence references optionally,
- warn if unresolved critical fields exist,
- allow confirmed-only export,
- never strip uncertainty silently.

Recommended JSON shape:

```json
{
  "exportVersion": "1.0.0",
  "documentId": "doc_1",
  "fields": {
    "passportNumber": {
      "value": "A1234567",
      "status": "confirmed",
      "evidenceIds": ["ev_1"]
    }
  }
}
```

---

## 4. Evidence package export

Contains:

- source crops
- OCR text
- parser outputs
- validator results
- DocGraph snippets
- conflicts/corrections

Highly sensitive.

Before export, show:

```text
This evidence package may include document text, crops, signatures, photos, MRZ, barcode payloads, and other sensitive data. Export only if you trust the recipient.
```

Offer:

- redacted export
- encrypted export
- selected fields only

---

## 5. Template export

Templates usually do not include variable values, but still reveal:

- document type
- field labels
- layout
- table schema
- validators
- visual descriptors
- issuer/vendor-like structure

Warning:

```text
Template exports may reveal document layout and field labels. Export only if safe.
```

Default:

- export without sample values,
- exclude private thumbnails unless user includes them,
- mark imported templates as draft.

---

## 6. Training/correction export

Highest risk.

Contains:

- corrections
- before/after values
- source crops
- labels
- field types
- table corrections
- asset crop corrections

Default:

- redaction recommended,
- no automatic upload,
- user manual sharing only,
- include redaction metadata.

Warning:

```text
Training exports may include sensitive data unless redacted. Review before sharing.
```

---

## 7. Debug package export

Debug package may include:

- runtime logs
- model versions
- task timings
- DocGraph
- evidence
- images/crops
- errors

Default debug package should be redacted and value-free unless user chooses full package.

Never include secrets, keys, or raw encryption material.

---

## 8. Export redaction

Redaction options:

- remove values
- replace values with synthetic values
- blur/redact image regions
- exclude portrait/signature crops
- remove MRZ/barcode payloads
- include geometry only
- include status/validator result without raw value

Redaction metadata required:

```json
{
  "redactionStatus": "redacted",
  "redactionVersion": "0.1.0",
  "redactedFields": ["name", "passportNumber", "dob"]
}
```

---

## 9. Export encryption

Offer passphrase-encrypted export for sensitive packages.

Rules:

- AES-GCM,
- unique salt/IV,
- KDF parameters stored,
- no passphrase stored,
- clear warning about forgotten passphrase.

---

## 10. Export manifest

Every export package should include manifest.

```ts
type ExportManifest = {
  packageVersion: string;
  packageType: string;
  createdAt: number;
  appVersion: string;
  containsSensitiveData: boolean;
  redactionStatus: "none" | "redacted" | "synthetic" | "encrypted";
  files: Array<{
    path: string;
    type: string;
    sha256?: string;
    sizeBytes: number;
  }>;
};
```

---

## 11. Import security

Imported packages must be treated as untrusted.

Rules:

- validate manifest,
- validate schema,
- reject unknown executable files,
- enforce size limits,
- prevent path traversal,
- verify checksums if present,
- store imported templates as draft,
- never auto-run scripts,
- never load imported models unless separate trusted model import flow exists.

---

## 12. Path traversal prevention

Reject paths containing:

```text
../
..\
absolute paths
drive letters
null bytes
```

When extracting ZIP/package:

- write only inside controlled import temp directory,
- normalize paths,
- reject suspicious entries.

---

## 13. Import template review

Imported template flow:

1. validate package,
2. show summary,
3. show document type/field count,
4. mark as draft,
5. user reviews before activation,
6. run compatibility check.

Do not make imported template active automatically.

---

## 14. Import training data

Imported training/correction packages:

- must have privacy metadata,
- should default to private local,
- require user confirmation before adding to dataset,
- never auto-commit to repository,
- validate redaction.

---

## 15. Import failure messages

Invalid package:

```text
This package could not be imported because its manifest is invalid.
```

Oversized package:

```text
This package is too large to import safely on this device.
```

Unsafe files:

```text
This package contains unsupported or unsafe files and was not imported.
```

---

## 16. Export UI checklist

Before export, show:

- package type
- contents
- sensitivity
- unresolved field statuses
- redaction status
- encryption option
- file size estimate
- warning text

---

## 17. Tests

Test:

- form values export
- confirmed-only export
- evidence export warning
- redacted export
- encrypted export/decrypt
- template export/import
- path traversal import rejection
- oversized import rejection
- corrupted manifest rejection
- imported template draft status
- training export redaction metadata

---

## 18. Final rule

Local-only privacy can be broken by careless export. Every export must preserve status, warn about sensitive content, and support redaction/encryption. Every import must be treated as hostile until validated.
