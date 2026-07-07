# Post-chain application script — refuses to run while any gate owns the harness.
# Applies: country-code law fix, staged src-patches (with import-path fixes),
# then typecheck + full unit suite. Gates printed for operator review, not auto-run.
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

# 0. Safety: never touch src/ while a gate runs (HMR law).
$gates = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'gate\.mjs' }
if ($gates) { throw "REFUSED: a gate chain is running (pid $($gates.ProcessId)). Wait for DEFINITIVE CHAIN DONE." }

# 1. Country-code law: ICAO alpha-3 exact (kills the 2 ids silents).
$fe = 'src/docgraph/field-extraction.ts'
$content = Get-Content $fe -Raw
$needle = "    canonicalLabel: 'country_code',`n    displayLabel: 'Country Code',`n    // 'country code' ONLY — never bare 'code'.`n    synonyms: ['country code'],`n    valueType: 'text',`n    required: false,`n    valuePattern: /^[A-Z]{2,3}$/i,"
$replacement = "    canonicalLabel: 'country_code',`n    displayLabel: 'Country Code',`n    // 'country code' ONLY — never bare 'code'.`n    synonyms: ['country code'],`n    valueType: 'text',`n    required: false,`n    // ICAO 9303 country codes are EXACTLY alpha-3: accepting 2 letters made a`n    // clipped read (`"UTO`" -> `"TO`" under rotation) unfalsifiable — 2 silents.`n    valuePattern: /^[A-Z]{3}$/i,"
if ($content.Contains("valuePattern: /^[A-Z]{3}$/i,")) {
  Write-Host "1. country_code already alpha-3 (idempotent skip)"
} elseif ($content.Contains($needle)) {
  Set-Content $fe ($content.Replace($needle, $replacement)) -NoNewline
  Write-Host "1. country_code -> exact alpha-3 APPLIED"
} else { throw "country_code block not found verbatim — inspect $fe manually" }

# 2. Move staged patches into src/ (idempotent: skips missing sources).
$moves = @(
  @{ from = '.staging/src-patches/geometry';        to = 'src/geometry';        items = @('phash.ts','phash.test.ts','phash.acceptance.test.ts','fixtures') },
  @{ from = '.staging/src-patches/workspace';       to = 'src/workspace';       items = @('export.ts','export.test.ts') },
  @{ from = '.staging/src-patches/workspace/ui';    to = 'src/workspace/ui';    items = @('windowing.ts','windowing.test.ts','review-lane.ts','review-lane.test.ts','schema-editor.ts','schema-editor.test.ts') },
  @{ from = '.staging/src-patches/perception';      to = 'src/perception';      items = @('client.ts','client.test.ts') },
  @{ from = '.staging/src-patches/docgraph';        to = 'src/docgraph';        items = @('checkbox.ts','checkbox.test.ts') },
  @{ from = '.staging/src-patches/lwt';             to = 'src/lwt';             items = @('shadow-ci.ts','shadow-ci.test.ts','question-ranking.ts','question-ranking.test.ts') }
)
foreach ($m in $moves) {
  New-Item -ItemType Directory -Force $m.to | Out-Null
  foreach ($item in $m.items) {
    $src = Join-Path $m.from $item
    if (Test-Path $src) { Move-Item $src (Join-Path $m.to $item) -Force; Write-Host "2. moved $src -> $($m.to)/" }
  }
}

# 3. Import-path fixes for the new locations.
$fixes = @(
  @{ file = 'src/workspace/export.ts';                 from = "from '../../../src/workspace/types'";    to = "from './types'" },
  @{ file = 'src/workspace/export.test.ts';            from = "from '../../../src/workspace/types'";    to = "from './types'" },
  @{ file = 'src/workspace/ui/schema-editor.ts';       from = "from '../../../../src/workspace/types'"; to = "from '../types'" },
  @{ file = 'src/workspace/ui/schema-editor.test.ts';  from = "from '../../../../src/workspace/types'"; to = "from '../types'" }
)
foreach ($f in $fixes) {
  if (Test-Path $f.file) {
    $c = Get-Content $f.file -Raw
    if ($c.Contains($f.from)) { Set-Content $f.file ($c.Replace($f.from, $f.to)) -NoNewline; Write-Host "3. import fixed in $($f.file)" }
  }
}

# 4. Prove it.
npx tsc --noEmit; if ($LASTEXITCODE -ne 0) { throw "tsc failed" }
npm run test; if ($LASTEXITCODE -ne 0) { throw "vitest failed" }
Write-Host ""
Write-Host "ALL GREEN. Operator gate sequence (run one at a time):"
Write-Host "  node bench/gate.mjs --corpus ids     # expect SILENT=0, then: Copy-Item bench/baselines/last-run.json bench/baselines/ids.json"
Write-Host "  node bench/gate.mjs --corpus utility # re-gate: SILENT=24 was a scorer bug (date DMY-vs-ISO, fixed in gate.mjs); expect SILENT=0"
Write-Host "  node bench/gate.mjs --corpus real    # 301 entries (~1.5h), then commit real.json"
Write-Host "  node bench/corpus/compile-mixed.cjs  # then wire gate scoring (.staging/gate-mixed-patch.md) + first mixed gate"
Write-Host "  node bench/perf.mjs                  # browser half now that the harness is free"
Write-Host "Then: Remove-Item .staging -Recurse -Force"
