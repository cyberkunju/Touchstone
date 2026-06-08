# Template Memory — Edge DocGraph Engine

**Purpose:** Define what gets saved after user correction, what must not be saved, how memory is created, and how it improves future extraction.

---

## 1. What template memory means

Template memory is the local reusable structure saved after a user reviews and corrects a document.

It is not model fine-tuning.  
It is not a cloud training set.  
It is not copying old values.  
It is a local TemplateGraph.

Template memory lets the app say:

```text
I know this layout now.
Next time, I will align to this layout, extract these regions, verify these fields, and only ask for review where needed.
```

---

## 2. What gets saved

After user correction, save:

- document type
- page count
- canonical page size
- stable anchors
- field labels
- field aliases
- field types
- field value regions
- visual asset regions
- table regions and column schemas
- QR/barcode regions
- MRZ regions
- checkbox regions/groups
- validators
- relationships
- extraction preferences
- template matching weights
- template version metadata
- correction provenance
- optional thumbnails

---

## 3. What must not be saved as reusable truth

Do not save variable values as future values.

Examples of values not to reuse:

- passport number
- name
- date of birth
- invoice number
- invoice total
- QR payload
- MRZ parsed values
- address
- phone/email
- bank account number
- any document-specific private data

These may exist in the source DocGraph, but TemplateGraph should store extraction structure, not reusable content.

---

## 4. Static anchors vs variable values

Some text is stable and should become an anchor.

Examples:

- `PASSPORT`
- `INVOICE`
- `Date of Birth`
- `Total`
- `GSTIN`
- `Machine Readable Zone`
- vendor logo
- table headers
- field labels

Some text is variable and must not become anchor by default.

Examples:

- `JOHN DOE`
- `A1234567`
- `2026-01-01`
- `₹1,200.00`
- invoice line items
- QR payload

If user explicitly marks a value as static, it can become an anchor. This should be rare.

---

## 5. Template memory creation flow

```text
Corrected DocGraph
  → collect confirmed/user-corrected fields
  → identify stable anchors
  → identify variable value regions
  → store field definitions
  → store asset definitions
  → store table/code/MRZ/checkbox definitions
  → attach validators
  → create fingerprint
  → create version metadata
  → save locally
```

---

## 6. Save modes

### 6.1 Save as new template

Use when:

- document is new
- no existing template matched
- user wants repeated extraction

Creates:

- new template ID
- new family ID
- version 1

### 6.2 Update existing template

Use when:

- same layout
- user improved labels/crops/validators
- change is small and intentional

Must be explicit.

### 6.3 Create new version

Use when:

- same document family
- layout changed
- fields shifted
- table schema changed
- new/removed fields

Creates:

- same family ID
- new template ID
- incremented version

### 6.4 Do not learn

Use when:

- document is one-off
- user does not want memory saved
- document contains highly sensitive layout
- extraction is too uncertain

---

## 7. Memory from field corrections

When user corrects a field label:

Save:

- corrected label
- old detected label as alias if useful
- canonical label
- label/value relationship

When user corrects a value:

Save:

- field type and region
- validator if value shows type
- do not save literal value as template truth

When user changes type:

Save:

- corrected valueType
- validators for that type
- UI control mapping

When user redraws region:

Save:

- corrected region
- crop expansion rule
- source correction ID

---

## 8. Memory from asset corrections

When user corrects asset crop:

Save:

- corrected asset box
- asset type
- crop expansion rule
- segmentation preference
- required/optional status

Examples:

- portrait photo region
- signature region
- stamp region
- seal region
- logo region

Do not save extracted private photo crop inside TemplateGraph unless specifically needed as a visual anchor and privacy policy allows. Prefer descriptors/hashes or region information.

---

## 9. Memory from table corrections

Save:

- table ROI
- header rows
- column names
- aliases
- column value types
- required columns
- arithmetic validators
- row behavior
- variable row rules

Do not save row values as template truth.

---

## 10. Memory from MRZ/code corrections

For MRZ:

Save:

- MRZ ROI
- format hint
- validators
- cross-check field relationships

Do not save parsed MRZ values.

For codes:

Save:

- code ROI
- code type
- payload parser
- fields confirmed by payload

Do not save payload as template truth.

---

## 11. Memory from checkbox corrections

Save:

- checkbox location
- label
- group membership
- state extraction policy
- exclusivity rules

Do not save checked/unchecked state as static unless it is truly static.

---

## 12. Template fingerprint memory

Create fingerprint from stable signals:

- text anchors
- layout histogram
- visual anchor descriptors
- special zones
- page geometry
- table/header structures
- object class distribution

Fingerprints help fast template retrieval.

---

## 13. Memory quality gates

Do not save template automatically if:

- too many fields are uncertain
- page quality is bad
- template anchors are weak
- user did not confirm corrections
- layout is ambiguous
- template looks like another existing template
- required regions are missing

Ask user to review or save as draft template.

---

## 14. Template draft state

A template can be saved as:

- draft
- active
- deprecated

Draft template:

- created from incomplete correction
- not used automatically unless user allows
- useful for later refinement

Active template:

- eligible for matching

Deprecated template:

- preserved for audit/migration
- not used by default

---

## 15. Local-only storage

Template memory is local.

Stored in:

- IndexedDB for metadata
- OPFS for thumbnails/descriptors/artifacts
- encrypted storage for sensitive records where feasible

No template sync/cloud by default.

---

## 16. Template memory and privacy

Templates can leak layout information and possibly labels. Treat templates as sensitive.

Sensitive template contents:

- field labels
- document type
- visual descriptors
- thumbnails
- anchors
- regions implying document layout

Rules:

- local-only
- allow deletion
- warn before export
- do not include private values
- encrypt where feasible

---

## 17. Template memory improves future extraction

Known-template extraction uses saved memory to:

- retrieve matching template
- align page
- project ROIs
- run ROI OCR
- extract assets
- parse expected codes/MRZ
- apply validators
- flag changes
- suggest versioning

This reduces:

- processing time
- field discovery errors
- user corrections
- silent mistakes from blind extraction

---

## 18. Template memory failure modes

### 18.1 Learned wrong region

Mitigation:

- correction evidence
- update/version only by user action
- verifier catches missing/invalid values

### 18.2 Learned variable value as anchor

Mitigation:

- anchor classifier
- explicit static marking
- corruption prevention rules

### 18.3 Template too broad

Mitigation:

- stronger required anchors
- false-match tests
- family/version rules

### 18.4 Template outdated

Mitigation:

- drift detection
- versioning
- deprecation

---

## 19. Template memory checklist

Before saving:

- [ ] user reviewed field labels
- [ ] user reviewed field types
- [ ] value regions correct
- [ ] asset regions correct
- [ ] tables reviewed
- [ ] validators attached
- [ ] stable anchors selected
- [ ] variable values excluded
- [ ] page quality acceptable
- [ ] template/version decision clear

---

## 20. Final statement

Template memory is the core learning mechanism. It transforms correction into reusable structure while protecting privacy and avoiding false learning. The app becomes powerful because it remembers layouts, not because it memorizes documents.
