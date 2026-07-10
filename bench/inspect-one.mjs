/**
 * SINGLE-IMAGE INSPECTOR — run ONE arbitrary image through the live app and
 * dump everything the engine believed: every hypothesis (label, canonical
 * label, value, status, box, reasons), the [GATE] summary, and a screenshot
 * of the full UI (viewer overlay + form panel) for human/vision comparison.
 *
 * Usage:
 *   node bench/inspect-one.mjs <image-path> [--out <prefix>]
 *
 * Requires the dev server at :5173 (bun run dev).
 */
import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const imgArg = process.argv[2];
if (!imgArg) {
  console.error('usage: node bench/inspect-one.mjs <image-path>');
  process.exit(2);
}
const imgPath = resolve(imgArg);
const outIdx = process.argv.indexOf('--out');
const outPrefix = outIdx > -1 ? process.argv[outIdx + 1] : basename(imgPath).replace(/\.[^.]+$/, '');
const outDir = join(root, 'test_screenshots', 'inspect');
mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  headless: process.argv.includes('--headful') ? false : 'new',
  // --chrome: use the INSTALLED Chrome (real WebGPU) instead of bundled
  // Chromium — execution-provider bugs only reproduce there.
  ...(process.argv.includes('--chrome') ? { channel: 'chrome' } : {}),
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  protocolTimeout: 20 * 60 * 1000,
  userDataDir: join(root, process.argv.includes('--chrome') ? '.chrome-profile' : '.puppeteer-profile'),
  defaultViewport: { width: 1600, height: 1200, deviceScaleFactor: 1 },
});

try {
  const page = await browser.newPage();
  page.on('dialog', (d) => d.dismiss().catch(() => {}));

  let gate = null;
  let graph = null;
  const diag = [];
  let settle = null;
  const done = new Promise((r) => { settle = r; });

  page.on('console', async (m) => {
    const t = m.text();
    if (/^\[(DIAG|App)\]/.test(t)) diag.push(t.slice(0, 500));
    if (t.startsWith('[App] DocGraph successfully verified')) {
      try {
        const args = m.args();
        if (args[1]) graph = await args[1].jsonValue();
      } catch (e) {
        diag.push(`(graph capture failed: ${e.message})`);
      }
    }
    if (t.startsWith('[GATE] ')) {
      try { gate = JSON.parse(t.slice(7)); } catch { gate = null; }
      settle?.();
    } else if (t.startsWith('Processing failed:')) {
      // Expand the error argument — the alert only says "see console".
      try {
        const args = m.args();
        for (const a of args.slice(1)) {
          const detail = await a.evaluate((v) => (v && v.stack) ? v.stack : String(v)).catch(() => null);
          if (detail) diag.push(`ERROR DETAIL: ${String(detail).slice(0, 900)}`);
        }
      } catch { /* best effort */ }
      diag.push(t.slice(0, 900));
      settle?.();
    }
  });
  page.on('pageerror', (e) => { diag.push(`pageerror: ${e.message}`); settle?.(); });

  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const input = await page.waitForSelector('input[type="file"]', { timeout: 30000 });
  const t0 = Date.now();
  await input.uploadFile(imgPath);
  await Promise.race([done, new Promise((r) => setTimeout(r, 6 * 60 * 1000))]);
  const ms = Date.now() - t0;

  // Let the UI settle, then screenshot the whole app.
  await new Promise((r) => setTimeout(r, 1500));
  const shotPath = join(outDir, `${outPrefix}.ui.png`);
  await page.screenshot({ path: shotPath, fullPage: true });

  const hyps = (graph?.hypotheses ?? []).map((h) => ({
    id: h.id,
    label: h.label,
    canonicalLabel: h.canonicalLabel ?? null,
    value: typeof h.value === 'string' ? h.value : (h.value == null ? null : JSON.stringify(h.value).slice(0, 300)),
    type: h.valueType,
    status: h.status,
    confidence: h.confidence,
    boxNorm: h.boxNorm ?? null,
    reasons: (h.reasons ?? []).slice(0, 4),
  }));

  const report = { image: imgPath, ms, gate, hypotheses: hyps, diag: diag.slice(-40) };
  const jsonPath = join(outDir, `${outPrefix}.json`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  console.log(`\n=== INSPECT ${basename(imgPath)} (${ms} ms) ===`);
  console.log(`mrzValid=${gate?.mrzValid ?? 'n/a'}  hypotheses=${hyps.length}`);
  for (const h of hyps) {
    const box = h.boxNorm ? `[${h.boxNorm.map((v) => v.toFixed(3)).join(',')}]` : '(no box)';
    console.log(`  ${String(h.status).padEnd(14)} ${String(h.label).padEnd(28)} = ${String(h.value).slice(0, 60).padEnd(60)} ${box}`);
  }
  console.log(`\nUI screenshot: ${shotPath}`);
  console.log(`Full report:   ${jsonPath}`);
} finally {
  await browser.close();
}
