/**
 * Focused MRZ diagnostic — event-driven (no DOM polling, which starves when
 * WASM OCR pegs the main thread). Completion is detected from the app's own
 * console signals; ALL relevant console output and page errors are captured.
 *
 * Usage: node diag_mrz.cjs [image ...]   (defaults to a 3-image probe)
 */
const puppeteer = require('puppeteer');
const path = require('path');
const IMG = path.join(__dirname, 'passport_images');
const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['3.jpg', 'ChatGPT Image Jun 6, 2026, 08_00_24 PM (2).png', '6.jpg'];

const PER_IMAGE_TIMEOUT_MS = 10 * 60 * 1000;

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    protocolTimeout: 20 * 60 * 1000,
    userDataDir: path.join(__dirname, '.puppeteer-profile'),
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(PER_IMAGE_TIMEOUT_MS);

  // Push-based completion: the app's pipeline ends with either the verifier
  // stage log, a processing failure, or an unhandled page error.
  let signalDone = null;
  const armed = () =>
    new Promise((resolve) => {
      signalDone = resolve;
    });
  const settle = (delayMs) => {
    if (!signalDone) return;
    const s = signalDone;
    signalDone = null;
    setTimeout(s, delayMs);
  };

  page.on('console', (m) => {
    const t = m.text();
    if (/\[DIAG\]|MRZ|DBNet found|Processing failed|successfully verified/i.test(t)) {
      console.log(t.length > 900 ? t.slice(0, 900) + '…' : t);
    }
    if (/(successfully verified and cached|Processing failed)/i.test(t)) {
      settle(500);
    }
  });
  page.on('pageerror', (e) => {
    console.log('PAGEERROR:', String(e).slice(0, 500));
    settle(0);
  });
  // CRITICAL: the app alert()s on failure; an unhandled modal dialog blocks
  // the entire CDP session (this was the protocolTimeout root cause).
  page.on('dialog', async (d) => {
    console.log(`DIALOG(${d.type()}): ${d.message().slice(0, 200)}`);
    await d.dismiss().catch(() => {});
  });

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 120000 });

  for (const file of targets) {
    console.log(`\n===== ${file} =====`);
    const done = armed();
    const input = await page.$('input[type="file"]');
    if (!input) {
      console.log('NO FILE INPUT — app did not render. Aborting.');
      break;
    }
    await input.uploadFile(path.join(IMG, file));
    await Promise.race([
      done,
      new Promise((r) =>
        setTimeout(() => {
          console.log('TIMEOUT waiting for pipeline signals');
          r();
        }, PER_IMAGE_TIMEOUT_MS),
      ),
    ]);
    // Reload between images: cheaper and more reliable than driving the
    // Clear button through a saturated main thread. Models are OPFS-cached.
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 120000 });
  }

  await browser.close();
  console.log('\nDIAG COMPLETE');
})().catch((e) => {
  console.error('HARNESS ERROR:', e);
  process.exit(1);
});
