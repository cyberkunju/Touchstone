# 08 — Consensus Solver & Attestor Registry

Judgment. How candidate values from every channel become exactly one of: a confirmed field with a
justification chain, or a precise question. This module *is* the zero-silent-error law as code.

---

## 1. Inputs (per document)

- **Candidates** per prospective field: OCR top-1, grammar re-decodes (I3), MRZ decode fields
  (I2), barcode/QR payload parses, template projections (I8), native-file cells/runs (I9),
  user-entered values. Each candidate: `{ value, channel, geometry?, pathProb?, marks[] }`.
- **Field slots**: from template bindings (known family), label detection (label↔value geometry),
  attestor self-labels (I4), or native headers (spreadsheets).
- **Context**: page quality, family priors (I5), template alignment quality (inlier ratio).

## 2. Constraint classes

| Class | Members | Effect |
|---|---|---|
| **Hard** (violation ⇒ candidate/assignment dead) | attestor checksum failure on a checksummed type; grammar invalidity for typed fields; geometric impossibility (value box outside page/ROI); calendar impossibility; type mismatch vs schema | prune |
| **Soft** (weighted score) | label affinity (distance/alignment/lexical match); template prior (expected ROI, type); confusion-prior likelihood of the read; quorum agreement (I6); cross-field rules (expiry > issue; DOB < issue; MRZ↔VIZ equality; table closure residuals); channel strength (native > payload > lattice-decode > raw OCR) | rank |

## 3. Assignment

- Label↔value pairing: **Hungarian algorithm** (`src/consensus/hungarian.ts`) over a cost matrix
  (geometric proximity/alignment + lexical label match + type compatibility). Globally optimal —
  the end of greedy-pairing pathologies.
- Value selection per field: exact search over surviving candidates (≤ 10/field by construction);
  document-global decisions (date locale, decimal style) are single shared variables, so one
  cheap branch-and-bound resolves e.g. every date on the page at once.
  `// note: exhaustive at document scale is milliseconds; a SAT/CP dependency would be ceremony`

## 4. Output — the Justification chain (frozen type, plan.md §13.3)

Every field emits `{ status, value, attestations[], candidatesConsidered, penalties[] }`.

**The law as a type:** `status === 'confirmed'` ⟺ `attestations.length ≥ 1`, enforced by the only
constructor able to produce a confirmed status, plus a fuzz test that attempts to forge confirmed
fields without attestations (must be unrepresentable).

## 5. Attestation kinds (exhaustive)

| Kind | Grants confirmed when |
|---|---|
| `checksum` | the value passes its registered checksum/structural attestor (with the checksum computed over the *decoded characters*, not trusted metadata) |
| `cross_channel` | two independent channels agree on the normalized value (MRZ↔VIZ, QR↔print, barcode↔OCR, text-layer↔render) |
| `arithmetic_closure` | the value participates in a satisfied closure equation (table sums, qty×unit) |
| `template_consistency` | value read from a template ROI with alignment inlier ratio ≥ threshold **and** grammar-valid **and** family has ≥ 2 confirmed historical records of this field (template alone never confirms on the first repeat) |
| `quorum` | dual-channel re-reads agree (I6) |
| `native_digital` | value parsed from digital file structure — exact by construction |
| `user_confirmed` | explicit user action (correction/approval) |

Statuses `needs_review / conflict / invalid / missing` follow the existing verifier enum with its
precedence (rejected > missing > conflict > invalid > needs_review > confirmed) — the current
tested `src/verifier` becomes a consumer of solver output rather than a parallel truth.

## 6. The Attestor Registry (`src/attestors/`) — one file + dense tests each

| # | Attestor | Algorithm | Self-label |
|---|---|---|---|
| 1 | `mrz-td1/td2/td3` | ICAO 9303 7-3-1 check digits + composite | passport/ID identity fields |
| 2 | `iban` | ISO 7064 mod-97-10 (rearrange + base-36 expand) | bank account |
| 3 | `luhn` | mod-10 doubling | card number (with IIN table #4), IMEI (#13) |
| 4 | `card-iin` | IIN ranges + length + Luhn fusion | card scheme |
| 5 | `verhoeff-aadhaar` | Verhoeff dihedral D5 over 12 digits | Aadhaar |
| 6 | `gstin` | 15-char structure + mod-36 check char (also embeds PAN at 3–12) | Indian GSTIN |
| 7 | `pan-in` | `[A-Z]{5}[0-9]{4}[A-Z]` + 4th-char holder-type table | Indian PAN |
| 8 | `vin` | ISO 3779 transliteration + weighted mod-11 (pos 9) | vehicle VIN |
| 9 | `isbn10` | mod-11 (X allowed) | ISBN |
| 10 | `isbn13/ean13` | mod-10 weights 1/3 | ISBN-13, EAN-13 |
| 11 | `ean8` / `upc-a` | mod-10 weights | retail codes |
| 12 | `isin` | ISO 6166: base-36 expand + Luhn | securities |
| 13 | `imei` | 15 digits + Luhn | device identity |
| 14 | `imo` | weighted 7..2 sum, last digit | vessel number |
| 15 | `nhs` | mod-11 weighted 10..2 | UK NHS number |
| 16 | `ssn-structure` | area/group/serial structural rules (no checksum exists — structural only, never confirms alone) | US SSN (structural mark) |
| 17 | `date-valid` | proleptic-Gregorian calendar validity + plausibility windows (DOB ∈ [now−120y, now]; expiry ∈ [now−20y, now+20y]) | typed date |
| 18 | `cross-date` | expiry > issue; DOB < issue; MRZ dates ≡ VIZ dates | date set coherence |
| 19 | `amount-closure` | Σ lines = subtotal; subtotal + tax − discount = total; qty×unit = line (ε = max(0.01, 0.5 % )) | table/total amounts |
| 20 | `gs1-128` | Application Identifier structure + embedded check digits | logistics labels |
| 21 | `epc-qr` | EPC069-12 SEPA payload grammar (BIC/IBAN/amount fields) → cross-attests printed fields | payment QR |
| 22 | `swiss-qr` | Swiss QR-bill payload grammar | payment QR |
| 23 | `upi-qr` | UPI URI grammar (`pa`, `am`, `tn`…) | payment QR |
| 24 | `aamva-pdf417` | AAMVA DL/ID element structure → cross-attests every printed license field | driver's licenses |
| 25 | `boarding-bcbp` | IATA BCBP structure | boarding passes |

Registry mechanics: every token stream (OCR lines, decoded payload fields, native cells) is
scanned by all pattern-gated attestors; hits attach `{ kind:'checksum', attestor }` and a semantic
tag that can *create* a field slot even with no label detected (self-labeling, N5). Structural-only
attestors (e.g., #16) attach marks but never grant confirmation alone.

## 7. Quorum channel (I6, P5.3)

For **critical** fields (money, IDs, dates) that survive with zero attestations: re-OCR the value
ROI through a decorrelated channel (binarized+deskewed variant, or the alternate recognizer tier);
normalize both reads; equality ⇒ `quorum` attestation; inequality ⇒ conflict with both candidates
shown. Never invoked for fields already attested — compute goes only where proof is missing (I10).

## 8. Failure semantics

- No candidates → `missing` (+ question if the schema requires the field).
- Candidates, no attestation → `needs_review` with best candidate pre-filled but visually marked.
- Contradictory attested channels (e.g., QR ≠ print) → `conflict`, both values + evidence shown —
  this is a *feature*: the engine caught a real-world inconsistency.
- Attestor bug discovered → the attestor is disabled by one registry line and every affected
  historical record is re-flagged by Shadow CI replay (I11) — the design makes even our own bugs
  loud instead of silent.
