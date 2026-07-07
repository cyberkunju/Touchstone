# 01 — Product & Features

What the Attestation Engine is for its user: capabilities, journeys, and the metric that rules them.

---

## 1. Product in one paragraph

A private, self-hosted workspace organized as **document-family tabs**. Drop any file in — the
engine studies it, builds an editable form with every field pinned to visible evidence, and asks
about anything it cannot prove. Approve/correct once and the family is learned: from then on,
every similar document — added one at a time or in bulk — fills instantly, lands as a row in the
family's records table, and the whole table exports to Excel at any time. Different documents
never pollute each other: an unknown upload becomes a *draft family* awaiting approval. With
every correction the engine gets measurably better at *your* documents on *your* scanner —
without any training, cloud, or subscription.

## 2. Feature register (F1–F20)

| ID | Feature | Definition of working | Phase |
|---|---|---|---|
| F1 | Universal intake | Any file routed by magic bytes (never extension): images (JPEG/PNG/WebP/TIFF/BMP), PDF (digital/scanned/hybrid), XLSX/XLS/CSV/ODS, DOCX/ODT | P2 (images+PDF), P3 (all) |
| F2 | Evidence extraction | OCR w/ per-char lattices, layout zones, codes, faces, tables, native cells — all with coordinates + provenance | P1–P4 |
| F3 | Form generation | Unknown document → proposed form (fields typed, labeled, ordered) from primitives + attestors, zero doc-type code | P1, P5 |
| F4 | Correction UI | Every field editable; edits recorded as first-class evidence; crops adjustable | P1–P2 |
| F5 | Template learning | Approved corrections → versioned TemplateGraph per family | P1 |
| F6 | Instant refill | Known template: ≤ 1.5 s to verified filled form (JIT plan) | P1, hardened P3+ |
| F7 | Family tabs | Workspace = tabs; each family: form schema + templates + records table | P2 |
| F8 | Records table | Append-only rows: values, statuses, justifications, asset crops, source ref | P2 |
| F9 | Bulk queue | N mixed files at once; concurrency-capped; per-file failure isolation; live streaming into table | P2 |
| F10 | Auto-routing + draft families | Upload routed by document identity; unknown → draft family awaiting approval; wrong-tab pollution impossible | P2 |
| F11 | Export | Family records → XLSX / CSV / JSON + asset files; optional provenance columns; fully client-side | P2 |
| F12 | Perfect asset crops | Passport photo (face-aligned, ratio-normalized), signature (transparent ink PNG), stamps/seals (masked crops) | P1 (photo/signature), P4 (stamps) |
| F13 | MRZ + codes | Checksum-guided MRZ decoding; QR/PDF417/Aztec/DataMatrix/1D payloads as ground truth; cross-attestation vs printed text | P1 (MRZ), P4 (full codes) |
| F14 | Tables | Ruled + borderless reconstruction; arithmetic closure proves them; single-cell auto-repair | P4 |
| F15 | Review lane + smart questions | Unproven fields queue per family; questions ranked by information gain, top 1–3 asked | P2, P6 |
| F16 | Learning without training | Confusion priors from checksum-verified reads; format priors per family; measurable improvement | P6 |
| F17 | Shadow CI | User's corrected archive replays on every update; regressions block | P6 |
| F18 | Offline self-host | One-command install; loopback service + browser UI; zero network at runtime | P3, P7 |
| F19 | Hardware profiles | `lite` (4 GB) / `full` (8 GB+) — automatic model tiering | P3 |
| F20 | Dedupe | Exact re-upload detected by hash → instant answer from stored record | P2 |

## 3. User journeys (normative)

**J1 — First passport.** Upload photo → streaming extraction (first verified fields ≤ 1.5 s) →
form appears: MRZ-attested fields green/confirmed, others amber with evidence crops → user fixes
2 fields, approves → "Save as family: Passports" → template learned, record #1 stored.

**J2 — Second passport.** Upload → identity match (family) → JIT extraction ≤ 1.5 s → all
attestable fields confirmed, record #2 appended. Zero questions if fully attested (STP hit).

**J3 — Bulk.** Drag 40 mixed passport scans + 2 PDFs onto the family → queue processes at
concurrency 2 → rows stream in → review lane shows only the 3 documents with unproven fields →
user answers batched questions → table complete → Export XLSX.

**J4 — Wrong document.** User drops an invoice while the Passports tab is open → identity match
fails → engine studies it, proposes draft family "Invoices?" with a generated form → user approves
(or edits schema first) → new tab. The passports table was never touched.

**J5 — Bad scan.** Blurred passport → quality gate flags it → extraction proceeds cautiously →
MRZ checksums unreachable → fields amber, banner suggests rescan → nothing silently guessed.

**J6 — Update day.** New app version → Shadow CI replays the user's archive → one regression
found → update blocked with a field-level diff report. Trust preserved.

## 4. Input matrix

| Route | Formats | Method | OCR? |
|---|---|---|---|
| Native spreadsheet | XLSX, XLSM, XLS, ODS, CSV | openpyxl / csv — exact cells, formulas, formats | Never |
| Native document | DOCX, ODT | python-docx — runs, tables, embedded images (images recurse to vision) | Only embedded images |
| Digital PDF | text-layer PDFs | pypdfium2 text spans + boxes | Never |
| Scanned PDF | raster-only PDFs | pypdfium2 rasterize → vision ladder | Yes |
| Hybrid PDF | text layer + raster | Both; text-layer claims verified against rendered sample; mismatch ⇒ vision wins + flag | Verification sample |
| Image | JPEG, PNG, WebP, TIFF, BMP | vision ladder | Yes |
| Unknown bytes | anything else | rejected with explicit `UNSUPPORTED_TYPE` — never guessed | — |

## 5. The metric that rules the product

**STP — straight-through rate**: % of uploads per family completed with zero human touches.
Secondary: questions-per-document (should decay per family), time-to-first-verified-field,
export correctness. The one absolute gate above all: **critical silent-error count = 0**.

## 6. Non-goals (inherited and extended)

No cloud/multi-user sync · no fraud/authenticity forensics · no face *recognition* (detection
only) · no legal/financial advice · no template marketplace · no LLM chat interface · no
mobile-native apps in v1 · no perfect cursive handwriting promise (printed-form handwriting only).
