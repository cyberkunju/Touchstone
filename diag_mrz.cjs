/** Focused MRZ diagnostic on a few images: dumps the bottom-region OCR items. */
const puppeteer = require('puppeteer');
const path = require('path');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const IMG = path.join(__dirname, 'passport_images');
const targets = ['3.jpg', 'ChatGPT Image Jun 6, 2026, 08_00_24 PM (2).png', '6.jpg'];

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'], protocolTimeout: 600000, defaultViewport: { width: 1440, height: 900 } });
  const page = await browser.newPage();
  page.on('console', (m) => { const t = m.text(); if (/\[DIAG\]|recognized texts|DBNet found/.test(t)) console.log(t); });
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 60000 });

  for (const file of targets) {
    console.log(`\n===== ${file} =====`);
    const input = await page.$('input[type="file"]');
    await input.uploadFile(path.join(IMG, file));
    try { await page.waitForFunction(() => !document.body.innerText.includes('Initializing Local AI Models'), { timeout: 300000 }); } catch {}
    try { await page.waitForSelector('main section div[style*="cursor: pointer"]', { timeout: 120000 }); } catch {}
    await delay(1500);
    const clear = await page.evaluateHandle(() => Array.from(document.querySelectorAll('button')).find((x) => x.innerText.includes('Clear Document')) || null);
    if (clear && clear.asElement()) { await clear.asElement().click(); await delay(800); }
  }
  await browser.close();
})();
