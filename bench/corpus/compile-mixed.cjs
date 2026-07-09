/**
 * P4.4 — MIXED-PAGE corpus: multiple certified documents on ONE page
 * (14 §2 `mixed` manifests). The universal-ingestion promise is "photograph
 * anything" — including a desk with a receipt AND a business card, or a
 * scanner bed with two IDs side by side.
 *
 * Truth model: each mixed page carries the truth of ALL constituent docs;
 * the gate rule (proposed, lead wires): every constituent's fields score
 * independently; a field from doc A confirmed with doc B's value is the
 * mixed-page silent error class.
 *
 * Sources are already-certified corpus entries — truth passes through
 * untouched (E1 doctrine: never hand-write truth that generators computed).
 *
 * Usage: node bench/corpus/compile-mixed.cjs [--quick]
 *   (run ONLY when no gate chain is active — shares the corpus tree)
 * Output: test_cases/mixed/<name>.png + manifest.json
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..', '..');
const OUT = path.join(root, 'test_cases', 'mixed');

/** Pairings that occur in real capture sessions. */
const PAIRINGS = [
  { name: 'invoice_card', a: { dir: 'docs/synthetic', pick: /^inv\d+_clean\.png$/ }, b: { dir: 'business_cards/synthetic', pick: /_clean\.png$/ }, layout: 'side' },
  { name: 'two_ids', a: { dir: 'id_cards/synthetic', pick: /^td1_id0\d_clean\.png$/ }, b: { dir: 'id_cards/synthetic', pick: /^td2_id0\d_clean\.png$/ }, layout: 'stack' },
  { name: 'receipt_boarding', a: { dir: 'docs/synthetic', pick: /^rcpt\d+_clean\.png$/ }, b: { dir: 'boarding_passes/synthetic', pick: /_clean\.png$/ }, layout: 'side' },
  { name: 'payslip_lease', a: { dir: 'payslips/synthetic', pick: /_clean\.png$/ }, b: { dir: 'property_leases/synthetic', pick: /_clean\.png$/ }, layout: 'overlap' },
];

function pickEntries(spec, n) {
  const dir = path.join(root, 'test_cases', spec.dir);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  return manifest.filter((e) => spec.pick.test(e.file)).slice(0, n)
    .map((e) => ({ ...e, abs: path.join(dir, e.file) }));
}

const LAYOUTS = {
  side: (a, b) => `
    <div style="position:absolute;left:3%;top:8%;width:55%;transform:rotate(-2deg);box-shadow:0 8px 30px rgba(0,0,0,0.4)"><img src="${a}" style="width:100%"></div>
    <div style="position:absolute;right:4%;top:14%;width:34%;transform:rotate(3deg);box-shadow:0 6px 24px rgba(0,0,0,0.4)"><img src="${b}" style="width:100%"></div>`,
  stack: (a, b) => `
    <div style="position:absolute;left:12%;top:5%;width:70%;transform:rotate(1deg);box-shadow:0 8px 30px rgba(0,0,0,0.4)"><img src="${a}" style="width:100%"></div>
    <div style="position:absolute;left:16%;top:52%;width:70%;transform:rotate(-2deg);box-shadow:0 8px 30px rgba(0,0,0,0.4)"><img src="${b}" style="width:100%"></div>`,
  overlap: (a, b) => `
    <div style="position:absolute;left:6%;top:6%;width:62%;box-shadow:0 8px 30px rgba(0,0,0,0.4)"><img src="${a}" style="width:100%"></div>
    <div style="position:absolute;left:44%;top:34%;width:52%;transform:rotate(4deg);box-shadow:0 10px 36px rgba(0,0,0,0.5)"><img src="${b}" style="width:100%"></div>`,
};

(async () => {
  const quick = process.argv.includes('--quick');
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1700, height: 1240, deviceScaleFactor: 1 });
  const manifest = [];

  for (const pairing of PAIRINGS) {
    const asrc = pickEntries(pairing.a, quick ? 1 : 3);
    const bsrc = pickEntries(pairing.b, quick ? 1 : 3);
    const n = Math.min(asrc.length, bsrc.length);
    for (let i = 0; i < n; i++) {
      const a = asrc[i];
      const b = bsrc[i];
      const dataA = `data:image/png;base64,${fs.readFileSync(a.abs).toString('base64')}`;
      const dataB = `data:image/png;base64,${fs.readFileSync(b.abs).toString('base64')}`;
      const html = `<html><body style="margin:0;width:1700px;height:1240px;background:
        repeating-linear-gradient(88deg,#7d6248 0 22px,#8a6d52 22px 50px,#755a40 50px 68px)">
        ${LAYOUTS[pairing.layout](dataA, dataB)}
        <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 45% 35%, transparent 55%, rgba(0,0,0,0.38))"></div>
      </body></html>`;
      // networkidle0 stalls on multi-MB data-URIs (no network activity to go
      // idle FROM) — wait for load, then explicitly for image decode.
      await page.setContent(html, { waitUntil: 'load', timeout: 120000 });
      await page.waitForFunction(
        () => [...document.images].every((i) => i.complete && i.naturalWidth > 0),
        { timeout: 60000 },
      );
      const file = `${pairing.name}_${String(i).padStart(2, '0')}.png`;
      await page.screenshot({ path: path.join(OUT, file) });
      manifest.push({
        file,
        class: 'mixed_page',
        layout: pairing.layout,
        constituents: [
          { family: pairing.a.dir.split('/')[0], sourceFile: a.file, truth: a.truth },
          { family: pairing.b.dir.split('/')[0], sourceFile: b.file, truth: b.truth },
        ],
        expect: {
          noSilentErrors: true,
          noCrossDocumentBleed: true, // doc A field confirmed with doc B value = THE mixed silent
        },
      });
      console.log(`✓ ${file}`);
    }
  }

  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  console.log(`Mixed pages: ${manifest.length} → ${OUT}`);
  await browser.close();
})();
