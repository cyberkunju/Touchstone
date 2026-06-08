# Barcode Validation — Edge DocGraph Engine

**Purpose:** Define QR/barcode/PDF417 payload validation, payload parsing, field cross-checking, unsupported payload behavior, and security rules.

---

## 1. Scope

The barcode validation layer handles:

- QR codes
- PDF417
- Data Matrix
- Code 128
- EAN/UPC
- Aztec where supported
- unknown supported-by-parser codes

The parser is zxing-wasm. The verifier validates decoded payloads against document evidence.

---

## 2. Core principle

Codes are deterministic evidence sources, but payload interpretation must be cautious.

Rules:

1. decode locally,
2. never auto-open URLs,
3. preserve raw payload,
4. parse structured payload conservatively,
5. cross-check printed fields when possible,
6. mark conflicts visibly,
7. do not overwrite printed data silently.

---

## 3. Validation flow

```text
code region
  → zxing-wasm decode
  → CodeEvidence
  → payload classification
  → payload parser if supported
  → field mapping hypotheses
  → cross-field validation
  → verifier status
```

---

## 4. Decode validation

Validator: `barcode_decode`

Inputs:

- CodeEvidence
- visible code region
- expected code type if template known

Possible results:

| Situation | Result |
|---|---|
| visible code decoded | pass |
| visible code not decoded | warn/fail |
| expected code missing | fail |
| unsupported code type | warn/unsupported |
| no visible code expected | not_applicable |

---

## 5. Payload classification

Classify payload as:

```ts
type PayloadType =
  | "url"
  | "json"
  | "key_value"
  | "vcard"
  | "payment"
  | "invoice"
  | "id_pdf417"
  | "product"
  | "plain_text"
  | "binary"
  | "unknown";
```

Payload classification should not require cloud calls.

---

## 6. Payload parser output

```ts
type ParsedCodePayload = {
  payloadType: PayloadType;
  rawPayload: string;
  parsedFields: Record<string, unknown>;
  confidence: number;
  warnings: string[];
};
```

---

## 7. QR payload validation

QR payloads may contain:

- URL
- payment URI
- invoice metadata
- tax data
- JSON
- plain text
- contact data

Validators:

- `qr_payload_type`
- `qr_url_safe_display`
- `qr_payload_schema`
- `qr_printed_field_match`

---

## 8. PDF417 validation

PDF417 often appears in IDs and shipping labels.

Validators:

- payload decoded
- expected fields exist
- date fields parse
- ID fields match printed text where applicable
- payload schema recognized

Important:

PDF417 payload may contain sensitive identity data. Treat as highly sensitive.

---

## 9. 1D barcode validation

Common uses:

- product code
- shipment tracking
- invoice reference
- internal ID

Validators:

- decode success
- code type expected
- checksum if format supports it
- printed code match if visible
- product/shipping field mapping if template known

No external lookup by default.

---

## 10. Cross-field checks

Examples:

- QR invoice number matches printed invoice number
- QR total amount matches printed total
- QR tax ID matches printed tax ID
- PDF417 DOB matches printed DOB
- barcode tracking number matches printed tracking number
- QR payment currency matches printed currency

Mismatch result:

```text
status = conflict
```

---

## 11. Template code validation

TemplateGraph can define expected code fields:

```ts
type TemplateCode = {
  id: string;
  codeType: "qr" | "barcode" | "pdf417" | "data_matrix" | "aztec" | "unknown";
  boxNorm: NormalizedBox;
  required: boolean;
  payloadParsers: string[];
  validators: string[];
};
```

Known-template flow:

```text
project code ROI
  → decode
  → validate expected type
  → parse payload
  → cross-check expected fields
```

If required code missing:

```text
status = missing
```

If visible but undecoded:

```text
status = needs_review
```

---

## 12. Security rules

Barcode payloads can be unsafe.

Rules:

- do not auto-open URLs,
- do not execute payloads,
- render payload as text safely,
- sanitize UI output,
- do not send payload to network,
- warn before exporting payloads,
- do not perform external product/URL lookup by default.

---

## 13. ValidationResult examples

### Decode success

```json
{
  "validatorId": "barcode_decode",
  "status": "pass",
  "severity": "medium",
  "message": "QR code decoded successfully."
}
```

### Decode failure

```json
{
  "validatorId": "barcode_decode",
  "status": "warn",
  "severity": "medium",
  "message": "QR code region was detected but could not be decoded."
}
```

### Payload conflict

```json
{
  "validatorId": "barcode_payload_cross_check",
  "status": "fail",
  "severity": "critical",
  "message": "QR invoice total does not match printed invoice total.",
  "details": {
    "payloadTotal": "1170.00",
    "printedTotal": "1200.00"
  }
}
```

---

## 14. Status mapping

| Situation | Status |
|---|---|
| code decoded, payload matches printed field | confirmed |
| visible code undecodable | needs_review |
| expected required code missing | missing |
| payload differs from printed critical field | conflict |
| payload schema invalid | invalid/needs_review |
| payload type unsupported | unsupported |
| URL payload | confirmed as decoded payload, not safe to open automatically |

---

## 15. UI behavior

Show:

- code crop
- code type
- raw payload
- parsed payload if supported
- safety warning for URLs
- cross-field validation result
- conflict details

Never show a decoded QR result as if it overwrote printed data.

---

## 16. Tests

Test:

- clean QR
- rotated QR
- low-contrast QR
- PDF417 ID payload
- 1D barcode
- unsupported payload
- URL payload
- payload/printed field match
- payload/printed field conflict
- required code missing

Assertions:

- raw payload preserved
- no URL auto-open
- conflict visible
- evidence IDs cited
- status correct

---

## 17. Final barcode validation rule

Codes are valuable deterministic evidence, but they are not final truth by themselves. Decode locally, parse safely, cross-check printed data, and expose conflicts rather than silently trusting payloads.
