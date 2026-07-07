/**
 * UNIVERSE COMPILER — the remaining Tier 2/3/5 families in one factory pass.
 *
 *   tax_forms          box arithmetic closure (wages+other=total; tax boxes)
 *   purchase_orders    line-item totals closure (invoice primitive reuse)
 *   insurance_notices  premium + fees − discount = total closure
 *   certificates       registrar-number grammar + seal graphic (review-first)
 *   transcripts        GPA = credit-weighted mean (closure!)
 *   medical_labs       analyte table with reference ranges (values = truth)
 *   insurance_cards    member-ID grammar (ID-card primitive reuse)
 *   blank_forms        labels present, NO values — inventing one = silent error
 *   foreign_script     Arabic/CJK/Cyrillic VIZ + Latin core fields (honesty)
 *   letters            date/reference-number grammars (review-first floor)
 *
 * Truth-by-construction everywhere a law exists; families without an anchor
 * are explicitly review-first (Documentation/20 §build-law #2).
 *
 * Usage: node bench/corpus/compile-universe.cjs [--quick]
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
const d2 = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s).replace(/</g, '&lt;');
const cents = (c) => `${Math.floor(c / 100)}.${d2(c % 100)}`;
const centsFmt = (c) => `${String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${d2(c % 100)}`;

const PEOPLE = ['ANNA ERIKSSON', 'KENJI NAKAMURA', 'CHINWE OKONKWO', 'SIOBHAN OBRIEN', 'LAYLA ALFARSI', 'MALGORZATA SZCZEPANSKA', 'WEI LI', 'JOSE FERNANDEZ', 'HANS MUELLER', 'PRIYA ANAND'];
const THEMES = [
  { font: 'Arial', bg: '#f4f6f8' },
  { font: 'Georgia, serif', bg: '#f6f2e9' },
  { font: 'Verdana', bg: '#f1f6f0' },
  { font: 'Tahoma', bg: '#f6f0f2' },
];
const cap = (label, value, big = false) =>
  `<div style="min-width:180px"><div style="font-size:13px;color:#67707c;text-transform:uppercase;letter-spacing:.5px">${label}</div>` +
  `<div style="font-size:${big ? 27 : 22}px;font-weight:600;color:#1b2027;margin-top:1px">${esc(String(value))}</div></div>`;

const RUNGS = [
  { name: 'clean' },
  { name: 'jpeg40', jpegQ: 40 },
  { name: 'blur1', css: 'blur(1.1px)' },
  { name: 'worst', css: 'blur(1.2px)', rotate: -5, noise: 30, jpegQ: 55 },
];

async function capture(page, html, rung, outPath, seed, vw = 1480, vh = 1900) {
  const rot = rung.rotate ?? 0;
  const fit = rot !== 0 ? 0.88 : 1;
  const wrapped = `<!doctype html><html><body style="margin:0;background:#b9b2a6;width:${vw}px;height:${vh}px;display:flex;align-items:center;justify-content:center">
    <div style="transform-origin:center;transform:rotate(${rot}deg) scale(${fit});filter:${rung.css ?? 'none'}">${html.replace(/<!doctype html><html><body style="margin:0">|<\/body><\/html>/g, '')}</div>
  </body></html>`;
  await page.setViewport({ width: vw, height: vh, deviceScaleFactor: 1.2 });
  await page.setContent(wrapped, { waitUntil: 'load' });
  if (rung.noise) {
    await page.evaluate(({ noise, seed: s0 }) => {
      const host = document.body.firstElementChild;
      const c = document.createElement('canvas');
      c.width = 740; c.height = 950;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(740, 950);
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

function pageShell(t, title, subtitle, body, w = 1400, h = 1800) {
  return `<!doctype html><html><body style="margin:0">
<div id="doc" style="width:${w}px;height:${h}px;background:${t.bg};font-family:${t.font};position:relative;overflow:hidden;padding:0">
  <div style="padding:34px 48px 4px;font-size:30px;font-weight:bold;letter-spacing:1px">${title}</div>
  <div style="padding:0 48px 8px;font-size:15px;color:#67707c">${subtitle}</div>
  ${body}
</div></body></html>`;
}

/* ============================ FAMILY BUILDERS ============================ */

function taxForm(i, rand, t) {
  const person = PEOPLE[i % PEOPLE.length];
  const tin = `9${String(Math.floor(rand() * 90000000) + 10000000)}`;
  const wages = 3200000 + Math.floor(rand() * 6200000);
  const other = Math.floor(rand() * 800000);
  const total = wages + other;
  const withheld = Math.floor(total * (0.18 + rand() * 0.1));
  const body = `
  <div style="position:absolute;left:48px;top:120px;right:48px;display:flex;flex-wrap:wrap;gap:24px 56px">
    ${cap('Taxpayer Name', person)}
    ${cap('Taxpayer ID', tin)}
    ${cap('Tax Year', '2025')}
    ${cap('Filing Status', 'SINGLE')}
  </div>
  <div style="position:absolute;left:48px;top:290px;right:48px">
    <table style="width:100%;border-collapse:collapse;font-size:21px">
      <tr style="background:#dde3ea"><th style="text-align:left;padding:12px">Box</th><th style="text-align:left;padding:12px">Description</th><th style="text-align:right;padding:12px">Amount</th></tr>
      <tr><td style="padding:11px;border-bottom:1px solid #cdd4dc">1</td><td style="padding:11px;border-bottom:1px solid #cdd4dc">Wages and salaries</td><td style="padding:11px;text-align:right;border-bottom:1px solid #cdd4dc">${centsFmt(wages)}</td></tr>
      <tr><td style="padding:11px;border-bottom:1px solid #cdd4dc">2</td><td style="padding:11px;border-bottom:1px solid #cdd4dc">Other income</td><td style="padding:11px;text-align:right;border-bottom:1px solid #cdd4dc">${centsFmt(other)}</td></tr>
      <tr style="font-weight:bold"><td style="padding:11px">3</td><td style="padding:11px">Total income</td><td style="padding:11px;text-align:right">${centsFmt(total)}</td></tr>
      <tr><td style="padding:11px">4</td><td style="padding:11px">Tax withheld</td><td style="padding:11px;text-align:right">${centsFmt(withheld)}</td></tr>
    </table>
  </div>
  <div style="position:absolute;left:48px;bottom:60px;font-size:14px;color:#67707c">Fictional revenue authority training form — box 3 = box 1 + box 2.</div>`;
  return {
    html: pageShell(t, 'ANNUAL INCOME TAX RETURN — FORM T-100', 'Fictional Revenue Authority — Training Specimen', body, 1400, 1200),
    truth: { taxpayer_id: tin, total_income: cents(total), tax_withheld: cents(withheld), full_name: person },
    vh: 1300,
  };
}

function purchaseOrder(i, rand, t) {
  const po = `PO-2026-${String(1000 + Math.floor(rand() * 9000))}`;
  const vendor = ['Cedarline Fabrication Ltd', 'Nimbus Parcel Systems', 'Aurora Grid Services'][i % 3];
  const n = 3 + Math.floor(rand() * 3);
  let subtotal = 0;
  const rows = Array.from({ length: n }, (_, k) => {
    const qty = 1 + Math.floor(rand() * 9);
    const unit = 1500 + Math.floor(rand() * 240000);
    const line = qty * unit;
    subtotal += line;
    return `<tr><td style="padding:10px;border-bottom:1px solid #cdd4dc">ITEM-${100 + k}</td><td style="padding:10px;border-bottom:1px solid #cdd4dc">${['Steel brackets', 'Hex fasteners', 'Control units', 'Cable assemblies', 'Sensor modules', 'Mounting plates'][k]}</td><td style="padding:10px;text-align:right;border-bottom:1px solid #cdd4dc">${qty}</td><td style="padding:10px;text-align:right;border-bottom:1px solid #cdd4dc">${centsFmt(unit)}</td><td style="padding:10px;text-align:right;border-bottom:1px solid #cdd4dc">${centsFmt(line)}</td></tr>`;
  }).join('');
  const tax = Math.round(subtotal * 0.1);
  const total = subtotal + tax;
  const body = `
  <div style="position:absolute;left:48px;top:120px;right:48px;display:flex;flex-wrap:wrap;gap:22px 52px">
    ${cap('PO Number', po)}${cap('Vendor', vendor)}${cap('Order Date', `1${i % 9}/06/2026`)}${cap('Requested By', PEOPLE[i % PEOPLE.length])}
  </div>
  <div style="position:absolute;left:48px;top:290px;right:48px">
    <table style="width:100%;border-collapse:collapse;font-size:20px">
      <tr style="background:#dde3ea"><th style="text-align:left;padding:11px">Code</th><th style="text-align:left;padding:11px">Description</th><th style="text-align:right;padding:11px">Qty</th><th style="text-align:right;padding:11px">Unit</th><th style="text-align:right;padding:11px">Line Total</th></tr>
      ${rows}
    </table>
    <div style="display:flex;justify-content:flex-end;gap:60px;margin-top:26px;font-size:22px">
      <div>${cap('Subtotal', centsFmt(subtotal))}</div>
      <div>${cap('Tax', centsFmt(tax))}</div>
      <div>${cap('Total', centsFmt(total), true)}</div>
    </div>
  </div>`;
  return {
    html: pageShell(t, 'PURCHASE ORDER', 'Fictional procurement document — totals close by arithmetic', body, 1400, 1400),
    truth: { invoice_number: po, subtotal: cents(subtotal), tax: cents(tax), total: cents(total), vendor },
    vh: 1500,
  };
}

function insuranceNotice(i, rand, t) {
  const policy = `POL-${String(100000 + Math.floor(rand() * 900000))}`;
  const premium = 42000 + Math.floor(rand() * 190000);
  const fees = 1500 + Math.floor(rand() * 6000);
  const discount = Math.floor(rand() * 9000);
  const total = premium + fees - discount;
  const body = `
  <div style="position:absolute;left:48px;top:120px;right:48px;display:flex;flex-wrap:wrap;gap:22px 52px">
    ${cap('Policy Number', policy)}${cap('Policy Holder', PEOPLE[i % PEOPLE.length])}${cap('Coverage Period', '01/09/2026 - 31/08/2027')}${cap('Due Date', `2${i % 8}/08/2026`)}
  </div>
  <div style="position:absolute;left:48px;top:300px;width:640px">
    <table style="width:100%;border-collapse:collapse;font-size:21px">
      <tr><td style="padding:11px;border-bottom:1px solid #cdd4dc">Base Premium</td><td style="padding:11px;text-align:right;border-bottom:1px solid #cdd4dc">${centsFmt(premium)}</td></tr>
      <tr><td style="padding:11px;border-bottom:1px solid #cdd4dc">Administrative Fees</td><td style="padding:11px;text-align:right;border-bottom:1px solid #cdd4dc">${centsFmt(fees)}</td></tr>
      <tr><td style="padding:11px;border-bottom:1px solid #cdd4dc">Loyalty Discount</td><td style="padding:11px;text-align:right;border-bottom:1px solid #cdd4dc">-${centsFmt(discount)}</td></tr>
      <tr style="font-weight:bold;font-size:24px"><td style="padding:13px">Total Due</td><td style="padding:13px;text-align:right">${centsFmt(total)}</td></tr>
    </table>
  </div>`;
  return {
    html: pageShell(t, 'PREMIUM RENEWAL NOTICE', 'Harborlight Mutual Insurance — Fictional Training Notice', body, 1400, 1000),
    truth: { policy_number: policy, total_due: cents(total), full_name: PEOPLE[i % PEOPLE.length] },
    vh: 1100,
  };
}

function certificate(i, rand, t) {
  const reg = `REG-${2026 - (i % 30)}-${String(10000 + Math.floor(rand() * 90000))}`;
  const person = PEOPLE[i % PEOPLE.length];
  const dob = `${d2(1 + (i % 28))}/0${1 + (i % 9)}/19${70 + (i % 29)}`;
  const body = `
  <div style="position:absolute;left:0;right:0;top:210px;text-align:center">
    <div style="font-size:18px;color:#67707c;text-transform:uppercase;letter-spacing:2px">This certifies the birth of</div>
    <div style="font-size:46px;font-weight:bold;margin:18px 0">${person}</div>
    <div style="display:flex;justify-content:center;gap:70px;margin-top:34px">
      ${cap('Date of Birth', dob)}${cap('Place of Birth', 'CAPITAL CITY')}${cap('Registration Number', reg)}
    </div>
  </div>
  <div style="position:absolute;right:110px;bottom:130px;width:190px;height:190px;border-radius:50%;border:6px double #a33;display:flex;align-items:center;justify-content:center;transform:rotate(-12deg);color:#a33;font-size:15px;text-align:center;opacity:.85">OFFICIAL SEAL<br>CIVIL REGISTRY<br>FICTIONAL</div>
  <div style="position:absolute;left:110px;bottom:150px">${cap('Registrar', 'M. HOLLOWAY')}</div>`;
  return {
    html: pageShell(t, 'CERTIFICATE OF BIRTH', 'Civil Registration Office — Fictional Training Certificate', body, 1400, 1000),
    truth: { registration_number: reg, full_name: person },
    vh: 1100,
  };
}

function transcript(i, rand, t) {
  const sid = `STU-${String(100000 + Math.floor(rand() * 900000))}`;
  const COURSES = [['Mathematics I', 4], ['Physics', 3], ['Chemistry', 3], ['Literature', 2], ['Computer Science', 4], ['History', 2]];
  let pts = 0, credits = 0;
  const rows = COURSES.map(([name, cr]) => {
    const grade = 2 + Math.floor(rand() * 3) + (rand() < 0.5 ? 0.5 : 0); // 2.0–4.5
    const g = Math.min(4, grade);
    pts += Math.round(g * 10) * cr;
    credits += cr;
    return `<tr><td style="padding:10px;border-bottom:1px solid #cdd4dc">${name}</td><td style="padding:10px;text-align:right;border-bottom:1px solid #cdd4dc">${cr}</td><td style="padding:10px;text-align:right;border-bottom:1px solid #cdd4dc">${g.toFixed(1)}</td></tr>`;
  }).join('');
  const gpa = (pts / 10 / credits).toFixed(2); // credit-weighted mean, exact
  const body = `
  <div style="position:absolute;left:48px;top:120px;right:48px;display:flex;flex-wrap:wrap;gap:22px 52px">
    ${cap('Student Name', PEOPLE[i % PEOPLE.length])}${cap('Student ID', sid)}${cap('Program', 'BSC GENERAL SCIENCE')}${cap('Academic Year', '2025 - 2026')}
  </div>
  <div style="position:absolute;left:48px;top:290px;width:760px">
    <table style="width:100%;border-collapse:collapse;font-size:20px">
      <tr style="background:#dde3ea"><th style="text-align:left;padding:11px">Course</th><th style="text-align:right;padding:11px">Credits</th><th style="text-align:right;padding:11px">Grade</th></tr>
      ${rows}
    </table>
    <div style="display:flex;justify-content:flex-end;gap:60px;margin-top:24px">${cap('Cumulative GPA', gpa, true)}</div>
  </div>`;
  return {
    html: pageShell(t, 'ACADEMIC TRANSCRIPT', 'Northfield Institute — Fictional Training Transcript (GPA = credit-weighted mean)', body, 1400, 1300),
    truth: { student_id: sid, gpa, full_name: PEOPLE[i % PEOPLE.length] },
    vh: 1400,
  };
}

function medicalLab(i, rand, t) {
  const mrn = `MRN-${String(100000 + Math.floor(rand() * 900000))}`;
  const ANALYTES = [
    ['Hemoglobin', 'g/dL', 13.0, 17.0], ['Glucose (fasting)', 'mg/dL', 70, 100],
    ['Creatinine', 'mg/dL', 0.7, 1.3], ['ALT', 'U/L', 7, 55], ['TSH', 'mIU/L', 0.4, 4.0],
  ];
  const values = {};
  const rows = ANALYTES.map(([name, unit, lo, hi]) => {
    const inRange = rand() < 0.7;
    const v = inRange ? lo + rand() * (hi - lo) : hi + rand() * hi * 0.4;
    const val = v.toFixed(1);
    values[name.toLowerCase().replace(/[^a-z]+/g, '_')] = val;
    return `<tr><td style="padding:10px;border-bottom:1px solid #cdd4dc">${name}</td><td style="padding:10px;text-align:right;border-bottom:1px solid #cdd4dc;font-weight:${inRange ? 400 : 700};color:${inRange ? '#1b2027' : '#a33'}">${val}</td><td style="padding:10px;border-bottom:1px solid #cdd4dc">${unit}</td><td style="padding:10px;border-bottom:1px solid #cdd4dc">${lo} - ${hi}</td><td style="padding:10px;border-bottom:1px solid #cdd4dc">${inRange ? '' : 'HIGH'}</td></tr>`;
  }).join('');
  const body = `
  <div style="position:absolute;left:48px;top:120px;right:48px;display:flex;flex-wrap:wrap;gap:22px 52px">
    ${cap('Patient Name', PEOPLE[i % PEOPLE.length])}${cap('Medical Record No', mrn)}${cap('Collected', `0${1 + (i % 9)}/07/2026`)}${cap('Physician', 'DR. R. VANCE')}
  </div>
  <div style="position:absolute;left:48px;top:290px;right:48px">
    <table style="width:100%;border-collapse:collapse;font-size:20px">
      <tr style="background:#dde3ea"><th style="text-align:left;padding:11px">Analyte</th><th style="text-align:right;padding:11px">Result</th><th style="text-align:left;padding:11px">Units</th><th style="text-align:left;padding:11px">Reference</th><th style="text-align:left;padding:11px">Flag</th></tr>
      ${rows}
    </table>
  </div>`;
  return {
    html: pageShell(t, 'LABORATORY REPORT', 'Meridian Diagnostics — Fictional Training Report', body, 1400, 1200),
    truth: { medical_record_no: mrn, full_name: PEOPLE[i % PEOPLE.length], ...values },
    vh: 1300,
  };
}

function insuranceCard(i, rand, t) {
  const member = `MBR${String(10000000 + Math.floor(rand() * 90000000))}`;
  const group = `GRP-${String(1000 + Math.floor(rand() * 9000))}`;
  const body = `
  <div style="position:absolute;left:44px;top:110px;right:44px;display:flex;flex-wrap:wrap;gap:18px 40px">
    ${cap('Member Name', PEOPLE[i % PEOPLE.length])}
    ${cap('Member ID', member)}
    ${cap('Group Number', group)}
    ${cap('Plan', ['GOLD PPO', 'SILVER HMO', 'PLATINUM POS'][i % 3])}
    ${cap('Effective', '01/01/2026')}
    ${cap('Copay', '25.00')}
  </div>`;
  return {
    html: pageShell(t, 'HEALTH INSURANCE CARD', 'Harborlight Mutual — Fictional Member Card', body, 1360, 760).replace('height:760px', 'height:760px;border-radius:24px'),
    truth: { member_id: member, group_number: group, full_name: PEOPLE[i % PEOPLE.length] },
    vh: 860, vw: 1440,
  };
}

function blankForm(i, rand, t) {
  const line = (label) =>
    `<div style="margin:22px 0"><div style="font-size:15px;color:#4a525e;text-transform:uppercase">${label}</div><div style="border-bottom:2px solid #333;height:34px"></div></div>`;
  const body = `
  <div style="position:absolute;left:60px;top:130px;right:60px">
    ${line('Full Name')}${line('Date of Birth')}${line('Address')}${line('Phone Number')}${line('Email')}${line('Signature')}
  </div>
  <div style="position:absolute;left:60px;bottom:50px;font-size:14px;color:#67707c">UNFILLED application form — extracting any VALUE from this page is an invention.</div>`;
  return {
    html: pageShell(t, 'MEMBERSHIP APPLICATION FORM', 'Blank specimen — labels only, no values exist', body, 1400, 1100),
    truth: null,
    vh: 1200,
    cls: 'blank_form',
  };
}

function foreignScript(i, rand, t) {
  const scripts = [
    { name: 'arabic', font: "'Segoe UI'", title: 'بطاقة تعريف', caption: 'الاسم الكامل', place: 'مدينة التدريب' },
    { name: 'cjk', font: "'Microsoft YaHei','SimSun'", title: '身份证明文件', caption: '姓名', place: '训练城市' },
    { name: 'cyrillic', font: "'Segoe UI'", title: 'УДОСТОВЕРЕНИЕ ЛИЧНОСТИ', caption: 'Полное имя', place: 'УЧЕБНЫЙ ГОРОД' },
  ];
  const s = scripts[i % 3];
  const person = PEOPLE[i % PEOPLE.length];
  const idNo = `FS${String(1000000 + Math.floor(rand() * 9000000))}`;
  const body = `
  <div style="position:absolute;left:48px;top:104px;font-family:${s.font};font-size:34px">${s.title}</div>
  <div style="position:absolute;left:48px;top:190px;right:48px;display:flex;flex-wrap:wrap;gap:22px 52px">
    <div style="min-width:220px"><div style="font-size:15px;color:#67707c;font-family:${s.font}">${s.caption} / FULL NAME</div><div style="font-size:26px;font-weight:600">${person}</div></div>
    ${cap('Document No', idNo)}
    ${cap('Date of Birth', `1${i % 9}/0${1 + (i % 9)}/198${i % 10}`)}
    <div style="min-width:220px"><div style="font-size:15px;color:#67707c">PLACE / <span style="font-family:${s.font}">${s.place}</span></div><div style="font-size:24px;font-weight:600;font-family:${s.font}">${s.place}</div></div>
  </div>`;
  return {
    html: pageShell(t, 'IDENTITY DOCUMENT — BILINGUAL', `Foreign-script stress specimen (${s.name}) — Latin core fields must extract, script text must never become garbage values`, body, 1400, 900),
    truth: { full_name: person, document_no: idNo },
    vh: 1000,
    cls: `foreign_${s.name}`,
  };
}

function letterDoc(i, rand, t) {
  const ref = `REF/2026/${String(100 + Math.floor(rand() * 900))}`;
  const body = `
  <div style="position:absolute;left:70px;top:140px;right:70px;font-size:20px;line-height:1.8">
    <div style="display:flex;justify-content:space-between;margin-bottom:36px">
      <div>${cap('Reference', ref)}</div><div>${cap('Date', `0${1 + (i % 9)}/07/2026`)}</div>
    </div>
    <p>Dear ${PEOPLE[i % PEOPLE.length].split(' ')[0]},</p>
    <p>We write to confirm receipt of your application dated 15/06/2026. Your submission has been assigned the reference number above and will be reviewed by our assessment committee within fourteen working days.</p>
    <p>Should any additional documentation be required, our office will contact you at the address on record. Please quote the reference number in all correspondence.</p>
    <p style="margin-top:44px">Yours sincerely,<br><br>M. HOLLOWAY<br>Director of Admissions</p>
  </div>`;
  return {
    html: pageShell(t, 'NORTHFIELD INSTITUTE', 'Office of Admissions — Fictional Correspondence', body, 1400, 1300),
    truth: { reference: ref },
    vh: 1400,
  };
}

/* ================================ REGISTRY ================================ */
const FAMILIES = [
  { key: 'tax_forms', gen: taxForm, n: 8, prefix: 'tax', cls: 'tax_form' },
  { key: 'purchase_orders', gen: purchaseOrder, n: 8, prefix: 'po', cls: 'purchase_order' },
  { key: 'insurance_notices', gen: insuranceNotice, n: 8, prefix: 'ins', cls: 'insurance_notice' },
  { key: 'certificates', gen: certificate, n: 8, prefix: 'cert', cls: 'certificate' },
  { key: 'transcripts', gen: transcript, n: 8, prefix: 'tr', cls: 'transcript' },
  { key: 'medical_labs', gen: medicalLab, n: 8, prefix: 'lab', cls: 'medical_lab' },
  { key: 'insurance_cards', gen: insuranceCard, n: 8, prefix: 'icard', cls: 'insurance_card' },
  { key: 'blank_forms', gen: blankForm, n: 6, prefix: 'blank', cls: 'blank_form' },
  { key: 'foreign_script', gen: foreignScript, n: 9, prefix: 'fs', cls: 'foreign_script' },
  { key: 'letters', gen: letterDoc, n: 6, prefix: 'letter', cls: 'letter' },
];

(async () => {
  const quick = process.argv.includes('--quick');
  const root = path.join(__dirname, '..', '..');
  const rungs = quick ? RUNGS.filter((r) => ['clean', 'worst'].includes(r.name)) : RUNGS;
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();

  for (const fam of FAMILIES) {
    const OUT = path.join(root, 'test_cases', fam.key, 'synthetic');
    fs.mkdirSync(OUT, { recursive: true });
    const manifest = [];
    const N = quick ? Math.min(2, fam.n) : fam.n;
    for (let i = 0; i < N; i++) {
      const rand = mulberry32(30000 + FAMILIES.indexOf(fam) * 1000 + i);
      const t = THEMES[i % THEMES.length];
      const doc = fam.gen(i, rand, t);
      const cls = doc.cls ?? fam.cls;
      for (const rung of rungs) {
        const file = `${fam.prefix}_id${d2(i)}_${rung.name}.${rung.jpegQ ? 'jpg' : 'png'}`;
        await capture(page, doc.html, rung, path.join(OUT, file), 30000 + i, doc.vw ?? 1480, doc.vh ?? 1900);
        manifest.push({
          file,
          class: rung.name === 'clean' ? cls : `${cls}_degraded`,
          degradation: rung.name,
          identity: i,
          truth: doc.truth,
          expect: { noSilentErrors: true },
        });
        process.stdout.write(`✓ ${file}\n`);
      }
    }
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`${fam.key}: ${manifest.length} → ${OUT}`);
  }
  await browser.close();
})();
