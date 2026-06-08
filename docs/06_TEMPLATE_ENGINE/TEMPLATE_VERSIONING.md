# Template Versioning — Edge DocGraph Engine

**Purpose:** Define how the system decides same template vs new version vs unknown, how versions are stored, and how old templates are protected.

---

## 1. Why versioning is critical

Documents change.

Examples:

- invoice vendor redesigns layout
- passport format updates
- form adds a new field
- table columns change
- QR code moves
- logo changes
- signature section moves

If the system overwrites the old template automatically, it corrupts future extraction. Versioning prevents this.

---

## 2. Versioning decisions

The system must classify each new document/template interaction as:

```ts
type TemplateDecision =
  | "same_template"
  | "same_family_new_version"
  | "unknown_template"
  | "ambiguous_match";
```

---

## 3. Same template

Use existing template when:

- match score is high
- required anchors present
- alignment succeeds
- projected ROIs work
- validators mostly pass
- drift is low
- field schema unchanged

Action:

```text
use existing TemplateGraph
```

Optional:

- allow small user corrections to update template if user explicitly chooses.

---

## 4. Same family, new version

Create new version when:

- family identity is clear
- layout changed
- field ROIs shifted systematically
- required fields moved
- new fields appeared
- old fields disappeared
- table schema changed
- visual anchors changed but text family remains
- validator failures cluster by region

Action:

```text
extract cautiously
ask user to correct
save as new version under same familyId
```

---

## 5. Unknown template

Use unknown flow when:

- match score low
- required anchors missing
- family signals weak
- no meaningful alignment
- document type differs
- top candidates not convincing

Action:

```text
run unknown-document pipeline
```

---

## 6. Ambiguous match

Use when:

- two or more candidates are close
- OCR quality too low to decide
- visual/geometry signals disagree
- document resembles multiple templates

Action:

- ask user to choose, or
- run unknown flow, or
- process as review-first

Do not force a match.

---

## 7. Version metadata

```ts
type TemplateVersioningMetadata = {
  parentTemplateId?: string;
  previousVersionId?: string;

  familyId: string;
  version: number;

  versionReason:
    | "initial"
    | "layout_drift"
    | "field_schema_change"
    | "validator_change"
    | "user_created_new_version"
    | "manual_duplicate"
    | "migration";

  createdFromDocumentId?: string;
  createdFromDocGraphId?: string;

  compatibleWithVersions: string[];

  deprecated?: boolean;
  deprecationReason?: string;
};
```

---

## 8. Family ID

Templates in the same document family share `familyId`.

Example:

```text
Vendor A Invoice
  familyId: vendor_a_invoice
  version 1
  version 2
  version 3
```

A family can contain multiple template versions.

---

## 9. Version numbering

Recommended:

- first template: version 1
- new layout: version +1
- migration: version unchanged but schema migration version updated, or create explicit migration copy if needed

Do not reuse version numbers.

---

## 10. Drift scoring

```ts
type TemplateDriftReport = {
  level: "none" | "low" | "medium" | "high";
  averageFieldShiftNorm: number;
  maxFieldShiftNorm: number;
  missingRequiredFields: string[];
  newCandidateFields: string[];
  changedTables: string[];
  changedAssets: string[];
  validatorFailureClusters: string[];
  reasons: string[];
};
```

Drift affects versioning.

---

## 11. Version decision logic

Example:

```ts
if (matchScore > 0.88 && drift.level in ["none", "low"] && validatorPassRate > 0.9) {
  decision = "same_template";
} else if (matchScore > 0.60 && familySignalsStrong && drift.level in ["medium", "high"]) {
  decision = "same_family_new_version";
} else if (ambiguous) {
  decision = "ambiguous_match";
} else {
  decision = "unknown_template";
}
```

Thresholds must be benchmarked.

---

## 12. User interaction

If same template:

```text
Matched existing template. Extracted fields using saved layout.
```

If new version:

```text
This looks like the same document family, but the layout changed. Create a new version?
```

If unknown:

```text
This appears to be a new layout. Review and optionally save as a new template.
```

If ambiguous:

```text
This document matches multiple templates. Choose one or process as new.
```

---

## 13. Template update vs new version

Update existing template when:

- correction is minor
- crop adjustment is small
- label alias improved
- validator added
- no layout drift
- user explicitly selects update

Create new version when:

- multiple fields moved
- schema changed
- required fields added/removed
- table changed
- anchors changed significantly
- extraction failures cluster

---

## 14. Compatibility

Some versions may be compatible.

Example:

- invoice v1 and v2 share most fields
- only logo moved
- same table schema

Compatibility metadata can help migrate corrections or suggest fields.

---

## 15. Deprecation

A template version may be deprecated if:

- obsolete layout
- high false match rate
- user manually disables
- replaced by better version
- corrupted template detected

Deprecated templates:

- remain stored unless deleted
- not used by default
- can be restored/exported

---

## 16. Migration

Schema changes may require migrating old TemplateGraphs.

Migration rules:

- preserve original version
- record migration provenance
- do not change extraction behavior without tests
- allow rollback if possible

---

## 17. Metrics

Track:

- same-template accuracy
- new-version detection accuracy
- false version creation rate
- false same-template rate
- false unknown rate
- template corruption rate
- correction count per version
- version drift patterns

---

## 18. Failure modes

### Over-versioning

Too many versions for minor scan variation.

Mitigation:

- local alignment correction
- threshold tuning
- require schema/layout change

### Under-versioning

New layout treated as same template.

Mitigation:

- drift detection
- validator failure clustering
- user correction count trigger

### Wrong family

Document assigned to wrong family.

Mitigation:

- conservative matching
- ambiguous state
- user template selection

---

## 19. Tests

Test:

- exact same template
- same template with scan shifts
- small crop differences
- new field added
- field removed
- table changed
- logo changed
- completely unknown layout
- two similar templates

Assertions:

- correct decision
- old templates preserved
- new versions saved safely
- no automatic overwrite
- user decisions recorded

---

## 20. Final versioning rule

Versioning protects memory. When layout changes, create a version. When structure is the same, reuse. When uncertain, review. Never corrupt an existing template silently.
