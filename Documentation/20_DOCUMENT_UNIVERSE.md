# 20 — THE DOCUMENT UNIVERSE (target coverage map)

The platform's promise: **photograph or scan ANY document → structured, verified form →
export anywhere.** Passports were the *proving ground* (hardest verification math, worst
adversarial pressure) — not the product. This is the full universe, organized by the
*capability* each family actually requires, so every engineering investment unlocks a whole
tier, never one document type (Constitution N5: no doc-type code paths — families share
primitives).

Provenance grades for all test data (see `test_cases/README.md`):
- **G1 math-verified** — checksums / arithmetic closure prove the label (strongest).
- **G2 cross-source** — two independent systems agree (our engine ↔ external OCR).
- **G3 silver** — single independent source; polices contradictions, never confirms.
- **G4 human** — reviewed by a person; required where no math exists.
- **R refusal** — the label is "this must NOT be claimed" (fakes, negatives).

---

## TIER 1 — Machine-verifiable identity (checksum math exists → G1 labels possible)

| Family | Verification anchor | Status |
|---|---|---|
| Passports (TD3) | ICAO 9303 check digits, composite | ✅ **Certified** (138 themed + 45 real-fake refusal + composites) |
| ID cards (TD1/TD2) | ICAO 9303 (3-line / 2-line MRZ) | ✅ **Certified 84/84** (k=8 projection fix) |
| Visas (MRV-A/MRV-B) | ICAO 9303 TD2-like | Corpus BUILT (40) — parser needs MRV format (next primitive) |
| Residence permits | ICAO TD1/TD2 | Corpus BUILT (40) — TD1 'IR' decodes with existing beam |
| Driving licenses (AAMVA) | PDF417 barcode = full duplicated payload | ✅ **Certified 84/84** — RS-proven fields promoted (parsers/aamva.ts) |
| Machine-readable travel docs (emergency, seafarer) | ICAO 9303 | Same primitives |

## TIER 2 — Arithmetic-verifiable commerce (numbers must add up → G1 by closure)

| Family | Verification anchor | Status |
|---|---|---|
| Invoices | line items × qty = totals; subtotal+tax=total | ✅ Certified 37/37 (docs corpus) |
| Receipts (retail/fuel/restaurant) | same arithmetic closure + totals | ✅ In docs corpus |
| Bank statements | running balance closure (opening+Σtx=closing) | Corpus BUILT (50, closure audited) — first gate exposed the TALL-PAGE detection limit (dense A4 captions fall below DBNet's 960px floor); adaptive det resolution is the next engine fix |
| Payslips | gross − deductions = net | Corpus BUILT (50, closure audited) — same tall-page fix pending |
| Tax forms (W-2/1099/VAT returns…) | box arithmetic + format grammars | Corpus BUILT (32, box math exact) |
| Purchase orders / quotes / delivery notes | totals closure + doc-number grammar | Corpus BUILT (32, closure exact) |
| Utility bills (electric/water/telecom) | amount grammars, account-number patterns, dates | Corpus BUILT (40, closure exact) |
| Insurance premium notices / EOBs | amount closure | Corpus BUILT (32, closure exact) |

## TIER 3 — Structured forms & tables (layout is the contract → template consensus)

| Family | Verification anchor | Status |
|---|---|---|
| Application forms (any org's blanks) | template family consensus — N same-layout docs vote | ✅ Form corpus green; template engine live (homography ladder) |
| Questionnaires / surveys | checkbox/mark detection + template ROIs | Checkbox primitive needed (P4) |
| Certificates (birth, marriage, death) | registrar number grammars, date plausibility, seals | Seal detection = PP-DocLayout `seal` class (P4) |
| Education certificates / transcripts | grade-table closure, institution templates | Table tier |
| Vehicle registration / titles | VIN check digit (ISO 3779 — REAL math!), plate grammars | VIN attestor = small grammar, big win |
| Property deeds / leases | parcel/registry number grammars, dates, parties | Template tier |
| Medical reports / lab results | reference-range tables, unit grammars, LOINC-ish codes | Table tier + unit grammar |
| Prescriptions | drug-name lexicon (hint not rule), dosage grammars | Handwriting-heavy — hardest |
| Insurance cards / policies | member-ID grammars, group numbers | ID-card primitives |
| Boarding passes / tickets | PDF417/Aztec barcode = full payload duplication | zxing TODAY — barcode↔print cross-check |
| Shipping labels / waybills | tracking-number check digits (UPS/FedEx/USPS mod-10/11!) | Grammar attestors — real math |
| Business cards | email/phone/URL grammars (already exist) | Generic layer |
| Letters / contracts | dates, parties, reference numbers; clause structure | Lowest verification; review-first posture |

## TIER 4 — Digital-native documents (text is EXACT → perception bypassed)

| Family | Route | Status |
|---|---|---|
| Digital PDFs | pypdfium2 text spans — zero OCR, exact truth | P3 service |
| Scanned PDFs | rasterize → vision pipeline | P3 service |
| Excel/CSV | openpyxl — exact cells | P3 service |
| Word documents | python-docx — exact runs | P3 service |
| Screenshots of documents | vision route + moiré/aliasing rungs in ladder | Degradation rung to add |
| Photos of screens | same + refresh-band artifacts | Degradation rung to add |

## TIER 5 — The adversarial & negative universe (refusal IS the product)

| Class | Expected behavior | Status |
|---|---|---|
| AI-generated fake IDs | MRZ checksum refusal | ✅ 21/21 refused (real_fakes corpus) |
| Tampered documents (VIZ ≠ MRZ) | conflict surfaced, never silent | ✅ conflict class green |
| Non-documents (book pages, screenshots, scenery) | no confident identity/money claims | ✅ negatives green |
| Blank forms (no filled values) | labels found, no values invented | Corpus needed |
| Wrong-language documents (Arabic/CJK/Cyrillic VIZ) | Latin fields extracted, rest honestly reviewed | Script-specific rec models (P3, PP-OCRv5 script pack) |
| Handwriting (cursive fills) | review-first, never silent confirm | Handwriting rungs in form corpus (partial) |

---

## The build law for this universe

1. **A new family enters by corpus, not by code.** First its `test_cases/` corpus (synthetic
   generator + real intake), THEN whatever primitive it needs. If extraction can't prove a
   value, the answer stays "review" — shipping a family ≠ claiming perfection on it.
2. **Every family gets its verification anchor identified up front** (the table columns
   above). No anchor → review-first posture is permanent and DOCUMENTED.
3. **The gate grows monotonically**: per-family ratchet baselines; SILENT=0 is universal law
   across all of them; recall ratchets upward per family.
4. Priority order = Tier order: identity (math) → commerce (arithmetic) → forms/tables
   (templates) → digital-native (exact) — each tier's primitives feed the next.
