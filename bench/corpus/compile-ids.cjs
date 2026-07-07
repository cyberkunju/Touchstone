/**
 * ID-CARD & LICENSE CORPUS COMPILER (Dataset Factory W1 — E1 truth renderer).
 *
 * TD1 (3×30) and TD2 (2×36) ICAO identity cards: check digits COMPUTED, so
 * labels are right by mathematics — same law as the passport compiler.
 * AAMVA-style driving licenses: VIZ fields + a REAL PDF417 barcode (bwip-js)
 * whose payload duplicates the printed data — the barcode↔VIZ cross-check is
 * the family's verification anchor (decode = ground truth, zxing RS-corrected).
 *
 * Usage:  node bench/corpus/compile-ids.cjs [--quick]
 * Output: test_cases/id_cards/synthetic/  + manifest.json
 *         test_cases/licenses/synthetic/  + manifest.json
 */
const puppeteer = require('puppeteer');
const bwipjs = require('bwip-js');
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

/* ----------------------------- identity forge ----------------------------- */
const SURNAMES = ['ERIKSSON', 'NAKAMURA', 'OKONKWO', "O'BRIEN", 'AL-FARSI', 'SZCZEPANSKA', 'LI', 'FERNANDEZ GARCIA', 'MUELLER', 'ANAND', 'VAN DER BERG', 'KOWALCZYK'];
const GIVENS = ['ANNA MARIA', 'KENJI', 'CHINWE ADAEZE', 'SIOBHAN', 'LAYLA', 'MALGORZATA', 'WEI', 'JOSE LUIS', 'HANS PETER', 'PRIYA', 'WILLEM', 'ZOFIA'];
const COUNTRIES = ['UTO', 'XAA', 'XBB', 'XCC'];
const SEXES = ['F', 'M', 'F', 'M', 'X', 'F', 'M', 'F', 'M', 'F', 'M', 'X'];

function cleanName(s) { return s.toUpperCase().replace(/[^A-Z ]/g, '').trim(); }
function mrzName(surname, given, width) {
  const c = (s) => cleanName(s).replace(/ +/g, '<');
  return pad(`${c(surname)}<<${c(given)}`, width);
}

function makeIdentity(i, rand) {
  const surname = SURNAMES[i % SURNAMES.length];
  const given = GIVENS[i % GIVENS.length];
  const country = COUNTRIES[i % COUNTRIES.length];
  const sex = SEXES[i % SEXES.length];
  const docNo = Array.from({ length: 9 }, () => 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789'[Math.floor(rand() * 33)]).join('');
  const yy = 50 + Math.floor(rand() * 50);
  const mm = 1 + Math.floor(rand() * 12);
  const dd = 1 + Math.floor(rand() * 28);
  const eyy = 26 + Math.floor(rand() * 8);
  const emm = 1 + Math.floor(rand() * 12);
  const edd = 1 + Math.floor(rand() * 28);
  const dob = `${d2(yy)}${d2(mm)}${d2(dd)}`;
  const exp = `${d2(eyy)}${d2(emm)}${d2(edd)}`;
  const isoDob = `${yy >= 50 ? 19 : 20}${d2(yy)}-${d2(mm)}-${d2(dd)}`;
  const isoExp = `20${d2(eyy)}-${d2(emm)}-${d2(edd)}`;
  return {
    surname, given, country, sex, docNo, dob, exp, isoDob, isoExp,
    vizDob: `${d2(dd)}/${d2(mm)}/${isoDob.slice(0, 4)}`,
    vizExp: `${d2(edd)}/${d2(emm)}/20${d2(eyy)}`,
    truth: {
      passport_number: docNo,
      country_code: country,
      date_of_birth: isoDob,
      sex,
      date_of_expiry: isoExp,
      surname: cleanName(surname),
    },
  };
}

/* ------------------------- MRZ construction (TD1/TD2) --------------------- */
// Mirrors src/beam/mrz-beam.test.ts constructive goldens — parser-agreed law.
function buildTd1(id) {
  const l1 = `I<${id.country}${id.docNo}${checkDigit(id.docNo)}${'<'.repeat(15)}`;
  const l2head = `${id.dob}${checkDigit(id.dob)}${id.sex}${id.exp}${checkDigit(id.exp)}${id.country}${'<'.repeat(11)}`;
  const composite = l1.slice(5, 30) + l2head.slice(0, 7) + l2head.slice(8, 15) + l2head.slice(18, 29);
  const l2 = `${l2head}${checkDigit(composite)}`;
  const l3 = mrzName(id.surname, id.given, 30);
  if (l1.length !== 30 || l2.length !== 30 || l3.length !== 30) throw new Error('TD1 length');
  return [l1, l2, l3];
}

function buildTd2(id) {
  const l1 = `I<${id.country}${mrzName(id.surname, id.given, 31)}`;
  const head = `${id.docNo}${checkDigit(id.docNo)}${id.country}${id.dob}${checkDigit(id.dob)}${id.sex}${id.exp}${checkDigit(id.exp)}${'<'.repeat(7)}`;
  const composite = head.slice(0, 10) + head.slice(13, 20) + head.slice(21, 35);
  const l2 = `${head}${checkDigit(composite)}`;
  if (l1.length !== 36 || l2.length !== 36) throw new Error('TD2 length');
  return [l1, l2];
}

/* --------------------------- AAMVA PDF417 payload -------------------------- */
// Structurally-valid AAMVA DL subfile (v10-style header). The payload is the
// TRUTH — zxing's Reed-Solomon-corrected decode of it is the cross-check.
function aamvaPayload(id, state) {
  const dobA = `${id.isoDob.slice(5, 7)}${id.isoDob.slice(8, 10)}${id.isoDob.slice(0, 4)}`;
  const expA = `${id.isoExp.slice(5, 7)}${id.isoExp.slice(8, 10)}${id.isoExp.slice(0, 4)}`;
  const fields = [
    `DAQ${id.docNo}`,
    `DCS${cleanName(id.surname)}`,
    `DAC${cleanName(id.given).split(' ')[0]}`,
    `DBB${dobA}`,
    `DBA${expA}`,
    // AAMVA DBC: 1=male, 2=female, 9=unknown/X. Mapping X to '2' made the
    // BARCODE contradict the printed card — 14 self-inflicted "silent errors"
    // where the engine faithfully decoded what the payload actually said.
    `DBC${id.sex === 'M' ? '1' : id.sex === 'F' ? '2' : '9'}`,
    `DAG100 MAIN STREET`,
    `DAICAPITAL CITY`,
    `DAJ${state}`,
    `DAK00000`,
  ].join('\n');
  const sub = `DL${fields}\r`;
  const header = `@\n\x1e\rANSI 636000100002DL0041${String(sub.length).padStart(4, '0')}`;
  return header + sub;
}

/* ------------------------------ page templates ----------------------------- */
const THEMES = [
  { font: 'Arial', bg: 'linear-gradient(135deg,#e7ecf2,#d5dde8)' },
  { font: 'Georgia, serif', bg: 'linear-gradient(150deg,#efe9dc,#e2d8c4)' },
  { font: 'Verdana', bg: 'linear-gradient(120deg,#e8f0e6,#d5e2d2)' },
  { font: 'Tahoma', bg: 'linear-gradient(140deg,#f0e8ea,#e2d2d8)' },
];
const esc = (s) => s.replace(/</g, '&lt;');
const cap = (theme, label, value) =>
  `<div style="min-width:150px"><div style="font-size:13px;color:#6a7280;text-transform:uppercase;letter-spacing:.5px">${label}</div>` +
  `<div style="font-size:22px;font-weight:600;color:#1c2026;margin-top:1px">${value}</div></div>`;

/** ID-1 card render (1360×860 ≈ 85.6:54 aspect). */
function idCardHtml(id, mrzLines, themeIdx, title) {
  const t = THEMES[themeIdx % THEMES.length];
  const mrzFs = mrzLines[0].length === 30 ? 34 : 30; // TD1 lines are shorter
  return `<!doctype html><html><body style="margin:0">
<div id="doc" style="width:1360px;height:860px;background:${t.bg};font-family:${t.font};position:relative;overflow:hidden;border-radius:24px">
  <div style="position:absolute;inset:0;opacity:.1;background:repeating-linear-gradient(60deg,#8899aa 0 2px,transparent 2px 16px)"></div>
  <div style="position:relative;padding:22px 36px 6px;font-size:26px;font-weight:bold;letter-spacing:1.5px">${title}</div>
  <div style="position:absolute;left:36px;top:92px;width:230px;height:300px;background:#cfd4dc;border:2px solid #8a94a4;display:flex;align-items:center;justify-content:center">
    <div style="width:130px;height:172px;border-radius:50% 50% 42% 42%/60% 60% 36% 36%;background:#7d8694"></div>
  </div>
  <div style="position:absolute;left:300px;top:88px;right:32px;display:flex;flex-wrap:wrap;gap:16px 34px">
    ${cap(t, 'Document Number', id.docNo)}
    ${cap(t, 'Country Code', id.country)}
    ${cap(t, 'Surname', cleanName(id.surname))}
    ${cap(t, 'Given Names', id.given)}
    ${cap(t, 'Date of Birth', id.vizDob)}
    ${cap(t, 'Sex', id.sex)}
    ${cap(t, 'Date of Expiry', id.vizExp)}
    ${cap(t, 'Nationality', id.country)}
  </div>
  <div style="position:absolute;left:0;right:0;bottom:16px;padding:8px 34px;font-family:'Lucida Console','Courier New',monospace;font-size:${mrzFs}px;font-weight:normal;letter-spacing:0;line-height:1.55;white-space:pre;background:#f2f4f0;color:#111">${mrzLines.map(esc).join('\n')}</div>
</div></body></html>`;
}

/** License render: VIZ fields + embedded REAL PDF417 (dataURL). */
function licenseHtml(id, barcodeDataUrl, themeIdx, state) {
  const t = THEMES[themeIdx % THEMES.length];
  return `<!doctype html><html><body style="margin:0">
<div id="doc" style="width:1360px;height:860px;background:${t.bg};font-family:${t.font};position:relative;overflow:hidden;border-radius:24px">
  <div style="position:relative;padding:20px 36px 4px;font-size:25px;font-weight:bold;letter-spacing:1.2px">${state} DRIVER LICENSE</div>
  <div style="position:absolute;left:36px;top:86px;width:220px;height:280px;background:#cfd4dc;border:2px solid #8a94a4;display:flex;align-items:center;justify-content:center">
    <div style="width:124px;height:164px;border-radius:50% 50% 42% 42%/60% 60% 36% 36%;background:#7d8694"></div>
  </div>
  <div style="position:absolute;left:290px;top:82px;right:32px;display:flex;flex-wrap:wrap;gap:14px 30px">
    ${cap(t, 'License No', id.docNo)}
    ${cap(t, 'Surname', cleanName(id.surname))}
    ${cap(t, 'Given Names', id.given)}
    ${cap(t, 'Date of Birth', id.vizDob)}
    ${cap(t, 'Sex', id.sex)}
    ${cap(t, 'Expires', id.vizExp)}
    ${cap(t, 'Address', '100 MAIN STREET')}
    ${cap(t, 'City', 'CAPITAL CITY')}
  </div>
  <div style="position:absolute;left:34px;right:34px;bottom:18px;background:#fff;padding:12px 14px;display:flex;justify-content:center">
    <img src="${barcodeDataUrl}" style="height:230px;image-rendering:pixelated"/>
  </div>
</div></body></html>`;
}

/* --------------------------- degradation ladder --------------------------- */
const RUNGS = [
  { name: 'clean' },
  { name: 'jpeg40', jpegQ: 40 },
  { name: 'blur1', css: 'blur(1.1px)' },
  { name: 'rot3', rotate: 3 },
  { name: 'persp', perspective: true },
  { name: 'small720', small: true, jpegQ: 75 },
  { name: 'worst', css: 'blur(1.2px)', rotate: -5, noise: 30, jpegQ: 55 },
];

// Proven capture pattern (ported from compile.cjs): transforms via CSS on a
// wrapper, noise as an in-DOM canvas overlay, downscale via deviceScaleFactor.
async function capture(page, html, rung, outPath, seed) {
  const rot = rung.rotate ?? 0;
  const fit = rot !== 0 || rung.perspective ? 0.86 : 1;
  const wrapped = `<!doctype html><html><body style="margin:0;background:#b9b2a6;width:1480px;height:980px;display:flex;align-items:center;justify-content:center">
    <div style="transform-origin:center;
      transform:${rung.perspective ? 'perspective(2200px) rotateX(6deg) rotateY(-5deg) scale(.94)' : ''} rotate(${rot}deg) scale(${fit});
      filter:${rung.css ?? 'none'}">${html.replace(/<!doctype html><html><body style="margin:0">|<\/body><\/html>/g, '')}</div>
  </body></html>`;
  await page.setViewport({
    width: 1480,
    height: 980,
    deviceScaleFactor: rung.small ? 0.5 : 1.3,
  });
  await page.setContent(wrapped, { waitUntil: 'load' });
  if (rung.noise) {
    await page.evaluate(({ noise, seed: s0 }) => {
      const host = document.body.firstElementChild;
      const c = document.createElement('canvas');
      c.width = 740; c.height = 490;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(740, 490);
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

/* --------------------------------- main ----------------------------------- */
(async () => {
  const quick = process.argv.includes('--quick');
  const root = path.join(__dirname, '..', '..');
  const OUT_IDS = path.join(root, 'test_cases', 'id_cards', 'synthetic');
  const OUT_LIC = path.join(root, 'test_cases', 'licenses', 'synthetic');
  fs.mkdirSync(OUT_IDS, { recursive: true });
  fs.mkdirSync(OUT_LIC, { recursive: true });

  const N = quick ? 2 : 18;
  const identities = Array.from({ length: N }, (_, i) => makeIdentity(i, mulberry32(4000 + i)));
  const rungs = quick ? RUNGS.filter((r) => ['clean', 'worst'].includes(r.name)) : RUNGS;

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();

  // --- ID cards (TD1 for even identities, TD2 for odd — both formats live) --
  const idManifest = [];
  for (let i = 0; i < identities.length; i++) {
    const id = identities[i];
    const isTd1 = i % 2 === 0;
    const mrzLines = isTd1 ? buildTd1(id) : buildTd2(id);
    const title = isTd1 ? 'NATIONAL IDENTITY CARD' : 'IDENTITY DOCUMENT';
    for (const rung of rungs) {
      const file = `td${isTd1 ? 1 : 2}_id${d2(i)}_${rung.name}.${rung.jpegQ ? 'jpg' : 'png'}`;
      await capture(page, idCardHtml(id, mrzLines, i, title), rung, path.join(OUT_IDS, file), 11000 + i * 100);
      idManifest.push({
        file,
        class: rung.name === 'clean' ? 'clean' : 'degraded',
        degradation: rung.name,
        format: isTd1 ? 'TD1' : 'TD2',
        identity: i,
        truth: { ...id.truth, mrzLines },
        expect: { mrzValid: true, noSilentErrors: true },
      });
      process.stdout.write(`✓ ${file}\n`);
    }
  }
  fs.writeFileSync(path.join(OUT_IDS, 'manifest.json'), JSON.stringify(idManifest, null, 2));

  // --- Licenses (real PDF417, payload = truth) ------------------------------
  const licManifest = [];
  for (let i = 0; i < identities.length; i++) {
    const id = identities[i];
    const state = ['UT', 'XA', 'XB', 'XC'][i % 4];
    const payload = aamvaPayload(id, state);
    // Truth = ONLY what the document actually shows. Licenses carry no ICAO
    // country code — claiming one in truth would penalize correct behavior.
    const licTruth = { ...id.truth, barcodePayload: payload };
    delete licTruth.country_code;
    const png = await bwipjs.toBuffer({
      bcid: 'pdf417', text: payload, scale: 3, padding: 6,
    });
    const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
    for (const rung of rungs) {
      const file = `lic_id${d2(i)}_${rung.name}.${rung.jpegQ ? 'jpg' : 'png'}`;
      await capture(page, licenseHtml(id, dataUrl, i, state), rung, path.join(OUT_LIC, file), 12000 + i * 100);
      licManifest.push({
        file,
        class: 'license',
        degradation: rung.name,
        identity: i,
        truth: licTruth,
        expect: { barcodeDecodes: true, noSilentErrors: true },
      });
      process.stdout.write(`✓ ${file}\n`);
    }
  }
  fs.writeFileSync(path.join(OUT_LIC, 'manifest.json'), JSON.stringify(licManifest, null, 2));

  await browser.close();
  console.log(`\nID-card corpus: ${idManifest.length} → ${OUT_IDS}`);
  console.log(`License corpus: ${licManifest.length} → ${OUT_LIC}`);
})();
