# MRZ Validation — Edge DocGraph Engine

**Purpose:** Define MRZ validation rules: ICAO-style check digits, line formats, date parsing, country codes, visual cross-checks, and failure behavior.

---

## 1. Scope

This document covers validation of Machine Readable Zones used in passports, ID cards, and travel documents.

The system should support:

- TD1
- TD2
- TD3
- partial/unknown MRZ handling
- OCR normalization
- check digit validation
- date parsing
- country/nationality code validation
- visual field cross-checks

---

## 2. MRZ validation principle

MRZ is high-value evidence, but only if validated.

Rules:

1. raw OCR lines must be preserved,
2. normalized MRZ lines must be stored separately,
3. check digits must be validated,
4. failed checks must not be hidden,
5. visual fields should be cross-checked,
6. MRZ does not prove document authenticity.

---

## 3. MRZ character set

MRZ uses:

```text
A-Z
0-9
<
```

The filler character is `<`.

Any other character in normalized MRZ should trigger warning or invalid state.

---

## 4. OCR normalization

Common MRZ OCR confusions:

| OCR | Candidate |
|---|---|
| O | 0 |
| 0 | O |
| I | 1 |
| B | 8 |
| S | 5 |
| Z | 2 |
| space | < |
| punctuation | < |

Normalization must be context-aware.

Example:

- date positions expect digits,
- country code positions expect letters,
- filler positions expect `<`.

Store normalization changes:

```ts
type MrzNormalizationChange = {
  line: number;
  position: number;
  from: string;
  to: string;
  reason: string;
};
```

---

## 5. Supported formats

### 5.1 TD1

Usually:

```text
3 lines × 30 characters
```

Common for ID cards.

### 5.2 TD2

Usually:

```text
2 lines × 36 characters
```

### 5.3 TD3

Usually:

```text
2 lines × 44 characters
```

Common for passports.

---

## 6. Check digit algorithm

MRZ check digit uses weighted modulo 10 calculation.

Weights repeat:

```text
7, 3, 1
```

Character values:

```text
0-9 → 0-9
A-Z → 10-35
<   → 0
```

Algorithm:

```ts
function mrzCheckDigit(input: string): number {
  const weights = [7, 3, 1];
  let sum = 0;

  for (let i = 0; i < input.length; i++) {
    sum += mrzCharValue(input[i]) * weights[i % 3];
  }

  return sum % 10;
}
```

Validation:

```ts
computed === providedDigit
```

---

## 7. TD3 validation

TD3 passport example:

```text
P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<
L898902C36UTO7408122F1204159ZE184226B<<<<<10
```

Typical fields:

- document type
- issuing country
- name
- document number
- nationality
- date of birth
- sex
- expiry date
- personal number/optional data
- check digits
- composite check digit

Validate:

- line count = 2
- each line length = 44
- character set valid
- document number check digit
- DOB check digit
- expiry check digit
- optional data check digit where applicable
- composite check digit

---

## 8. TD1 validation

TD1 fields typically include:

- document type
- issuing country
- document number
- optional data
- DOB
- sex
- expiry
- nationality
- name
- composite check digit

Validate:

- line count = 3
- line length = 30
- required check digits
- country/nationality code
- date formats
- composite check digit

---

## 9. TD2 validation

Validate:

- line count = 2
- line length = 36
- document number check digit
- DOB check digit
- expiry check digit
- composite check digit where applicable

---

## 10. Date parsing

MRZ dates are usually:

```text
YYMMDD
```

Need century inference.

### DOB

Century should infer reasonable birth date.

Rules:

- date must be valid calendar date
- date should not be in future
- age may be checked if configured
- ambiguous century should be handled carefully

### Expiry

Rules:

- valid calendar date
- usually future or near past depending document
- expiry should be after DOB
- expiry should be after issue date if issue date visible

---

## 11. Country/nationality codes

Validate issuing country and nationality codes against known MRZ/ICAO-style country code list.

Rules:

- unknown code should warn or fail depending field criticality,
- special codes must be supported if included,
- do not assume country from flag alone.

Country validation is useful but should be less severe than check digit failure unless template requires strict behavior.

---

## 12. Name parsing

MRZ name format:

```text
SURNAME<<GIVEN<NAMES
```

Rules:

- `<` separates name components,
- multiple fillers collapse to spaces,
- compare to visual names using normalized form,
- account for order and transliteration differences.

MRZ name mismatch should usually create conflict or needs_review, not automatic invalid, unless strict template policy.

---

## 13. Visual cross-checks

Compare MRZ parsed fields to visible fields:

- document number
- date of birth
- expiry date
- name
- nationality
- sex/gender if visible

Cross-check result examples:

| Result | Status impact |
|---|---|
| match | strengthens confirmation |
| mismatch critical | conflict |
| visual missing | MRZ may still confirm MRZ field but visible field missing |
| MRZ invalid | do not confirm MRZ-derived fields |

---

## 14. MRZ ValidationResult examples

### Check digit pass

```json
{
  "validatorId": "mrz_checksum_document_number",
  "status": "pass",
  "severity": "critical",
  "message": "MRZ document number check digit passed."
}
```

### Check digit fail

```json
{
  "validatorId": "mrz_checksum_document_number",
  "status": "fail",
  "severity": "critical",
  "message": "MRZ document number check digit failed."
}
```

### Visual conflict

```json
{
  "validatorId": "mrz_visual_dob_match",
  "status": "fail",
  "severity": "critical",
  "message": "MRZ date of birth does not match visible date of birth."
}
```

---

## 15. Status mapping

| MRZ situation | Status |
|---|---|
| MRZ valid, visual matches | confirmed |
| MRZ valid, visual missing | confirmed for MRZ value; visible field may be missing |
| MRZ valid, visual differs | conflict |
| MRZ checksum fails | invalid |
| MRZ OCR unreadable | needs_review |
| MRZ expected but missing | missing |
| MRZ format unsupported | unsupported/needs_review |

---

## 16. UI behavior

Show:

- MRZ crop
- raw OCR lines
- normalized lines
- parsed fields
- check digit results
- visual cross-check results
- conflicts

Do not show only final parsed values. MRZ validation must be transparent.

---

## 17. Tests

Unit tests:

- check digit algorithm
- char value mapping
- TD1 parse
- TD2 parse
- TD3 parse
- DOB date parsing
- expiry date parsing
- country code validation
- normalization changes
- invalid characters
- composite check digit failure

Integration tests:

- valid passport MRZ
- blurred MRZ with correction
- checksum fail
- visual conflict
- missing MRZ in known template

---

## 18. Security and privacy

MRZ data is highly sensitive.

Rules:

- do not log raw MRZ by default
- encrypt stored MRZ evidence where feasible
- warn before exporting debug packages
- keep all parsing local
- do not claim authenticity verification

---

## 19. Final MRZ validation rule

A parsed MRZ is trustworthy only when its structure and check digits validate. A valid MRZ can strengthen visual fields, but mismatches must become visible conflicts. Failed check digits must never be silently accepted.
