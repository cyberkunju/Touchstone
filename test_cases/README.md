# test_cases/ — THE canonical test-data tree

Every image, manifest and label the project tests against lives here, organized by
**family / provenance / degradation**. Nothing in this tree is unlabeled: every file is
reachable from a `manifest.json` that states its truth and its provenance grade.

## Provenance grades (the trust ladder for labels)

| Grade | Meaning | Example |
|---|---|---|
| **G1** | Math-verified: checksums / arithmetic closure prove the label | synthetic passports (ICAO digits computed), invoice totals |
| **G2** | Cross-source: ≥2 independent systems agree | our engine ↔ Mistral OCR agreement |
| **G3** | Silver: single independent source — polices contradictions, never confirms | Mistral VIZ reads on fakes |
| **G4** | Human-reviewed | manual labels where no math exists |
| **R**  | Refusal label: the truth is "this must NOT be claimed" | AI-fake MRZs, non-documents |

## Tree

```
test_cases/
  README.md                      ← this file
  passports/
    synthetic/                   ← G1. Rendered by bench/corpus/compile.cjs (6 themes ×
      manifest.json                12 identities × 11 degradation rungs + conflict class).
      id00_clean.png …             Truth computed (ICAO check digits) — correct by math.
    real_fakes/                  ← R + G3. Photoreal AI-generated passports; every MRZ is
      manifest.json                checksum-INVALID (proven). Engine must refuse the MRZ.
      review.json                  Silver VIZ labels police confirmed-field contradictions.
      images/                      The 21 source images.
      ocr/                         Raw Mistral OCR markdown (audit trail, offline reruns).
    specimens/                   ← G1. ICAO 9303 official specimen + minimal fixture.
  docs/
    synthetic/                   ← G1 (totals closure) + R (negatives). Invoices, receipts,
      manifest.json                forms, hard negatives. Rendered by compile-docs.cjs.
  visual_goldens/                ← geometry ratchet for portrait/signature crops
      goldens.json                 (written by bench/goldens.mjs; crops for human eyes).
      *.png
```

## Rules

1. **No unlabeled files.** A file without a manifest entry does not exist for testing.
2. **Labels are math or nothing**: G1/G2 entries can score `confirmed` extractions; G3
   only flags contradictions; R entries demand refusal. Grades never get promoted silently.
3. **Generators own `synthetic/`** — those directories are BUILD OUTPUTS. Regenerate with:
   `node bench/corpus/compile.cjs` · `node bench/corpus/compile-docs.cjs`
   New real images: drop into `passports/real_fakes/images/` (or a new family dir) and run
   `npx vite-node bench/label-real.ts` — checksum-valid MRZs become G1 truth automatically;
   everything else lands in `review.json` for human labeling.
4. **The gate consumes this tree**: `node bench/gate.mjs [--corpus docs|real]`.
   Baselines (committed ratchets) stay in `bench/baselines/` — results, not data.
5. New document families (see `Documentation/20_DOCUMENT_UNIVERSE.md`) enter as new
   top-level dirs with the same provenance discipline: `id_cards/`, `licenses/`,
   `bank_statements/`, … — corpus first, code second.
