/**
 * CORPUS COMPILER — non-passport document classes (invoices, receipts,
 * generic forms, hard negatives). Same doctrine as the passport compiler:
 * seeded determinism, truth-by-construction (totals COMPUTED from line items
 * so arithmetic is exact), realistic anatomy, physics degradation, sidecar
 * manifest. Output: test_cases/docs/synthetic/ + manifest.json.
 *
 * Hard negatives are documents that are NOT extractable subjects (book page,
 * screenshot, poster): the only expectation is honesty — zero confirmed
 * identity/invoice fields, no MRZ claim. Refusing noise is a pass.
 *
 * Usage: node bench/corpus/compile-docs.cjs [--quick]
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

/* ------------------------------ identities -------------------------------- */
const VENDORS = ['NORTHWIND SUPPLIES LTD', 'ACME INDUSTRIAL CO', 'BLUE HARBOR FOODS', 'ORION TECH SERVICES', 'CEDAR & STONE STUDIO', 'KILIMANJARO TRADING'];
const CUSTOMERS = ['Meridian Labs', 'Kestrel Logistics', 'Aster & Vale LLP', 'Juniper Retail Group'];
const ITEMS = [
  ['Widget A-11', 'Bracket M4', 'Hex Kit', 'Panel Mount', 'Cable 2m'],
  ['Consulting (hr)', 'Site Audit', 'Report Prep', 'Travel'],
  ['Espresso Beans 1kg', 'Filter Pack', 'Cleaner 500ml', 'Cups x50'],
];

function makeInvoice(i, rand) {
  const vendor = VENDORS[i % VENDORS.length];
  const customer = CUSTOMERS[i % CUSTOMERS.length];
  const number = `INV-${2026 - (i % 3)}-${String(1000 + Math.floor(rand() * 9000))}`;
  const day = 1 + Math.floor(rand() * 28);
  const month = 1 + Math.floor(rand() * 12);
  const d2 = (n) => String(n).padStart(2, '0');
  const dateViz = `${d2(day)}/${d2(month)}/2026`;
  const dateIso = `2026-${d2(month)}-${d2(day)}`;
  const pool = ITEMS[i % ITEMS.length];
  const lines = pool.slice(0, 3 + Math.floor(rand() * 2)).map((name) => {
    const qty = 1 + Math.floor(rand() * 9);
    const unit = Math.round((5 + rand() * 240) * 100) / 100;
    return { name, qty, unit, line: Math.round(qty * unit * 100) / 100 };
  });
  // Truth by construction: totals COMPUTED — arithmetic closure holds exactly.
  const subtotal = Math.round(lines.reduce((s, l) => s + l.line, 0) * 100) / 100;
  const tax = Math.round(subtotal * 0.08 * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;
  const money = (v) => `$${v.toFixed(2)}`;
  return {
    vendor, customer, number, dateViz, lines, subtotal, tax, total, money,
    truth: {
      invoice_number: number,
      invoice_date: dateIso,
      vendor,
      total: total.toFixed(2),
      subtotal: subtotal.toFixed(2),
      tax: tax.toFixed(2),
    },
  };
}

/* ------------------------------- templates -------------------------------- */
function invoiceHtml(inv) {
  const rows = inv.lines
    .map(
      (l) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #ddd">${l.name}</td>` +
        `<td style="padding:8px 12px;border-bottom:1px solid #ddd;text-align:right">${l.qty}</td>` +
        `<td style="padding:8px 12px;border-bottom:1px solid #ddd;text-align:right">${inv.money(l.unit)}</td>` +
        `<td style="padding:8px 12px;border-bottom:1px solid #ddd;text-align:right">${inv.money(l.line)}</td></tr>`
    )
    .join('');
  return `<!doctype html><html><body style="margin:0">
<div style="width:1200px;height:1550px;background:#fff;font-family:Arial;padding:56px;box-sizing:border-box;position:relative">
  <div style="font-size:34px;font-weight:bold">${inv.vendor}</div>
  <div style="color:#555;margin-top:4px">42 Harbor Road · Port City · contact@example.test</div>
  <div style="font-size:44px;font-weight:300;letter-spacing:6px;margin-top:34px">INVOICE</div>
  <div style="display:flex;justify-content:space-between;margin-top:26px">
    <div>
      <div style="color:#777;font-size:14px;text-transform:uppercase">Bill To</div>
      <div style="font-size:20px;margin-top:4px">${inv.customer}</div>
    </div>
    <div style="text-align:right;line-height:1.9">
      <div><span style="color:#777">Invoice Number:</span> <b>${inv.number}</b></div>
      <div><span style="color:#777">Invoice Date:</span> <b>${inv.dateViz}</b></div>
      <div><span style="color:#777">Due Date:</span> <b>30 days</b></div>
    </div>
  </div>
  <table style="width:100%;margin-top:36px;border-collapse:collapse;font-size:18px">
    <thead><tr style="background:#f2f2f2">
      <th style="padding:10px 12px;text-align:left">Description</th>
      <th style="padding:10px 12px;text-align:right">Qty</th>
      <th style="padding:10px 12px;text-align:right">Unit Price</th>
      <th style="padding:10px 12px;text-align:right">Amount</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="margin-top:26px;margin-left:auto;width:340px;font-size:19px;line-height:2">
    <div style="display:flex;justify-content:space-between"><span style="color:#777">Subtotal</span><b>${inv.money(inv.subtotal)}</b></div>
    <div style="display:flex;justify-content:space-between"><span style="color:#777">Tax (8%)</span><b>${inv.money(inv.tax)}</b></div>
    <div style="display:flex;justify-content:space-between;border-top:2px solid #222;font-size:22px"><span>Total</span><b>${inv.money(inv.total)}</b></div>
  </div>
  <div style="position:absolute;bottom:56px;color:#888;font-size:14px">Payment within 30 days. Thank you for your business.</div>
</div></body></html>`;
}

function receiptHtml(inv) {
  const rows = inv.lines
    .map((l) => `<div style="display:flex;justify-content:space-between"><span>${l.qty}x ${l.name}</span><span>${inv.money(l.line)}</span></div>`)
    .join('');
  return `<!doctype html><html><body style="margin:0;background:#777">
<div style="width:560px;margin:40px auto;background:#fdfdf8;font-family:'Courier New',monospace;font-size:19px;padding:34px 30px;line-height:1.7">
  <div style="text-align:center;font-weight:bold;font-size:23px">${inv.vendor}</div>
  <div style="text-align:center">${inv.dateViz} 14:${String(10 + (inv.lines.length * 7) % 49)}</div>
  <div style="text-align:center">Receipt ${inv.number.replace('INV', 'RCP')}</div>
  <div style="border-top:1px dashed #333;margin:14px 0"></div>
  ${rows}
  <div style="border-top:1px dashed #333;margin:14px 0"></div>
  <div style="display:flex;justify-content:space-between"><span>SUBTOTAL</span><span>${inv.money(inv.subtotal)}</span></div>
  <div style="display:flex;justify-content:space-between"><span>TAX</span><span>${inv.money(inv.tax)}</span></div>
  <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:22px"><span>TOTAL</span><span>${inv.money(inv.total)}</span></div>
  <div style="text-align:center;margin-top:16px">*** THANK YOU ***</div>
</div></body></html>`;
}

function formHtml(rand) {
  const first = ['MIRA', 'DEV', 'SOFIA', 'TARO'][Math.floor(rand() * 4)];
  const last = ['HOLT', 'RAJAN', 'DIMITROV', 'ENDO'][Math.floor(rand() * 4)];
  const email = `${first.toLowerCase()}.${last.toLowerCase()}@example.test`;
  const phone = `+1 555 0${100 + Math.floor(rand() * 899)} ${1000 + Math.floor(rand() * 8999)}`;
  const dob = `1${9 - Math.floor(rand() * 2)}${70 + Math.floor(rand() * 29)}-0${1 + Math.floor(rand() * 9)}-1${Math.floor(rand() * 9)}`;
  const truth = { full_name: `${first} ${last}`, email, phone, date_of_birth: dob };
  const row = (label, value) =>
    `<div style="margin-top:26px"><div style="font-size:15px;color:#555;text-transform:uppercase;letter-spacing:1px">${label}</div>` +
    `<div style="font-size:24px;border-bottom:2px solid #444;padding:6px 2px;font-family:'Segoe Print',cursive">${value}</div></div>`;
  return {
    truth,
    html: `<!doctype html><html><body style="margin:0">
<div style="width:1100px;height:1400px;background:#fbfaf6;font-family:Arial;padding:60px;box-sizing:border-box">
  <div style="font-size:32px;font-weight:bold;text-align:center">MEMBERSHIP APPLICATION FORM</div>
  <div style="text-align:center;color:#777;margin-top:6px">Please complete all fields in block letters</div>
  ${row('Full Name', truth.full_name)}
  ${row('Date of Birth', dob)}
  ${row('Email', email)}
  ${row('Phone', phone)}
  ${row('Address', '18 CEDAR LANE, PORT CITY')}
  <div style="margin-top:40px;display:flex;gap:14px;align-items:center"><div style="width:22px;height:22px;border:2px solid #444"></div><span>I agree to the membership terms</span></div>
  <div style="margin-top:60px;display:flex;justify-content:space-between">
    <div style="width:320px;border-top:2px solid #444;padding-top:6px;color:#555">Signature</div>
    <div style="width:200px;border-top:2px solid #444;padding-top:6px;color:#555">Date</div>
  </div>
</div></body></html>`,
  };
}

function negativeHtml(kind) {
  if (kind === 'book') {
    return `<!doctype html><html><body style="margin:0"><div style="width:1000px;height:1500px;background:#faf7ef;font-family:Georgia;padding:80px;box-sizing:border-box;font-size:21px;line-height:1.9;column-count:1;text-align:justify">
    <div style="text-align:center;font-style:italic;margin-bottom:40px">CHAPTER SEVEN</div>
    ${'The harbor lights flickered across the water as the last ferry pulled away from the pier. Nobody on the quay spoke; the fog carried every sound twice as far as it should. '.repeat(14)}
    <div style="text-align:center;margin-top:40px">— 128 —</div></div></body></html>`;
  }
  return `<!doctype html><html><body style="margin:0"><div style="width:1280px;height:800px;background:#1e1f26;color:#d8dbe3;font-family:Consolas;padding:24px;box-sizing:border-box;font-size:16px;line-height:1.6">
  <div style="color:#8eb4ff">PS C:\\workspace&gt; npm run build</div>
  <div>&gt; app@2.1.0 build</div>
  <div>&gt; vite build</div>
  <div style="color:#7ee09a">✓ 214 modules transformed.</div>
  <div>dist/index.html   0.46 kB</div>
  <div>dist/assets/index-Bx91k2.js   142.11 kB │ gzip: 45.90 kB</div>
  <div style="color:#8eb4ff;margin-top:10px">PS C:\\workspace&gt; _</div></div></body></html>`;
}

/* --------------------------- degradation ladder --------------------------- */
const RUNGS = [
  { name: 'clean' },
  { name: 'blur15', css: 'blur(1.5px)', jpegQ: 60 },
  { name: 'rot5', rotate: 5, jpegQ: 70 },
  { name: 'worst', css: 'blur(1.2px)', rotate: -4, jpegQ: 45 },
];

async function capture(page, html, rung, outPath) {
  const rot = rung.rotate ?? 0;
  const fitScale = rot !== 0 ? 0.88 : 1;
  const inner = html.replace(/<!doctype html><html><body style="[^"]*">|<\/body><\/html>/g, '');
  const wrapped = `<!doctype html><html><body style="margin:0;background:#565043">
    <div style="display:flex;align-items:center;justify-content:center;overflow:hidden">
      <div style="transform-origin:center;transform:rotate(${rot}deg) scale(${fitScale});filter:${rung.css ?? 'none'}">${inner}</div>
    </div></body></html>`;
  await page.setContent(wrapped, { waitUntil: 'load' });
  const el = await page.$('body > div');
  const type = rung.jpegQ ? 'jpeg' : 'png';
  await el.screenshot({ path: outPath, type, ...(rung.jpegQ ? { quality: rung.jpegQ } : {}) });
}

(async () => {
  const quick = process.argv.includes('--quick');
  const OUT = path.join(__dirname, '..', '..', 'test_cases', 'docs', 'synthetic');
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1700, deviceScaleFactor: 1.2 });
  const manifest = [];
  const nInv = quick ? 2 : 6;
  const rungs = quick ? RUNGS.filter((r) => r.name === 'clean' || r.name === 'worst') : RUNGS;

  for (let i = 0; i < nInv; i++) {
    const inv = makeInvoice(i, mulberry32(4000 + i));
    for (const rung of rungs) {
      const file = `inv${String(i).padStart(2, '0')}_${rung.name}.${rung.jpegQ ? 'jpg' : 'png'}`;
      await capture(page, invoiceHtml(inv), rung, path.join(OUT, file));
      manifest.push({ file, class: rung.name === 'clean' ? 'invoice' : 'invoice_degraded', degradation: rung.name, truth: inv.truth, expect: { docType: 'invoice', noSilentErrors: true } });
      process.stdout.write(`✓ ${file}\n`);
    }
    // Receipt variant of every second invoice identity.
    if (i % 2 === 0) {
      const file = `rcp${String(i).padStart(2, '0')}_clean.png`;
      await capture(page, receiptHtml(inv), RUNGS[0], path.join(OUT, file));
      manifest.push({ file, class: 'receipt', degradation: 'clean', truth: { total: inv.truth.total, subtotal: inv.truth.subtotal, tax: inv.truth.tax }, expect: { noSilentErrors: true } });
      process.stdout.write(`✓ ${file}\n`);
    }
  }

  const nForms = quick ? 1 : 4;
  for (let i = 0; i < nForms; i++) {
    const form = formHtml(mulberry32(6000 + i));
    for (const rung of quick ? [RUNGS[0]] : [RUNGS[0], RUNGS[3]]) {
      const file = `form${String(i).padStart(2, '0')}_${rung.name}.${rung.jpegQ ? 'jpg' : 'png'}`;
      await capture(page, form.html, rung, path.join(OUT, file));
      manifest.push({ file, class: 'form', degradation: rung.name, truth: form.truth, expect: { noSilentErrors: true } });
      process.stdout.write(`✓ ${file}\n`);
    }
  }

  for (const kind of ['book', 'screenshot']) {
    const file = `neg_${kind}.png`;
    await capture(page, negativeHtml(kind), RUNGS[0], path.join(OUT, file));
    manifest.push({ file, class: 'negative', degradation: 'clean', truth: null, expect: { mrzValid: false, noConfirmedIdentityOrMoney: true } });
    process.stdout.write(`✓ ${file}\n`);
  }

  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await browser.close();
  console.log(`\nDocs corpus compiled: ${manifest.length} entries → ${OUT}`);
})();
