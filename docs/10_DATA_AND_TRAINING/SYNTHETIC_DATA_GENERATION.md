# Synthetic Data Generation — Edge DocGraph Engine

**Purpose:** Define how to generate fake passports, invoices, receipts, forms, tables, MRZ zones, QR/barcodes, signatures, stamps, and difficult scans without leaking real sensitive data.

---

## 1. Why synthetic data is essential

The project deals with sensitive documents.

Synthetic data allows:

- safe open-source development
- detector training bootstrap
- privacy-safe benchmarks
- rare class balancing
- hard-case generation
- template drift testing
- verifier conflict testing

Synthetic data is not a replacement for real-world evaluation, but it is the safest foundation.

---

## 2. Synthetic generation principles

Rules:

1. never use real personal data,
2. use fake identities only,
3. use fake document numbers,
4. use fake companies,
5. use fake addresses,
6. generate fake portraits or use license-safe placeholders,
7. watermark synthetic datasets internally if needed,
8. store generator seed and template version,
9. generate ground truth automatically,
10. split by generator/template family to avoid leakage.

---

## 3. Generator architecture

```text
generator/
  templates/
    passport/
    invoice/
    receipt/
    generic_form/
    certificate/
    bank_statement/
  assets/
    fonts/
    logos_fake/
    stamps_fake/
    signatures_fake/
    portraits_fake/
  renderers/
  augmentations/
  ground_truth/
  manifests/
```

Flow:

```text
sample spec
  → fake data generator
  → document template renderer
  → annotation generator
  → augmentation
  → final image/PDF
  → ground truth
  → manifest
```

---

## 4. Synthetic sample manifest

```json
{
  "sampleId": "syn_invoice_000001",
  "generatorVersion": "0.1.0",
  "templateFamilyId": "syn_invoice_a",
  "templateVersionId": "v1",
  "seed": 12345,
  "docCategory": "invoice",
  "containsRealPersonalData": false,
  "annotations": {
    "detector": true,
    "ocr": true,
    "table": true,
    "fields": true
  },
  "qualityTags": ["clean"]
}
```

---

## 5. Fake passport generation

Generate:

- title
- country/issuer fake
- fake emblem/logo
- portrait photo placeholder
- surname/given names
- fake passport number
- nationality
- DOB
- issue date
- expiry date
- MRZ-like lines with valid check digits if possible
- optional signature/stamp

Important:

- synthetic passport must not imitate a real passport too closely if distributed publicly,
- mark as fictional where appropriate,
- use fake countries or clearly synthetic examples for public datasets.

---

## 6. Fake MRZ generation

MRZ generator should support:

- TD1
- TD2
- TD3

It should produce:

- raw MRZ lines
- parsed fields
- check digits
- bounding boxes
- OCR ground truth

Also generate invalid MRZ cases:

- wrong check digit
- blurred line
- missing character
- OCR confusion O/0
- partial crop

These are essential for verifier tests.

---

## 7. Fake invoice generation

Generate:

- vendor logo
- vendor address
- invoice number
- invoice date
- due date
- customer details
- line item table
- subtotal
- tax
- discount
- total
- QR payload
- barcode/reference
- payment terms

Ground truth:

- fields
- table cells
- arithmetic relationships
- QR payload mapping
- detector boxes

Conflict cases:

- QR total differs
- printed total differs from table
- tax ID mismatch
- missing total
- invalid date

---

## 8. Fake receipt generation

Generate:

- store name
- items
- prices
- discounts
- tax
- total
- payment amount
- change
- barcode/QR
- low-quality thermal print effects

Add receipt-specific augmentations:

- thermal noise
- faded text
- curled paper
- vertical crop
- long narrow aspect ratio

---

## 9. Fake generic forms

Generate:

- labels and values
- checkboxes
- radio groups
- signature area
- stamp area
- date fields
- address block
- tables/grids
- handwritten-like signatures
- blank/missing fields

Include both:

- fixed templates
- changed versions

---

## 10. Fake certificate generation

Generate:

- title
- recipient name
- date
- organization logo/emblem
- seal
- signature
- certificate number
- decorative border

Useful for:

- seals
- signatures
- logos
- visual anchors
- non-table layouts

---

## 11. Fake bank statement generation

Generate:

- account holder
- fake account number
- statement period
- opening balance
- transaction table
- debit/credit columns
- closing balance
- branch/contact details

Ground truth:

- balance progression
- table cells
- sensitive field markers

Conflict cases:

- closing balance mismatch
- missing transaction row
- OCR confusion in amount

---

## 12. Fake assets

### Fake logos

Use simple generated shapes/text, not real brands.

### Fake stamps/seals

Generate synthetic ink stamps and seals.

Variables:

- opacity
- rotation
- blur
- overlap
- color if allowed in data
- partial crop

### Fake signatures

Use generated scribbles or license-safe signature-like strokes.

Do not use real signatures.

### Fake portraits

Use:

- generated avatars,
- abstract placeholders,
- license-safe synthetic faces if policy allows.

Avoid real people unless explicit license and consent exist.

---

## 13. Ground truth generation

Synthetic renderer should output:

- image/PDF
- detector boxes
- segmentation masks
- OCR text boxes
- field definitions
- table cells
- MRZ parsed fields
- QR/barcode payloads
- template metadata
- quality tags

Ground truth should be exact before augmentation and transformed after augmentation.

---

## 14. Augmentation integration

Augmentations must transform annotations:

- boxes
- polygons
- masks
- text regions
- table cells
- field ROIs

If an augmentation makes text unreadable, ground truth remains but quality tag should indicate difficulty.

---

## 15. Template version generation

Generate families:

```text
invoice_template_a_v1
invoice_template_a_v2
invoice_template_a_v3
```

Version changes:

- field moves
- logo changes
- new field added
- table columns change
- QR moves
- total area shifts

Used to test template versioning.

---

## 16. Negative synthetic examples

Generate:

- decorative boxes not fields
- icons not logos
- grid-like backgrounds not tables
- random patterns not QR
- blank signature lines
- stamps overlapping text
- cropped documents
- duplicate labels

---

## 17. Synthetic dataset split

Split by generator family:

- do not put same rendered template family in train and locked test,
- hold out entire generator templates,
- hold out augmentation recipes.

This avoids inflated metrics.

---

## 18. Tests

Generator tests:

- deterministic output by seed
- boxes valid
- masks valid
- text ground truth matches rendered text
- table math correct
- MRZ check digits correct
- QR payload decodes
- augmentation transforms labels correctly
- split leakage absent

---

## 19. Privacy

Synthetic data should be safe, but still avoid using:

- real passport designs too closely
- real company logos
- real addresses
- real phone numbers
- real email domains if avoidable
- real signatures
- real faces without license/consent

Use clearly fake domains like `example.test` or `example.com` where appropriate.

---

## 20. Final rule

Synthetic data is how this project becomes open-source and privacy-safe. It must generate not just pretty fake documents, but full ground truth, hard cases, conflicts, template drift, and validation scenarios.
