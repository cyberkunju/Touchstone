# STAGED: gate.mjs mixed-page scoring (apply post-chain, before the first mixed gate)

## 1. CORPUS_DIRS — add:
```js
  mixed: 'mixed',
```

## 2. BASELINE_FILES — add:
```js
  mixed: 'mixed.json',
```

## 3. Class rule — insert BEFORE the final `} else {` default rule:
```js
  } else if (entry.class === 'mixed_page') {
    // Multi-document pages: every constituent's truth scores independently.
    // THE mixed silent class: a field CONFIRMED with a value that belongs to
    // the OTHER constituent (cross-document bleed) — checked by testing each
    // confirmed value against the other doc's truth pool.
    const allTruths = entry.constituents.map((c) =>
      new Map(Object.entries(c.truth).filter(([k]) => k !== 'mrzLines' && k !== 'barcodePayload' && k !== 'checkedStates')));
    r.fieldTotal = allTruths.reduce((s, t) => s + t.size, 0);
    const seen = new Set();
    for (const f of gate.fields) {
      const key = truthKeyFor(f.label);
      if (!key || f.value === null) continue;
      // A field matching ANY constituent's truth for that key = hit.
      let matched = false;
      for (let ci = 0; ci < allTruths.length; ci++) {
        if (allTruths[ci].has(key) && valuesMatch(key, allTruths[ci].get(key), f.value)) {
          if (!seen.has(`${ci}:${key}`)) { seen.add(`${ci}:${key}`); }
          matched = true;
          break;
        }
      }
      if (matched) continue;
      // Confirmed + wrong for every constituent that HAS this key = silent.
      if (f.status === 'confirmed' && allTruths.some((t) => t.has(key))) {
        r.silentErrors.push({ field: key, got: f.value, want: allTruths.map((t) => t.get(key)).filter(Boolean).join(' | ') });
      }
    }
    r.fieldHits = seen.size;
    // Floors start permissive (single-doc assumption in the pipeline today);
    // SILENT=0 is the law from day one.
    r.pass = r.silentErrors.length === 0;
  } else {
```

## 4. Post-apply: `node bench/corpus/compile-mixed.cjs` → `node bench/gate.mjs --corpus mixed`
Expected honest outcome today: low recall (the pipeline assumes one document/page —
detection region-splitting is future work); the LAW is zero cross-document confident bleed.
Commit baseline on exit 0.
