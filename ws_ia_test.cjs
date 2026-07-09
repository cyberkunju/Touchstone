/**
 * Workspace IA e2e (P2.4): upload → auto-file → Workspace tab → family →
 * records table → record detail → user edit. Real engine, real Chromium.
 * Requires the dev server on :5173.
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const WORKSPACE = __dirname;
const SHOTS = path.join(WORKSPACE, 'test_screenshots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const browserPaths = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

async function launch() {
  const opts = {
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader'],
    protocolTimeout: 600000,
  };
  try {
    return await puppeteer.launch(opts);
  } catch (e) {
    for (const p of browserPaths) {
      if (fs.existsSync(p)) return await puppeteer.launch({ ...opts, executablePath: p });
    }
    throw e;
  }
}

const clickByText = async (page, selector, text) =>
  page.evaluate(
    (sel, t) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(t));
      if (el) { el.click(); return true; }
      return false;
    },
    selector,
    text,
  );

(async () => {
  const browser = await launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 950 });
  const logs = [];
  page.on('console', (m) => logs.push(m.text()));

  let failures = 0;
  const check = (name, ok) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
    if (!ok) failures++;
  };

  try {
    await page.goto('http://localhost:5174/', { waitUntil: 'networkidle2', timeout: 60000 });
    await delay(1500);

    // 1. Upload a passport and wait for the pipeline + filing.
    const img = path.join(WORKSPACE, 'test_cases', 'passports', 'synthetic', 'id00_clean.png');
    console.log('uploading', img);
    const input = await page.waitForSelector('input[type=file]', { timeout: 30000 });
    await input.uploadFile(img);
    // Wait for the filing log line (models may need to download on cold cache).
    const t0 = Date.now();
    let filed = false;
    while (Date.now() - t0 < 480000) {
      if (logs.some((l) => l.includes('workspace: filed') || l.includes('workspace: sha256 already filed'))) { filed = true; break; }
      if (logs.some((l) => l.includes('workspace filing failed'))) break;
      await delay(1000);
    }
    check('document auto-filed into workspace', filed);

    // 2. Switch to the Workspace tab.
    check('Workspace tab present', await clickByText(page, 'header nav button', 'Workspace'));
    await delay(800);
    await page.screenshot({ path: path.join(SHOTS, 'ws_families.png') });
    const famCard = await page.evaluate(() =>
      [...document.querySelectorAll('main button')].some((b) => /record\(s\)/.test(b.textContent)),
    );
    check('family card rendered with record count', famCard);

    // 3. Open the family → records table.
    await page.evaluate(() => {
      [...document.querySelectorAll('main button')].find((b) => /record\(s\)/.test(b.textContent))?.click();
    });
    await delay(800);
    await page.screenshot({ path: path.join(SHOTS, 'ws_records.png') });
    const gridRow = await page.evaluate(() => document.querySelectorAll('[role="row"]').length > 0);
    check('records table has rows', gridRow);

    // 4. Open the record → detail with statuses.
    await page.evaluate(() => document.querySelector('[role="row"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await delay(800);
    await page.screenshot({ path: path.join(SHOTS, 'ws_record_detail.png') });
    const detail = await page.evaluate(() => ({
      inputs: document.querySelectorAll('main input').length,
      hasStatus: /confirmed|needs_review/.test(document.querySelector('main')?.textContent ?? ''),
      hasSha: /sha256/.test(document.querySelector('main')?.textContent ?? ''),
    }));
    check('record detail renders fields with statuses', detail.inputs > 0 && detail.hasStatus && detail.hasSha);

    // 5. User edit persists (applyUserEdit path).
    const edited = await page.evaluate(() => {
      const inp = document.querySelector('main input');
      if (!inp) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(inp, 'EDITED-BY-E2E');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    });
    await delay(1200);
    const confirmedAfterEdit = await page.evaluate(() =>
      /confirmed/.test(document.querySelector('main')?.textContent ?? ''),
    );
    check('user edit path fires and confirms', edited && confirmedAfterEdit);

    console.log(failures === 0 ? '\nWORKSPACE IA E2E: ALL PASS' : `\nWORKSPACE IA E2E: ${failures} FAILURE(S)`);
    process.exitCode = failures === 0 ? 0 : 1;
  } catch (e) {
    console.error('E2E error:', e.message);
    console.log('recent logs:', logs.slice(-12).join('\n'));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
