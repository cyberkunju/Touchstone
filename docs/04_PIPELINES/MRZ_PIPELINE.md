# MRZ Pipeline — Edge DocGraph Engine

**Purpose:** Define MRZ detection, OCR, normalization, parsing, checksum validation, visual-field cross-checking, and DocGraph integration.

---

## 1. Pipeline goal

The MRZ pipeline extracts machine-readable zones from passports, IDs, visas, and related documents, validates them deterministically, and links parsed values to visible fields.

MRZ must never be accepted blindly. Checksum validation is mandatory where applicable.

---

## 2. High-level flow

```text
MRZ candidate
  → crop
  → preprocess
  → OCR
  → normalize MRZ text
  → detect format TD1/TD2/TD3
  → parse fields
  → validate check digits
  → cross-check visual fields
  → MRZ evidence + validation results
  → DocGraph
```

---

## 3. MRZ candidate sources

Sources:

- YOLOv11n `mrz_zone`
- TemplateGraph projected MRZ ROI
- OCR pattern detection
- user-selected region

Priority:

1. template MRZ ROI in known-template flow
2. detector MRZ zone
3. OCR pattern scan
4. user region

---

## 4. Supported formats

### TD1

Common for ID cards.

Typical:

```text
3 lines × 30 characters
```

### TD2

Some travel documents.

Typical:

```text
2 lines × 36 characters
```

### TD3

Passports.

Typical:

```text
2 lines × 44 characters
```

---

## 5. MRZ OCR preprocessing

MRZ text has special constraints.

Recommended preprocessing:

- crop MRZ zone tightly but not too tight
- upscale if text height is small
- preserve line separation
- improve contrast carefully
- avoid distortion
- deskew local region if needed
- use high-resolution ROI OCR

---

## 6. OCR output requirements

OCR evidence must include:

- raw lines
- coordinates
- confidence
- crop ID
- model version
- preprocessing profile

Keep raw OCR exactly before normalization.

---

## 7. MRZ normalization

Normalize common OCR confusions only in MRZ context.

Common substitutions:

- `O` ↔ `0`
- `I` ↔ `1`
- `B` ↔ `8`
- `S` ↔ `5`
- `Z` ↔ `2`
- punctuation/space ↔ `<`

Normalization should be rule-based and traceable.

```ts
type MrzNormalizationChange = {
  position: number;
  from: string;
  to: string;
  reason: string;
};
```

---

## 8. Format detection

Detect format by:

- number of lines
- line lengths
- MRZ character set
- document type prefix
- check digit positions

Output:

```ts
type MrzFormatDetection = {
  format: "TD1" | "TD2" | "TD3" | "unknown";
  confidence: number;
  reasons: string[];
};
```

---

## 9. Check digit validation

Use deterministic check digit logic.

Check digits validate:

- document number
- date of birth
- expiry date
- optional data where applicable
- composite check digit where applicable

Output:

```ts
type MrzCheckDigitResult = {
  field: string;
  expected: string;
  computed: string;
  passed: boolean;
};
```

A failed critical check digit must prevent automatic confirmation.

---

## 10. Parsed MRZ evidence

```ts
type MrzEvidence = {
  id: string;
  source: "mrz_parser";
  pageId: string;
  rawLines: string[];
  normalizedLines: string[];
  normalizationChanges: MrzNormalizationChange[];
  format: "TD1" | "TD2" | "TD3" | "unknown";
  parsed: {
    documentType?: string;
    issuingCountry?: string;
    documentNumber?: string;
    nationality?: string;
    dateOfBirth?: string;
    sex?: string;
    expiryDate?: string;
    surname?: string;
    givenNames?: string;
    optionalData?: string;
  };
  checkDigits: MrzCheckDigitResult[];
  status: "valid" | "partial" | "invalid";
  sourceOcrEvidenceIds: string[];
};
```

---

## 11. Visual-field cross-checking

MRZ parsed values should be compared to visible fields.

Examples:

- MRZ document number vs visible passport number
- MRZ date of birth vs visible DOB
- MRZ expiry vs visible expiry
- MRZ name vs visible name
- MRZ nationality vs visible nationality

Comparison must account for:

- date formats
- name order
- accents/transliteration
- OCR errors
- missing visual fields

Conflict output:

```text
MRZNode --conflicts_with--> FieldNode
```

---

## 12. Known-template MRZ flow

For known templates:

```text
project MRZ ROI
  → crop
  → OCR MRZ
  → parse
  → validate
  → cross-check expected fields
```

If MRZ missing:

- mark MRZ field missing
- highlight expected region

If checksum fails:

- mark invalid/conflict
- do not confirm MRZ-derived fields

---

## 13. Unknown-document MRZ flow

For unknown documents:

```text
detector or OCR pattern finds MRZ
  → parse
  → create MRZ node
  → generate field hypotheses
  → cross-check visible OCR fields
```

MRZ can help create fields, but visual cross-check improves trust.

---

## 14. Error handling

### MRZ zone detected but OCR unreadable

Status:

- MRZNode candidate
- needs_review
- show crop

### Format unknown

Status:

- unsupported or needs_review

### Checksum failure

Status:

- invalid or conflict

### Partial parse

Status:

- partial
- parsed fields may be needs_review

---

## 15. UI behavior

For MRZ evidence, show:

- MRZ crop
- raw OCR lines
- normalized lines
- parsed fields
- check-digit results
- visual cross-check status

If conflict:

- show both MRZ and visual evidence side-by-side

---

## 16. Tests

Unit tests:

- check digit calculation
- TD1 parsing
- TD2 parsing
- TD3 parsing
- OCR normalization
- invalid check digits
- partial MRZ
- visual field matching

Integration tests:

- passport MRZ clean
- passport MRZ blurred
- MRZ conflict with visual field
- missing MRZ
- wrong format

---

## 17. Security and privacy

MRZ contains sensitive identity data.

Rules:

- do not log MRZ by default
- encrypt stored MRZ evidence where feasible
- warn before exporting evidence package
- keep all parsing local

---

## 18. Final MRZ rule

MRZ is deterministic high-value evidence. It must be parsed locally, validated with check digits, cross-checked with visible fields, and represented in DocGraph. A failed checksum must never be silently accepted.
