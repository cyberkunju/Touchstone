# STAGED src/ patch — apply when chain ends (with the .staging/src-patches moves)

## Fix 1: country_code truncation silent (ids chain verdict, td1_id12/16 rot3)
File: src/docgraph/field-extraction.ts (~line 109)
Change:
```
    valuePattern: /^[A-Z]{2,3}$/i,
```
to:
```
    // ICAO 9303 country codes are EXACTLY alpha-3. Accepting 2 letters makes
    // a clipped read ("UTO" -> "TO" under rotation) unfalsifiable — the
    // truncation IS a valid-looking value. Exact length or no pairing
    // (live-caught: 2 silents in the deepened TD1 corpus).
    valuePattern: /^[A-Z]{3}$/i,
```
(the entry is `canonicalLabel: 'country_code'` — do NOT touch the neighboring
`/^[A-Z]{1,2}$/i` entry above it, that's a different field.)

## Post-apply
1. npx tsc --noEmit && npm test
2. node bench/gate.mjs --corpus ids   → expect silents=0 (recall on those 2 rungs may
   drop by one field — acceptable; review > silent)
3. exit 0 ⇒ commit baseline: Copy-Item bench/baselines/last-run.json bench/baselines/ids.json
