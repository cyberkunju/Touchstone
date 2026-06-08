# Template Storage Format — Edge DocGraph Engine

**Purpose:** Define exact local storage layout for TemplateGraphs, metadata, artifacts, descriptors, indexes, and migrations.

---

## 1. Storage goals

Template storage must be:

- local-first
- privacy-preserving
- versioned
- queryable
- exportable
- migratable
- corruption-resistant
- efficient for template matching

---

## 2. Storage layers

Use:

```text
IndexedDB → structured template metadata and TemplateGraph JSON
OPFS      → large artifacts, thumbnails, descriptors, optional crops
WebCrypto → encryption for sensitive records where feasible
```

The exact implementation can wrap these with a storage service.

---

## 3. Logical storage layout

```text
template_store/
  templates/
    {templateId}/
      template.json
      metadata.json
      thumbnail.webp
      descriptors/
        visual_anchor_{id}.bin
        keypoint_anchor_{id}.bin
      artifacts/
        optional_preview_{id}.webp
      benchmarks/
        last_match_report.json

  families/
    {familyId}/
      family.json
      versions.json

  indexes/
    text_anchor_index.json
    layout_fingerprint_index.json
    visual_hash_index.json
    special_zone_index.json

  migrations/
    migration_log.json
```

In browser, this is represented through IndexedDB records and OPFS files, not necessarily a visible filesystem.

---

## 4. IndexedDB object stores

Recommended stores:

```text
templates
templateFamilies
templateVersions
templateIndexes
templateArtifacts
templateDescriptors
templateMigrations
templateUsageStats
```

---

## 5. templates store

Key:

```text
templateId
```

Value:

```ts
type StoredTemplateRecord = {
  templateId: string;
  familyId: string;
  version: number;
  schemaVersion: string;
  name: string;
  docType: string;
  status: "draft" | "active" | "deprecated";
  templateGraph: TemplateGraph;
  createdAt: number;
  updatedAt: number;
  encrypted: boolean;
};
```

---

## 6. templateFamilies store

```ts
type TemplateFamilyRecord = {
  familyId: string;
  name: string;
  docType: string;
  activeVersionIds: string[];
  deprecatedVersionIds: string[];
  createdAt: number;
  updatedAt: number;
};
```

---

## 7. templateVersions store

```ts
type TemplateVersionRecord = {
  templateId: string;
  familyId: string;
  version: number;
  parentTemplateId?: string;
  previousVersionId?: string;
  status: "draft" | "active" | "deprecated";
  versionReason: string;
  createdAt: number;
};
```

---

## 8. templateIndexes store

Indexes support candidate retrieval.

Index types:

- text anchor index
- layout fingerprint index
- visual hash index
- special-zone index
- document type index
- recent template index

Example:

```ts
type TemplateIndexRecord = {
  indexId: string;
  indexType:
    | "text_anchor"
    | "layout_fingerprint"
    | "visual_hash"
    | "special_zone"
    | "doc_type"
    | "recent";

  key: string;
  templateIds: string[];
  updatedAt: number;
};
```

---

## 9. templateArtifacts store

Metadata for OPFS artifacts.

```ts
type TemplateArtifactRecord = {
  artifactId: string;
  templateId: string;
  artifactType:
    | "thumbnail"
    | "visual_descriptor"
    | "keypoint_descriptor"
    | "preview_crop"
    | "benchmark_report";

  opfsPath: string;
  mimeType?: string;
  sizeBytes?: number;
  encrypted: boolean;
  createdAt: number;
};
```

---

## 10. OPFS artifact layout

Suggested:

```text
/opfs/edge-docgraph/templates/{templateId}/thumbnail.webp
/opfs/edge-docgraph/templates/{templateId}/descriptors/{descriptorId}.bin
/opfs/edge-docgraph/templates/{templateId}/reports/{reportId}.json
```

Avoid storing private document crops in TemplateGraph unless user explicitly permits. Prefer descriptors and thumbnails that are safe enough for local use.

---

## 11. Encryption

Sensitive template records should be encrypted where feasible.

Sensitive fields:

- TemplateGraph labels/regions
- visual descriptors
- thumbnails
- any stored preview crops
- source provenance
- template names if user-sensitive

Use:

- WebCrypto AES-GCM
- per-install or user-provided key strategy
- encrypted payload wrapper

Encrypted wrapper:

```ts
type EncryptedRecord = {
  encrypted: true;
  algorithm: "AES-GCM";
  keyId: string;
  iv: string;
  ciphertext: string;
  authTag?: string;
};
```

---

## 12. Model/version metadata

TemplateGraph should record model versions used to create it.

```ts
type TemplateModelContext = {
  detectorVersion?: string;
  ocrVersion?: string;
  segmentationVersion?: string;
  tableEngineVersion?: string;
  parserVersions?: Record<string, string>;
};
```

This helps diagnose template behavior after model updates.

---

## 13. Storage API

Recommended service interface:

```ts
interface TemplateStore {
  saveTemplate(template: TemplateGraph, options: SaveTemplateOptions): Promise<void>;

  getTemplate(templateId: string): Promise<TemplateGraph | null>;

  listTemplates(filter?: TemplateFilter): Promise<TemplateSummary[]>;

  listFamilyVersions(familyId: string): Promise<TemplateSummary[]>;

  updateTemplateStatus(templateId: string, status: TemplateStatus): Promise<void>;

  deleteTemplate(templateId: string): Promise<void>;

  exportTemplate(templateId: string): Promise<TemplateExportPackage>;

  importTemplate(pkg: TemplateExportPackage): Promise<TemplateGraph>;

  queryCandidates(input: CandidateQuery): Promise<CandidateTemplate[]>;
}
```

---

## 14. Template summary

Used in UI lists.

```ts
type TemplateSummary = {
  templateId: string;
  familyId: string;
  version: number;
  name: string;
  docType: string;
  status: "draft" | "active" | "deprecated";
  fieldCount: number;
  assetCount: number;
  tableCount: number;
  lastUsedAt?: number;
  thumbnailId?: string;
};
```

---

## 15. Export package format

```ts
type TemplateExportPackage = {
  packageVersion: string;
  exportedAt: number;

  templateGraph: TemplateGraph;

  artifacts: Array<{
    artifactId: string;
    path: string;
    mimeType: string;
    dataRef: string;
  }>;

  warnings: string[];
};
```

Export should warn:

```text
Template exports may reveal document layout and labels. Only share if safe.
```

---

## 16. Import validation

When importing:

1. validate schema version
2. validate IDs
3. validate coordinate ranges
4. validate no missing referenced artifacts
5. check for duplicate family/template IDs
6. offer rename/family merge
7. run migration if needed
8. store as draft by default unless trusted

---

## 17. Deletion

Deleting a template should:

- remove TemplateGraph record
- remove artifacts/descriptors
- remove indexes
- update family versions
- optionally preserve deletion tombstone for migration/log

Deleting a family should require confirmation if multiple versions exist.

---

## 18. Migrations

Template schema changes require migration.

```ts
type TemplateMigrationRecord = {
  id: string;
  fromSchemaVersion: string;
  toSchemaVersion: string;
  templateId: string;
  status: "success" | "failed" | "skipped";
  message?: string;
  timestamp: number;
};
```

Migration rules:

- back up previous record if feasible
- do not silently discard fields
- log migration provenance
- test old templates

---

## 19. Index rebuild

If indexes become corrupted:

```text
scan all templates
  → rebuild text anchor index
  → rebuild layout index
  → rebuild special-zone index
  → rebuild visual hash index
```

Provide internal maintenance command.

---

## 20. Storage failure handling

If save fails:

- do not claim template saved
- keep corrected DocGraph in memory if possible
- show retry option
- provide export fallback if feasible

If read fails:

- mark template unavailable
- do not delete automatically

---

## 21. Tests

Test:

- save template
- load template
- list templates
- family versions
- export/import
- delete
- migration
- index query
- encrypted storage
- corrupted artifact reference
- duplicate import

---

## 22. Final storage rule

Template storage must be boring, explicit, versioned, and safe. A brilliant matching engine is useless if template storage corrupts memory, leaks sensitive layout data, or cannot migrate old templates.
