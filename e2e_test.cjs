/**
 * End-to-end test of the real engine in a real Chromium via Puppeteer.
 *
 * Uploads the passport and invoice test images, waits for the local PP-OCRv5
 * pipeline to run, and reports the extracted fields, their statuses, and the
 * real OCR confidences. Captures all browser console output for diagnosis.
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
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-unsafe-webgpu',
      '--enable-features=Vulkan,WebGPU',
      '--use-angle=swiftshader',
    ],
    protocolTimeout: 600000,
  };
  try {
    return await puppeteer.launch(opts);
  } catch (e) {
    for (const p of browserPaths) {
      if (fs.existsSync(p)) {
        console.log('Using browser:', p);
        return await puppeteer.launch({ ...opts, executablePath: p });
      }
    }
    throw e;
  }
}

async function extractFields(page) {
  return page.evaluate(() => {
    const out = [];
    const inputs = Array.from(document.querySelectorAll('main input[type="text"]'));
    inputs.forEach((input) => {
      const card = input.closest('div[style*="cursor: pointer"]') || input.closest('div');
      let label = '';
      let status = '';
      if (card) {
        const spans = card.querySelectorAll('span');
        if (spans[0]) label = spans[0].innerText.trim();
        // The status badge text is the last short span in the header.
        const badge = card.querySelector('div[style*="border-radius: 12px"]');
        if (badge) status = badge.innerText.trim();
      }
      out.push({ label, value: input.value, status });
    });
    return out;
  });
}

async function processImage(page, fileName, shotName) {
  const imgPath = path.join(WORKSPACE, fileName);
  console.log(`\n=== Uploading ${fileName} ===`);
  const fileInput = await page.$('input[type="file"]');
  if (!fileInput) throw new Error('file input not found');
  await fileInput.uploadFile(imgPath);

  // Wait for the model-loading overlay to disappear (one-time, may take long).
  try {
    await page.waitForFunction(
      () => !document.body.innerText.includes('Initializing Local AI Models'),
      { timeout: 480000 },
    );
  } catch (e) {
    console.warn('  model-loading overlay still present:', e.message);
  }

  // Wait for form fields to render.
  try {
    await page.waitForSelector('main input[type="text"]', { timeout: 180000 });
  } catch (e) {
    console.warn('  no form fields rendered:', e.message);
  }
  await delay(1500);
  await page.screenshot({ path: path.join(SHOTS, shotName), fullPage: true });

  const fields = await extractFields(page);
  console.log(`  Extracted ${fields.length} field(s):`);
  fields.forEach((f) => console.log(`    - [${f.status}] ${f.label}: ${JSON.stringify(f.value)}`));
  return fields;
}

(async () => {
  const browser = await launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });

  page.on('console', (msg) => console.log('  [browser]', msg.text()));
  page.on('pageerror', (err) => console.error('  [PAGE ERROR]', err.message));
  page.on('requestfailed', (req) =>
    console.error('  [REQ FAILED]', req.url().slice(0, 120), req.failure() && req.failure().errorText),
  );

  page.on('dialog', async (d) => {
    console.log('  [dialog]', d.type(), d.message());
    if (d.type() === 'prompt') await d.accept('Passport US Type A');
    else await d.accept();
  });

  try {
    console.log('Navigating to http://localhost:5173/ ...');
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 60000 });
    await page.screenshot({ path: path.join(SHOTS, 'e2e_01_initial.png') });

    // Report SharedArrayBuffer / WebGPU availability.
    const caps = await page.evaluate(() => ({
      sab: typeof SharedArrayBuffer !== 'undefined',
      crossOriginIsolated: self.crossOriginIsolated,
      webgpu: !!navigator.gpu,
    }));
    console.log('Capabilities:', JSON.stringify(caps));

    const passport = await processImage(page, 'passport_test.png', 'e2e_02_passport.png');

    // Clear and process the invoice.
    const clearBtn = await page.evaluateHandle(() => {
      const b = Array.from(document.querySelectorAll('button')).find((x) =>
        x.innerText.includes('Clear Document'),
      );
      return b || null;
    });
    if (clearBtn && clearBtn.asElement()) {
      await clearBtn.asElement().click();
      await delay(1000);
    }

    const invoice = await processImage(page, 'invoice_test.png', 'e2e_03_invoice.png');

    console.log('\n=== SUMMARY ===');
    console.log('passport fields:', passport.length, '| invoice fields:', invoice.length);
    console.log('E2E test completed.');
  } catch (err) {
    console.error('E2E FAILED:', err);
    try {
      await page.screenshot({ path: path.join(SHOTS, 'e2e_error.png'), fullPage: true });
    } catch {}
  } finally {
    await browser.close();
  }
})();
