/**
 * FINAL FAMILIES COMPILER — property leases, prescriptions, questionnaires.
 *
 *   property_leases  rent/deposit arithmetic (deposit = 2 × rent — closure),
 *                    party names, dates, address grammars.
 *   prescriptions    PRINTED variant carries drug/dose truth; HANDWRITING
 *                    variant (script font) is deliberately review-first: the
 *                    engine must never confidently misread cursive (truth
 *                    withheld from scoring except silent-error policing).
 *   questionnaires   checkbox forms — truth records the CHECKED states; no
 *                    checkbox primitive exists yet (P4), so the class floor
 *                    is 0 and the law is pure honesty (no invented answers).
 *
 * Usage: node bench/corpus/compile-final.cjs [--quick]
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
const cents = (c) => `${Math.floor(c / 100)}.${d2(c % 100)}`;
const centsFmt = (c) => `${String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${d2(c % 100)}`;
const PEOPLE = ['ANNA ERIKSSON', 'KENJI NAKAMURA', 'CHINWE OKONKWO', 'SIOBHAN OBRIEN', 'LAYLA ALFARSI', 'MALGORZATA SZCZEPANSKA', 'WEI LI', 'JOSE FERNANDEZ', 'HANS MUELLER', 'PRIYA ANAND'];
const THEMES = [
  { font: 'Arial', bg: '#f5f6f7' },
  { font: 'Georgia, serif', bg: '#f7f3ea' },
  { font: 'Verdana', bg: '#f2f6f1' },
  { font: 'Tahoma', bg: '#f7f1f3' },
];
const cap = (label, value) =>
  `<div style="min-width:190px"><div style="font-size:13px;color:#67707c;text-transform:uppercase;letter-spacing:.5px">${label}</div>` +
  `<div style="font-size:22px;font-weight:600;color:#1b2027;margin-top:1px">${value}</div></div>`;

const RUNGS = [
  { name: 'clean' },
  { name: 'jpeg40', jpegQ: 40 },
  { name: 'blur1', css: 'blur(1.1px)' },
  { name: 'worst', css: 'blur(1.2px)', rotate: -5, noise: 30, jpegQ: 55 },
];

async function capture(page, html, rung, outPath, seed, vw, vh) {
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

function shell(t, title, subtitle, body, w, h) {
  return `<!doctype html><html><body style="margin:0">
<div id="doc" style="width:${w}px;height:${h}px;background:${t.bg};font-family:${t.font};position:relative;overflow:hidden">
  <div style="padding:32px 50px 4px;font-size:29px;font-weight:bold;letter-spacing:1px">${title}</div>
  <div style="padding:0 50px 6px;font-size:15px;color:#67707c">${subtitle}</div>
  ${body}
</div></body></html>`;
}

(async () => {
  const quick = process.argv.includes('--quick');
  const root = path.join(__dirname, '..', '..');
  const rungs = quick ? RUNGS.filter((r) => ['clean', 'worst'].includes(r.name)) : RUNGS;
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();

  /* ------------------------- property leases ------------------------------ */
  {
    const OUT = path.join(root, 'test_cases', 'property_leases', 'synthetic');
    fs.mkdirSync(OUT, { recursive: true });
    const manifest = [];
    const N = quick ? 2 : 8;
    for (let i = 0; i < N; i++) {
      const rand = mulberry32(40000 + i);
      const t = THEMES[i % THEMES.length];
      const landlord = PEOPLE[i % PEOPLE.length];
      const tenant = PEOPLE[(i + 4) % PEOPLE.length];
      const rent = 90000 + Math.floor(rand() * 220000);
      const deposit = rent * 2; // THE closure: deposit = 2 × rent
      const address = `${10 + i} WILLOW CRESCENT, UNIT ${1 + (i % 12)}`;
      const body = `
      <div style="position:absolute;left:50px;top:120px;right:50px;display:flex;flex-wrap:wrap;gap:22px 50px">
        ${cap('Landlord', landlord)}${cap('Tenant', tenant)}
        ${cap('Property Address', address)}
        ${cap('Lease Start', `01/09/2026`)}${cap('Lease End', `31/08/2027`)}
        ${cap('Monthly Rent', centsFmt(rent))}${cap('Security Deposit', centsFmt(deposit))}
      </div>
      <div style="position:absolute;left:50px;top:420px;right:50px;font-size:17px;line-height:1.8;color:#333c46">
        <p>1. The Tenant shall pay the Monthly Rent stated above on the first day of each calendar month.</p>
        <p>2. The Security Deposit equals two months' rent and is refundable per clause 9.</p>
        <p>3. This agreement is a fictional training specimen for document analysis systems.</p>
      </div>
      <div style="position:absolute;left:50px;bottom:70px;display:flex;gap:120px">
        ${cap('Landlord Signature', '________________')}${cap('Tenant Signature', '________________')}
      </div>`;
      for (const rung of rungs) {
        const file = `lease_id${d2(i)}_${rung.name}.${rung.jpegQ ? 'jpg' : 'png'}`;
        await capture(page, shell(t, 'RESIDENTIAL LEASE AGREEMENT', 'Fictional tenancy contract — deposit = 2 × rent by construction', body, 1400, 1300), rung, path.join(OUT, file), 40000 + i, 1480, 1400);
        manifest.push({
          file, class: rung.name === 'clean' ? 'property_lease' : 'property_lease_degraded',
          degradation: rung.name, identity: i,
          truth: { monthly_rent: cents(rent), security_deposit: cents(deposit), landlord, tenant },
          expect: { noSilentErrors: true },
        });
        process.stdout.write(`✓ ${file}\n`);
      }
    }
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`Property leases: ${manifest.length} → ${OUT}`);
  }

  /* --------------------------- prescriptions ------------------------------ */
  {
    const OUT = path.join(root, 'test_cases', 'prescriptions', 'synthetic');
    fs.mkdirSync(OUT, { recursive: true });
    const manifest = [];
    const DRUGS = [
      ['Amoxicillin', '500mg', 'three times daily for 7 days'],
      ['Lisinopril', '10mg', 'once daily'],
      ['Metformin', '850mg', 'twice daily with meals'],
      ['Atorvastatin', '20mg', 'once daily at night'],
    ];
    const N = quick ? 2 : 8;
    for (let i = 0; i < N; i++) {
      const rand = mulberry32(41000 + i);
      const t = THEMES[i % THEMES.length];
      const patient = PEOPLE[i % PEOPLE.length];
      const [drug, dose, freq] = DRUGS[i % DRUGS.length];
      const rxNo = `RX-${String(100000 + Math.floor(rand() * 900000))}`;
      const makeBody = (handwritten) => `
      <div style="position:absolute;left:50px;top:118px;right:50px;display:flex;flex-wrap:wrap;gap:20px 46px">
        ${cap('Patient Name', patient)}${cap('Rx Number', rxNo)}${cap('Date', `0${1 + (i % 9)}/07/2026`)}${cap('Prescriber', 'DR. R. VANCE, MD')}
      </div>
      <div style="position:absolute;left:50px;top:320px;right:50px;border-top:2px solid #9aa4b2;padding-top:26px">
        <div style="font-size:40px;color:#25303c;margin-bottom:8px">℞</div>
        <div style="font-size:${handwritten ? 34 : 27}px;${handwritten ? "font-family:'Segoe Script','Comic Sans MS',cursive;transform:rotate(-1.2deg);color:#1a2f66" : 'font-weight:600'};line-height:1.7">
          ${drug} ${dose}<br>Sig: ${freq}<br>Disp: 30 units — no refills
        </div>
      </div>
      <div style="position:absolute;right:60px;bottom:70px">${cap('Signature', handwritten ? '<span style="font-family:\'Segoe Script\',cursive;font-size:30px">R Vance</span>' : 'R. VANCE')}</div>`;
      // Printed variant — drug truth is scoreable.
      for (const rung of rungs) {
        const file = `rx_id${d2(i)}_${rung.name}.${rung.jpegQ ? 'jpg' : 'png'}`;
        await capture(page, shell(t, 'PRESCRIPTION', 'Meridian Clinic — fictional printed Rx', makeBody(false), 1400, 1000), rung, path.join(OUT, file), 41000 + i, 1480, 1100);
        manifest.push({
          file, class: rung.name === 'clean' ? 'prescription' : 'prescription_degraded',
          degradation: rung.name, identity: i,
          truth: { rx_number: rxNo, patient_name: patient, drug: `${drug} ${dose}` },
          expect: { noSilentErrors: true },
        });
        process.stdout.write(`✓ ${file}\n`);
      }
      // Handwriting variant — review-first: only silent-error policing.
      for (const rung of rungs.filter((r) => ['clean', 'worst'].includes(r.name))) {
        const file = `rxhw_id${d2(i)}_${rung.name}.${rung.jpegQ ? 'jpg' : 'png'}`;
        await capture(page, shell(t, 'PRESCRIPTION', 'Meridian Clinic — fictional handwritten Rx (cursive: review-first by design)', makeBody(true), 1400, 1000), rung, path.join(OUT, file), 41500 + i, 1480, 1100);
        manifest.push({
          file, class: 'prescription_hw',
          degradation: rung.name, identity: i,
          // Cursive truth is withheld from recall scoring — only the patient
          // (printed caption) polices silents. Misreading cursive CONFIDENTLY
          // is the failure mode; not reading it is correct.
          truth: { rx_number: rxNo, patient_name: patient },
          expect: { noSilentErrors: true },
        });
        process.stdout.write(`✓ ${file}\n`);
      }
    }
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`Prescriptions: ${manifest.length} → ${OUT}`);
  }

  /* --------------------------- questionnaires ----------------------------- */
  {
    const OUT = path.join(root, 'test_cases', 'questionnaires', 'synthetic');
    fs.mkdirSync(OUT, { recursive: true });
    const manifest = [];
    const QUESTIONS = [
      'Do you currently hold a valid driving license?',
      'Have you resided at your address for more than 2 years?',
      'Are you employed full-time?',
      'Do you consent to electronic communication?',
      'Have you previously held a membership with us?',
      'Would you like to receive the monthly newsletter?',
    ];
    const N = quick ? 2 : 8;
    for (let i = 0; i < N; i++) {
      const rand = mulberry32(42000 + i);
      const t = THEMES[i % THEMES.length];
      const person = PEOPLE[i % PEOPLE.length];
      const checked = QUESTIONS.map(() => rand() < 0.5);
      const rows = QUESTIONS.map((q, k) => `
        <div style="display:flex;align-items:center;gap:22px;margin:20px 0">
          <div style="width:30px;height:30px;border:3px solid #333;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:bold">${checked[k] ? '✕' : ''}</div>
          <div style="font-size:20px">${q}</div>
        </div>`).join('');
      const body = `
      <div style="position:absolute;left:50px;top:118px;right:50px;display:flex;gap:50px">
        ${cap('Respondent Name', person)}${cap('Date', `1${i % 9}/07/2026`)}
      </div>
      <div style="position:absolute;left:50px;top:240px;right:50px">${rows}</div>
      <div style="position:absolute;left:50px;bottom:60px;font-size:14px;color:#67707c">Marked boxes are ground truth — a checkbox primitive (P4) will score them; until then honesty is the law.</div>`;
      for (const rung of rungs) {
        const file = `quest_id${d2(i)}_${rung.name}.${rung.jpegQ ? 'jpg' : 'png'}`;
        await capture(page, shell(t, 'MEMBER QUESTIONNAIRE', 'Fictional survey form — checkbox truth recorded for the P4 primitive', body, 1400, 1200), rung, path.join(OUT, file), 42000 + i, 1480, 1300);
        manifest.push({
          file, class: rung.name === 'clean' ? 'questionnaire' : 'questionnaire_degraded',
          degradation: rung.name, identity: i,
          truth: { full_name: person, checkedStates: checked },
          expect: { noSilentErrors: true },
        });
        process.stdout.write(`✓ ${file}\n`);
      }
    }
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`Questionnaires: ${manifest.length} → ${OUT}`);
  }

  await browser.close();
})();
