/** Responsive smoke — screenshot the processed app at 3 viewport sizes. */
import puppeteer from 'puppeteer';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const img = process.argv[2] ?? join(root, 'test_cases', 'passports', 'synthetic', 'id00_clean.png');
const sizes = [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'tablet', width: 820, height: 1180 },
];

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox'],
  userDataDir: join(root, 'test_screenshots', '.visual-binding-profile'),
});
try {
  const page = await browser.newPage();
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  let settle;
  const done = new Promise((r) => { settle = r; });
  page.on('console', (m) => {
    const t = m.text();
    if (t.startsWith('[GATE] ') || t.startsWith('Processing failed:')) settle?.();
  });
  await page.setViewport(sizes[0]);
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const input = await page.waitForSelector('input[type="file"]', { timeout: 30000 });
  await input.uploadFile(resolve(img));
  await Promise.race([done, new Promise((r) => setTimeout(r, 5 * 60 * 1000))]);
  await new Promise((r) => setTimeout(r, 1200));
  for (const s of sizes) {
    await page.setViewport({ width: s.width, height: s.height });
    await new Promise((r) => setTimeout(r, 700));
    const out = join(root, 'test_screenshots', `responsive-${s.name}.png`);
    await page.screenshot({ path: out, fullPage: s.name === 'tablet' });
    console.log(`${s.name} ${s.width}x${s.height} -> ${out}`);
  }
} finally {
  await browser.close();
  process.exit(0);
}
