# Migrations — Edge DocGraph Engine

**Purpose:** Define how old DocGraphs, TemplateGraphs, EvidenceRecords, ValidationResults, settings, and exports migrate to new schema versions.

---

## 1. Migration goal

Users must not lose templates, corrections, or documents because schemas evolve.

Migrations must be:

- explicit,
- versioned,
- tested,
- reversible where feasible,
- safe for sensitive data,
- audited.

---

## 2. Migrated objects

Objects that may need migration:

- DocGraph
- TemplateGraph
- EvidenceRecord
- ValidationResult
- EditableForm snapshots
- CorrectionEvent
- storage indexes
- export packages
- model manifests
- user settings

---

## 3. Migration version chain

Use step migrations:

```text
docgraph-v1 → docgraph-v2
templategraph-v1 → templategraph-v2
```

Do not write giant “latest converter” only.

---

## 4. Migration interface

```ts
interface Migration<TBefore, TAfter> {
  fromVersion: string;
  toVersion: string;
  migrate(input: TBefore): Result<TAfter, MigrationError>;
}
```

Migration result must include warnings.

---

## 5. Migration registry

```ts
type MigrationRegistry = {
  docgraph: Migration[];
  templategraph: Migration[];
  evidence: Migration[];
  validation: Migration[];
};
```

Registry resolves path:

```text
v1 → v2 → v3
```

---

## 6. Backup before migration

Before migrating persistent data:

- copy old record if feasible,
- mark backup version,
- do not delete old until migration succeeds,
- allow recovery if migration fails.

For large OPFS artifacts, store metadata backup if full copy is too expensive.

---

## 7. Migration safety

Rules:

- never invent missing evidence,
- never silently confirm uncertain fields,
- preserve original evidence IDs,
- preserve user corrections,
- preserve template history,
- mark downgraded/unknown fields as needs_review,
- do not save variable values into templates.

---

## 8. Template migrations

Template migrations are high risk.

Must preserve:

- familyId,
- version,
- anchors,
- fields,
- validators,
- status,
- corruption prevention metadata.

If migration cannot preserve confidence:

```text
mark template as draft/review_required
```

Do not leave risky migrated template active.

---

## 9. DocGraph migrations

DocGraph migration must preserve:

- nodes,
- edges,
- evidence,
- hypotheses,
- validations,
- conflicts,
- provenance.

If new field is required but absent:

- set default safely,
- add migration warning,
- never fabricate model evidence.

---

## 10. Export/import migrations

Imported older packages must be:

- validated,
- migrated in temp,
- reviewed,
- only then stored.

If migration fails:

```text
This package uses an older format that cannot be migrated safely.
```

---

## 11. Migration tests

For every migration:

- fixture before,
- expected after,
- invalid input,
- missing optional fields,
- sensitive data preservation,
- template active/draft behavior,
- rollback failure path.

---

## 12. Migration report

```json
{
  "migrationId": "templategraph-v1-to-v2",
  "objectId": "tpl_001",
  "fromVersion": "templategraph-v1",
  "toVersion": "templategraph-v2",
  "status": "success",
  "warnings": []
}
```

---

## 13. Failure behavior

If migration fails:

- do not overwrite old data,
- show user message,
- keep app usable if possible,
- offer export backup if safe,
- log safe error.

---

## 14. Final rule

Migration must never trade safety for convenience. If old data cannot be safely understood, mark it review-required rather than pretending it is current and trusted.
