# Date, Amount, ID, Phone, Email, and Currency Validation — Edge DocGraph Engine

**Purpose:** Define validation rules for common scalar field types: dates, amounts, currencies, IDs, phone numbers, emails, names, and countries.

---

## 1. Scope

This document covers field-level validators for:

- date
- amount
- currency
- ID number
- phone
- email
- country/nationality
- name
- address

These validators are used by the Verifier to assign field status.

---

## 2. General validation principle

Preserve raw value.

```text
raw OCR value
  → normalized candidate
  → parser result
  → validation result
  → status
```

Do not overwrite raw OCR with normalized value.

---

## 3. Date validation

### 3.1 Inputs

- raw text
- normalized text
- field label
- template date format hints
- document type
- locale hints
- related dates

### 3.2 Accepted date forms

Examples:

- `YYYY-MM-DD`
- `DD/MM/YYYY`
- `MM/DD/YYYY` if locale/template supports it
- `DD MMM YYYY`
- `YYYY.MM.DD`
- MRZ `YYMMDD`

### 3.3 Date ambiguity

Example:

```text
01/02/1999
```

Could mean:

- 1 February 1999
- January 2 1999

If template/locale cannot disambiguate:

```text
status = needs_review
```

### 3.4 Date validators

- parseable date
- valid calendar date
- not impossible
- date range
- issue date before expiry date
- DOB not in future
- expiry not before issue
- reasonable age range if configured

### 3.5 Date result examples

Invalid:

```json
{
  "validatorId": "date_format",
  "status": "fail",
  "severity": "high",
  "message": "Date is not a valid calendar date."
}
```

Ambiguous:

```json
{
  "validatorId": "date_ambiguity",
  "status": "warn",
  "severity": "medium",
  "message": "Date format is ambiguous."
}
```

---

## 4. Amount validation

### 4.1 Inputs

- raw text
- OCR confidence
- currency context
- decimal separator policy
- table/summary relationships

### 4.2 Accepted forms

Examples:

- `1200`
- `1,200.00`
- `₹1,200.00`
- `$1,200.00`
- `1.200,00` where locale supports
- `(1200.00)` negative accounting format
- `-1200.00`

### 4.3 Amount validators

- parseable numeric value
- decimal precision
- currency symbol/code
- negative allowed
- range if configured
- table arithmetic consistency
- subtotal/tax/total consistency

### 4.4 Ambiguity

`1,200` can mean:

- one thousand two hundred
- one point two in some locales

Template/locale should disambiguate. Otherwise mark needs_review for critical amounts.

---

## 5. Currency validation

Currency validator checks:

- symbol recognized
- ISO code recognized
- consistency across document
- currency expected by template
- amount/currency pairing

Examples:

- `$`
- `USD`
- `₹`
- `INR`
- `€`
- `EUR`

If currency missing but template default exists, status may still be confirmed with reason.

---

## 6. ID number validation

ID validation depends on field and document type.

Possible checks:

- regex pattern
- length
- allowed characters
- checksum if known
- MRZ cross-check
- barcode/QR cross-check
- template-specific format

Examples:

```json
{
  "validatorId": "id_pattern",
  "status": "pass",
  "message": "Passport number matches expected alphanumeric pattern."
}
```

### OCR confusions

Common:

- O/0
- I/1
- S/5
- B/8
- Z/2

Normalize only with context and preserve raw value.

---

## 7. Phone validation

Checks:

- digits and symbols
- country code
- length
- separators
- extension format
- template country hint

Do not over-enforce global phone rules in v1 unless country known.

Status examples:

- parseable phone → confirmed/needs_review depending confidence
- impossible length → invalid
- ambiguous country → needs_review

---

## 8. Email validation

Checks:

- one `@`
- local/domain parts exist
- domain has dot if required
- no spaces
- common OCR confusions considered but not silently changed

Example invalid:

```text
john@@example.com
```

Example needs_review:

```text
john.doe@examp1e.com
```

where OCR may have confused `l` and `1`.

---

## 9. Country and nationality validation

Checks:

- country name recognized
- country code recognized
- nationality code recognized
- MRZ country/nationality code consistency
- flag/emblem only as weak evidence, not final proof

Country code mismatch with MRZ may produce conflict.

---

## 10. Name validation

Name validation should be light.

Checks:

- non-empty
- reasonable character set
- not clearly an amount/date/ID
- MRZ name consistency if available

Do not reject valid names because of unfamiliar scripts or uncommon formats.

Name/MRZ mismatch usually conflict or needs_review.

---

## 11. Address validation

Address validation should be conservative.

Checks:

- non-empty
- multiline grouping
- not confused with unrelated text
- optional postal code extraction

Do not over-validate addresses without country-specific rules.

---

## 12. Validation config

Template field can define:

```json
{
  "validatorType": "date",
  "config": {
    "allowedFormats": ["DD/MM/YYYY"],
    "minDate": "1900-01-01",
    "maxDate": "today",
    "allowAmbiguous": false
  }
}
```

Amount config:

```json
{
  "validatorType": "amount",
  "config": {
    "currency": "INR",
    "allowNegative": false,
    "decimalPlaces": 2,
    "tolerance": 0.01
  }
}
```

---

## 13. Status mapping

| Situation | Status |
|---|---|
| parser succeeds + validators pass | confirmed |
| parser succeeds but ambiguous | needs_review |
| parser fails critical field | invalid |
| low OCR confidence | needs_review |
| cross-field mismatch | conflict |
| required field absent | missing |

---

## 14. Tests

Test dates:

- valid formats
- invalid dates
- ambiguous dates
- MRZ dates
- DOB future
- expiry before issue

Test amounts:

- currency symbols
- separators
- negative values
- rounding
- invalid OCR

Test IDs:

- pattern pass/fail
- OCR confusions
- MRZ cross-check

Test phones/emails:

- valid
- invalid
- ambiguous OCR

---

## 15. Final scalar validation rule

Common fields must be validated without destroying raw evidence. Normalize cautiously, mark ambiguity visibly, and let cross-field validators strengthen or dispute field trust.
