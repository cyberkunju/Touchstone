# Storage Security — Edge DocGraph Engine

**Purpose:** Define security rules for IndexedDB, OPFS, model cache, document cache, template storage, temporary files, deletion, quota, and storage risks.

---

## 1. Storage scope

The app may use:

- IndexedDB
- OPFS
- Cache API for app/model assets where appropriate
- optional SQLite WASM over OPFS
- Tauri filesystem/SQLite in local app path

Storage contains sensitive data unless proven otherwise.

---

## 2. Storage threat assumptions

Browser local storage can be affected by:

- user clearing site data,
- browser profile access,
- malicious browser extensions,
- XSS,
- compromised device,
- storage quota eviction,
- backup/sync systems,
- private browsing limitations.

Therefore:

- store minimum data,
- encrypt sensitive records where feasible,
- avoid sensitive logs,
- provide deletion,
- do not rely on storage as a security boundary alone.

---

## 3. Storage layout

Recommended logical layout:

```text
IndexedDB:
  documents
  pages
  docgraphs
  evidence
  templates
  corrections
  validators
  exports
  modelCacheIndex
  storageAudit

OPFS:
  /documents/{documentId}/pages/
  /documents/{documentId}/crops/
  /documents/{documentId}/artifacts/
  /templates/{templateId}/descriptors/
  /models/{modelId}/{version}/
  /tmp/
```

---

## 4. IndexedDB security rules

Use IndexedDB for structured records.

Rules:

- classify every record,
- encrypt sensitive payloads where configured,
- avoid storing huge blobs directly when OPFS is better,
- never store plaintext secrets in predictable records,
- support deletion by document/template,
- support schema migrations,
- keep indexes free of sensitive raw values where possible.

Bad index:

```text
index by passportNumber
```

Good index:

```text
index by documentId / fieldId / status
```

---

## 5. OPFS security rules

Use OPFS for large files:

- page images
- crops
- model files
- descriptors
- temporary artifacts
- encrypted export packages

Rules:

- separate documents by documentId,
- never place unrelated document files together without metadata,
- encrypt sensitive blobs where configured,
- clean temp files,
- do not expose OPFS paths in export unless needed,
- store metadata references in IndexedDB.

---

## 6. Model cache security

Model cache usually contains public model files.

Still protect against:

- tampering,
- corrupted partial downloads,
- version mismatch,
- untrusted model import.

Rules:

- use manifest,
- verify checksum,
- use temp path before promotion,
- pin model version,
- do not load arbitrary user-provided model by default,
- record model version in evidence.

---

## 7. Document cache

Document cache may include:

- original file copy
- rendered pages
- normalized pages
- crops
- DocGraph
- evidence

Default should be conservative:

```text
session-only unless user saves document/project or template requires artifacts.
```

User should be able to delete document cache.

---

## 8. Template storage

Templates are sensitive.

Store:

- TemplateGraph
- anchor descriptors
- template thumbnails if user allows
- validators
- regions
- field labels

Rules:

- no variable document values,
- encrypt where configured,
- warn before export,
- allow deletion,
- version templates,
- prevent silent overwrite.

---

## 9. Temporary files

Temporary files are high risk because developers forget them.

Rules:

- all temp files go under `/tmp/`,
- temp records include owner jobId,
- cleanup after task,
- cleanup on startup,
- cleanup after cancellation,
- encrypt temp sensitive blobs if stored longer than task.

---

## 10. Deletion model

Deletion must remove:

- IndexedDB records,
- OPFS artifacts,
- thumbnails,
- crops,
- DocGraph,
- corrections,
- template descriptors if deleting template,
- export packages generated locally if user chooses.

Because browser storage may not support secure deletion, phrase accurately:

```text
Delete local app records and artifacts.
```

Do not claim forensic secure wipe.

---

## 11. Storage quota handling

Browser storage quota may fail.

Handle:

- quota exceeded,
- OPFS write failure,
- IndexedDB transaction failure,
- cache eviction.

User message:

```text
Local storage is full. Delete old documents/templates or free space, then try again.
```

---

## 12. Persistence

If browser supports persistent storage request, app may ask only with clear reason.

Message:

```text
Allow persistent local storage so models and templates are not cleared automatically.
```

Do not surprise users.

---

## 13. Storage audit

Maintain local audit metadata:

```ts
type StorageAuditRecord = {
  id: string;
  objectType: string;
  objectId: string;
  sensitivity: DataSensitivity;
  encrypted: boolean;
  sizeBytes?: number;
  createdAt: number;
  lastAccessedAt?: number;
  retentionPolicy: RetentionPolicy;
};
```

This enables “clear data” UI.

---

## 14. Import storage risks

Imported templates/training packages can be malicious or oversized.

Rules:

- validate schema,
- limit size,
- scan manifest,
- do not execute code,
- store imported templates as draft by default,
- reject path traversal,
- ignore unknown executable content,
- checksum artifacts.

---

## 15. Tauri storage

Tauri can store under app data directory.

Rules:

- use OS app data paths,
- validate all paths,
- avoid arbitrary path writes,
- encrypt sensitive records where possible,
- use OS keychain for keys where possible,
- never expose raw filesystem to frontend.

---

## 16. Backup/sync warning

Browser profiles and app data may be backed up or synced by OS/browser tools.

Privacy docs should warn:

```text
Local data may be included in device/browser backups depending on your system settings.
```

---

## 17. Tests

Test:

- document save/delete
- template save/delete
- correction delete
- temp cleanup
- quota failure
- encrypted record read/write
- corrupted OPFS file
- model checksum failure
- import rejection
- migration

---

## 18. References

- IndexedDB API: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- Origin Private File System: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
- Web Crypto API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API

---

## 19. Final rule

Local storage is sensitive storage. Treat IndexedDB, OPFS, templates, corrections, crops, and caches as part of the privacy boundary, and design deletion, encryption, validation, and quota behavior from day one.
