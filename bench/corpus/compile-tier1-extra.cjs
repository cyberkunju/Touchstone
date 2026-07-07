/**
 * TIER-1 EXTRAS COMPILER — MRV visas + residence permits (Dataset Factory).
 *
 * MRV-B visas: TD2-shaped MRZ (36 cols, 'V<' prefix); residence permits:
 * TD1 with 'IR' document code. All check digits COMPUTED — same law as every
 * identity generator: truth exists before the pixel.
 *
 * Usage:  node bench/corpus/compile-tier1-extra.cjs [--quick]
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function charValue(ch) {
  if (ch >= '0' && ch <= '9') return ch.charCodeAt(0) - 48;
  if (ch >= 'A' && ch <= 'Z') return ch.charCodeAt(0) - 55;
  return 0;
}
function checkDigit(s) {
  const w = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += charValue(s[i]) * w[i % 3];
  return String(sum % 10);
}
const pad = (s, n) => (s + '<'.repeat(n)).slice(0, n);
const d2 = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s).replace(/</g, '&lt;');

const SURNAMES = ['ERIKSSON', 'NAKAMURA', 'OKONKWO', 'OBRIEN', 'ALFARSI', 'SZCZEPANSKA', 'LI', 'FERNANDEZ', 'MUELLER', 'ANAND'];
const GIVENS = ['ANNA', 'KENJI', 'CHINWE', 'SIOBHAN', 'LAYLA', 'MALGORZATA', 'WEI', 'JOSE', 'HANS', 'PRIYA'];
const COUNTRIES = ['UTO', 'XAA', 'XBB', 'XCC'];
const THEMES = [
  { font: 'Arial', bg: 'linear-gradient(135deg,#e9eef4,#d6dfe9)' },
  { font: 'Georgia, serif', bg: 'linear-gradient(150deg,#f0ebdf,#e3d9c5)' },
  { font: 'Verdana', bg: 'linear-gradient(120deg,#e9f1e7,#d6e3d3)' },
  { font: 'Tahoma', bg: 'linear-gradient(140deg,#f1e9eb,#e3d3d9)' },
];
const cap = (label, value) =>
  `<div style="min-width:170px"><div style="font-size:14px;color:#67707c;text-transform:uppercase;letter-spacing:.5px">${label}</div>` +
  `<div style="font-size:24px;font-weight:600;color:#1b2027;margin-top:1px">${esc(String(value))}</div></div>`;

function mrzName(surname, given, width) {
  return pad(`${surname}<<${given}`, width);
}
function makeIdentity(i, rand) {
  const surname = SURNAMES[i % SURNAMES.length];
  const given = GIVENS[i % GIVENS.length];
  const country = COUNTRIES[i % COUNTRIES.length];
  const sex = ['F', 'M', 'X'][i % 3];
  const docNo = Array.from({ length: 9 }, () => 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789'[Math.floor(rand() * 33)]).join('');
  const yy = 55 + Math.floor(rand() * 45);
  const mm = 1 + Math.floor(rand() * 12);
  const dd = 1 + Math.floor(rand() * 28);
  const eyy = 26 + Math.floor(rand() * 6);
  const emm = 1 + Math.floor(rand() * 12);
  const edd = 1 + Math.floor(rand() * 28);
  const dob = `${d2(yy)}${d2(mm)}${d2(dd)}`;
  const exp = `${d2(eyy)}${d2(emm)}${d2(edd)}`;
  return {
    surname, given, country, sex, docNo, dob, exp,
    isoDob: `19${d2(yy)}-${d2(mm)}-${d2(dd)}`,
    isoExp: `20${d2(eyy)}-${d2(emm)}-${d2(edd)}`,
    vizDob: `${d2(dd)}/${d2(mm)}/19${d2(yy)}`,
    vizExp: `${d2(edd)}/${d2(emm)}/20${d2(eyy)}`,
  };
}

/** MRV-B visa: 2×36, 'V<' prefix, same field layout as TD2 line 2. */
function buildMrvB(id) {
  const l1 = `V<${id.country}${mrzName(id.surname, id.given, 31)}`;
  const head = `${id.docNo}${checkDigit(id.docNo)}${id.country}${id.dob}${checkDigit(id.dob)}${id.sex}${id.exp}${checkDigit(id.exp)}${'<'.repeat(8)}`;
  if (l1.length !== 36 || head.length !== 36) throw new Error('MRV-B lengths');
  return [l1, head];
}
/** Residence permit: TD1 with 'IR' code. */
function buildPermitTd1(id) {
  const l1 = `IR${id.country}${id.docNo}${checkDigit(id.docNo)}${'<'.repeat(15)}`;
  const l2head = `${id.dob}${checkDigit(id.dob)}${id.sex}${id.exp}${checkDigit(id.exp)}${id.country}${'<'.repeat(11)}`;
  const composite = l1.slice(5, 30) + l2head.slice(0, 7) + l2head.slice(8, 15) + l2head.slice(18, 29);
  const l2 = `${l2head}${checkDigit(composite)}`;
  const l3 = mrzName(id.surname, id.given, 30);
  if (l1.length !== 30 || l2.length !== 30 || l3.length !== 30) throw new Error('TD1 lengths');
  return [l1, l2, l3];
}

function visaHtml(id, mrz, themeIdx) {
  const t = THEMES[themeIdx % THEMES.length];
  return `<!doctype html><html><body style="margin:0">
<div id="doc" style="width:1400px;height:980px;background:${t.bg};font-family:${t.font};position:relative;overflow:hidden">
  <div style="padding:26px 44px 6px;font-size:30px;font-weight:bold;letter-spacing:2px">VISA</div>
  <div style="padding:0 44px;font-size:16px;color:#67707c">Machine Readable Visa — Fictional Training Specimen</div>
  <div style="position:absolute;left:44px;top:120px;width:250px;height:320px;background:#cfd4dc;border:2px solid #8a94a4;display:flex;align-items:center;justify-content:center">
    <div style="width:140px;height:186px;border-radius:50% 50% 42% 42%/60% 60% 36% 36%;background:#7d8694"></div>
  </div>
  <div style="position:absolute;left:330px;top:112px;right:40px;display:flex;flex-wrap:wrap;gap:22px 44px">
    ${cap('Type', 'V')}
    ${cap('Issuing State', id.country)}
    ${cap('Document Number', id.docNo)}
    ${cap('Surname', id.surname)}
    ${cap('Given Names', id.given)}
    ${cap('Date of Birth', id.vizDob)}
    ${cap('Sex', id.sex)}
    ${cap('Valid Until', id.vizExp)}
    ${cap('Entries', 'MULTIPLE')}
    ${cap('Duration of Stay', '90 DAYS')}
  </div>
  <div style="position:absolute;left:0;right:0;bottom:20px;padding:10px 44px;font-family:'Lucida Console','Courier New',monospace;font-size:34px;line-height:1.6;white-space:pre;background:#f4efe4;color:#111">${mrz.map(esc).join('\n')}</div>
</div></body></html>`;
}

function permitHtml(id, mrz, themeIdx) {
  const t = THEMES[themeIdx % THEMES.length];
  return `<!doctype html><html><body style="margin:0">
<div id="doc" style="width:1360px;height:860px;background:${t.bg};font-family:${t.font};position:relative;overflow:hidden;border-radius:24px">
  <div style="padding:22px 36px 6px;font-size:26px;font-weight:bold;letter-spacing:1.5px">RESIDENCE PERMIT</div>
  <div style="position:absolute;left:36px;top:92px;width:220px;height:290px;background:#cfd4dc;border:2px solid #8a94a4;display:flex;align-items:center;justify-content:center">
    <div style="width:126px;height:168px;border-radius:50% 50% 42% 42%/60% 60% 36% 36%;background:#7d8694"></div>
  </div>
  <div style="position:absolute;left:290px;top:88px;right:32px;display:flex;flex-wrap:wrap;gap:16px 32px">
    ${cap('Document Number', id.docNo)}
    ${cap('Issuing State', id.country)}
    ${cap('Surname', id.surname)}
    ${cap('Given Names', id.given)}
    ${cap('Date of Birth', id.vizDob)}
    ${cap('Sex', id.sex)}
    ${cap('Valid Until', id.vizExp)}
    ${cap('Permit Type', 'LONG-TERM RESIDENT')}
  </div>
  <div style="position:absolute;left:0;right:0;bottom:14px;padding:8px 34px;font-family:'Lucida Console','Courier New',monospace;font-size:32px;line-height:1.55;white-space:pre;background:#f2f4f0;color:#111">${mrz.map(esc).join('\n')}</div>
</div></body></html>`;
}

const RUNGS = [
  { name: 'clean' },
  { name: 'jpeg40', jpegQ: 40 },
  { name: 'blur1', css: 'blur(1.1px)' },
  { name: 'rot3', rotate: 3 },
  { name: 'worst', css: 'blur(1.2px)', rotate: -5, noise: 30, jpegQ: 55 },
];

async function capture(page, html, rung, outPath, seed) {
  const rot = rung.rotate ?? 0;
  const fit = rot !== 0 ? 0.86 : 1;
  const wrapped = `<!doctype html><html><body style="margin:0;background:#b9b2a6;width:1480px;height:1060px;display:flex;align-items:center;justify-content:center">
    <div style="transform-origin:center;transform:rotate(${rot}deg) scale(${fit});filter:${rung.css ?? 'none'}">${html.replace(/<!doctype html><html><body style="margin:0">|<\/body><\/html>/g, '')}</div>
  </body></html>`;
  await page.setViewport({ width: 1480, height: 1060, deviceScaleFactor: 1.3 });
  await page.setContent(wrapped, { waitUntil: 'load' });
  if (rung.noise) {
    await page.evaluate(({ noise, seed: s0 }) => {
      const host = document.body.firstElementChild;
      const c = document.createElement('canvas');
      c.width = 740; c.height = 530;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(740, 530);
      let a = s0 >>> 0;
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
    }, { noise: rung.noise, seed });
  }
  const type = rung.jpegQ ? 'jpeg' : 'png';
  await page.screenshot({ path: outPath, type, ...(rung.jpegQ ? { quality: rung.jpegQ } : {}) });
}

(async () => {
  const quick = process.argv.includes('--quick');
  const root = path.join(__dirname, '..', '..');
  const N = quick ? 2 : 8;
  const rungs = quick ? RUNGS.filter((r) => ['clean', 'worst'].includes(r.name)) : RUNGS;
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();

  for (const fam of [
    { key: 'visas', title: 'Visas', build: buildMrvB, html: visaHtml, prefix: 'visa', seedBase: 21000 },
    { key: 'residence_permits', title: 'Residence permits', build: buildPermitTd1, html: permitHtml, prefix: 'perm', seedBase: 22000 },
  ]) {
    const OUT = path.join(root, 'test_cases', fam.key, 'synthetic');
    fs.mkdirSync(OUT, { recursive: true });
    const manifest = [];
    for (let i = 0; i < N; i++) {
      const id = makeIdentity(i, mulberry32(fam.seedBase + i));
      const mrz = fam.build(id);
      for (const rung of rungs) {
        const file = `${fam.prefix}_id${d2(i)}_${rung.name}.${rung.jpegQ ? 'jpg' : 'png'}`;
        await capture(page, fam.html(id, mrz, i), rung, path.join(OUT, file), fam.seedBase + i);
        manifest.push({
          file,
          class: rung.name === 'clean' ? fam.key.replace(/s$/, '') : `${fam.key.replace(/s$/, '')}_degraded`,
          degradation: rung.name,
          identity: i,
          truth: {
            passport_number: id.docNo,
            country_code: id.country,
            date_of_birth: id.isoDob,
            sex: id.sex,
            date_of_expiry: id.isoExp,
            surname: id.surname,
            mrzLines: mrz,
          },
          expect: { mrzValid: true, noSilentErrors: true },
        });
        process.stdout.write(`✓ ${file}\n`);
      }
    }
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`${fam.title}: ${manifest.length} → ${OUT}`);
  }
  await browser.close();
})();
