# Table Validation — Edge DocGraph Engine

**Purpose:** Define validation rules for tables: structure, headers, totals, row sums, debit/credit/balance checks, cell confidence, and conflict handling.

---

## 1. Scope

Table validation applies to:

- invoices
- receipts
- bank statements
- transaction lists
- forms with grids
- fee tables
- product/item tables
- summaries/subtotals

Tables must be graph-structured, not plain OCR blobs.

---

## 2. Table validation goals

The validator should answer:

- Is the table structure plausible?
- Are headers detected?
- Are cells assigned correctly?
- Are numeric columns parseable?
- Do row sums match totals?
- Do debit/credit/balance calculations work?
- Are required columns present?
- Is any table value conflicting with printed summary fields?

---

## 3. Table validation flow

```text
TableNode
  → structure validation
  → cell OCR confidence validation
  → header validation
  → value type validation
  → arithmetic validation
  → cross-field validation
  → status impact
```

---

## 4. Table structure validation

Validator: `table_structure`

Checks:

- table box exists
- row count plausible
- column count plausible
- cell boxes valid
- cells inside table
- no impossible overlaps
- merged cells handled
- empty table not accepted as confirmed

Result examples:

- pass: regular grid reconstructed
- warn: borderless table with uncertain columns
- fail: table required but no usable structure

---

## 5. Header validation

Validator: `table_header`

Checks:

- expected headers present
- header aliases match
- header row identified
- columns mapped to value types

Example aliases:

```json
{
  "Amount": ["Amt", "Line Total", "Total"],
  "Description": ["Item", "Particulars", "Details"],
  "Quantity": ["Qty", "QTY"]
}
```

If headers missing but template schema can still map columns, status may be needs_review.

---

## 6. Cell confidence validation

Validator: `table_cell_confidence`

Checks:

- OCR confidence per cell
- empty required cells
- ambiguous cell assignment
- multi-cell overlap
- low-quality crop

A table may be confirmed overall while individual cells need review only if non-critical cells are affected.

---

## 7. Numeric column validation

Validator: `numeric_column_consistency`

Checks:

- amount columns contain parseable amounts
- quantity columns contain numbers
- dates parse in date columns
- text columns are not wrongly parsed as amounts
- separators/currency consistent

---

## 8. Invoice arithmetic validation

Validator: `invoice_total_math`

Typical rules:

```text
sum(line item amounts) = subtotal
subtotal + tax - discount + fees = total
```

Config:

```ts
type InvoiceMathConfig = {
  subtotalFieldId?: string;
  taxFieldIds?: string[];
  discountFieldIds?: string[];
  feeFieldIds?: string[];
  totalFieldId: string;
  lineItemTableId: string;
  tolerance: number;
};
```

Tolerance handles rounding.

Example:

```text
computedTotal = 1170.00
printedTotal = 1200.00
→ conflict
```

---

## 9. Receipt validation

Receipts may have:

- item rows
- tax
- discounts
- total
- payment amount
- change

Validators:

- line sum
- tax consistency
- total consistency
- payment/change consistency where present

Receipts often have noisy OCR, so uncertain rows may create needs_review rather than immediate conflict.

---

## 10. Bank statement validation

Validator: `balance_progression`

Rules:

```text
previous balance + credits - debits = current balance
```

or depending statement convention:

```text
opening balance + sum(transactions) = closing balance
```

Checks:

- date column parse
- debit/credit amount parse
- balance parse
- row order
- arithmetic progression
- closing balance

If one row uncertain:

- mark row/cell needs_review
- avoid declaring full table confirmed

---

## 11. Generic table validation

For generic forms:

- structure plausibility
- required columns
- cell OCR confidence
- no arithmetic unless configured

Do not invent business rules.

---

## 12. Cross-field table validation

Tables may confirm printed fields.

Examples:

- line item table confirms invoice total
- bank transaction table confirms closing balance
- fee table confirms amount due
- tax table confirms tax total

If mismatch:

```text
printed field status = conflict
table status = conflict or needs_review depending evidence
```

---

## 13. ValidationResult examples

### Structure warning

```json
{
  "validatorId": "table_structure",
  "status": "warn",
  "severity": "medium",
  "message": "Table structure was reconstructed, but one column boundary is uncertain."
}
```

### Invoice total pass

```json
{
  "validatorId": "invoice_total_math",
  "status": "pass",
  "severity": "critical",
  "message": "Subtotal plus tax minus discount equals printed total."
}
```

### Invoice total fail

```json
{
  "validatorId": "invoice_total_math",
  "status": "fail",
  "severity": "critical",
  "message": "Printed total does not match computed total from table.",
  "details": {
    "computed": "1170.00",
    "printed": "1200.00",
    "tolerance": "0.01"
  }
}
```

---

## 14. Status mapping

| Table situation | Status |
|---|---|
| structure good + cells readable + validators pass | confirmed |
| structure plausible but some ambiguity | needs_review |
| required table missing | missing |
| arithmetic mismatch | conflict |
| required numeric cell invalid | invalid/needs_review |
| unsupported complex table | unsupported |

---

## 15. UI behavior

Table UI should show:

- table crop
- cell grid
- low-confidence cells
- header mapping
- arithmetic result
- conflicting totals
- editable rows/columns/cells

For arithmetic conflicts, show calculation details.

---

## 16. Template table validation

Known-template table extraction should use TemplateTable schema.

Checks:

- expected columns present
- required columns exist
- header aliases match
- variable row policy respected
- totals validate

If template table changed:

- trigger drift/versioning

---

## 17. Tests

Test:

- correct invoice table
- invoice table total mismatch
- borderless receipt table
- bank debit/credit/balance table
- missing required column
- ambiguous cell
- low OCR confidence cell
- merged cells
- template table changed

Assertions:

- status correct
- conflicts visible
- table cells preserve evidence
- arithmetic details shown
- corrections re-run validators

---

## 18. Final table validation rule

Tables are validation engines, not just extracted grids. Whenever tables imply totals, balances, or field confirmations, the verifier must check the math and expose mismatches.
