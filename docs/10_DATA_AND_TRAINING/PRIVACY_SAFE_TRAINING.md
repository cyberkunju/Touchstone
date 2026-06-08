# Privacy-Safe Training — Edge DocGraph Engine

**Purpose:** Define privacy-safe data practices: fake data, redaction, opt-in correction export, sensitive artifact handling, and no leakage into open-source datasets.

---

## 1. Core privacy rule

Sensitive document data must never enter training data accidentally.

Default policy:

```text
All user documents and corrections are private local data.
```

Training data can include user-derived samples only through explicit export and privacy review.

---

## 2. Sensitive data types

Sensitive:

- names
- document numbers
- dates of birth
- addresses
- phone numbers
- email addresses
- passport/ID details
- MRZ lines
- QR/barcode payloads
- tax IDs
- invoice/customer details
- bank account numbers
- transaction data
- portrait photos
- signatures
- official stamps/seals
- uploaded document images
- template layouts from private organizations

---

## 3. Safe data sources

Preferred:

1. synthetic documents
2. manually created fake documents
3. public templates with license
4. redacted user exports
5. private local benchmark sets with strict access

Open-source public dataset must be synthetic/public-license only.

---

## 4. Prohibited practices

Do not:

- upload user documents automatically,
- train on private user data silently,
- commit real documents to repository,
- commit real MRZ/barcode payloads,
- commit real signatures/photos,
- publish private template layouts,
- log OCR text to analytics,
- send document content to cloud services,
- use real IDs in synthetic examples.

---

## 5. Redaction strategy

Redaction should remove or replace:

- text values
- portrait photos
- signatures
- MRZ payloads
- QR/barcode payloads
- account numbers
- addresses
- document numbers

Redaction can preserve:

- layout geometry
- class labels
- field types
- bounding boxes
- masks if safe
- validator status without raw values
- synthetic replacement values

---

## 6. Synthetic replacement

Replace real values with fake values of same type.

Examples:

```text
JOHN DOE → ALEX SAMPLE
A1234567 → X0000001
1999-02-01 → 1990-01-01
₹1,200.00 → ₹999.00
```

For images:

- replace portrait with generated avatar/placeholder
- replace signature with synthetic scribble
- replace logo/stamp if private
- blur or remove payload codes

---

## 7. Redaction metadata

Every exported/redacted sample must include:

```json
{
  "redactionStatus": "redacted",
  "redactionVersion": "0.1.0",
  "containsRealPersonalData": false,
  "redactedFields": ["name", "passportNumber", "dob"],
  "reviewStatus": "approved"
}
```

---

## 8. Opt-in export

User correction export flow:

1. user chooses export,
2. app previews included data,
3. app warns about sensitive content,
4. app offers redaction,
5. user confirms,
6. export package generated locally,
7. user manually shares if desired.

No automatic upload.

---

## 9. Local private training

A user may train locally on their own data if feature exists later.

Rules:

- local-only,
- no upload,
- clear warning,
- model artifacts may memorize sensitive patterns,
- exported models may leak information,
- user controls deletion.

This is out of MVP unless explicitly planned.

---

## 10. Repository rules

Never commit:

- real documents
- real IDs
- real MRZ
- real QR payloads
- real signatures
- real portraits
- private templates
- unreviewed correction exports
- raw OCR logs

Repository dataset folder should include:

```text
synthetic/
public_license/
redacted_examples/
```

with manifest/license.

---

## 11. Debug logging rules

Do not log:

- OCR text
- field values
- MRZ lines
- barcode payloads
- image blobs
- crop content
- user document names if sensitive

Allowed logs:

- task durations
- model versions
- memory warnings
- field status counts
- error codes
- non-sensitive metrics

---

## 12. Benchmark privacy

Private benchmark sets can exist locally but must be marked:

```text
private_not_for_commit
```

Use `.gitignore` and explicit folder names:

```text
private_data/
private_benchmarks/
user_exports/
```

Add repository guard scripts if possible.

---

## 13. Data review checklist

Before adding data to public/training repo:

- [ ] source/license known
- [ ] no real personal data
- [ ] no real signatures/photos
- [ ] no real MRZ/barcode payload
- [ ] redaction metadata present
- [ ] reviewer approved
- [ ] split assigned
- [ ] dataset manifest updated

---

## 14. Model privacy

Models can memorize data if trained on sensitive samples.

Rules:

- do not train public models on private unredacted data,
- document dataset sources for every model,
- keep private-trained models private,
- warn before exporting locally trained model,
- record training manifest.

---

## 15. Privacy tests

Automated checks can scan for:

- email patterns
- phone patterns
- MRZ-like lines
- ID-like patterns
- real domain names
- unredacted metadata flags
- files in forbidden directories

These checks are not perfect but useful.

---

## 16. User-facing privacy wording

Use:

```text
Corrections are stored locally on this device.
```

```text
Exported training packages may include sensitive data. Review before sharing.
```

```text
This template saves layout and extraction rules, not document values.
```

---

## 17. Final privacy rule

The project’s open-source credibility depends on privacy discipline. Use synthetic and redacted data by default, keep user corrections local, and never let sensitive documents leak into training, logs, exports, or repository history.
