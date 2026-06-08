/**
 * Batch diagnostic harness: runs a set of real passport images through the app
 * via Chrome DevTools (Puppeteer) and dumps, per image: classification, MRZ
 * detection/parse status + check digits, recognized OCR text, and the final
 * extracted fields with their statuses. Used to find root causes.
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const DIR = path.join(__dirname, 'passport_images');
const images = process.argv.slice(2);
const targets = images.length > 0 ? images : ['3.jpg', '6.jpg', '10.jpg', '13.jpg'];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function extractFields(page) {
  return page.evaluate(() => {
    const out = [];
    const cards = Array.from(document.querySelectorAll('main section div[style*="cursor: pointer"]'));
    cards.forEach((card) => {
      const spans = card.querySelectorAll('span');
      const label = spans[0] ? spans[0].innerText.trim() : '';
      const badge = card.querySelector('div[style*="border-radius: 12px"]');
      const status = badge ? badge.innerText.trim() : '';
      const input = card.querySelector('input[type="text"]');
      const value = input ? input.value : (card.querySelector('canvas') ? '[PHOTO]' : '');
      if (label) out.push({ label, value, status });
    });
    return out;
  });
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    protocolTimeout: 600000,
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();

  const logs = [];
  page.on('console', (m) => {
    logs.push(m.text());
  });
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 60000 });

  for (const name of targets) {
    const file = path.join(DIR, name);
    if (!fs.existsSync(file)) { console.log(`\n### ${name}: NOT FOUND`); continue; }
    logs.length = 0;
    console.log(`\n############ ${name} ############`);

    // Clear any prior doc.
    const clearBtn = await page.evaluateHandle(() => Array.from(document.querySelectorAll('button')).find((b) => b.innerText.includes('Clear Document')) || null);
    if (clearBtn && clearBtn.asElement()) { await clearBtn.asElement().click(); await delay(500); }

    const input = await page.$('input[type="file"]');
    await input.uploadFile(file);

    try {
      await page.waitForFunction(() => !document.body.innerText.includes('Initializing Local AI Models'), { timeout: 300000 });
    } catch {}
    try {
      await page.waitForFunction(() => !/Extracting|Recognizing|Running|Decoding|Normalizing|Downloading|Loading/.test(document.body.innerText), { timeout: 300000 });
    } catch {}
    await delay(1500);

    for (const l of logs) console.log('  ' + l.replace(/\s+/g, ' ').slice(0, 2000));

    const fields = await extractFields(page);
    console.log(`  --- ${fields.length} FIELDS ---`);
    fields.forEach((f) => console.log(`   [${f.status}] ${f.label} = ${JSON.stringify(f.value)}`));
  }

  await browser.close();
})();
