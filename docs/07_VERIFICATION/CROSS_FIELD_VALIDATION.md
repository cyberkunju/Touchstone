# Cross-Field Validation — Edge DocGraph Engine

**Purpose:** Define how the system compares fields against each other and against parser/table/code evidence to detect confirmation, conflict, invalid states, and missing dependencies.

---

## 1. What is cross-field validation?

Cross-field validation checks relationships between multiple evidence sources or fields.

Examples:

- MRZ DOB matches visible DOB
- QR invoice number matches printed invoice number
- invoice total matches line item table
- expiry date after issue date
- bank balance progression works
- barcode tracking number matches printed tracking number

Cross-field validation is where the system becomes trustworthy beyond OCR.

---

## 2. Core principle

Do not silently choose one source over another.

If two reliable sources disagree:

```text
status = conflict
```

Show both.

---

## 3. Cross-field validator schema

```ts
type CrossFieldValidatorConfig = {
  sourceId: string;
  targetId: string;
  comparisonType:
    | "exact"
    | "normalized_exact"
    | "date_equal"
    | "amount_equal"
    | "name_similarity"
    | "id_match"
    | "table_sum"
    | "balance_progression"
    | "custom";
  tolerance?: number;
  severity: "low" | "medium" | "high" | "critical";
};
```

---

## 4. MRZ vs visual fields

Compare:

- document number
- date of birth
- expiry date
- name
- nationality
- sex/gender if visible

Rules:

- valid MRZ strengthens visual fields
- invalid MRZ cannot confirm fields
- mismatch between valid MRZ and visual field creates conflict
- missing visual field may be filled from MRZ but should indicate source

Examples:

```text
MRZ DOB = 1999-02-01
Visual DOB = 1999-02-01
→ confirmed
```

```text
MRZ DOB = 1999-02-01
Visual DOB = 1999-03-01
→ conflict
```

---

## 5. QR/barcode vs printed fields

Compare:

- invoice number
- tax ID
- total amount
- payment reference
- tracking number
- ID fields
- product code

Rules:

- decoded payload must not overwrite printed field silently
- mismatch creates conflict
- unknown payload mapping creates needs_review/unsupported

---

## 6. Table vs summary fields

Compare:

- line items vs subtotal
- subtotal + tax - discount vs total
- debit/credit rows vs closing balance
- fee table vs amount due

Rules:

- arithmetic pass strengthens confirmation
- arithmetic mismatch creates conflict
- uncertain table structure can make summary field needs_review instead of conflict

---

## 7. Date relationship validation

Common date relationships:

- expiry after issue
- DOB before issue
- DOB not in future
- due date after invoice date
- statement end after statement start
- transaction dates within statement period

Examples:

```text
Issue Date = 2024-01-01
Expiry Date = 2023-01-01
→ invalid/conflict depending source
```

---

## 8. Amount relationship validation

Common relationships:

- subtotal + tax = total
- amount paid + balance due = total
- debit/credit/balance progression
- quantity × unit price = line total
- sum of fees = amount due

Allow tolerance for rounding.

---

## 9. Name matching

Name matching should be tolerant.

Normalize:

- uppercase
- trim spaces
- remove filler characters
- handle comma order
- handle MRZ separators
- optionally remove accents for comparison

Do not over-enforce names across scripts.

Mismatch should usually be conflict/needs_review, not invalid.

---

## 10. ID matching

ID matching can be stricter.

Normalize only contextually:

- remove spaces/hyphens if allowed
- uppercase
- OCR confusions if validator supports

Mismatch between strong sources is conflict.

---

## 11. ConflictRecord

```ts
type ConflictRecord = {
  id: string;
  documentId: string;
  targetId: string;

  conflictType:
    | "value_mismatch"
    | "date_mismatch"
    | "amount_mismatch"
    | "id_mismatch"
    | "name_mismatch"
    | "table_mismatch"
    | "template_mismatch";

  left: {
    value: unknown;
    source: string;
    evidenceIds: string[];
  };

  right: {
    value: unknown;
    source: string;
    evidenceIds: string[];
  };

  severity: "low" | "medium" | "high" | "critical";
  message: string;
};
```

---

## 12. ValidationResult examples

### MRZ visual match

```json
{
  "validatorId": "mrz_visual_dob_match",
  "status": "pass",
  "severity": "critical",
  "message": "MRZ date of birth matches visible date of birth."
}
```

### QR conflict

```json
{
  "validatorId": "qr_invoice_number_match",
  "status": "fail",
  "severity": "critical",
  "message": "QR invoice number differs from printed invoice number."
}
```

### Table total match

```json
{
  "validatorId": "invoice_total_math",
  "status": "pass",
  "severity": "critical",
  "message": "Line item total matches printed total."
}
```

---

## 13. Status mapping

| Cross-field result | Status |
|---|---|
| strong match | confirmed or confidence boost |
| weak match | needs_review or small boost |
| mismatch critical | conflict |
| dependency missing | missing/needs_review |
| one source invalid | invalid source, do not confirm dependent |
| unsupported comparison | unsupported/needs_review |

---

## 14. Dependency graph

Cross-field validators depend on multiple fields.

Example:

```text
invoice_total_math depends on:
  table_line_items
  subtotal
  tax
  discount
  total
```

When user corrects one dependency, rerun affected validators only.

---

## 15. UI behavior

For cross-field conflict, show:

- both values
- both sources
- source crops/payloads
- validator message
- resolve controls

Example:

```text
Conflict: Invoice Total
Printed total: 1200.00
Computed from table: 1170.00
```

---

## 16. Tests

Test:

- MRZ/visual match
- MRZ/visual mismatch
- QR/printed match
- QR/printed mismatch
- table total match
- table total mismatch
- date relationship fail
- balance progression fail
- missing dependency
- user correction reruns validation

---

## 17. Final cross-field rule

Cross-field validation is the strongest protection against silent errors. When independent evidence agrees, confidence increases. When it disagrees, the system must show conflict rather than choose silently.
