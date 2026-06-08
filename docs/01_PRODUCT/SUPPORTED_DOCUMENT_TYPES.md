# Supported Document Types — Edge DocGraph Engine

**Purpose:** Define document families, extraction goals, core primitives, difficulty, MVP priority, and expansion strategy.  
**Important:** “Supported” does not mean “perfect automatic extraction without review.” It means the engine can create an evidence-backed editable form and improve through TemplateGraph learning.

---

## 1. Support model

The product supports documents in three levels:

### Level 1 — Deep MVP support

Document types that must work well enough to prove the engine.

- Passport / ID style documents
- Invoice / receipt style documents
- Generic forms with labels, values, checkboxes, signatures, and tables

### Level 2 — Structured support after MVP

Document families that share primitives from Level 1.

- Certificates
- Bank statements
- Licenses
- Application forms
- Shipping labels
- Product labels
- Tax/financial forms
- Medical/lab reports with tables
- Academic transcripts

### Level 3 — Review-first generic support

Arbitrary documents where the app extracts evidence and creates a review-first form but does not promise high automatic confidence.

- contracts
- letters
- handwritten documents
- mixed-layout reports
- scanned book pages
- historical documents
- highly decorative or degraded pages

---

## 2. Universal extraction primitives

The engine should not hardcode every document type separately. It should support reusable primitives:

| Primitive | Examples |
|---|---|
| Text | printed text, labels, values, paragraphs |
| Label-value pairs | name/value, date/value, invoice number/value |
| Visual assets | photos, signatures, stamps, seals, logos |
| Tables | line items, transactions, fees, scores |
| Codes | QR, barcode, PDF417, Data Matrix |
| MRZ | passports, visas, IDs |
| Checkboxes | forms, applications, consent forms |
| Layout anchors | headers, logos, lines, sections |
| Validators | dates, amounts, IDs, checksums, totals |
| TemplateGraph | repeated layouts and versions |

A document type is supported when these primitives combine into useful form extraction.

---

## 3. MVP document type 1 — Passport / ID style documents

### 3.1 Why it is MVP

Passport/ID documents test:

- photo extraction
- fixed templates
- dates
- ID numbers
- MRZ parsing
- logos/emblems
- signatures
- country/issuer clues
- strict validation
- high sensitivity/privacy

If this works, the engine proves it can handle text + visual assets + validators.

### 3.2 Expected evidence

- document boundary
- portrait photo
- name fields
- document number
- date of birth
- issue date
- expiry date
- nationality/country
- sex/gender field where present
- place of birth/issue where present
- signature where present
- emblem/logo where visible
- MRZ zone where present
- barcode/PDF417 where present
- OCR text lines
- parser and validation results

### 3.3 Required validators

- date format
- date plausibility
- expiry after issue date
- MRZ check digits
- MRZ vs visual field cross-check
- required field presence
- face presence in portrait crop
- document number pattern where template-specific

### 3.4 MVP status

Deep support required.

### 3.5 Known limitations

- hologram reflections may reduce OCR quality
- some countries use non-standard layouts
- scripts/languages may need specific OCR support
- security features are not authenticity proof
- face verification is crop sanity only, not identity matching

### 3.6 Explicit non-claim

The engine does not verify whether an ID is genuine. It extracts and validates visible/document-encoded evidence.

---

## 4. MVP document type 2 — Invoice / receipt style documents

### 4.1 Why it is MVP

Invoices and receipts test:

- variable layouts
- vendor logos
- tables
- totals
- taxes
- dates
- amounts
- QR/barcodes
- repeated vendor templates
- one-shot template memory

### 4.2 Expected evidence

- seller/vendor name
- buyer/customer name where present
- invoice number
- invoice date
- due date
- tax ID/GST/VAT where present
- address blocks
- logo
- QR/barcode
- line-item table
- subtotal
- tax
- discount
- total
- payment terms
- stamp/signature where present

### 4.3 Required validators

- amount format
- currency consistency
- subtotal + tax - discount = total where applicable
- invoice date plausibility
- table row amount calculations where possible
- QR payload vs printed values where possible
- required field presence per template

### 4.4 MVP status

Deep support required.

### 4.5 Known limitations

- receipts are often crumpled, low-resolution, or thermal-faded
- borderless tables are difficult
- handwritten corrections may need review
- mixed currencies require more logic
- vendor-specific layouts require templates for best accuracy

---

## 5. MVP document type 3 — Generic forms

### 5.1 Why it is MVP

Generic forms test the broadest reusable primitives:

- labels
- values
- blank boxes
- checkboxes
- signatures
- stamps
- sections
- tables
- user correction
- template learning

### 5.2 Expected evidence

- title/header
- section labels
- field labels
- field values
- checkboxes
- radio buttons
- signature areas
- stamp/seal areas
- tables
- form boxes and lines
- handwritten regions when detected
- date fields
- numeric fields

### 5.3 Required validators

- required field presence
- date format
- checkbox exclusivity where applicable
- field type validation
- nearby label/value relation checks

### 5.4 MVP status

Deep support required.

### 5.5 Known limitations

- fully handwritten forms are not v1 target
- unusual layouts may require correction
- repeated labels may create ambiguity
- form semantics may require template learning

---

## 6. Level 2 document types

### 6.1 Certificates

Examples:

- education certificates
- completion certificates
- birth/marriage/death certificates
- professional certificates

Expected evidence:

- certificate title
- issuer
- recipient
- date
- registration/certificate number
- seal
- stamp
- signature
- logo/emblem
- QR/barcode where present

Why feasible:

- similar to generic forms plus visual assets
- often strong layout anchors

Challenges:

- decorative fonts
- seals overlapping text
- multiple signatures
- old scans

Priority: P2 after MVP.

---

### 6.2 Bank statements

Expected evidence:

- account holder
- account number
- bank name/logo
- statement period
- opening balance
- closing balance
- transaction table
- debit/credit/balance columns
- totals

Validators:

- opening balance + transactions = closing balance
- debit/credit numeric consistency
- date order
- currency consistency

Challenges:

- multi-page tables
- dense data
- page continuation
- privacy sensitivity
- multiple formats per bank

Priority: P2, but can be tested after invoice/table engine matures.

---

### 6.3 Licenses

Examples:

- driver license
- business license
- trade license
- permit

Expected evidence:

- license number
- holder/business name
- issue/expiry dates
- issuing authority
- photo where present
- barcode/PDF417 where present
- signature
- stamp/seal

Why feasible:

- similar to ID/passport plus form fields

Challenges:

- region-specific formats
- barcode payload schemas
- small text

Priority: P2.

---

### 6.4 Shipping labels

Expected evidence:

- sender
- receiver
- tracking number
- barcode/QR
- carrier logo
- address blocks
- service level
- weight
- date

Why feasible:

- strong barcode + label structure

Challenges:

- damaged labels
- thermal print
- rotated labels
- multiple barcodes

Priority: P2.

---

### 6.5 Product labels

Expected evidence:

- product name
- brand/logo
- barcode
- batch number
- expiry date
- manufacturing date
- ingredients/table where present
- certification symbols

Challenges:

- curved surfaces if photographed
- small print
- multiple languages
- glossy packaging

Priority: P3 unless product-label use case becomes central.

---

### 6.6 Medical/lab reports

Expected evidence:

- patient name
- report date
- lab name/logo
- test table
- result values
- reference ranges
- doctor/signature/stamp
- QR/barcode

Challenges:

- medical sensitivity
- table complexity
- multi-page reports
- domain-specific terminology

Priority: P3 unless privacy-first medical extraction becomes target.

Non-claim:

- The engine does not provide medical advice.

---

### 6.7 Academic transcripts

Expected evidence:

- student name
- institution
- roll/registration number
- course table
- grades
- credits
- totals/GPA
- seal/signature/date

Challenges:

- dense tables
- multi-page records
- varied grading systems

Priority: P3.

---

## 7. Level 3 review-first documents

These documents should produce evidence-backed forms but may require more user correction.

### 7.1 Contracts

Expected output:

- parties
- dates
- signatures
- stamps
- key clauses as text blocks
- tables where present

Not expected:

- legal interpretation
- obligation extraction with legal certainty

### 7.2 Letters

Expected output:

- sender
- recipient
- date
- subject
- signature
- body text

Not expected:

- perfect semantic summarization

### 7.3 Handwritten documents

Expected output:

- detected handwriting regions
- review-first fields

Not expected:

- high-confidence handwriting OCR in v1

### 7.4 Historical or degraded scans

Expected output:

- best-effort evidence
- quality warnings
- review-first form

Not expected:

- high automation

---

## 8. Document type detection strategy

The system should infer document type from multiple evidence sources:

- text anchors
- layout patterns
- visual assets
- special zones
- template matches
- code/MRZ presence
- table structure
- user selection/correction

Examples:

```text
MRZ at bottom + portrait photo + fixed ID fields → passport/ID candidate
line-item table + totals + invoice number → invoice candidate
many labels/checkboxes/signatures → generic form candidate
```

Document type should be a hypothesis, not hard truth.

---

## 9. Template families

Document support improves through template families.

Examples:

```text
Passport / ID
  → India passport template v1
  → India passport template v2
  → Generic TD3 passport template

Invoice
  → Vendor A invoice v1
  → Vendor A invoice v2
  → Generic invoice template

Generic form
  → School admission form v1
  → Clinic intake form v1
  → Consent form v1
```

Each family can have multiple versions.

---

## 10. Support-level definitions

### Deep support

A document type has deep support when the engine has:

- object classes for major elements
- field hypotheses
- validators
- template learning
- UI correction patterns
- tests
- benchmark samples

### Basic support

A document type has basic support when the engine can:

- OCR text
- detect major regions
- create reviewable fields
- allow correction
- save templates

### Review-first support

A document type has review-first support when:

- the engine extracts visible evidence
- creates tentative fields
- marks uncertainty clearly
- depends heavily on user correction

---

## 11. Expansion strategy

Do not add document types by writing one-off hacks. Add by identifying primitives and validators.

For each new document type, define:

1. required fields
2. optional fields
3. visual assets
4. special parsers
5. validators
6. table schemas
7. template anchors
8. UI correction needs
9. benchmark dataset
10. known failure modes

---

## 12. Final supported-document principle

The product should support any document as an evidence-backed review workflow, but only claim high automation for document families that have templates, validators, and tested extraction paths.

The honest promise:

> Any document can become a local editable evidence-backed form. Repeated templates become fast and accurate after correction.
