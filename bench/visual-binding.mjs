import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const passport = join(root, 'test_cases', 'passports', 'synthetic', 'id00_clean.png');
const screenshot = join(root, 'test_screenshots', 'visual-binding.png');

let failures = 0;
function check(name, condition, detail = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
  if (!condition) failures += 1;
}

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  userDataDir: join(root, 'test_screenshots', '.visual-binding-profile'),
  defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 2 },
});

try {
  const page = await browser.newPage();
  page.on('dialog', (dialog) => dialog.dismiss().catch(() => {}));
  // 'localhost', not 127.0.0.1 — Vite 8 binds the hostname, which resolves
  // IPv6-first (::1) on Windows; the raw IPv4 loopback is refused.
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0', timeout: 60_000 });

  const completed = new Promise((resolveDone, rejectDone) => {
    const timer = setTimeout(() => rejectDone(new Error('document processing timed out')), 120_000);
    const onMessage = (message) => {
      if (!message.text().startsWith('[GATE]')) return;
      clearTimeout(timer);
      page.off('console', onMessage);
      resolveDone();
    };
    page.on('console', onMessage);
  });
  const input = await page.waitForSelector('input[type="file"]', { timeout: 30_000 });
  await input.uploadFile(passport);
  await completed;

  const nationalityCard = await page.$('[data-canonical-label="nationality"]');
  const nationalityValue = nationalityCard
    ? await nationalityCard.$eval('input[type="text"]', (element) => element.value)
    : null;
  if (nationalityCard) await nationalityCard.click();
  check(
    'nationality field rendered',
    nationalityValue !== null,
    nationalityValue ?? 'canonical nationality card missing',
  );
  const fieldStatus = async (canonicalLabel) => {
    const card = await page.$(`[data-canonical-label="${canonicalLabel}"]`);
    return card ? card.evaluate((element) => element.textContent ?? '') : '';
  };
  check(
    'checksum-covered passport number is confirmed',
    /CONFIRMED/i.test(await fieldStatus('passport_number')),
  );
  check(
    'uncovered nationality remains review-only',
    /NEEDS REVIEW/i.test(await fieldStatus('nationality')),
  );
  const metricsText = await page.$eval('.app-panel--form', (panel) => panel.textContent ?? '');
  check(
    'UI separates image quality from proof coverage',
    /Image quality:\s*\d+%/i.test(metricsText) && /Proof coverage:\s*\d+%/i.test(metricsText),
  );

  await new Promise((resolveWait) => setTimeout(resolveWait, 750));
  const selectionDiagnostic = await page.evaluate(() => {
    const card = document.querySelector('[data-canonical-label="nationality"]');
    const panel = document.querySelector('.app-panel--evidence');
    return {
      cardBorder: card ? getComputedStyle(card).borderColor : 'missing',
      panelText: panel?.textContent?.replace(/\s+/g, ' ').trim() ?? 'missing',
      bodyHasBindingTrace: panel?.textContent?.includes('Binding Trace') ?? false,
    };
  });
  check(
    'selected field opens binding inspector',
    selectionDiagnostic.bodyHasBindingTrace,
    `border=${selectionDiagnostic.cardBorder}; panel=${selectionDiagnostic.panelText.slice(0, 160)}`,
  );

  const readBindingBox = async (canonicalLabel) => {
    const card = await page.$(`[data-canonical-label="${canonicalLabel}"]`);
    if (!card) return null;
    await card.click();
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
    const text = await page.$eval('.app-panel--evidence', (panel) => panel.textContent ?? '');
    const match = text.match(/Value box:\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)/i);
    return match ? match.slice(1).map(Number) : null;
  };
  for (const canonicalLabel of ['passport_number', 'date_of_birth', 'date_of_expiry']) {
    const box = await readBindingBox(canonicalLabel);
    check(
      `${canonicalLabel} keeps visible-side evidence geometry`,
      box !== null && box[1] < 0.7 && box[3] < 0.75,
      box?.map((value) => value.toFixed(4)).join(', ') ?? 'missing',
    );
  }
  if (nationalityCard) {
    await nationalityCard.click();
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }

  const result = await page.evaluate(() => {
    const parseColor = (value) => {
      const probe = document.createElement('span');
      probe.style.color = value;
      document.body.appendChild(probe);
      const match = getComputedStyle(probe).color.match(/\d+/g)?.slice(0, 3).map(Number) ?? [];
      probe.remove();
      return match;
    };
    const near = (data, index, color) =>
      color.length === 3 &&
      Math.abs(data[index] - color[0]) <= 4 &&
      Math.abs(data[index + 1] - color[1]) <= 4 &&
      Math.abs(data[index + 2] - color[2]) <= 4 &&
      data[index + 3] >= 220;

    const viewer = document.querySelector('.app-panel--viewer canvas');
    const viewerRect = viewer?.getBoundingClientRect();
    const context = viewer?.getContext('2d');
    const pixels = context && viewer ? context.getImageData(0, 0, viewer.width, viewer.height).data : null;
    const styles = getComputedStyle(document.documentElement);
    const colors = [
      parseColor(styles.getPropertyValue('--status-review')),
      parseColor(styles.getPropertyValue('--status-confirmed')),
      parseColor(styles.getPropertyValue('--status-conflict')),
      parseColor(styles.getPropertyValue('--border-focus')),
    ];
    const counts = colors.map(() => 0);
    if (pixels) {
      for (let index = 0; index < pixels.length; index += 4) {
        colors.forEach((color, colorIndex) => {
          if (near(pixels, index, color)) counts[colorIndex] += 1;
        });
      }
    }

    const inspector = document.querySelector('.app-panel--evidence');
    const inspectorText = inspector?.textContent ?? '';
    const crop = inspector?.querySelector('canvas');
    const cropRect = crop?.getBoundingClientRect();
    return {
      statusPixels: counts.slice(0, 3).reduce((sum, count) => sum + count, 0),
      focusPixels: counts[3],
      highDpi: !!viewer && !!viewerRect && viewer.width >= viewerRect.width * 1.8,
      bindingTrace: /Canonical:/i.test(inspectorText) &&
        /Caption OCR:/i.test(inspectorText) && /Value OCR:/i.test(inspectorText),
      cropWidth: cropRect?.width ?? 0,
      cropHeight: cropRect?.height ?? 0,
    };
  });

  check('status-colored overlay pixels exist', result.statusPixels > 20, `pixels=${result.statusPixels}`);
  check('selected caption focus outline exists', result.focusPixels > 10, `pixels=${result.focusPixels}`);
  check('viewer uses high-DPI backing pixels', result.highDpi);
  check('inspector exposes canonical caption/value binding', result.bindingTrace);
  check(
    'evidence crop preserves source aspect ratio',
    result.cropWidth > 0 && result.cropHeight > 0 && Math.abs(result.cropWidth / result.cropHeight - 3) > 0.2,
    `${result.cropWidth.toFixed(0)}x${result.cropHeight.toFixed(0)}`,
  );

  await page.screenshot({ path: screenshot, fullPage: true });
} finally {
  await browser.close();
}

if (failures > 0) {
  console.error(`${failures} visual binding acceptance failure(s)`);
  process.exit(1);
}
console.log(`Visual binding acceptance green: ${screenshot}`);