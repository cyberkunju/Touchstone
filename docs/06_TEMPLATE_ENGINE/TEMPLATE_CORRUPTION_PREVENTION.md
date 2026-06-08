# Template Corruption Prevention — Edge DocGraph Engine

**Purpose:** Define how to prevent wrong corrections, bad scans, layout drift, false matches, and variable values from damaging TemplateGraph memory.

---

## 1. What is template corruption?

Template corruption happens when saved template memory becomes wrong or unsafe.

Examples:

- wrong ROI saved for a field
- variable value saved as stable anchor
- new layout overwrites old layout
- bad scan creates distorted template
- false template match updates wrong template
- user correction accidentally changes required schema
- table schema learned incorrectly
- asset crop saved from false detection

Template corruption is dangerous because it affects future documents.

---

## 2. Prevention principle

The template engine must be conservative.

Rules:

1. Do not auto-update templates.
2. Do not learn variable values as anchors.
3. Do not save from poor-quality scans without warning.
4. Do not overwrite old layout on drift.
5. Do not trust false matches.
6. Do not save rejected hypotheses.
7. Do not save low-confidence fields as required without user confirmation.
8. Preserve template versions.
9. Track provenance.
10. Test templates against regression samples.

---

## 3. Risk sources

### 3.1 Bad first correction

User may accidentally correct wrong field/region.

Mitigation:

- show evidence before saving
- template review screen
- allow draft templates
- allow edit/delete template
- save provenance

### 3.2 Bad scan

Poor image may distort regions.

Mitigation:

- quality gate
- warn before template save
- prefer corrected/normalized coordinates
- allow rescan
- mark template as draft if quality poor

### 3.3 Variable value as anchor

Example:

- `JOHN DOE` saved as anchor
- invoice number saved as anchor

Mitigation:

- variable-value classifier
- static anchor whitelist
- user explicit static marking
- anchor audit screen

### 3.4 Layout drift overwrite

New version overwrites old version.

Mitigation:

- drift detection
- version suggestion
- no silent update

### 3.5 False template match

Wrong template used and updated.

Mitigation:

- conservative matching
- ambiguous state
- update only after user confirmation
- false-match benchmarks

---

## 4. Template save gates

Before saving as active template, verify:

- page quality acceptable
- enough stable anchors
- fields have valid regions
- required fields reviewed
- asset crops reviewed
- table schema reviewed
- validators attached
- no critical conflicts unresolved
- user confirms template save
- no similar template conflict unresolved

If gates fail:

- save as draft, or
- ask for correction, or
- block save for critical issue

---

## 5. Anchor safety rules

### Allowed anchors

- fixed labels
- document titles
- section headers
- table headers
- logos/emblems
- MRZ zone region
- QR/code region
- field box geometry

### Dangerous anchors

- names
- ID numbers
- dates
- invoice numbers
- totals
- addresses
- QR payloads
- MRZ parsed values
- signatures/photos as visual content

Dangerous anchors require explicit user marking.

---

## 6. Template update gates

Before updating existing template:

Calculate change impact:

```ts
type TemplateChangeImpact = {
  fieldsMoved: number;
  fieldsAdded: number;
  fieldsRemoved: number;
  validatorsChanged: number;
  tableSchemasChanged: number;
  assetsMoved: number;
  anchorsChanged: number;
  severity: "low" | "medium" | "high";
};
```

Rules:

- low severity → allow update with confirmation
- medium severity → suggest new version
- high severity → block overwrite; create new version

---

## 7. Required field safety

Do not mark a field required automatically just because it was present once.

Required can come from:

- user selection
- document type rule
- template import
- validator requirement
- strong repeated evidence across examples later

For v1, user should confirm required fields.

---

## 8. Table corruption prevention

Tables are high-risk.

Before saving table schema:

- verify table ROI
- confirm headers
- confirm column types
- confirm variable rows policy
- confirm total validators
- avoid saving row values as schema
- allow manual correction

If table structure uncertain, save template table as review-required.

---

## 9. Asset corruption prevention

Before saving asset region:

- confirm asset type
- confirm crop complete
- avoid saving variable visual content as anchor unless stable
- store region, not private crop, unless user explicitly exports/saves
- use face presence only for portrait sanity

---

## 10. Validator corruption prevention

Validators can be too strict or too loose.

Rules:

- attach validators based on field type and user confirmation
- do not invent unsupported validators
- validator failure should not auto-delete fields
- changed validator severity requires template update/version record

---

## 11. Draft template mode

Use draft template when:

- source scan quality poor
- anchors weak
- fields incomplete
- user has not reviewed all required fields
- table uncertain
- match ambiguity exists

Draft templates:

- not used automatically by default
- can be tested manually
- can be promoted after review

---

## 12. Template regression tests

For important templates, keep local regression samples if user allows.

Test:

- template match
- ROI projection
- required fields
- validators
- version detection
- no false match against similar templates

Regression prevents silent degradation after updates.

---

## 13. Rollback

Template updates should be recoverable.

Options:

- keep previous template version
- maintain update history
- allow restore
- mark version deprecated rather than delete

---

## 14. Corruption detection after use

Detect possible corruption when:

- many fields fail repeatedly
- users correct same fields repeatedly
- false matches reported
- required ROIs empty often
- validators fail unusually
- template drift always high

Action:

- mark template needs_review
- suggest repair
- disable auto-match if severe

---

## 15. User-facing safety UI

Before saving template, show:

- fields to save
- assets to save
- tables to save
- anchors selected
- required fields
- unresolved warnings
- draft/active option

For major update:

```text
This change moves 8 fields and changes the table structure. Create a new version instead of overwriting?
```

---

## 16. Metrics

Track:

- template corruption rate
- repeated correction count
- false match rate
- false update rate
- versioning accuracy
- draft-to-active promotion rate
- template rollback count

---

## 17. Invariants

1. No silent template update.
2. No variable values as anchors by default.
3. No bad-scan template save without warning.
4. No drift overwrite.
5. No rejected hypotheses saved.
6. No unresolved critical conflict saved as active template.
7. Every template change has provenance.
8. Old templates are recoverable.

---

## 18. Final statement

Template memory is powerful only if it is safe. Preventing template corruption is more important than aggressive learning. The system should learn carefully, version layouts, preserve history, and always let the user control template updates.
