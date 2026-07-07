/**
 * STRUCTURED-DOCS CORPUS COMPILER (Dataset Factory W3 — E1 truth renderer).
 *
 * Four Tier-3 families, every one anchored in REAL mathematics or a REAL
 * machine-verifiable payload:
 *   - Vehicle registration docs: VIN with a true ISO 3779 check digit.
 *   - Boarding passes: IATA BCBP-style payload in a REAL Aztec barcode.
 *   - Shipping labels: tracking number with mod-10 check digit + Code128.
 *   - Business cards: email/phone grammar targets (generic layer).
 *
 * Usage:  node bench/corpus/compile-structured.cjs [--quick]
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
const d2 = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s).replace(/</g, '&lt;');

/* ----------------------------- ISO 3779 VIN ------------------------------- */
// Transliteration: digits are themselves; letters per the standard (I,O,Q banned).
const VIN_ALPHABET = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
const VIN_VALUES = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
function vinCharValue(ch) {
  return ch >= '0' && ch <= '9' ? Number(ch) : VIN_VALUES[ch];
}
function computeVinCheckDigit(vin17) {
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += vinCharValue(vin17[i]) * VIN_WEIGHTS[i];
  const r = sum % 11;
  return r === 10 ? 'X' : String(r);
}
/** Construct a 17-char VIN whose position 9 (index 8) is the TRUE check digit. */
function makeVin(rand) {
  const pick = () => VIN_ALPHABET[Math.floor(rand() * VIN_ALPHABET.length)];
  const chars = Array.from({ length: 17 }, pick);
  chars[8] = '0';
  chars[8] = computeVinCheckDigit(chars.join(''));
  const vin = chars.join('');
  if (computeVinCheckDigit(vin) !== vin[8]) throw new Error('VIN check math broke');
  return vin;
}

/* -------------------------- mod-10 tracking digit -------------------------- */
// Alternating 3,1 weights from the RIGHT; check = (10 − sum mod 10) mod 10.
function trackingCheckDigit(digits15) {
  let sum = 0;
  for (let i = 0; i < digits15.length; i++) {
    const fromRight = digits15.length - 1 - i;
    sum += Number(digits15[i]) * (fromRight % 2 === 0 ? 3 : 1);
  }
  return String((10 - (sum % 10)) % 10);
}
function makeTracking(rand) {
  const body = Array.from({ length: 15 }, () => String(Math.floor(rand() * 10))).join('');
  return body + trackingCheckDigit(body);
}

/* ----------------------------- shared pools -------------------------------- */
const PEOPLE = [
  'ANNA ERIKSSON', 'KENJI NAKAMURA', 'CHINWE OKONKWO', 'SIOBHAN OBRIEN',
  'LAYLA ALFARSI', 'MALGORZATA SZCZEPANSKA', 'WEI LI', 'JOSE FERNANDEZ',
  'HANS MUELLER', 'PRIYA ANAND', 'WILLEM VAN DER BERG', 'ZOFIA KOWALCZYK',
];
const THEMES = [
  { font: 'Arial', bg: 'linear-gradient(135deg,#eef1f4,#dde3ea)' },
  { font: 'Georgia, serif', bg: 'linear-gradient(150deg,#f1ece1,#e5dbc8)' },
  { font: 'Verdana', bg: 'linear-gradient(120deg,#eaf1e8,#d9e4d5)' },
  { font: 'Tahoma', bg: 'linear-gradient(140deg,#f2eaec,#e5d6db)' },
];
const cap = (label, value) =>
  `<div style="min-width:170px"><div style="font-size:13px;color:#67707c;text-transform:uppercase;letter-spacing:.5px">${label}</div>` +
  `<div style="font-size:23px;font-weight:600;color:#1b2027;margin-top:1px">${esc(String(value))}</div></div>`;

/* ------------------------------ page templates ----------------------------- */
function vehicleHtml(v, themeIdx) {
  const t = THEMES[themeIdx % THEMES.length];
  return `<!doctype html><html><body style="margin:0">
<div id="doc" style="width:1400px;height:1000px;background:${t.bg};font-family:${t.font};position:relative;overflow:hidden">
  <div style="padding:30px 44px 8px;font-size:30px;font-weight:bold;letter-spacing:1.5px">VEHICLE REGISTRATION CERTIFICATE</div>
  <div style="padding:2px 44px;font-size:16px;color:#67707c">Department of Road Transport — Fictional Training Specimen</div>
  <div style="position:absolute;left:44px;top:130px;right:44px;display:flex;flex-wrap:wrap;gap:26px 52px">
    ${cap('Registered Owner', v.owner)}
    ${cap('Plate Number', v.plate)}
    ${cap('Vehicle Identification Number', v.vin)}
    ${cap('Make', v.make)}
    ${cap('Model', v.model)}
    ${cap('Year of Manufacture', v.year)}
    ${cap('Body Type', v.body)}
    ${cap('Fuel', v.fuel)}
    ${cap('Registration Date', v.regDateViz)}
    ${cap('Valid Until', v.expDateViz)}
  </div>
  <div style="position:absolute;left:44px;bottom:40px;right:44px;border-top:2px solid #9aa4b2;padding-top:14px;font-size:15px;color:#67707c">
    This certificate is issued for vehicle identification purposes. VIN check digit verified per ISO 3779.
  </div>
</div></body></html>`;
}

function boardingHtml(b, barcodeUrl, themeIdx) {
  const t = THEMES[themeIdx % THEMES.length];
  return `<!doctype html><html><body style="margin:0">
<div id="doc" style="width:1400px;height:600px;background:${t.bg};font-family:${t.font};position:relative;overflow:hidden;border-radius:18px">
  <div style="padding:22px 40px 4px;font-size:26px;font-weight:bold;letter-spacing:1px">${b.airline} — BOARDING PASS</div>
  <div style="position:absolute;left:40px;top:86px;display:flex;flex-wrap:wrap;gap:18px 42px;max-width:900px">
    ${cap('Passenger', b.passenger)}
    ${cap('Flight', b.flight)}
    ${cap('From', b.from)}
    ${cap('To', b.to)}
    ${cap('Date', b.dateViz)}
    ${cap('Seat', b.seat)}
    ${cap('Gate', b.gate)}
    ${cap('Boarding Time', b.boarding)}
  </div>
  <div style="position:absolute;right:36px;top:80px;bottom:36px;width:360px;background:#fff;display:flex;align-items:center;justify-content:center;padding:12px">
    <img src="${barcodeUrl}" style="width:320px;image-rendering:pixelated"/>
  </div>
</div></body></html>`;
}

function shippingHtml(s, barcodeUrl, themeIdx) {
  const t = THEMES[themeIdx % THEMES.length];
  return `<!doctype html><html><body style="margin:0">
<div id="doc" style="width:1000px;height:1400px;background:#fff;font-family:${t.font};position:relative;overflow:hidden;border:3px solid #111">
  <div style="padding:20px 30px;border-bottom:3px solid #111;display:flex;justify-content:space-between">
    <div style="font-size:30px;font-weight:bold">${s.carrier}</div>
    <div style="font-size:24px;font-weight:bold;border:2px solid #111;padding:4px 14px">${s.service}</div>
  </div>
  <div style="padding:18px 30px;display:flex;gap:40px">
    <div style="flex:1">
      <div style="font-size:13px;color:#555;text-transform:uppercase">Ship From</div>
      <div style="font-size:19px;line-height:1.5">${s.sender.join('<br>')}</div>
    </div>
    <div style="flex:1">
      <div style="font-size:13px;color:#555;text-transform:uppercase">Ship To</div>
      <div style="font-size:23px;font-weight:600;line-height:1.5">${s.recipient.join('<br>')}</div>
    </div>
  </div>
  <div style="padding:6px 30px;display:flex;gap:44px">
    ${cap('Weight', s.weight)}
    ${cap('Pieces', '1 OF 1')}
    ${cap('Ship Date', s.dateViz)}
  </div>
  <div style="position:absolute;left:30px;right:30px;bottom:60px;border-top:3px solid #111;padding-top:18px;text-align:center">
    <img src="${barcodeUrl}" style="width:820px;image-rendering:pixelated"/>
    <div style="font-size:15px;color:#555;text-transform:uppercase;margin-top:12px">Tracking Number</div>
    <div style="font-size:30px;font-weight:bold;letter-spacing:3px">${s.tracking}</div>
  </div>
</div></body></html>`;
}

function cardHtml(c, themeIdx) {
  const t = THEMES[themeIdx % THEMES.length];
  return `<!doctype html><html><body style="margin:0">
<div id="doc" style="width:1050px;height:600px;background:${t.bg};font-family:${t.font};position:relative;overflow:hidden;border-radius:14px">
  <div style="position:absolute;left:54px;top:110px">
    <div style="font-size:40px;font-weight:bold;color:#182030">${c.name}</div>
    <div style="font-size:23px;color:#5a6472;margin-top:6px">${c.title}</div>
    <div style="font-size:26px;font-weight:600;color:#2a3446;margin-top:26px">${c.company}</div>
  </div>
  <div style="position:absolute;left:54px;bottom:60px;display:flex;flex-direction:column;gap:10px;font-size:21px;color:#333c48">
    <div>Email&nbsp;&nbsp;${c.email}</div>
    <div>Phone&nbsp;&nbsp;${c.phone}</div>
    <div>Web&nbsp;&nbsp;&nbsp;&nbsp;${c.web}</div>
  </div>
</div></body></html>`;
}

/* --------------------------- degradation ladder --------------------------- */
const RUNGS = [
  { name: 'clean' },
  { name: 'jpeg40', jpegQ: 40 },
  { name: 'blur1', css: 'blur(1.1px)' },
  { name: 'rot3', rotate: 3 },
  { name: 'worst', css: 'blur(1.2px)', rotate: -5, noise: 30, jpegQ: 55 },
];
const CARD_RUNGS = RUNGS.filter((r) => ['clean', 'blur1', 'worst'].includes(r.name));

async function capture(page, html, rung, outPath, seed, vw = 1480, vh = 1060) {
  const rot = rung.rotate ?? 0;
  const fit = rot !== 0 ? 0.86 : 1;
  const wrapped = `<!doctype html><html><body style="margin:0;background:#b9b2a6;width:${vw}px;height:${vh}px;display:flex;align-items:center;justify-content:center">
    <div style="transform-origin:center;transform:rotate(${rot}deg) scale(${fit});filter:${rung.css ?? 'none'}">${html.replace(/<!doctype html><html><body style="margin:0">|<\/body><\/html>/g, '')}</div>
  </body></html>`;
  await page.setViewport({ width: vw, height: vh, deviceScaleFactor: 1.25 });
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

/* --------------------------------- main ----------------------------------- */
(async () => {
  const quick = process.argv.includes('--quick');
  const root = path.join(__dirname, '..', '..');
  const out = (fam) => {
    const p = path.join(root, 'test_cases', fam, 'synthetic');
    fs.mkdirSync(p, { recursive: true });
    return p;
  };
  const N = quick ? 2 : 10;
  const rungs = quick ? RUNGS.filter((r) => ['clean', 'worst'].includes(r.name)) : RUNGS;
  const cardRungs = quick ? CARD_RUNGS.filter((r) => ['clean', 'worst'].includes(r.name)) : CARD_RUNGS;

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const barcodeUrl = async (opts) =>
    `data:image/png;base64,${(await bwipjs.toBuffer(opts)).toString('base64')}`;

  // ---- Vehicle registration (ISO 3779 VIN) ---------------------------------
  {
    const OUT = out('vehicle_docs');
    const MAKES = [['NORDWAGEN', 'TERRA GT'], ['KITSUNE MOTORS', 'AURA X'], ['VELOCE AUTO', 'STRADA S'], ['POLAR MOTORS', 'GLACIER LX']];
    const manifest = [];
    for (let i = 0; i < N; i++) {
      const rand = mulberry32(6000 + i);
      const vin = makeVin(rand);
      const [make, model] = MAKES[i % MAKES.length];
      const plate = `${'BCDFGHJKLMNPRSTVWXYZ'[Math.floor(rand() * 20)]}${'BCDFGHJKLMNPRSTVWXYZ'[Math.floor(rand() * 20)]}${'BCDFGHJKLMNPRSTVWXYZ'[Math.floor(rand() * 20)]} ${1000 + Math.floor(rand() * 9000)}`;
      const year = 2012 + Math.floor(rand() * 14);
      const v = {
        owner: PEOPLE[i % PEOPLE.length], vin, plate, make, model, year,
        body: ['SEDAN', 'HATCHBACK', 'SUV', 'WAGON'][i % 4],
        fuel: ['PETROL', 'DIESEL', 'ELECTRIC', 'HYBRID'][i % 4],
        regDateViz: `0${1 + (i % 9)}/03/2024`,
        expDateViz: `0${1 + (i % 9)}/03/2031`,
      };
      for (const rung of rungs) {
        const file = `veh_id${d2(i)}_${rung.name}.${rung.jpegQ ? 'jpg' : 'png'}`;
        await capture(page, vehicleHtml(v, i), rung, path.join(OUT, file), 61000 + i);
        manifest.push({
          file, class: rung.name === 'clean' ? 'vehicle_doc' : 'vehicle_doc_degraded',
          degradation: rung.name, identity: i,
          truth: { vin, plate: v.plate, owner: v.owner, year: String(year) },
          expect: { noSilentErrors: true },
        });
        process.stdout.write(`✓ ${file}\n`);
      }
    }
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`Vehicle docs: ${manifest.length} → ${OUT}`);
  }

  // ---- Boarding passes (real Aztec, BCBP-style payload) --------------------
  {
    const OUT = out('boarding_passes');
    const AIRLINES = [['NIMBUS AIR', 'NB'], ['POLARIS AIRWAYS', 'PX'], ['MERIDIAN JET', 'MJ'], ['AURORA WINGS', 'AW']];
    const manifest = [];
    for (let i = 0; i < N; i++) {
      const rand = mulberry32(7000 + i);
      const [airline, code] = AIRLINES[i % AIRLINES.length];
      const person = PEOPLE[i % PEOPLE.length];
      const [given, ...rest] = person.split(' ');
      const surname = rest.join(' ') || given;
      const flight = `${code}${100 + Math.floor(rand() * 900)}`;
      const from = `QQ${'ABCDEFGH'[i % 8]}`;
      const to = `QQ${'JKLMNPRS'[i % 8]}`;
      const seat = `${1 + Math.floor(rand() * 34)}${'ACDF'[Math.floor(rand() * 4)]}`;
      // BCBP M1: name(20) padded, e-ticket flag E, PNR(7), from, to, carrier,
      // flight(5), julian date(3), class, seat(4), sequence, status.
      const pnr = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPRSTUVWXYZ123456789'[Math.floor(rand() * 32)]).join('');
      const julian = String(60 + Math.floor(rand() * 300)).padStart(3, '0');
      const name20 = `${surname.replace(/ /g, '')}/${given}`.slice(0, 20).padEnd(20, ' ');
      const payload = `M1${name20}E${pnr} ${from}${to}${code} ${flight.slice(2).padStart(4, '0')} ${julian}Y${seat.padStart(4, '0')}0051 100`;
      const b = {
        airline, passenger: person, flight, from, to, seat,
        gate: `${'ABC'[i % 3]}${1 + (i % 22)}`,
        dateViz: `1${i % 9}/08/2026`,
        boarding: `0${7 + (i % 3)}:${d2(10 + (i % 5) * 10)}`,
      };
      const url = await barcodeUrl({ bcid: 'azteccode', text: payload, scale: 4 });
      for (const rung of rungs) {
        const file = `bp_id${d2(i)}_${rung.name}.${rung.jpegQ ? 'jpg' : 'png'}`;
        await capture(page, boardingHtml(b, url, i), rung, path.join(OUT, file), 71000 + i, 1480, 680);
        manifest.push({
          file, class: rung.name === 'clean' ? 'boarding_pass' : 'boarding_pass_degraded',
          degradation: rung.name, identity: i,
          truth: { passenger: person, flight, seat, barcodePayload: payload },
          expect: { barcodeDecodes: true, noSilentErrors: true },
        });
        process.stdout.write(`✓ ${file}\n`);
      }
    }
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`Boarding passes: ${manifest.length} → ${OUT}`);
  }

  // ---- Shipping labels (mod-10 tracking + Code128) -------------------------
  {
    const OUT = out('shipping_labels');
    const CARRIERS = ['SWIFTPARCEL', 'NIMBUS LOGISTICS', 'POLAR EXPRESS FREIGHT'];
    const manifest = [];
    for (let i = 0; i < N; i++) {
      const rand = mulberry32(8000 + i);
      const tracking = makeTracking(rand);
      const recipient = PEOPLE[(i + 3) % PEOPLE.length];
      const s = {
        carrier: CARRIERS[i % CARRIERS.length],
        service: ['EXPRESS', 'GROUND', 'PRIORITY'][i % 3],
        sender: [PEOPLE[i % PEOPLE.length], `${100 + i} INDUSTRIAL WAY`, 'DEPOT CITY 00810'],
        recipient: [recipient, `${200 + i} MAPLE AVENUE`, `SUITE ${1 + (i % 40)}`, 'HARBORVIEW 00442'],
        weight: `${(1 + rand() * 19).toFixed(1)} KG`,
        dateViz: `2${i % 8}/07/2026`,
        tracking,
      };
      const url = await barcodeUrl({ bcid: 'code128', text: tracking, scale: 3, height: 18 });
      for (const rung of rungs) {
        const file = `ship_id${d2(i)}_${rung.name}.${rung.jpegQ ? 'jpg' : 'png'}`;
        await capture(page, shippingHtml(s, url, i), rung, path.join(OUT, file), 81000 + i, 1080, 1480);
        manifest.push({
          file, class: rung.name === 'clean' ? 'shipping_label' : 'shipping_label_degraded',
          degradation: rung.name, identity: i,
          truth: { tracking_number: tracking, recipient_name: recipient, barcodePayload: tracking },
          expect: { barcodeDecodes: true, noSilentErrors: true },
        });
        process.stdout.write(`✓ ${file}\n`);
      }
    }
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`Shipping labels: ${manifest.length} → ${OUT}`);
  }

  // ---- Business cards -------------------------------------------------------
  {
    const OUT = out('business_cards');
    const COMPANIES = ['Cobalt Ridge Consulting', 'Fernline Studios', 'Atlas Meadow Foods', 'Skybridge Telecom'];
    const TITLES = ['Senior Engineer', 'Operations Director', 'Product Designer', 'Account Manager'];
    const M = quick ? 2 : 12;
    const manifest = [];
    for (let i = 0; i < M; i++) {
      const person = PEOPLE[i % PEOPLE.length];
      const company = COMPANIES[i % COMPANIES.length];
      const slug = company.toLowerCase().replace(/[^a-z]/g, '');
      const first = person.split(' ')[0].toLowerCase();
      const c = {
        name: person, title: TITLES[i % TITLES.length], company,
        email: `${first}@${slug}.example`,
        phone: `+1-555-01${d2(i)}`,
        web: `www.${slug}.example`,
      };
      for (const rung of cardRungs) {
        const file = `card_id${d2(i)}_${rung.name}.${rung.jpegQ ? 'jpg' : 'png'}`;
        await capture(page, cardHtml(c, i), rung, path.join(OUT, file), 91000 + i, 1120, 680);
        manifest.push({
          file, class: rung.name === 'clean' ? 'business_card' : 'business_card_degraded',
          degradation: rung.name, identity: i,
          truth: { full_name: person, email: c.email, phone: c.phone },
          expect: { noSilentErrors: true },
        });
        process.stdout.write(`✓ ${file}\n`);
      }
    }
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`Business cards: ${manifest.length} → ${OUT}`);
  }

  await browser.close();
})();
