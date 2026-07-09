/**
 * Multi-page PDF e2e: upload a 2-page digital invoice, assert the
 * continuation pass ran, page-2 fields were extracted, and THE
 * CONTINUATION LAW held (page-2 scalars review-capped, never confirmed).
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const WORKSPACE = __dirname;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const browserPaths = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

async function launch() {
  const opts = { headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader'], protocolTimeout: 600000 };
  try { return await puppeteer.launch(opts); } catch (e) {
    for (const p of browserPaths) if (fs.existsSync(p)) return puppeteer.launch({ ...opts, executablePath: p });
    throw e;
  }
}

(async () => {
  const browser = await launch();
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(m.text()));
  let failures = 0;
  const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failures++; };

  try {
    await page.goto('http://localhost:5174/', { waitUntil: 'networkidle2', timeout: 60000 });
    await delay(1500);
    const input = await page.waitForSelector('input[type=file]', { timeout: 30000 });
    await input.uploadFile(path.join(WORKSPACE, 'test_cases', 'native_files', 'invoice_multipage.pdf'));

    const t0 = Date.now();
    let gate = null;
    while (Date.now() - t0 < 480000) {
      const g = logs.find((l) => l.startsWith('[GATE] '));
      if (g) { gate = JSON.parse(g.slice(7)); break; }
      await delay(1000);
    }
    check('pipeline completed with a [GATE] line', !!gate);
    check('continuation pass logged page 2', logs.some((l) => l.includes('continuation page 2:')));

    const fields = gate ? gate.fields : [];
    const byLabel = (rx) => fields.filter((f) => rx.test(f.label));
    const po = byLabel(/po.?number/i)[0];
    check('page-2 field extracted (PO Number)', !!po && /PO-77-4412/.test(po.value ?? ''));
    check('CONTINUATION LAW: page-2 scalars never confirmed',
      byLabel(/po.?number|delivery|contact/i).every((f) => f.status !== 'confirmed'));

    const inv = fields.find((f) => /invoice.?number/i.test(f.label));
    check('page-1 fields intact (invoice number present)', !!inv && /INV-2031-889/.test(inv.value ?? ''));
    const total = fields.find((f) => /^total/i.test(f.label));
    check('page-1 closure math intact (total extracted)', !!total && /1,?296/.test(total.value ?? ''));

    console.log(failures === 0 ? '\nMULTI-PAGE E2E: ALL PASS' : `\nMULTI-PAGE E2E: ${failures} FAILURE(S)`);
    console.log('\nfields:', fields.map((f) => `${f.label}=${f.value} [${f.status}]`).join('\n        '));
    process.exitCode = failures === 0 ? 0 : 1;
  } catch (e) {
    console.error('E2E error:', e.message);
    console.log('recent logs:', logs.slice(-15).join('\n'));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
