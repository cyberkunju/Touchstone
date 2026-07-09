/**
 * P7.1 — performance budgets as tests (Documentation/13).
 *
 * Two halves:
 *  - SERVICE budgets (runnable anytime): /v1/health latency, digital-file
 *    throughput, resident memory — measured against the real service.
 *  - BROWSER budgets (needs the harness; auto-skips while a gate chain
 *    owns it): known-template ≤ 1.5s, unknown-doc-full ≤ 8s on the lite
 *    profile, measured through the same puppeteer path as the gate.
 *
 * Budgets are LAWS from 13 — this file only encodes them. Run:
 *   node bench/perf.mjs             # all available halves
 *   node bench/perf.mjs --service   # service half only
 *
 * Exit code 1 on any budget breach (CI-ready).
 */
import { execSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const BUDGETS = {
  healthMs: 50,
  digitalPerPageMs: 1000 / 25, // ≤ 1 s per 25 pages-or-sheets
  digitalSingleFileMs: 1000,   // any single small native file
  serviceResidentMB: 450,
};

const args = process.argv.slice(2);
const serviceOnly = args.includes('--service');
let failures = 0;

function check(name, actual, budget, unit) {
  const ok = actual <= budget;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${actual.toFixed(1)}${unit} (budget ${budget}${unit})`);
  if (!ok) failures++;
}

/* ------------------------------- service half ----------------------------- */
async function serviceHalf() {
  console.log('=== service budgets (13 §2-3) ===');
  // P7.3 bearer handshake: pin a harness token (the service reads
  // DOCUTRACT_TOKEN; data endpoints 401 without it — by design).
  const TOKEN = 'perf-harness-token';
  const AUTH = { Authorization: `Bearer ${TOKEN}` };
  const proc = spawn('python', ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8478', '--log-level', 'error'],
    { cwd: join(root, 'service'), stdio: 'ignore', env: { ...process.env, DOCUTRACT_TOKEN: TOKEN } });
  try {
    // Wait for boot.
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      try {
        const r = await fetch('http://127.0.0.1:8478/v1/health');
        up = r.ok;
      } catch { await new Promise((r) => setTimeout(r, 250)); }
    }
    if (!up) throw new Error('service failed to boot');

    // /v1/health ≤ 50 ms (median of 20, after warmup — never loads models).
    const times = [];
    for (let i = 0; i < 25; i++) {
      const t0 = performance.now();
      await fetch('http://127.0.0.1:8478/v1/health');
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    check('/v1/health median', times[Math.floor(times.length / 2)], BUDGETS.healthMs, 'ms');

    // Digital file ≤ 1 s (single-sheet xlsx, no inference).
    const xlsx = readFileSync(join(root, 'test_cases/native_files/ledger_00.xlsx'));
    const form = new FormData();
    form.append('file', new Blob([xlsx]), 'ledger.xlsx');
    const t0 = performance.now();
    const res = await fetch('http://127.0.0.1:8478/v1/perceive', { method: 'POST', body: form, headers: AUTH });
    const elapsed = performance.now() - t0;
    if (!res.ok) throw new Error(`perceive failed: ${res.status}`);
    check('digital xlsx perceive', elapsed, BUDGETS.digitalSingleFileMs, 'ms');

    // Resident memory ≤ 450 MB (python RSS after the digital route).
    const rss = Number(execSync(
      `powershell -NoProfile -Command "(Get-Process -Id ${proc.pid}).WorkingSet64 / 1MB"`,
    ).toString().trim());
    check('service resident RSS', rss, BUDGETS.serviceResidentMB, 'MB');
  } finally {
    proc.kill();
  }
}

/* ------------------------------- browser half ----------------------------- */
async function browserHalf() {
  console.log('=== browser budgets (13 §3) — needs the harness ===');
  // Refuse to fight a running gate for the shared profile (one-harness law).
  const gates = execSync(
    'powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \\"Name=\'node.exe\'\\" | Where-Object { $_.CommandLine -match \'gate\' } | Measure-Object).Count"',
  ).toString().trim();
  if (Number(gates) > 0) {
    console.log('SKIP  browser budgets: a gate chain owns the harness (rerun when free)');
    return;
  }
  if (!existsSync(join(root, '.puppeteer-profile'))) {
    console.log('SKIP  browser budgets: no harness profile yet');
    return;
  }
  const { default: puppeteer } = await import('puppeteer');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox'],
    userDataDir: join(root, '.puppeteer-profile'),
  });
  try {
    const page = await browser.newPage();
    // Throttle to the lite profile floor (4 cores-ish): 2x CPU slowdown.
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 2 });
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 60000 });

    // Unknown doc — full verified form ≤ 8 s (clean passport, throttled).
    // Methodology per 13 §6: model/session warmup is one-time setup, NOT
    // per-document cost — one untimed warmup upload loads the ONNX sessions,
    // then budgets assert on the MEDIAN of 3 timed runs.
    const img = join(root, 'test_cases/passports/synthetic/id00_clean.png');
    const timeOneUpload = async () => {
      const input = await page.waitForSelector('input[type=file]', { timeout: 15000 });
      // Attach the completion listener BEFORE uploading — a fast doc could
      // emit its [GATE] line before a late listener exists (measured-race).
      const done = new Promise((resolveWait) => {
        const timer = setTimeout(resolveWait, 60000);
        const onMsg = (msg) => {
          if (msg.text().startsWith('[GATE]')) {
            clearTimeout(timer);
            page.off('console', onMsg);
            resolveWait();
          }
        };
        page.on('console', onMsg);
      });
      const t0 = performance.now();
      await input.uploadFile(img);
      await done;
      return performance.now() - t0;
    };
    await timeOneUpload(); // warmup: session + dictionary load (untimed)
    const runs = [];
    for (let i = 0; i < 3; i++) {
      // Reset via the app's own Clear Document control — sessions stay hot;
      // steady-state per-document cost is what the 13 §3 budget governs.
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find((b) =>
          b.textContent?.includes('Clear Document'),
        );
        if (!btn) throw new Error('Clear Document button not found');
        btn.click();
      });
      runs.push(await timeOneUpload());
    }
    runs.sort((a, b) => a - b);
    check('unknown doc full form (throttled 2x, median of 3)', runs[1], 8000, 'ms');

    // Known template (I8) ≤ 1.5 s — learn a template from a solved COMMERCE
    // doc (identity/MRZ templates are excluded from the sparse path by
    // design: MRZ proofs need the full ladder), then re-uploads of the same
    // layout ride the sparse anchor-probe refill. Same 2× throttle +
    // median-of-3 discipline. A breach is REPORTED, never hidden (13 §4).
    const invImg = join(root, 'test_cases/docs/synthetic/inv00_clean.png');
    const timeInvoice = async () => {
      const input = await page.waitForSelector('input[type=file]', { timeout: 15000 });
      const done = new Promise((resolveWait) => {
        const timer = setTimeout(resolveWait, 120000);
        const onMsg = (msg) => {
          if (msg.text().startsWith('[GATE]')) {
            clearTimeout(timer);
            page.off('console', onMsg);
            resolveWait();
          }
        };
        page.on('console', onMsg);
      });
      const t0 = performance.now();
      await input.uploadFile(invImg);
      await done;
      return performance.now() - t0;
    };
    const clearDoc = () =>
      page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find((b) =>
          b.textContent?.includes('Clear Document'),
        );
        if (!btn) throw new Error('Clear Document button not found');
        btn.click();
      });
    await clearDoc();
    await timeInvoice(); // solve the invoice once (full ladder, untimed)
    await page.evaluate(() => {
      window.prompt = () => 'PerfBudgetTemplate';
      window.alert = () => {};
    });
    let refillSeen = false;
    const onRefill = (msg) => {
      if (msg.text().includes('template refill')) refillSeen = true;
    };
    page.on('console', onRefill);
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        b.textContent?.includes('Save Template'),
      );
      if (!btn) throw new Error('Save Template button not found');
      btn.click();
    });
    await new Promise((r) => setTimeout(r, 1500)); // template persistence
    const tplRuns = [];
    for (let i = 0; i < 3; i++) {
      await clearDoc();
      tplRuns.push(await timeInvoice());
    }
    page.off('console', onRefill);
    tplRuns.sort((a, b) => a - b);
    if (!refillSeen) {
      console.log('FAIL  known-template path never engaged (no refill diag) — template match broken');
      failures++;
    } else {
      check('known template refill (throttled 2x, median of 3)', tplRuns[1], 1500, 'ms');
    }
    // HARNESS HYGIENE: the profile is SHARED with the gate chain — a
    // leftover perf template would hijack gate documents into the refill
    // path and corrupt scores. Delete it surgically from the store.
    await page.evaluate(async () => {
      const db = await new Promise((res, rej) => {
        const req = indexedDB.open('docgraph-engine-db');
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
      await new Promise((res, rej) => {
        const tx = db.transaction('templates', 'readwrite');
        const store = tx.objectStore('templates');
        const all = store.getAll();
        all.onsuccess = () => {
          for (const t of all.result) {
            if (t.name === 'PerfBudgetTemplate') store.delete(t.id);
          }
        };
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
      db.close();
    });
  } finally {
    await browser.close();
  }
}

/* --------------------------------- runner --------------------------------- */
try {
  await serviceHalf();
  if (!serviceOnly) await browserHalf();
} catch (e) {
  console.error(`perf harness error: ${e.message}`);
  failures++;
}
console.log(failures === 0 ? 'ALL BUDGETS GREEN' : `${failures} BUDGET BREACH(ES)`);
process.exit(failures === 0 ? 0 : 1);
