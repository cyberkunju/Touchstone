# Barcode and QR Pipeline — Edge DocGraph Engine

**Purpose:** Define local QR/barcode/PDF417 parsing with zxing-wasm and how decoded payloads become DocGraph evidence.

---

## 1. Pipeline goal

The barcode/QR pipeline detects or receives code regions, decodes them locally using zxing-wasm, stores decoded payloads as evidence, and links them to visual code nodes and form fields.

---

## 2. Supported code types

Initial target:

- QR code
- PDF417
- Code 128
- EAN
- Data Matrix
- Aztec where available

The parser should report actual decoded type.

---

## 3. High-level flow

```text
code candidate region
  → crop / preprocess
  → zxing-wasm decode
  → CodeEvidence
  → BarcodeNode / QRNode
  → optional payload parser
  → field hypotheses / validators
  → verifier
```

---

## 4. Code candidate sources

Sources:

- YOLOv11n detections: `qr_code`, `barcode`
- TemplateGraph projected code ROI
- user-selected code region
- optional whole-page scan if detector misses code

Priority:

1. projected template ROI
2. detector code region
3. user region
4. broad scan

---

## 5. Input structure

```ts
type CodeParseInput = {
  pageId: string;
  imageId: string;
  roi?: NormalizedBox;
  expectedType?: "qr" | "barcode" | "pdf417" | "data_matrix" | "unknown";
  source: "detector" | "template" | "user" | "broad_scan";
};
```

---

## 6. Preprocessing

For code crops:

- crop ROI
- rotate if needed
- increase contrast carefully
- upscale small codes
- avoid aggressive threshold that damages modules
- preserve raw crop

For rotated codes:

- try 0/90/180/270 if parser fails and cost is acceptable

---

## 7. Decode result

```ts
type CodeEvidence = {
  id: string;
  source: "barcode_parser";
  parser: "zxing-wasm";
  pageId: string;
  codeType: "qr" | "barcode" | "pdf417" | "data_matrix" | "aztec" | "unknown";
  payload: string;
  boxNorm?: NormalizedBox;
  confidence?: number;
  sourceRegionEvidenceId?: string;
  createdAt: number;
};
```

If parser fails:

```ts
type CodeParseFailure = {
  id: string;
  source: "barcode_parser";
  pageId: string;
  boxNorm?: NormalizedBox;
  status: "undecodable";
  reason: string;
};
```

Failures are evidence uncertainty, not necessarily system errors.

---

## 8. DocGraph node creation

Decoded code becomes:

- QRNode
- BarcodeNode
- CodePayloadNode if useful

Edges:

- `contains` from page to code
- `validated_by` for payload validators
- `confirms` or `conflicts_with` printed fields when compared
- `template_projected_from` if expected by template

---

## 9. Payload parsing

Some payloads are structured.

Possible formats:

- URL
- JSON
- vCard
- payment URI
- invoice metadata
- ID card PDF417 payload
- plain text
- key-value text
- unknown binary/text

Payload parser should be conservative.

Output:

```ts
type ParsedPayloadEvidence = {
  id: string;
  source: "payload_parser";
  codeEvidenceId: string;
  payloadType: "url" | "json" | "kv" | "vcard" | "payment" | "id_pdf417" | "unknown";
  parsedFields: Record<string, unknown>;
  confidence: number;
};
```

---

## 10. Cross-field validation

Decoded payload may validate printed fields.

Examples:

- QR GST number matches printed GST number
- invoice number in QR matches visible invoice number
- payment amount matches invoice total
- PDF417 ID payload matches printed name/DOB
- product barcode matches printed code

Verifier decides final status.

If payload disagrees:

```text
FieldStatus = conflict
```

---

## 11. Known-template flow

For known templates:

```text
project code ROI
  → crop
  → decode
  → validate expected payload
  → cross-check printed fields
```

If expected code missing:

- status missing
- expected region highlighted

---

## 12. Unknown-document flow

For unknown documents:

```text
detector finds code
  → parse
  → create code node
  → infer fields if payload structured
  → mark review if payload mapping uncertain
```

Do not automatically create many form fields from unknown payload without review.

---

## 13. Error and uncertainty

### Code visible but undecodable

Status:

- code node exists
- payload missing
- needs_review

### Code decoded but payload unknown

Status:

- confirmed code payload
- unknown semantic mapping

### Payload conflicts with printed text

Status:

- conflict

### Multiple codes

Store each separately. Do not merge unless evidence supports relationship.

---

## 14. Security

Code payloads may contain:

- URLs
- personal data
- payment details
- scripts as text
- malicious-looking strings

Rules:

- never auto-open URLs
- display payload safely
- sanitize UI rendering
- do not execute payload
- do not send payload to remote services

---

## 15. Tests

Test cases:

- clear QR
- rotated QR
- low-contrast QR
- PDF417
- 1D barcode
- multiple codes
- undecodable code
- QR payload conflicting with printed field
- URL payload
- JSON payload

Assertions:

- payload evidence created
- failure evidence created when undecodable
- no auto-open URL
- DocGraph nodes created
- cross-field validation works

---

## 16. Final barcode/QR rule

Codes are deterministic evidence sources. Use zxing-wasm locally, store decoded payloads as graph evidence, and let validators decide whether payload confirms or conflicts with visible document fields.
