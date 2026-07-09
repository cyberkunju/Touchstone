/**
 * J3/J4 UI e2e (P2.4/P6.2 acceptance) — the review-lane and question-card
 * journeys, driven through the REAL app against the dev server.
 *
 *   J3: upload → open review lane → keyboard-accept every open field →
 *       lane closes, zero open fields remain.
 *   J4: upload → question cards render (≤3, conflicts first) → answering
 *       confirms the field and removes the card.
 *
 * Run: node bench/e2e-ui.mjs   (dev server on :5173, same as gate.mjs)
 */

import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const IMG = join(root, 'test_cases', 'letters', 'synthetic', 'letter_id00_clean.png');
const FALLBACK = join(root, 'test_cases', 'prescriptions', 'synthetic', 'rxhw_id00_clean.png');

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  userDataDir: join(root, '.puppeteer-profile'),
  defaultViewport: { width: 1440, height: 900 },
});

try {
  const page = await browser.newPage();
  page.on('dialog', (d) => d.dismiss().catch(() => {}));

  const uploadAndWait = async (img = IMG) => {
    const done = new Promise((r) => {
      const timer = setTimeout(r, 120000);
      const onMsg = (msg) => {
        if (msg.text().startsWith('[GATE]')) {
          clearTimeout(timer);
          page.off('console', onMsg);
          r();
        }
      };
      page.on('console', onMsg);
    });
    const input = await page.waitForSelector('input[type="file"]', { timeout: 30000 });
    await input.uploadFile(img);
    await done;
  };

  /* ------------------------------- J3 ------------------------------------ */
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await uploadAndWait();

  let reviewBtn = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /^Review \d+ open field/.test(x.textContent ?? ''));
    if (!b) return null;
    const n = Number(/Review (\d+)/.exec(b.textContent)[1]);
    b.click();
    return n;
  });

  if (reviewBtn === null) {
    // The chosen doc unexpectedly proved everything — try the fallback
    // before concluding: J3 MUST actually exercise the lane.
    await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await uploadAndWait(FALLBACK);
    reviewBtn = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /^Review \d+ open field/.test(x.textContent ?? ''));
      if (!b) return null;
      const n = Number(/Review (\d+)/.exec(b.textContent)[1]);
      b.click();
      return n;
    });
  }

  check('J3 found a doc with open fields', reviewBtn !== null, `open=${reviewBtn}`);
  if (reviewBtn !== null) {
    await page.waitForSelector('[role="dialog"][aria-label="Review lane"]', { timeout: 5000 });
    // Keyboard-accept every open field (Enter). Single-flight: wait for the
    // counter to advance (or the lane to close) between presses.
    let laneOpen = true;
    for (let i = 0; i < reviewBtn + 5 && laneOpen; i++) {
      await page.keyboard.press('Enter');
      await new Promise((r) => setTimeout(r, 400));
      laneOpen = await page.evaluate(() => !!document.querySelector('[aria-label="Review lane"]'));
    }
    check('J3 lane closes after accepting all', !laneOpen);
    const remaining = await page.evaluate(() =>
      [...document.querySelectorAll('button')].some((x) => /^Review \d+ open field/.test(x.textContent ?? '')),
    );
    check('J3 zero open fields remain', !remaining);
  }

  /* ------------------------------- J4 ------------------------------------ */
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await uploadAndWait();

  const cardInfo = await page.evaluate(() => {
    const wrap = document.querySelector('[aria-label="Questions"]');
    if (!wrap) return { count: 0 };
    return { count: wrap.children.length };
  });
  check('J4 cards render for an open doc', cardInfo.count > 0 && cardInfo.count <= 3, `count=${cardInfo.count}`);

  if (cardInfo.count > 0) {
    const answeredId = await page.evaluate(() => {
      const wrap = document.querySelector('[aria-label="Questions"]');
      const card = wrap?.querySelector('[data-question-id]');
      const answer = card && [...card.querySelectorAll('button')].find((b) => /^(Yes|[A-Z0-9])/.test(b.textContent ?? ''));
      if (!card || !answer) return null;
      answer.click();
      return card.getAttribute('data-question-id');
    });
    await new Promise((r) => setTimeout(r, 600));
    const result = await page.evaluate((fieldId) => {
      const cards = [...document.querySelectorAll('[data-question-id]')];
      return {
        answeredCardPresent: cards.some((card) => card.getAttribute('data-question-id') === fieldId),
        count: cards.length,
      };
    }, answeredId);
    check(
      'J4 answering removes the exact card',
      answeredId !== null && !result.answeredCardPresent,
      `tray ${cardInfo.count} → ${result.count}`,
    );
  } else {
    check('J4 cards', false, 'no questions rendered — journey not exercised');
  }
} finally {
  await browser.close();
}

if (failures > 0) {
  console.error(`${failures} UI e2e failure(s)`);
  process.exit(1);
}
console.log('J3/J4 UI e2e green');
