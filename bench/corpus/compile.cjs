/**
 * CORPUS COMPILER — deterministic ground-truth passport corpus (P1.9 asset).
 *
 * Why generated, not collected: real passports are uncommittable (PII/legal),
 * and AI-fake images carry NO ground truth. The only corpus giving perfect
 * labels + real-world physics + worst-case coverage + determinism is a
 * compiler: seeded identities → ICAO-correct MRZ (check digits computed, so
 * labels are RIGHT by mathematics) → realistic render → physics degradation
 * ladder, every rung labeled → sidecar truth manifest for the gate runner.
 *
 * Classes:
 *  - clean/degraded: VIZ ≡ MRZ, expect mrzValid + fields == truth
 *  - conflict:       VIZ deliberately ≠ MRZ (expect the conflict machinery)
 *  - adversarial:    the pre-existing AI-fake images (structurally non-ICAO
 *                    MRZs) — expectation is REFUSAL (mrzValid=false, no MRZ
 *                    field promoted). Refusing fakes is a pass.
 *
 * Usage: node bench/corpus/compile.cjs [--quick]
 * Output: test_cases/passports/synthetic/*.png + manifest.json
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

/* ------------------------------- seeded RNG ------------------------------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ----------------------------- ICAO 9303 math ----------------------------- */
// Mirrors src/parsers/mrz.ts (the vitest bridge asserts agreement).
function charValue(ch) {
  if (ch >= '0' && ch <= '9') return ch.charCodeAt(0) - 48;
  if (ch >= 'A' && ch <= 'Z') return ch.charCodeAt(0) - 55;
  return 0; // '<'
}
function checkDigit(s) {
  const w = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += charValue(s[i]) * w[i % 3];
  return String(sum % 10);
}
const pad = (s, n) => (s + '<'.repeat(n)).slice(0, n);

/* ----------------------------- identity forge ----------------------------- */
// Latin-transliterated multi-cultural names (MRZ is A–Z only), incl. doubled
// letters, apostrophe/hyphen VIZ forms, long-name truncation, short names.
const SURNAMES = ['ERIKSSON', 'NAKAMURA', 'OKONKWO', "O'BRIEN", 'AL-FARSI', 'SZCZEPANSKA', 'LI', 'FERNANDEZ GARCIA', 'MUELLER', 'ANAND', 'VAN DER BERG', 'KOWALCZYK'];
const GIVENS = ['ANNA MARIA', 'KENJI', 'CHINWE ADAEZE', 'SIOBHAN', 'LAYLA', 'MALGORZATA', 'WEI', 'JOSE LUIS', 'HANS PETER', 'PRIYA', 'WILLEM', 'ZOFIA'];
const COUNTRIES = ['UTO', 'XAA', 'XBB', 'XCC']; // reserved/test codes only — zero real-state claims
const SEXES = ['F', 'M', 'F', 'M', 'X', 'F', 'M', 'F', 'M', 'F', 'M', 'X'];

function mrzName(surname, given) {
  const clean = (s) => s.toUpperCase().replace(/[^A-Z ]/g, '').trim().replace(/ +/g, '<');
  return pad(`${clean(surname)}<<${clean(given)}`, 39);
}

function makeIdentity(i, rand) {
  const surname = SURNAMES[i % SURNAMES.length];
  const given = GIVENS[i % GIVENS.length];
  const country = COUNTRIES[i % COUNTRIES.length];
  const sex = SEXES[i % SEXES.length];
  const docNo = pad(
    Array.from({ length: 8 + Math.floor(rand() * 2) }, () =>
      'ABCDEFGHJKLMNPRSTUVWXYZ0123456789'[Math.floor(rand() * 33)]
    ).join(''),
    9
  );
  const yy = 50 + Math.floor(rand() * 50);           // birth 1950–1999
  const mm = 1 + Math.floor(rand() * 12);
  const dd = 1 + Math.floor(rand() * 28);
  const eyy = 26 + Math.floor(rand() * 8);           // expiry 2026–2033
  const emm = 1 + Math.floor(rand() * 12);
  const edd = 1 + Math.floor(rand() * 28);
  const d2 = (n) => String(n).padStart(2, '0');
  const dob = `${d2(yy)}${d2(mm)}${d2(dd)}`;
  const exp = `${d2(eyy)}${d2(emm)}${d2(edd)}`;

  const l1 = `P<${country}${mrzName(surname, given)}`;
  const optional = '<'.repeat(14);
  const body =
    docNo + checkDigit(docNo) + country + dob + checkDigit(dob) + sex.replace('X', 'X') +
    exp + checkDigit(exp) + optional + checkDigit(optional);
  const composite = body.slice(0, 10) + body.slice(13, 20) + body.slice(21, 43);
  const l2 = body + checkDigit(composite);
  if (l1.length !== 44 || l2.length !== 44) throw new Error(`bad MRZ lengths ${l1.length}/${l2.length}`);

  const isoDob = `${yy >= 50 ? 19 : 20}${d2(yy)}-${d2(mm)}-${d2(dd)}`;
  const isoExp = `20${d2(eyy)}-${d2(emm)}-${d2(edd)}`;
  return {
    surname, given, country, sex, docNo: docNo.replace(/</g, ''),
    vizDob: `${d2(dd)}/${d2(mm)}/${isoDob.slice(0, 4)}`,
    vizExp: `${d2(edd)}/${d2(emm)}/20${d2(eyy)}`,
    l1, l2,
    truth: {
      mrzLines: [l1, l2],
      passport_number: docNo.replace(/</g, ''),
      country_code: country,
      date_of_birth: isoDob,
      sex,
      date_of_expiry: isoExp,
      surname: surname.toUpperCase().replace(/[^A-Z ]/g, ''),
    },
  };
}

/* ------------------------------ page template ----------------------------- */
// Realistic passport data-page anatomy: small caption labels ABOVE values
// (never inline label:value crams — real passports and real OCR both separate
// them), tight monospace MRZ. Realism here is the corpus's entire value.

// ANTI-BIAS THEMES (deterministic per identity): a single font/background/
// layout family would let the engine overfit our rasterizer's quirks instead
// of the document domain. Fonts, page tints and the photo side rotate across
// identities; the MRZ font stays OCR-monospace (that IS physical reality).
const THEMES = [
  { font: 'Arial', bg: 'linear-gradient(135deg,#efe9dc,#e6ded0)', mirror: false, ink: '#22201a' },
  { font: 'Georgia, serif', bg: 'linear-gradient(150deg,#e7ecef,#d8e0e6)', mirror: false, ink: '#1a2026' },
  { font: 'Verdana', bg: 'linear-gradient(120deg,#eee7ea,#e2d6dc)', mirror: true, ink: '#241c20' },
  { font: "'Times New Roman', serif", bg: 'linear-gradient(160deg,#e9efe4,#dbe4d4)', mirror: false, ink: '#1c221a' },
  { font: 'Tahoma', bg: 'linear-gradient(140deg,#f0ece0,#e0dac8)', mirror: true, ink: '#26221a' },
  { font: "'Segoe UI'", bg: 'linear-gradient(125deg,#e6e9f0,#d6dbe8)', mirror: false, ink: '#1c1e26' },
];

function passportHtml(id, opts = {}) {
  const theme = THEMES[(opts.themeIdx ?? 0) % THEMES.length];
  const viz = opts.conflictViz ?? {};
  const dob = viz.dob ?? id.vizDob;
  const docNo = viz.docNo ?? id.docNo;
  const f = (cap, val) =>
    `<div style="min-width:200px"><div style="font-size:15px;color:#7a7160;text-transform:uppercase;letter-spacing:.5px">${cap}</div>` +
    `<div style="font-size:27px;font-weight:600;color:${theme.ink};margin-top:2px">${val}</div></div>`;
  // The MRZ is TEXT, not markup: unescaped '<' starts an HTML tag and the
  // browser silently swallows the entire zone (found via band-pixel dump —
  // the render contained only the leading 'P').
  const esc = (s) => s.replace(/</g, '&lt;');
  const photoBox = theme.mirror
    ? 'right:40px;top:110px;'
    : 'left:40px;top:110px;';
  const fieldBox = theme.mirror
    ? 'left:40px;top:104px;width:960px;'
    : 'left:380px;top:104px;right:40px;';
  return `<!doctype html><html><body style="margin:0">
<div id="doc" style="width:1400px;height:980px;background:${theme.bg};font-family:${theme.font};position:relative;overflow:hidden">
  <div style="position:absolute;inset:0;opacity:.12;background:repeating-linear-gradient(45deg,#b8a888 0 2px,transparent 2px 14px)"></div>
  <div style="position:relative;padding:26px 40px 10px;font-size:30px;font-weight:bold;letter-spacing:2px">PASSPORT</div>
  <div style="position:absolute;${photoBox}width:300px;height:380px;background:#cfc6b4;border:2px solid #94896f;display:flex;align-items:center;justify-content:center">
    <div style="width:170px;height:220px;border-radius:50% 50% 42% 42%/60% 60% 36% 36%;background:#8d8371"></div>
  </div>
  <div style="position:absolute;${fieldBox}display:flex;flex-wrap:wrap;gap:26px 48px">
    ${f('Type', 'P')}
    ${f('Country Code', id.country)}
    ${f('Passport No', docNo)}
    ${f('Surname', id.truth.surname)}
    ${f('Given Names', id.given)}
    ${f('Nationality', id.country)}
    ${f('Date of Birth', dob)}
    ${f('Sex', id.sex)}
    ${f('Date of Expiry', id.vizExp)}
    ${f('Place of Birth', 'CAPITAL CITY')}
  </div>
  <div style="position:absolute;left:0;right:0;bottom:22px;padding:10px 44px;font-family:'Lucida Console','Courier New',monospace;font-size:36px;font-weight:normal;letter-spacing:0;line-height:1.7;white-space:pre;background:#f4efe4;color:#111">${esc(id.l1)}\n${esc(id.l2)}</div>
</div></body></html>`;
}

/* --------------------------- degradation ladder --------------------------- */
// Each rung = { name, css?: transforms on capture, post?: canvas ops, jpegQ? }
const RUNGS = [
  { name: 'clean' },
  { name: 'jpeg40', jpegQ: 40 },
  { name: 'blur1', css: 'blur(1.1px)' },
  { name: 'blur2', css: 'blur(2px)', jpegQ: 60 },
  { name: 'rot3', rotate: 3 },
  { name: 'rot-7', rotate: -7, jpegQ: 70 },
  { name: 'persp', perspective: true },
  { name: 'noise', noise: 18 },
  { name: 'glare', glare: true },
  { name: 'small720', scale: 720 / 1400, jpegQ: 65 },
  { name: 'worst', css: 'blur(1.4px)', rotate: 4, noise: 14, glare: true, jpegQ: 45 },
];

async function capture(page, html, rung, outPath, seed) {
  // Rotation must scale-to-fit or the MRZ band (bottom of the page — the
  // very thing under test) rotates out of the crop. Caught by visual review.
  const rot = rung.rotate ?? 0;
  const fitScale = rot !== 0 ? 0.86 : 1;
  const wrapped = `<!doctype html><html><body style="margin:0;background:#55503f">
  <div style="width:1400px;height:980px;overflow:hidden;background:#4a453c">
    <div style="transform-origin:center;
      transform:${rung.perspective ? 'perspective(2200px) rotateX(7deg) rotateY(-6deg) scale(.94)' : ''} rotate(${rot}deg) scale(${fitScale});
      filter:${rung.css ?? 'none'}">${html.replace(/<!doctype html><html><body style="margin:0">|<\/body><\/html>/g, '')}</div>
  </div></body></html>`;
  await page.setViewport({ width: 1400, height: 980, deviceScaleFactor: rung.scale ? 1 : 1.4 });
  // Static markup: 'load' is correct and instant; 'networkidle0' can hang on
  // pages with zero network activity in some puppeteer/Chrome combinations.
  await page.setContent(wrapped, { waitUntil: 'load' });
  if (rung.noise || rung.glare) {
    await page.evaluate(({ noise, glare, seed }) => {
      const host = document.body.firstElementChild;
      if (glare) {
        const g = document.createElement('div');
        g.style.cssText = 'position:absolute;left:18%;top:6%;width:52%;height:46%;pointer-events:none;background:radial-gradient(ellipse at center,rgba(255,255,255,.55),rgba(255,255,255,0) 62%);transform:rotate(-14deg)';
        host.style.position = 'relative';
        host.appendChild(g);
      }
      if (noise) {
        const c = document.createElement('canvas');
        c.width = 700; c.height = 490;
        const ctx = c.getContext('2d');
        const img = ctx.createImageData(700, 490);
        let a = seed >>> 0;
        const rnd = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
        for (let i = 0; i < img.data.length; i += 4) {
          const v = Math.floor((rnd() - 0.5) * 2 * noise) + 128;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
          img.data[i + 3] = 46;
        }
        ctx.putImageData(img, 0, 0);
        const n = document.createElement('div');
        n.style.cssText = `position:absolute;inset:0;pointer-events:none;background:url(${c.toDataURL()});background-size:100% 100%;mix-blend-mode:overlay`;
        host.style.position = 'relative';
        host.appendChild(n);
      }
    }, { noise: rung.noise ?? 0, glare: !!rung.glare, seed });
  }
  const type = rung.jpegQ ? 'jpeg' : 'png';
  await page.screenshot({ path: outPath, type, ...(rung.jpegQ ? { quality: rung.jpegQ } : {}) });
}

/* --------------------------------- main ----------------------------------- */
(async () => {
  const quick = process.argv.includes('--quick');
  const OUT = path.join(__dirname, '..', '..', 'test_cases', 'passports', 'synthetic');
  fs.mkdirSync(OUT, { recursive: true });

  const identities = Array.from({ length: quick ? 3 : 16 }, (_, i) => makeIdentity(i, mulberry32(1000 + i)));
  const rungs = quick ? RUNGS.filter((r) => ['clean', 'blur2', 'rot-7', 'worst'].includes(r.name)) : RUNGS;

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const manifest = [];

  for (let i = 0; i < identities.length; i++) {
    const id = identities[i];
    for (const rung of rungs) {
      const file = `id${String(i).padStart(2, '0')}_${rung.name}.${rung.jpegQ ? 'jpg' : 'png'}`;
      await capture(page, passportHtml(id, { themeIdx: i }), rung, path.join(OUT, file), 7000 + i * 100);
      manifest.push({
        file, class: rung.name === 'clean' ? 'clean' : 'degraded', degradation: rung.name,
        identity: i, truth: id.truth,
        expect: { mrzValid: true, noSilentErrors: true },
      });
      process.stdout.write(`✓ ${file}\n`);
    }
    // One conflict specimen per 4th identity: VIZ doc number ≠ MRZ (worst
    // real-world scenario: tampering/typo — the engine must SURFACE it).
    if (i % 4 === 0) {
      const file = `id${String(i).padStart(2, '0')}_conflict.png`;
      const forged = id.docNo.slice(0, -1) + (id.docNo.endsWith('7') ? '9' : '7');
      await capture(page, passportHtml(id, { themeIdx: i, conflictViz: { docNo: forged } }), RUNGS[0], path.join(OUT, file), 9000 + i);
      manifest.push({
        file, class: 'conflict', degradation: 'clean', identity: i, truth: id.truth,
        expect: { mrzValid: true, conflictOn: ['passport_number'], noSilentErrors: true },
      });
      process.stdout.write(`✓ ${file} (conflict)\n`);
    }
  }

  // Adversarial class: the pre-existing AI-fake images (structurally non-ICAO
  // MRZs). Ground truth for them is exactly one thing: the engine must REFUSE
  // to claim their MRZ. Refusal is the pass condition.
  for (const f of ['3.jpg', '6.jpg', '7.jpg']) {
    if (fs.existsSync(path.join(__dirname, '..', '..', 'test_cases', 'passports', 'real_fakes', 'images', f))) {
      manifest.push({ file: `../real_fakes/images/${f}`, class: 'adversarial', degradation: 'n/a', identity: -1, truth: null, expect: { mrzValid: false } });
    }
  }

  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await browser.close();
  console.log(`\nCorpus compiled: ${manifest.length} entries → ${OUT}`);
})();
