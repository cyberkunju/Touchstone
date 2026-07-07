/**
 * VISUAL GOLDENS HARNESS (P1.7) — verifies portrait & signature crops.
 *
 * Uploads realistic passport specimens, reads the [GATE] line's visual-asset
 * boxes, asserts DETERMINISTIC GEOMETRY (portrait 3:4 pixel aspect, sane
 * coverage, in-page bounds), crops the assets in-browser and saves PNGs for
 * human inspection, and ratchets the boxes against committed golden geometry
 * (JSON, environment-independent — pixel-diff goldens are brittle across GPU
 * rasterizers and are deliberately avoided).
 *
 * Usage:
 *   node bench/goldens.mjs            # assert against committed goldens
 *   node bench/goldens.mjs --commit   # (re)write bench/goldens/goldens.json
 *
 * Requires the dev server at :5173 and the shared puppeteer profile — never
 * run concurrently with bench/gate.mjs.
 */
import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const OUT = join(root, 'test_cases', 'visual_goldens');
const GOLDEN_FILE = join(OUT, 'goldens.json');
const commit = process.argv.includes('--commit');
mkdirSync(OUT, { recursive: true });

/** Specimens: realistic passports with faces/signatures. */
const SPECIMENS = ['3.jpg', '6.jpg', '7.jpg', '8.jpg', '9.jpg'].map((f) =>
  join(root, 'test_cases', 'passports', 'real_fakes', 'images', f),
);

/** Geometry tolerance when ratcheting against goldens (normalized units). */
const BOX_TOL = 0.03;

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  protocolTimeout: 10 * 60 * 1000,
  userDataDir: join(root, '.puppeteer-profile'),
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
page.on('dialog', (d) => d.dismiss().catch(() => {}));

let gateLine = null;
let settle = null;
page.on('console', (m) => {
  const t = m.text();
  if (/YuNet|portrait|Photo detection|Face detection/i.test(t) && t.startsWith('[')) {
    console.log(`  | ${t.slice(0, 200)}`);
  }
  if (t.startsWith('[GATE] ')) {
    try { gateLine = JSON.parse(t.slice(7)); } catch { gateLine = null; }
    settle?.();
  } else if (t.startsWith('Processing failed:')) {
    settle?.();
  }
});

await page.goto('http://localhost:5173/', { waitUntil: 'load', timeout: 60000 });
// Model warm-up: wait for the upload input to exist.
await page.waitForSelector('input[type=file]', { timeout: 10 * 60 * 1000 });

const results = [];
let failures = 0;

for (const file of SPECIMENS) {
  const name = file.split(/[\\/]/).pop();
  gateLine = null;
  const settled = new Promise((res) => { settle = res; });
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const input = await page.waitForSelector('input[type=file]', { timeout: 60000 });
  await input.uploadFile(file);
  await Promise.race([settled, new Promise((r) => setTimeout(r, 4 * 60 * 1000))]);

  if (!gateLine) {
    console.log(`FAIL  ${name}  (no GATE line)`);
    failures++;
    results.push({ file: name, assets: null });
    continue;
  }

  const assets = gateLine.fields.filter((f) => f.type === 'visual_asset' && f.box);
  const portrait = assets.find((a) => /portrait|photo/i.test(a.label));
  const signature = assets.find((a) => /signature/i.test(a.label));

  // Load the specimen in-page (the app renders to <canvas>, so the source
  // image is not queryable) — gives true dimensions and crop rendering.
  const ext = name.endsWith('.png') ? 'png' : 'jpeg';
  const dataUrl = `data:image/${ext};base64,${readFileSync(file).toString('base64')}`;
  const page_ = await page.evaluate(async (src, boxes) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
    const crops = boxes.map((box) => {
      const [x1, y1, x2, y2] = box;
      const sw = Math.round((x2 - x1) * img.naturalWidth);
      const sh = Math.round((y2 - y1) * img.naturalHeight);
      if (sw < 2 || sh < 2) return null;
      const c = document.createElement('canvas');
      c.width = sw; c.height = sh;
      c.getContext('2d').drawImage(
        img,
        Math.round(x1 * img.naturalWidth), Math.round(y1 * img.naturalHeight), sw, sh,
        0, 0, sw, sh,
      );
      return c.toDataURL('image/png');
    });
    return { w: img.naturalWidth, h: img.naturalHeight, crops };
  }, dataUrl, assets.map((a) => a.box));
  const dims = { w: page_.w, h: page_.h };

  const checks = [];
  if (portrait && dims) {
    const [x1, y1, x2, y2] = portrait.box;
    const pxW = (x2 - x1) * dims.w;
    const pxH = (y2 - y1) * dims.h;
    const aspect = pxW / pxH;
    const inBounds = x1 >= 0 && y1 >= 0 && x2 <= 1 && y2 <= 1 && x2 > x1 && y2 > y1;
    const area = (x2 - x1) * (y2 - y1);
    // Face-driven frames are exactly 3:4; heuristic boxes are looser.
    const isFrame = /portrait/i.test(portrait.label);
    const aspectOk = isFrame ? Math.abs(aspect - 0.75) < 0.02 : aspect > 0.4 && aspect < 1.4;
    const areaOk = area > 0.01 && area < 0.35;
    checks.push({ what: 'portrait aspect', ok: aspectOk, detail: aspect.toFixed(3) });
    checks.push({ what: 'portrait bounds', ok: inBounds, detail: portrait.box.map((v) => v.toFixed(3)).join(',') });
    checks.push({ what: 'portrait area', ok: areaOk, detail: area.toFixed(4) });
  } else {
    checks.push({ what: 'portrait present', ok: false, detail: 'none detected' });
  }
  if (signature) {
    // Signature is REVIEW-CAPPED evidence (a stroke-width discriminator is
    // legitimately ambiguous on calligraphic print — e.g. Arabic captions),
    // so the harness asserts sanity + drift, not shape aesthetics: in-bounds,
    // non-degenerate, not page-sized. A human confirms the crop in review.
    const [x1, y1, x2, y2] = signature.box;
    const area = (x2 - x1) * (y2 - y1);
    const sane = x1 >= 0 && y1 >= 0 && x2 <= 1 && y2 <= 1 && x2 > x1 && y2 > y1 && area < 0.15;
    checks.push({ what: 'signature sanity', ok: sane, detail: signature.box.map((v) => v.toFixed(3)).join(',') });
  }

  // Save the in-browser crops for human inspection.
  assets.forEach((asset, i) => {
    const cropUrl = page_.crops[i];
    if (!cropUrl) return;
    const slug = asset.label.toLowerCase().replace(/\W+/g, '_');
    writeFileSync(
      join(OUT, `${name.replace(/\.\w+$/, '')}_${slug}.png`),
      Buffer.from(cropUrl.split(',')[1], 'base64'),
    );
  });

  const bad = checks.filter((c) => !c.ok);
  if (bad.length > 0) failures++;
  console.log(
    `${bad.length === 0 ? 'PASS' : 'FAIL'}  ${name}  ` +
      checks.map((c) => `${c.what}=${c.ok ? 'ok' : 'BAD'}(${c.detail})`).join(' '),
  );
  results.push({
    file: name,
    portrait: portrait?.box ?? null,
    signature: signature?.box ?? null,
  });
}

/* ------------------------------ golden ratchet ----------------------------- */
if (commit) {
  writeFileSync(GOLDEN_FILE, JSON.stringify({ when: new Date().toISOString(), results }, null, 2));
  console.log(`\nGoldens committed → ${GOLDEN_FILE}`);
} else if (existsSync(GOLDEN_FILE)) {
  const golden = JSON.parse(readFileSync(GOLDEN_FILE, 'utf8'));
  for (const r of results) {
    const g = golden.results.find((x) => x.file === r.file);
    if (!g) continue;
    for (const key of ['portrait', 'signature']) {
      if (!g[key]) continue;
      if (!r[key]) {
        console.log(`REGRESSION  ${r.file}: ${key} vanished (golden had it)`);
        failures++;
        continue;
      }
      const drift = Math.max(...g[key].map((v, i) => Math.abs(v - r[key][i])));
      if (drift > BOX_TOL) {
        console.log(`REGRESSION  ${r.file}: ${key} drifted ${drift.toFixed(3)} > ${BOX_TOL}`);
        failures++;
      }
    }
  }
} else {
  console.log('\n(no committed goldens yet — run with --commit to set the baseline)');
}

await browser.close();
console.log(`\n=== GOLDENS: ${failures === 0 ? 'ALL PASS' : failures + ' failure(s)'} ===`);
process.exit(failures === 0 ? 0 : 1);
