/**
 * COMMERCE CORPUS COMPILER â€” bank statements, payslips, utility bills.
 *
 * Doctrine: seeded determinism + truth-by-construction arithmetic in integer
 * cents (never floats for law-bearing totals) + realistic render anatomy +
 * canonical degradation ladder + per-family manifests.
 *
 * Usage:  node bench/corpus/compile-commerce.cjs [--quick]
 * Output: test_cases/bank_statements/synthetic/manifest.json
 *         test_cases/payslips/synthetic/manifest.json
 *         test_cases/utility_bills/synthetic/manifest.json
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
const d2 = (n) => String(n).padStart(2, '0');
const d6 = (n) => String(n).padStart(6, '0');
const d10 = (n) => String(n).padStart(10, '0');

/* ----------------------------- formatting -------------------------------- */
function isoDate(y, m, d) {
  return `${y}-${d2(m)}-${d2(d)}`;
}
function vizDate(y, m, d) {
  return `${d2(d)}/${d2(m)}/${y}`;
}
function addDays(y, m, d, delta) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return {
    y: dt.getUTCFullYear(),
    m: dt.getUTCMonth() + 1,
    d: dt.getUTCDate(),
  };
}
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
const esc = (s) => String(s).replace(/</g, '&lt;');
function centsToTruth(cents) {
  const sign = cents < 0 ? '-' : '';
  const v = Math.abs(cents);
  return `${sign}${Math.floor(v / 100)}.${String(v % 100).padStart(2, '0')}`;
}
function centsToRender(cents) {
  const sign = cents < 0 ? '-' : '';
  const v = Math.abs(cents);
  const whole = String(Math.floor(v / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = String(v % 100).padStart(2, '0');
  return `${sign}${whole}.${frac}`;
}
function money(vLabel, cents) {
  return `<div style="min-width:220px">
    <div style="font-size:13px;color:#636c78;text-transform:uppercase;letter-spacing:.6px">${vLabel}</div>
    <div style="font-size:26px;font-weight:700;color:#1a2028;margin-top:2px">${centsToRender(cents)}</div>
  </div>`;
}
function cap(label, value) {
  return `<div style="min-width:220px">
    <div style="font-size:13px;color:#636c78;text-transform:uppercase;letter-spacing:.6px">${label}</div>
    <div style="font-size:24px;font-weight:600;color:#1a2028;margin-top:2px">${escHtml(value)}</div>
  </div>`;
}

/* ------------------------------ themes ----------------------------------- */
const THEMES = [
  { font: 'Arial', bg: 'linear-gradient(135deg,#edf1f7,#dde4f0)' },
  { font: 'Georgia, serif', bg: 'linear-gradient(150deg,#f3eee3,#e7dece)' },
  { font: 'Verdana', bg: 'linear-gradient(125deg,#e9f2ea,#d9e7db)' },
  { font: 'Tahoma', bg: 'linear-gradient(145deg,#f1ebee,#e5d9df)' },
];

/* --------------------------- degradation ladder --------------------------- */
const RUNGS = [
  { name: 'clean' },
  { name: 'jpeg40', jpegQ: 40 },
  { name: 'blur1', css: 'blur(1.1px)' },
  { name: 'rot3', rotate: 3 },
  { name: 'worst', css: 'blur(1.2px)', rotate: -5, noise: 30, jpegQ: 55 },
];

// Canonical capture: transform wrapper, optional noise overlay canvas,
// deterministic noise seeded input, and deviceScaleFactor downscale rung.
async function capture(page, html, rung, outPath, seed) {
  const rot = rung.rotate ?? 0;
  const fit = rot !== 0 ? 0.86 : 1;
  const wrapped = `<!doctype html><html><body style="margin:0;background:#b9b2a6;width:1480px;height:1960px;display:flex;align-items:center;justify-content:center">
    <div style="transform-origin:center;
      transform:rotate(${rot}deg) scale(${fit});
      filter:${rung.css ?? 'none'}">${html.replace(/<!doctype html><html><body style="margin:0">|<\/body><\/html>/g, '')}</div>
  </body></html>`;
  await page.setViewport({
    width: 1480,
    height: 1960,
    deviceScaleFactor: rung.name === 'worst' ? 1 : 1.3,
  });
  await page.setContent(wrapped, { waitUntil: 'load' });

  if (rung.noise) {
    await page.evaluate(({ noise, seed: s0 }) => {
      const host = document.body.firstElementChild;
      const c = document.createElement('canvas');
      c.width = 740;
      c.height = 980;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(740, 980);
      let a = s0 >>> 0;
      const rnd = () => {
        a = (a * 1664525 + 1013904223) >>> 0;
        return a / 4294967296;
      };
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
  await page.screenshot({
    path: outPath,
    type,
    ...(rung.jpegQ ? { quality: rung.jpegQ } : {}),
  });
}

/* ----------------------------- pools ------------------------------------- */
const PEOPLE = [
  'Ariana Holt', 'Dev Rajan', 'Sofia Dimitrov', 'Taro Endo', 'Mina Ortega',
  'Luca Ferraro', 'Nia Okafor', 'Jonas Berg', 'Priya Sen', 'Mateo Ibarra',
  'Eleni Pappas', 'Rafiq Noor',
];

const BANKS = [
  'Meridian Savings Bank',
  'North Harbor Credit Union',
  'Copperfield Community Bank',
  'Bluepeak Finance House',
  'Summit Ledger Trust',
];

// Semantic column pairing: a "SALARY CREDIT" must never appear in the Debit
// column (realism defect caught on visual review of the first render).
const TX_DESC_DEBIT = [
  'ATM CASH WITHDRAWAL',
  'CARD PURCHASE GROCERY',
  'UTILITY AUTO-PAY',
  'ONLINE TRANSFER OUT',
  'RESTAURANT PAYMENT',
  'FUEL STATION PURCHASE',
  'SUBSCRIPTION CHARGE',
  'RENT PAYMENT',
];
const TX_DESC_CREDIT = [
  'SALARY CREDIT',
  'INTEREST CREDIT',
  'REFUND CREDIT',
  'ONLINE TRANSFER IN',
  'MOBILE WALLET REFUND',
  'DIVIDEND PAYMENT',
];

const EMPLOYERS = [
  'Ironclad Analytics Pty',
  'Cedarline Fabrication Ltd',
  'Nimbus Parcel Systems',
  'Aurora Grid Services',
  'Atlas Meadow Foods',
];

const ALLOWANCES = ['Housing Allowance', 'Transport Allowance', 'Meal Allowance', 'Shift Allowance'];
const EXTRA_DEDUCTIONS = ['Pension Fund', 'Union Fee', 'Loan Repayment'];

const PROVIDERS = [
  { name: 'LumenGrid Electric Co', kind: 'electric' },
  { name: 'Clearstream Water Utility', kind: 'water' },
  { name: 'Skybridge Telecom Network', kind: 'telecom' },
];

const BILL_LINES = {
  electric: ['Energy Usage', 'Grid Access Charge', 'Meter Service', 'Renewable Surcharge', 'Tax Adjustment'],
  water: ['Water Consumption', 'Service Availability', 'Wastewater Charge', 'Environmental Levy', 'Meter Reading Fee'],
  telecom: ['Plan Subscription', 'Data Overage', 'Call Usage', 'Equipment Rental', 'Regulatory Fee'],
};

/* ------------------------ family generators ------------------------------ */
function makeBankStatement(identity, rand) {
  const holder = PEOPLE[identity % PEOPLE.length];
  const bank = BANKS[identity % BANKS.length];
  const accountNumber = d10(1000000000 + Math.floor(rand() * 9000000000));

  const start = {
    y: 2026,
    m: 1 + Math.floor(rand() * 6),
    d: 1 + Math.floor(rand() * 6),
  };
  const end = addDays(start.y, start.m, start.d, 27 + Math.floor(rand() * 4));
  const opening = 120000 + Math.floor(rand() * 580000);

  const txCount = 8 + Math.floor(rand() * 7);
  let balance = opening;
  let totalCredits = 0;
  let totalDebits = 0;
  let cursor = { ...start };
  const tx = [];

  for (let i = 0; i < txCount; i++) {
    cursor = addDays(cursor.y, cursor.m, cursor.d, 1 + Math.floor(rand() * 3));
    const isCredit = rand() < 0.42;
    const amount = 800 + Math.floor(rand() * 68000);
    const pool = isCredit ? TX_DESC_CREDIT : TX_DESC_DEBIT;
    const desc = pool[Math.floor(rand() * pool.length)];
    if (isCredit) {
      totalCredits += amount;
      balance += amount;
      tx.push({
        dateViz: vizDate(cursor.y, cursor.m, cursor.d),
        description: desc,
        debit: null,
        credit: amount,
      });
    } else {
      totalDebits += amount;
      balance -= amount;
      tx.push({
        dateViz: vizDate(cursor.y, cursor.m, cursor.d),
        description: desc,
        debit: amount,
        credit: null,
      });
    }
  }

  const truth = {
    account_number: accountNumber,
    opening_balance: centsToTruth(opening),
    closing_balance: centsToTruth(balance),
    total_credits: centsToTruth(totalCredits),
    total_debits: centsToTruth(totalDebits),
    account_holder: holder,
  };

  return {
    bank,
    holder,
    accountNumber,
    periodViz: `${vizDate(start.y, start.m, start.d)} - ${vizDate(end.y, end.m, end.d)}`,
    opening,
    closing: balance,
    totalCredits,
    totalDebits,
    tx,
    truth,
  };
}

function makePayslip(identity, rand) {
  const employer = EMPLOYERS[identity % EMPLOYERS.length];
  const employeeName = PEOPLE[(identity + 3) % PEOPLE.length];
  const employeeId = d6(100000 + Math.floor(rand() * 900000));

  const year = 2026;
  const month = 1 + Math.floor(rand() * 12);
  const pStart = { y: year, m: month, d: 1 };
  const pEnd = addDays(year, month, 1, 27);

  const base = 220000 + Math.floor(rand() * 420000);
  const allowanceCount = 1 + Math.floor(rand() * 3);
  const earnings = [{ label: 'Base Salary', amount: base }];
  for (let i = 0; i < allowanceCount; i++) {
    earnings.push({
      label: ALLOWANCES[(identity + i) % ALLOWANCES.length],
      amount: 12000 + Math.floor(rand() * 70000),
    });
  }

  const gross = earnings.reduce((s, e) => s + e.amount, 0);

  const tax = Math.round(gross * 18 / 100);
  const insurance = 9000 + Math.floor(rand() * 16000);
  const extraCount = Math.floor(rand() * 3);
  const deductions = [
    { label: 'Tax Withholding', amount: tax },
    { label: 'Insurance Premium', amount: insurance },
  ];
  for (let i = 0; i < extraCount; i++) {
    deductions.push({
      label: EXTRA_DEDUCTIONS[(identity + i) % EXTRA_DEDUCTIONS.length],
      amount: 4000 + Math.floor(rand() * 30000),
    });
  }

  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
  const net = gross - totalDeductions;

  const truth = {
    employee_id: employeeId,
    gross_pay: centsToTruth(gross),
    net_pay: centsToTruth(net),
    total_deductions: centsToTruth(totalDeductions),
    employee_name: employeeName,
  };

  return {
    employer,
    employeeName,
    employeeId,
    payPeriodViz: `${vizDate(pStart.y, pStart.m, pStart.d)} - ${vizDate(pEnd.y, pEnd.m, pEnd.d)}`,
    earnings,
    deductions,
    gross,
    totalDeductions,
    net,
    truth,
  };
}

function makeUtilityBill(identity, rand) {
  const provider = PROVIDERS[identity % PROVIDERS.length];
  const accountNumber = d10(2000000000 + Math.floor(rand() * 7000000000));
  const billY = 2026;
  const billM = 1 + Math.floor(rand() * 12);
  const billD = 1 + Math.floor(rand() * 26);
  const due = addDays(billY, billM, billD, 14 + Math.floor(rand() * 9));

  const previous = 1500 + Math.floor(rand() * 120000);
  const payments = Math.floor(rand() * previous);
  const lineNames = BILL_LINES[provider.kind];
  const count = 3 + Math.floor(rand() * 3);
  const lines = [];
  let currentCharges = 0;
  for (let i = 0; i < count; i++) {
    const amt = 600 + Math.floor(rand() * 36000);
    lines.push({ label: lineNames[(identity + i) % lineNames.length], amount: amt });
    currentCharges += amt;
  }

  const totalDue = previous - payments + currentCharges;

  const truth = {
    account_number: accountNumber,
    total_due: centsToTruth(totalDue),
    due_date: isoDate(due.y, due.m, due.d),
    current_charges: centsToTruth(currentCharges),
  };

  return {
    provider: provider.name,
    accountNumber,
    billDateViz: vizDate(billY, billM, billD),
    dueDateViz: vizDate(due.y, due.m, due.d),
    previous,
    payments,
    currentCharges,
    totalDue,
    lines,
    truth,
  };
}

/* ------------------------------ templates -------------------------------- */
function bankStatementHtml(doc, themeIdx) {
  const t = THEMES[themeIdx % THEMES.length];
  const txRows = doc.tx.map((r) => (
    `<tr>
      <td style="padding:8px 10px;border-bottom:1px solid #d8dde5">${r.dateViz}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #d8dde5">${escHtml(r.description)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #d8dde5;text-align:right">${r.debit == null ? '' : centsToRender(r.debit)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #d8dde5;text-align:right">${r.credit == null ? '' : centsToRender(r.credit)}</td>
    </tr>`
  )).join('');

  return `<!doctype html><html><body style="margin:0">
<div id="doc" style="width:1400px;height:1800px;background:${t.bg};font-family:${t.font};position:relative;overflow:hidden">
  <div style="position:absolute;inset:0;opacity:.12;background:repeating-linear-gradient(60deg,#8fa1b2 0 2px,transparent 2px 14px)"></div>
  <div style="position:relative;padding:32px 44px 0;font-size:40px;font-weight:800;letter-spacing:1px;color:#1a2430">BANK STATEMENT</div>
  <div style="position:relative;padding:8px 44px 0;font-size:28px;font-weight:700;color:#243245">${escHtml(doc.bank)}</div>
  <div style="position:relative;padding:20px 44px 0;display:flex;flex-wrap:wrap;gap:16px 34px">
    ${cap('Account Holder', doc.holder)}
    ${cap('Account Number', doc.accountNumber)}
    ${cap('Statement Period', doc.periodViz)}
    ${money('Opening Balance', doc.opening)}
    ${money('Closing Balance', doc.closing)}
  </div>
  <div style="position:relative;padding:24px 44px 0">
    <table style="width:100%;border-collapse:collapse;background:#ffffffda;font-size:21px">
      <thead>
        <tr style="background:#e6edf7">
          <th style="padding:10px;text-align:left">Date</th>
          <th style="padding:10px;text-align:left">Description</th>
          <th style="padding:10px;text-align:right">Debit</th>
          <th style="padding:10px;text-align:right">Credit</th>
        </tr>
      </thead>
      <tbody>${txRows}</tbody>
    </table>
  </div>
  <div style="position:relative;padding:22px 44px 0;display:flex;gap:40px">
    ${money('Total Credits', doc.totalCredits)}
    ${money('Total Debits', doc.totalDebits)}
  </div>
</div></body></html>`;
}

function payslipHtml(doc, themeIdx) {
  const t = THEMES[themeIdx % THEMES.length];
  const eRows = doc.earnings.map((r) => (
    `<tr><td style="padding:8px 10px;border-bottom:1px solid #d8dde5">${escHtml(r.label)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #d8dde5;text-align:right">${centsToRender(r.amount)}</td></tr>`
  )).join('');
  const dRows = doc.deductions.map((r) => (
    `<tr><td style="padding:8px 10px;border-bottom:1px solid #d8dde5">${escHtml(r.label)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #d8dde5;text-align:right">${centsToRender(r.amount)}</td></tr>`
  )).join('');

  return `<!doctype html><html><body style="margin:0">
<div id="doc" style="width:1400px;height:1800px;background:${t.bg};font-family:${t.font};position:relative;overflow:hidden">
  <div style="position:absolute;inset:0;opacity:.12;background:repeating-linear-gradient(65deg,#98a9b8 0 2px,transparent 2px 16px)"></div>
  <div style="position:relative;padding:32px 44px 0;font-size:40px;font-weight:800;letter-spacing:1px;color:#1a2430">PAYSLIP</div>
  <div style="position:relative;padding:8px 44px 0;font-size:28px;font-weight:700;color:#243245">${escHtml(doc.employer)}</div>
  <div style="position:relative;padding:20px 44px 0;display:flex;flex-wrap:wrap;gap:16px 34px">
    ${cap('Employee Name', doc.employeeName)}
    ${cap('Employee ID', doc.employeeId)}
    ${cap('Pay Period', doc.payPeriodViz)}
  </div>
  <div style="position:relative;padding:24px 44px 0;display:flex;gap:24px">
    <table style="width:50%;border-collapse:collapse;background:#ffffffda;font-size:21px">
      <thead><tr style="background:#e6edf7"><th style="padding:10px;text-align:left">Earnings</th><th style="padding:10px;text-align:right">Amount</th></tr></thead>
      <tbody>${eRows}</tbody>
    </table>
    <table style="width:50%;border-collapse:collapse;background:#ffffffda;font-size:21px">
      <thead><tr style="background:#f0e6e6"><th style="padding:10px;text-align:left">Deductions</th><th style="padding:10px;text-align:right">Amount</th></tr></thead>
      <tbody>${dRows}</tbody>
    </table>
  </div>
  <div style="position:relative;padding:22px 44px 0;display:flex;gap:34px;flex-wrap:wrap">
    ${money('Gross Pay', doc.gross)}
    ${money('Total Deductions', doc.totalDeductions)}
    ${money('Net Pay', doc.net)}
  </div>
</div></body></html>`;
}

function utilityBillHtml(doc, themeIdx) {
  const t = THEMES[themeIdx % THEMES.length];
  const lineRows = doc.lines.map((r) => (
    `<tr><td style="padding:8px 10px;border-bottom:1px solid #d8dde5">${escHtml(r.label)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #d8dde5;text-align:right">${centsToRender(r.amount)}</td></tr>`
  )).join('');

  return `<!doctype html><html><body style="margin:0">
<div id="doc" style="width:1400px;height:1800px;background:${t.bg};font-family:${t.font};position:relative;overflow:hidden">
  <div style="position:absolute;inset:0;opacity:.12;background:repeating-linear-gradient(62deg,#8ca0b3 0 2px,transparent 2px 15px)"></div>
  <div style="position:relative;padding:32px 44px 0;font-size:40px;font-weight:800;letter-spacing:1px;color:#1a2430">UTILITY BILL</div>
  <div style="position:relative;padding:8px 44px 0;font-size:28px;font-weight:700;color:#243245">${escHtml(doc.provider)}</div>
  <div style="position:relative;padding:20px 44px 0;display:flex;flex-wrap:wrap;gap:16px 34px">
    ${cap('Account Number', doc.accountNumber)}
    ${cap('Bill Date', doc.billDateViz)}
    ${cap('Due Date', doc.dueDateViz)}
    ${money('Previous Balance', doc.previous)}
    ${money('Payments', doc.payments)}
  </div>
  <div style="position:relative;padding:24px 44px 0">
    <table style="width:100%;border-collapse:collapse;background:#ffffffda;font-size:21px">
      <thead><tr style="background:#e6edf7"><th style="padding:10px;text-align:left">Current Charges</th><th style="padding:10px;text-align:right">Amount</th></tr></thead>
      <tbody>${lineRows}</tbody>
    </table>
  </div>
  <div style="position:relative;padding:22px 44px 0;display:flex;gap:34px;flex-wrap:wrap">
    ${money('Current Charges Total', doc.currentCharges)}
    ${money('Total Due', doc.totalDue)}
  </div>
  <div style="position:relative;padding:12px 44px 0;color:#3a4859;font-size:18px">Total Due = Previous Balance - Payments + Current Charges</div>
</div></body></html>`;
}

/* --------------------------------- main ----------------------------------- */
(async () => {
  const quick = process.argv.includes('--quick');
  const root = path.join(__dirname, '..', '..');

  const OUT_BANK = path.join(root, 'test_cases', 'bank_statements', 'synthetic');
  const OUT_PAY = path.join(root, 'test_cases', 'payslips', 'synthetic');
  const OUT_UTIL = path.join(root, 'test_cases', 'utility_bills', 'synthetic');
  fs.mkdirSync(OUT_BANK, { recursive: true });
  fs.mkdirSync(OUT_PAY, { recursive: true });
  fs.mkdirSync(OUT_UTIL, { recursive: true });

  const bankN = quick ? 2 : 10;
  const payN = quick ? 2 : 10;
  const utilN = quick ? 2 : 8;
  const rungs = quick ? RUNGS.filter((r) => ['clean', 'worst'].includes(r.name)) : RUNGS;

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();

  const bankManifest = [];
  for (let i = 0; i < bankN; i++) {
    const doc = makeBankStatement(i, mulberry32(3100 + i));
    for (const rung of rungs) {
      const ext = rung.jpegQ ? 'jpg' : 'png';
      const file = `bank_id${d2(i)}_${rung.name}.${ext}`;
      await capture(page, bankStatementHtml(doc, i), rung, path.join(OUT_BANK, file), 51000 + i * 100);
      bankManifest.push({
        file,
        class: rung.name === 'clean' ? 'bank_statement' : 'bank_statement_degraded',
        degradation: rung.name,
        identity: i,
        truth: doc.truth,
        expect: { noSilentErrors: true },
      });
      process.stdout.write(`âœ“ ${file}\n`);
    }
  }
  fs.writeFileSync(path.join(OUT_BANK, 'manifest.json'), JSON.stringify(bankManifest, null, 2));
  console.log(`Bank statements corpus: ${bankManifest.length} â†’ ${OUT_BANK}`);

  const payManifest = [];
  for (let i = 0; i < payN; i++) {
    const doc = makePayslip(i, mulberry32(4100 + i));
    for (const rung of rungs) {
      const ext = rung.jpegQ ? 'jpg' : 'png';
      const file = `payslip_id${d2(i)}_${rung.name}.${ext}`;
      await capture(page, payslipHtml(doc, i), rung, path.join(OUT_PAY, file), 61000 + i * 100);
      payManifest.push({
        file,
        class: rung.name === 'clean' ? 'payslip' : 'payslip_degraded',
        degradation: rung.name,
        identity: i,
        truth: doc.truth,
        expect: { noSilentErrors: true },
      });
      process.stdout.write(`âœ“ ${file}\n`);
    }
  }
  fs.writeFileSync(path.join(OUT_PAY, 'manifest.json'), JSON.stringify(payManifest, null, 2));
  console.log(`Payslips corpus: ${payManifest.length} â†’ ${OUT_PAY}`);

  const utilManifest = [];
  for (let i = 0; i < utilN; i++) {
    const doc = makeUtilityBill(i, mulberry32(5100 + i));
    for (const rung of rungs) {
      const ext = rung.jpegQ ? 'jpg' : 'png';
      const file = `utility_id${d2(i)}_${rung.name}.${ext}`;
      await capture(page, utilityBillHtml(doc, i), rung, path.join(OUT_UTIL, file), 71000 + i * 100);
      utilManifest.push({
        file,
        class: rung.name === 'clean' ? 'utility_bill' : 'utility_bill_degraded',
        degradation: rung.name,
        identity: i,
        truth: doc.truth,
        expect: { noSilentErrors: true },
      });
      process.stdout.write(`âœ“ ${file}\n`);
    }
  }
  fs.writeFileSync(path.join(OUT_UTIL, 'manifest.json'), JSON.stringify(utilManifest, null, 2));
  console.log(`Utility bills corpus: ${utilManifest.length} â†’ ${OUT_UTIL}`);

  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
