# TemplateGraph Specification — Edge DocGraph Engine

**Purpose:** Define the complete TemplateGraph model used to remember corrected document layouts and enable fast, verified repeated extraction.

---

## 1. What is a TemplateGraph?

A **TemplateGraph** is reusable local memory learned from a corrected DocGraph.

It stores the structure of a document layout, not the current document’s private values.

It should remember:

- stable anchors
- field regions
- asset regions
- table regions and schemas
- code/MRZ regions
- checkbox groups
- labels and aliases
- validators
- relationships
- version metadata
- matching fingerprints
- extraction preferences

It must not blindly store old field values as future values.

---

## 2. Core principle

The TemplateGraph stores **where and how to extract**, not **what value to reuse**.

Bad:

```text
Template stores: Passport Number = A1234567
```

Correct:

```text
Template stores:
  field label: Passport Number
  value type: id_number
  value ROI: [0.61, 0.22, 0.82, 0.26]
  validator: passport_number
  anchors: PASSPORT, MRZ zone, photo region, emblem
```

When a new similar document is uploaded, the value must be extracted from the new document.

---

## 3. Relationship to DocGraph

DocGraph represents one processed document.

TemplateGraph represents reusable learned structure across similar documents.

```text
Corrected DocGraph
  → TemplateGraph Builder
  → TemplateGraph
  → Known-template extraction
  → New DocGraph evidence
```

TemplateGraph is built from:

- corrected FieldHypothesis records
- corrected VisualAssetNode regions
- corrected TableNode schemas
- verified anchors
- validation rules
- user-defined required fields
- template version decisions

---

## 4. Top-level TemplateGraph schema

```ts
type TemplateGraph = {
  id: string;
  familyId: string;
  version: number;

  schemaVersion: string;

  name: string;
  description?: string;

  docType: TemplateDocumentType;

  pageCount: number;
  canonicalPages: TemplatePage[];

  fingerprint: TemplateFingerprint;

  anchors: TemplateAnchor[];

  fields: TemplateField[];
  assets: TemplateAsset[];
  tables: TemplateTable[];
  codes: TemplateCode[];
  mrzZones: TemplateMRZ[];
  checkboxes: TemplateCheckbox[];

  sections: TemplateSection[];

  aliases: TemplateAliasMap;
  validators: TemplateValidatorSpec[];
  relationships: TemplateRelationship[];

  matching: TemplateMatchingConfig;
  extraction: TemplateExtractionConfig;
  versioning: TemplateVersioningMetadata;

  provenance: TemplateProvenance[];

  createdAt: number;
  updatedAt: number;
};
```

---

## 5. Document type

```ts
type TemplateDocumentType =
  | "passport"
  | "id_card"
  | "invoice"
  | "receipt"
  | "generic_form"
  | "certificate"
  | "bank_statement"
  | "license"
  | "shipping_label"
  | "product_label"
  | "unknown";
```

Document type helps choose validators and extraction rules, but it must not override evidence.

---

## 6. Template pages

```ts
type TemplatePage = {
  id: string;
  pageIndex: number;

  canonicalWidth: number;
  canonicalHeight: number;

  aspectRatio: number;

  pageRole?: "front" | "back" | "main" | "continuation" | "attachment" | "unknown";

  expectedQuality?: {
    minTextHeightNorm?: number;
    minResolutionHint?: string;
  };

  thumbnailId?: string;
};
```

Templates can be multi-page.

---

## 7. Template fingerprint

The fingerprint helps retrieve candidate templates quickly.

```ts
type TemplateFingerprint = {
  textSignature: {
    stableTokens: string[];
    tokenHashes: string[];
  };

  layoutSignature: {
    textBlockHistogram: number[];
    objectClassHistogram: Record<string, number>;
    regionDistribution: number[];
  };

  visualSignature?: {
    perceptualHash?: string;
    logoHashes?: string[];
    emblemHashes?: string[];
  };

  specialZones: {
    hasMRZ: boolean;
    hasQRCode: boolean;
    hasBarcode: boolean;
    hasPhoto: boolean;
    hasTable: boolean;
    hasCheckboxes: boolean;
  };

  pageGeometry: {
    aspectRatio: number;
    pageCount: number;
  };
};
```

Fingerprints are for candidate retrieval. They do not replace full matching.

---

## 8. Template anchors

Anchors are stable reference points used to match and align new documents.

```ts
type TemplateAnchor = {
  id: string;
  pageIndex: number;

  type:
    | "text"
    | "visual"
    | "geometry"
    | "keypoint"
    | "special_zone"
    | "table_grid";

  label?: string;

  boxNorm?: NormalizedBox;
  polygonNorm?: NormalizedPolygon;

  value?: string;
  descriptorId?: string;

  importance: number;
  stability: number;

  requiredForMatch: boolean;

  createdFromNodeIds: string[];
  createdFromEvidenceIds: string[];
};
```

Anchor types are defined in `ANCHOR_TYPES.md`.

---

## 9. Template fields

```ts
type TemplateField = {
  id: string;
  pageIndex: number;

  label: string;
  canonicalLabel?: string;
  aliases: string[];

  valueType: FieldValueType;

  labelBoxNorm?: NormalizedBox;
  valueBoxNorm: NormalizedBox;

  required: boolean;

  extraction: {
    preferredMode: "roi_ocr" | "parser" | "asset_crop" | "table" | "checkbox" | "manual";
    roiExpansion: number;
    ocrMode?: "roi" | "mrz" | "table_cell" | "rotated";
    preprocessingProfileId?: string;
  };

  validators: string[];

  relationships: string[];

  anchorIds: string[];

  sensitivity?: "normal" | "sensitive" | "highly_sensitive";

  createdFromHypothesisId?: string;
  createdFromCorrectionIds: string[];
};
```

Important:

- `valueBoxNorm` is the region to extract from future documents.
- It does not store the old value.
- If a value is static, it must be explicitly marked as an anchor or static field.

---

## 10. Template assets

```ts
type TemplateAsset = {
  id: string;
  pageIndex: number;

  label: string;

  assetType:
    | "photo"
    | "signature"
    | "stamp"
    | "seal"
    | "logo"
    | "emblem"
    | "flag"
    | "symbol"
    | "watermark"
    | "unknown";

  boxNorm: NormalizedBox;

  required: boolean;

  extraction: {
    cropExpansion: number;
    segmentationPolicy: "never" | "optional" | "preferred" | "required";
    preserveRawCrop: boolean;
  };

  validators: string[];

  anchorIds: string[];

  createdFromAssetNodeId?: string;
  createdFromCorrectionIds: string[];
};
```

---

## 11. Template tables

```ts
type TemplateTable = {
  id: string;
  pageIndex: number;

  label: string;
  boxNorm: NormalizedBox;

  required: boolean;

  columns: TemplateTableColumn[];

  headerRows: number[];

  extraction: {
    strategy: "geometry" | "schema_guided_geometry" | "slanet_plus_trial" | "manual";
    roiExpansion: number;
    allowVariableRows: boolean;
    allowMergedCells: boolean;
  };

  validators: string[];

  createdFromTableNodeId?: string;
  createdFromCorrectionIds: string[];
};
```

Column:

```ts
type TemplateTableColumn = {
  id: string;
  label: string;
  aliases: string[];
  valueType: FieldValueType;
  required: boolean;
  expectedXRangeNorm?: [number, number];
  validators: string[];
};
```

---

## 12. Template codes

```ts
type TemplateCode = {
  id: string;
  pageIndex: number;

  label: string;

  codeType: "qr" | "barcode" | "pdf417" | "data_matrix" | "aztec" | "unknown";

  boxNorm: NormalizedBox;

  required: boolean;

  payloadParsers: string[];
  validators: string[];

  anchorIds: string[];
};
```

---

## 13. Template MRZ zones

```ts
type TemplateMRZ = {
  id: string;
  pageIndex: number;

  boxNorm: NormalizedBox;

  formatHint?: "TD1" | "TD2" | "TD3" | "unknown";

  required: boolean;

  extraction: {
    roiExpansion: number;
    ocrMode: "mrz";
    normalizationProfile: "mrz_default";
  };

  validators: string[];
  crossCheckFieldIds: string[];
};
```

---

## 14. Template checkboxes

```ts
type TemplateCheckbox = {
  id: string;
  pageIndex: number;

  label: string;
  labelBoxNorm?: NormalizedBox;
  boxNorm: NormalizedBox;

  groupId?: string;

  required: boolean;

  statePolicy: "extract" | "user_review" | "static_expected";

  validators: string[];
};
```

---

## 15. Template sections

```ts
type TemplateSection = {
  id: string;
  label: string;
  pageIndex?: number;
  fieldIds: string[];
  assetIds: string[];
  tableIds: string[];
  order: number;
};
```

Sections drive form UI.

---

## 16. Alias map

```ts
type TemplateAliasMap = Record<string, string[]>;
```

Example:

```json
{
  "Date of Birth": ["DOB", "Birth Date", "D.O.B"],
  "Passport Number": ["Passport No", "Document No", "P No"]
}
```

Aliases help unknown extraction and template matching.

---

## 17. Validators

```ts
type TemplateValidatorSpec = {
  id: string;
  validatorType:
    | "required"
    | "date"
    | "date_range"
    | "amount"
    | "id_pattern"
    | "mrz_checksum"
    | "barcode_payload"
    | "table_arithmetic"
    | "face_present"
    | "checkbox_group"
    | "custom";

  targetIds: string[];

  severity: "info" | "low" | "medium" | "high" | "critical";

  config: Record<string, unknown>;
};
```

Validators are attached to fields/assets/tables/codes/MRZ.

---

## 18. Relationships

```ts
type TemplateRelationship = {
  id: string;
  type:
    | "field_confirms_field"
    | "mrz_confirms_field"
    | "code_confirms_field"
    | "table_confirms_field"
    | "field_depends_on_field"
    | "checkbox_group_member"
    | "section_contains"
    | "anchor_supports_field";

  fromId: string;
  toId: string;

  config?: Record<string, unknown>;
};
```

Relationships enable cross-field validation.

---

## 19. Matching config

```ts
type TemplateMatchingConfig = {
  requiredAnchorIds: string[];

  weights: {
    textAnchor: number;
    visualAnchor: number;
    geometry: number;
    keypoint: number;
    specialZone: number;
    requiredRegion: number;
  };

  thresholds: {
    sameTemplate: number;
    sameFamilyNewVersion: number;
    unknown: number;
    ambiguousMargin: number;
  };
};
```

---

## 20. Extraction config

```ts
type TemplateExtractionConfig = {
  defaultRoiExpansion: number;

  localSearch: {
    enabled: boolean;
    maxShiftNorm: number;
    maxRetries: number;
  };

  ocr: {
    batchRois: boolean;
    highResSmallFields: boolean;
  };

  segmentation: {
    lazyLoad: boolean;
    enabledAssetTypes: string[];
  };
};
```

---

## 21. Versioning metadata

```ts
type TemplateVersioningMetadata = {
  parentTemplateId?: string;
  previousVersionId?: string;

  versionReason:
    | "initial"
    | "user_created_new_version"
    | "layout_drift"
    | "field_schema_change"
    | "validator_change"
    | "manual_duplicate"
    | "migration";

  compatibleWithVersions: string[];

  deprecated?: boolean;
  deprecationReason?: string;
};
```

---

## 22. Provenance

```ts
type TemplateProvenance = {
  id: string;
  actor: "user" | "system" | "template_engine";
  action: string;
  sourceDocGraphId?: string;
  sourceDocumentId?: string;
  correctionIds?: string[];
  timestamp: number;
};
```

---

## 23. TemplateGraph invariants

1. TemplateGraph stores structure, not variable values.
2. Every field/asset/table/code/MRZ region must be normalized.
3. Every template element must trace to corrected graph evidence or user creation.
4. Templates must be versioned.
5. Template updates must be explicit.
6. Matching must be multi-signal.
7. Required fields must be represented even when missing in future documents.
8. Validators must be preserved.
9. TemplateGraph must not bypass DocGraph/verifier.
10. Old templates must not be silently corrupted.

---

## 24. Minimal valid TemplateGraph

A minimal valid TemplateGraph must have:

- id
- familyId
- version
- schemaVersion
- name
- docType
- pageCount
- canonicalPages
- fingerprint
- anchors
- fields/assets/tables/codes/MRZ/checkboxes arrays
- matching config
- extraction config
- versioning metadata
- provenance
- timestamps

---

## 25. Final statement

TemplateGraph is the product’s memory. It makes the second similar upload fast and accurate, but only if it stores anchors, regions, validators, relationships, and version metadata safely. It must learn structure from corrections without learning private values as static truth.
