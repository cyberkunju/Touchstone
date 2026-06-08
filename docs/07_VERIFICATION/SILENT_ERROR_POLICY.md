# Silent Error Policy — Edge DocGraph Engine

**Purpose:** Define strict “never silently lie” rules for document extraction, verification, UI, export, template learning, and release quality.

---

## 1. Core policy

A silent error is worse than a visible uncertainty.

The system must prefer:

```text
needs_review
```

over:

```text
wrong confirmed value
```

Internal slogan:

> No hallucinated fields. No silent wrong values. Every output needs evidence.

---

## 2. Silent error definition

A silent error occurs when:

```text
the exported/shown value is wrong
AND the system presents it as confirmed/trusted
AND the user is not clearly warned
```

Critical silent error:

```text
wrong critical field
AND status = confirmed
```

Critical silent errors are release blockers.

---

## 3. Critical fields

Critical fields include:

- passport/ID number
- name
- date of birth
- expiry date
- issue date
- nationality
- MRZ values
- QR/barcode mapped identity values
- invoice total
- tax ID
- bank account number
- closing balance
- payment amount
- signature/photo presence when required
- required legal/consent checkbox

Projects may extend this list.

---

## 4. Strict rules

### Rule 1 — No evidence, no field

A field without evidence must not be confirmed.

Only user-created fields may exist without document evidence, and they must be marked as user-created.

### Rule 2 — Low confidence is visible

Low-confidence OCR/detection/parser output must produce `needs_review`, not confirmed.

### Rule 3 — Critical validator failure blocks confirmation

Examples:

- MRZ checksum failed
- invalid date
- table total mismatch
- QR payload conflict
- required field missing

### Rule 4 — Conflicts are never hidden

If strong evidence sources disagree, status must be `conflict`.

### Rule 5 — Template projection is not truth

Template ROI only tells where to look. It does not confirm the value.

### Rule 6 — Never copy old template values

TemplateGraph stores structure, not current values.

### Rule 7 — Bad scans downgrade trust

Blur/glare/low resolution overlapping fields must prevent clean confirmation when critical.

### Rule 8 — User overrides are auditable

If user accepts invalid/conflicting value, record override and preserve original evidence.

### Rule 9 — Export preserves status

Exports must not strip uncertainty.

### Rule 10 — Template learning waits for correction

Do not learn unresolved conflicts or uncertain fields into active templates.

---

## 5. Hallucination prevention

The system must not invent:

- missing labels
- missing values
- country from flag alone
- inferred totals without evidence
- MRZ values when checksum fails
- QR payload fields not actually present
- table rows not visible
- names from prior documents
- old template values

Inferences can be shown only as suggestions with evidence/reason.

---

## 6. Confirmation gates

A critical field can be confirmed only if:

- evidence exists,
- confidence sufficient,
- validators pass,
- no conflict,
- quality acceptable,
- source region visible,
- template alignment trustworthy if template-derived.

If any gate fails:

```text
needs_review / missing / conflict / invalid
```

---

## 7. Unknown-document policy

Unknown documents are review-first.

Do not over-confirm unknown-document fields unless evidence is strong.

Unknown layout field confirmation requires:

- strong OCR/parser result,
- strong geometry,
- no conflicting evidence,
- field-type validator pass,
- quality acceptable.

---

## 8. Known-template policy

Known templates are verification-first.

Do not assume all projected ROIs are correct.

Known-template fields require:

- template match confidence,
- alignment confidence,
- ROI extraction,
- validators,
- no drift conflict.

If layout drift appears:

```text
new version or review
```

---

## 9. Export policy

Exports must include status.

Critical unresolved fields should trigger warning:

```text
This export contains unresolved critical fields.
```

Field export example:

```json
{
  "passportNumber": {
    "value": "A1234567",
    "status": "needs_review",
    "reasons": ["OCR confidence low"]
  }
}
```

Do not export as:

```json
{
  "passportNumber": "A1234567"
}
```

unless user selected a clean confirmed-only export mode and all fields are confirmed.

---

## 10. UI policy

The UI must:

- show status labels,
- show reasons,
- show evidence,
- highlight conflicts,
- highlight missing required fields,
- avoid hiding warnings behind tiny icons,
- not use color alone.

---

## 11. Template learning policy

Do not save active template if:

- critical conflicts unresolved,
- required fields unreviewed,
- source scan quality poor,
- anchors weak,
- user did not confirm template save,
- variable values selected as anchors.

Save as draft or block save.

---

## 12. Benchmark policy

Track:

- silent critical error rate
- confirmed wrong field rate
- conflict detection rate
- invalid detection rate
- missing required detection rate
- user correction rate for confirmed fields

Release gate:

```text
Any increase in silent critical errors blocks release.
```

---

## 13. Developer policy

Developers must not:

- add fallback that silently changes values,
- auto-correct OCR without preserving raw text,
- lower thresholds to make demos look better,
- hide needs_review fields from UI,
- strip statuses from exports,
- auto-update templates after mismatch.

---

## 14. Test cases

Every release must include silent-error tests:

- MRZ conflict
- table total mismatch
- QR payload mismatch
- low-confidence OCR critical ID
- glare over expiry date
- wrong template match candidate
- missing required field
- invalid date
- user override

---

## 15. Acceptable uncertainty

It is acceptable for the system to say:

```text
I found this, but review is needed.
```

It is unacceptable for the system to say:

```text
Confirmed.
```

when the evidence is weak or contradictory.

---

## 16. Final policy statement

The product’s trust comes from honesty. The system does not need to be omniscient. It must be evidence-backed, uncertainty-aware, and strict about never silently lying.
