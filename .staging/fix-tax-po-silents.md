# STAGED: tax/po silent fixes (apply with apply-post-chain.ps1 batch, then re-gate tax/po)

## Class A — generic-layer names + vendor (tax full_name "KENJINAKAMURA", po vendor "…Ld")
The non-identity-name review-cap exists ONLY in the registry (knownFields) loop and only for
valueType 'name'. Two gaps: (1) generic layer has no name cap; (2) 'vendor' is typed text.

### A1. App.tsx — registry loop: extend the cap condition
Find (in the knownFields loop):
```ts
          if (
            f.valueType === 'id_number' ||
            (f.valueType === 'name' && !isIdentityDoc)
          ) {
```
Replace with:
```ts
          if (
            f.valueType === 'id_number' ||
            ((f.valueType === 'name' || f.canonicalLabel === 'vendor') && !isIdentityDoc)
          ) {
```
(reason string already generic enough; vendor = org name, same no-attestor argument)

### A2. App.tsx — generic loop (docType === 'generic'): add the same law
Inside `for (const g of extractGenericFields(...))` after the hypothesis is created
(mirror the registry loop's hypReviewCaps.set pattern):
```ts
          // N1: names/identifiers read by the GENERIC layer have no attestor
          // (live-caught: "KENJINAKAMURA" confirmed on a tax form — the
          // registry path had this law, the generic path did not).
          if (
            g.valueType === 'id_number' ||
            g.valueType === 'name' ||
            g.canonicalLabel === 'vendor' ||
            g.canonicalLabel === 'full_name'
          ) {
            hypReviewCaps.set(
              h,
              'Read from pixels alone by the generic layer — no attestor; review required.',
            );
          }
```
(verify variable names against the actual generic loop when applying)

## Class B — PO/invoice closure (po total "9,399.42" vs 41204.78 on a CLEAN rung)
Wrong amount paired as total; POs and invoices publish subtotal + tax = total.
Extend `closureFamilies` in App.tsx — IMPORTANT nuance vs bank/payslip: many invoices
legitimately show ONLY a total, so this family must cap ONLY when all three terms are
present AND the equation fails (missing terms ≠ unevaluable-cap, unlike bank).

In the closure block, extend the ternary:
```ts
            : docType === 'invoice'
              ? [{
                  terms: ['subtotal', 'tax', 'total'],
                  // Cap only on PROVEN contradiction: all three present and
                  // the printed math does not close (invoices often omit
                  // subtotal/tax legitimately — absence is not evidence).
                  holds: ([s, t, tot]) =>
                    s === null || t === null || tot === null || s + t === tot,
                }]
              : [];
```
(replace the existing `: [];` tail; verify the engine's docType for PO renders — if the
classifier says 'generic' for POs, ALSO compute this over the generic-extracted amounts,
or accept Class-A caps as the interim and note it.)

## Post-apply
node bench/gate.mjs --corpus tax  → expect SILENT=0
node bench/gate.mjs --corpus po   → expect SILENT=0
Commit baselines on exit 0. Recall may dip slightly (capped fields still count as hits —
verify no floor breach; floors are 0.4 clean / 0.2 degraded).
