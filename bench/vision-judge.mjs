/**
 * VISION JUDGE — external GPT-5.4 validation of the engine's BOXING and UI.
 *
 * Pipeline per image:
 *  1. Run the image through the live app (same as inspect-one).
 *  2. Composite the engine's normalized field boxes onto the ORIGINAL image
 *     at native resolution (green = value box, label text above).
 *  3. Screenshot the WHOLE processed app page — document viewer with the
 *     overlay boxes, the filled form fields, statuses, the approval panel.
 *  4. Send BOTH images to the GPT-5.4 deployment (vision): grade every box
 *     (tight? right target?) on the composite, and grade the app page — do
 *     the drawn overlay boxes, extracted values and statuses match the
 *     document truth? Score 0-10 each, list every failure.
 *
 * Usage: node bench/vision-judge.mjs <image-path> [--out <prefix>]
 * Requires dev server at :5173 and .env.local credentials.
 */
import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvLocal, gptVision } from './ai-services.mjs';

loadEnvLocal();
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const imgArg = process.argv[2];
if (!imgArg) {
  console.error('usage: node bench/vision-judge.mjs <image-path>');
  process.exit(2);
}
const imgPath = resolve(imgArg);
const outIdx = process.argv.indexOf('--out');
const outPrefix = outIdx > -1 ? process.argv[outIdx + 1] : basename(imgPath).replace(/\.[^.]+$/, '');
const outDir = join(root, 'test_screenshots', 'judge');
mkdirSync(outDir, { recursive: true });

/* ------------------------- 1. run the engine ------------------------------ */
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  protocolTimeout: 20 * 60 * 1000,
  // The visual-binding profile (models cached) — NOT .puppeteer-profile,
  // which the family gate may hold locked concurrently.
  userDataDir: join(root, 'test_screenshots', '.visual-binding-profile'),
  defaultViewport: { width: 1600, height: 1200 },
});

let composite;
let uiShot;
let hyps = [];
try {
  const page = await browser.newPage();
  page.on('dialog', (d) => d.dismiss().catch(() => {}));

  let graph = null;
  let settle = null;
  const done = new Promise((r) => { settle = r; });
  page.on('console', async (m) => {
    const t = m.text();
    if (t.startsWith('[App] DocGraph successfully verified')) {
      try { graph = await m.args()[1]?.jsonValue(); } catch { /* keep null */ }
    }
    if (t.startsWith('[GATE] ') || t.startsWith('Processing failed:')) settle?.();
  });
  page.on('pageerror', () => settle?.());

  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const input = await page.waitForSelector('input[type="file"]', { timeout: 30000 });
  await input.uploadFile(imgPath);
  await Promise.race([done, new Promise((r) => setTimeout(r, 6 * 60 * 1000))]);
  // The graph console-arg jsonValue() resolves asynchronously AFTER the GATE
  // line settles the race — without this wait hyps read as [] (live-caught:
  // the judge received a composite with ZERO boxes and graded garbage).
  await new Promise((r) => setTimeout(r, 1500));

  hyps = (graph?.hypotheses ?? [])
    .filter((h) => h.boxNorm)
    .map((h) => ({
      label: h.valueType === 'mrz' ? 'MRZ band (machine-readable zone)' : h.label,
      value:
        typeof h.value === 'string'
          ? h.value
          : h.valueType === 'mrz'
            ? '(2-line MRZ)'
            : h.valueType === 'visual_asset'
              ? '(visual asset — geometry only)'
              : '',
      status: h.status,
      box: h.boxNorm,
    }));

  /* ---------------- 2. composite boxes onto the WORKING image ------------- */
  // The engine deskews/rectifies its working bitmap — boxes live in THAT
  // space. Compositing on the original photo misaligns every box the moment
  // deskew fires (live-caught: correct geometry graded as garbage).
  const workingImage = await page.evaluate(
    () => window.__docutract?.workingImage ?? null,
  );
  const b64 = workingImage
    ? workingImage.split(',')[1]
    : readFileSync(imgPath).toString('base64');
  composite = Buffer.from(
    await page.evaluate(async (imgB64, boxes) => {
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = `data:image/png;base64,${imgB64}`;
      });
      // Cap the long side at 2000px for the API while keeping aspect.
      const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
      const W = Math.round(img.width * scale);
      const H = Math.round(img.height * scale);
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, W, H);
      ctx.textBaseline = 'bottom';
      boxes.forEach((b, i) => {
        const [x1, y1, x2, y2] = b.box;
        const px = x1 * W;
        const py = y1 * H;
        const pw = (x2 - x1) * W;
        const ph = (y2 - y1) * H;
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#00c853';
        ctx.strokeRect(px, py, pw, ph);
        const tag = `${i + 1}`;
        ctx.font = 'bold 22px sans-serif';
        const tw = ctx.measureText(tag).width + 10;
        ctx.fillStyle = '#00c853';
        ctx.fillRect(px, Math.max(0, py - 26), tw, 26);
        ctx.fillStyle = '#000';
        ctx.fillText(tag, px + 5, Math.max(26, py));
      });
      return c.toDataURL('image/png').split(',')[1];
    }, b64, hyps),
    'base64',
  );
  writeFileSync(join(outDir, `${outPrefix}.composite.png`), composite);

  /* -------- 2b. the WHOLE processed app page (viewer + form + review) ----- */
  // Select the first field card so the evidence/approval panel is open too.
  await new Promise((r) => setTimeout(r, 800));
  const firstCard = await page.$('[data-canonical-label]');
  if (firstCard) {
    await firstCard.click();
    await new Promise((r) => setTimeout(r, 400));
  }
  uiShot = Buffer.from(await page.screenshot({ fullPage: true }));
  writeFileSync(join(outDir, `${outPrefix}.apppage.png`), uiShot);
} finally {
  await browser.close();
}

/* --------------------------- 3. GPT-5.4 judge ----------------------------- */
const legend = hyps
  .map((h, i) => `${i + 1}. label="${h.label}" claimed_value="${h.value.slice(0, 60)}" status=${h.status}`)
  .join('\n');

const verdict = await gptVision(
  [
    {
      text:
        'You are a merciless document-extraction QA judge. TWO images are attached.\n' +
        'IMAGE 1 (composite): the original document; every GREEN numbered rectangle is where the ' +
        'extraction engine claims a field VALUE is printed. Legend:\n\n' +
        legend +
        '\n\nNORMALIZATION NOTE: claimed dates are ISO-normalized (e.g. 2024-05-15). A box sitting on ' +
        'the printed form of the SAME date ("15 MAY 2024") is CORRECT — judge geometry/target, never ' +
        'surface format. Legend entries marked "(visual asset — geometry only)" and the MRZ band are ' +
        'geometry-only claims with no text value.\n\n' +
        'IMAGE 2 (app page): the FULL page of the application after processing this document — ' +
        'the document viewer with its own drawn overlay boxes, the extracted form fields with values ' +
        'and statuses (CONFIRMED / NEEDS REVIEW / CONFLICT), and the evidence/approval panel.\n\n' +
        'JUDGE PART A — BOXING on IMAGE 1 (geometry only, not OCR): for EACH numbered box:\n' +
        ' - tight: does the rectangle tightly enclose exactly the claimed value text (small margins ok)?\n' +
        ' - correct_target: does it enclose the RIGHT text (the value it claims), not a caption/neighbor/nothing?\n' +
        ' - issues: loose/offset/covers-multiple-lines/covers-caption/empty-area/wrong-text, or none.\n' +
        'REFUSAL IS CORRECT: if the document is a stamps/visa page, a blank page, or too degraded to read, ' +
        'ZERO field boxes is the intended, CORRECT engine output — grade such honest refusal 10/10, ' +
        'never as failure.\n' +
        'JUDGE PART B — APP PAGE on IMAGE 2:\n' +
        ' - overlay_quality: do the boxes drawn on the in-app document canvas sit on the correct values (0-10)?\n' +
        ' - form_truth: do the extracted form values match what the document actually prints (0-10)?\n' +
        ' - status_honesty: are statuses appropriate (nothing wrong marked CONFIRMED) (0-10)?\n' +
        ' - ui_issues: list every concrete UI failure you can see (missing boxes, wrong values, misleading labels).\n' +
        'Then give: overall_score (0-10 across everything), the 3 worst problems, and any value printed on ' +
        'the document that has NO box but should. Output strict JSON: ' +
        '{"boxes":[{"n":1,"tight":bool,"correct_target":bool,"issues":"..."}],' +
        '"app_page":{"overlay_quality":N,"form_truth":N,"status_honesty":N,"ui_issues":["..."]},' +
        '"overall_score":N,"worst":["..."],"missing_fields":["..."],"summary":"..."}',
    },
    { imagePng: composite },
    { imagePng: uiShot },
  ],
  { maxTokens: 8000 },
);

writeFileSync(join(outDir, `${outPrefix}.verdict.json`), verdict);
console.log(`\n=== GPT-5.4 BOXING+UI VERDICT — ${basename(imgPath)} (${hyps.length} boxes) ===\n`);
console.log(verdict);
console.log(`\ncomposite: ${join(outDir, `${outPrefix}.composite.png`)}`);
console.log(`app page:  ${join(outDir, `${outPrefix}.apppage.png`)}`);
// Puppeteer's protocol keep-alives can hold the event loop open after the
// verdict prints (live-caught: the script "hung" and needed manual ^C).
process.exit(0);
