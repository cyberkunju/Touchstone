/**
 * GATE RUNNER (P1.9) — scores the live app against the ground-truth corpus.
 *
 * For every manifest entry: upload → capture the app's [GATE] line → score
 * against truth. The one absolute blocker (Constitution N1): silent errors —
 * a field in `confirmed` status whose value contradicts ground truth — must
 * be ZERO. Everything else ratchets against the committed baseline.
 *
 * Usage:
 *   node bench/gate.mjs                 # full corpus
 *   node bench/gate.mjs --quick         # first 8 entries
 *   node bench/gate.mjs --commit        # write bench/baselines/p1.json
 *
 * Requires the dev server at :5173. Uses the persistent puppeteer profile so
 * models load from OPFS (seconds, not minutes).
 */
import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const corpusArg = process.argv.includes('--corpus')
  ? process.argv[process.argv.indexOf('--corpus') + 1]
  : 'passports';
const CORPUS_DIRS = {
  passports: join('passports', 'synthetic'),
  docs: join('docs', 'synthetic'),
  real: join('passports', 'real_fakes'),
  ids: join('id_cards', 'synthetic'),
  licenses: join('licenses', 'synthetic'),
  bank: join('bank_statements', 'synthetic'),
  payslips: join('payslips', 'synthetic'),
  utility: join('utility_bills', 'synthetic'),
  vehicles: join('vehicle_docs', 'synthetic'),
  boarding: join('boarding_passes', 'synthetic'),
  shipping: join('shipping_labels', 'synthetic'),
  cards: join('business_cards', 'synthetic'),
  visas: join('visas', 'synthetic'),
  permits: join('residence_permits', 'synthetic'),
  tax: join('tax_forms', 'synthetic'),
  po: join('purchase_orders', 'synthetic'),
  insurance: join('insurance_notices', 'synthetic'),
  certificates: join('certificates', 'synthetic'),
  transcripts: join('transcripts', 'synthetic'),
  labs: join('medical_labs', 'synthetic'),
  icards: join('insurance_cards', 'synthetic'),
  blanks: join('blank_forms', 'synthetic'),
  foreign: join('foreign_script', 'synthetic'),
  letters: join('letters', 'synthetic'),
  leases: join('property_leases', 'synthetic'),
  rx: join('prescriptions', 'synthetic'),
  quest: join('questionnaires', 'synthetic'),
  composites: 'composites',
  mixed: 'mixed',
};
const BASELINE_FILES = {
  passports: 'p1.json',
  docs: 'docs.json',
  real: 'real.json',
  ids: 'ids.json',
  licenses: 'licenses.json',
  bank: 'bank.json',
  payslips: 'payslips.json',
  utility: 'utility.json',
  vehicles: 'vehicles.json',
  boarding: 'boarding.json',
  shipping: 'shipping.json',
  cards: 'cards.json',
  visas: 'visas.json',
  permits: 'permits.json',
  tax: 'tax.json',
  po: 'po.json',
  insurance: 'insurance.json',
  certificates: 'certificates.json',
  transcripts: 'transcripts.json',
  labs: 'labs.json',
  icards: 'icards.json',
  blanks: 'blanks.json',
  foreign: 'foreign.json',
  letters: 'letters.json',
  leases: 'leases.json',
  rx: 'rx.json',
  quest: 'quest.json',
  composites: 'composites.json',
  mixed: 'mixed.json',
};
const CORPUS = join(root, 'test_cases', CORPUS_DIRS[corpusArg] ?? CORPUS_DIRS.passports);
const BASELINE = join(here, 'baselines', BASELINE_FILES[corpusArg] ?? BASELINE_FILES.passports);
const quick = process.argv.includes('--quick');
const commit = process.argv.includes('--commit');
const filterArg = process.argv.includes('--filter')
  ? new RegExp(process.argv[process.argv.indexOf('--filter') + 1], 'i')
  : null;
const verbose = process.argv.includes('--verbose');

const manifestAll = JSON.parse(readFileSync(join(CORPUS, 'manifest.json'), 'utf8'));
const manifest = filterArg ? manifestAll.filter((e) => filterArg.test(e.file)) : manifestAll;
const entries = quick ? manifest.slice(0, 8) : manifest;

/* --------------------------- truth comparison ----------------------------- */
const norm = (s) => String(s ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
/** label (possibly suffixed "(MRZ)") → truth key */
const LABEL_TO_TRUTH = new Map([
  ['PASSPORT NUMBER', 'passport_number'],
  ['DOCUMENT NUMBER', 'passport_number'],
  ['LICENSE NUMBER', 'passport_number'],
  ['LICENSE NO', 'passport_number'],
  ['COUNTRY CODE', 'country_code'],
  ['DATE OF BIRTH', 'date_of_birth'],
  ['SEX', 'sex'],
  ['DATE OF EXPIRY', 'date_of_expiry'],
  ['EXPIRY DATE', 'date_of_expiry'],
  ['SURNAME', 'surname'],
  // docs corpus
  ['INVOICE NUMBER', 'invoice_number'],
  ['INVOICE DATE', 'invoice_date'],
  ['VENDOR', 'vendor'],
  ['FROM', 'vendor'],
  ['TOTAL', 'total'],
  ['SUBTOTAL', 'subtotal'],
  ['TAX', 'tax'],
  ['FULL NAME', 'full_name'],
  ['NAME', 'full_name'],
  ['EMAIL', 'email'],
  ['PHONE', 'phone'],
  // W2 commerce families
  ['ACCOUNT NUMBER', 'account_number'],
  ['ACCOUNT HOLDER', 'account_holder'],
  ['OPENING BALANCE', 'opening_balance'],
  ['CLOSING BALANCE', 'closing_balance'],
  ['TOTAL CREDITS', 'total_credits'],
  ['TOTAL DEBITS', 'total_debits'],
  ['EMPLOYEE ID', 'employee_id'],
  ['EMPLOYEE NAME', 'employee_name'],
  ['GROSS PAY', 'gross_pay'],
  ['NET PAY', 'net_pay'],
  ['TOTAL DEDUCTIONS', 'total_deductions'],
  ['TOTAL DUE', 'total_due'],
  ['DUE DATE', 'due_date'],
  ['CURRENT CHARGES', 'current_charges'],
  // W3 structured families
  ['VEHICLE IDENTIFICATION NUMBER', 'vin'],
  ['VIN', 'vin'],
  ['PLATE NUMBER', 'plate'],
  ['REGISTERED OWNER', 'owner'],
  ['YEAR OF MANUFACTURE', 'year'],
  ['PASSENGER', 'passenger'],
  ['FLIGHT', 'flight'],
  ['SEAT', 'seat'],
  ['TRACKING NUMBER', 'tracking_number'],
  // Universe families
  ['TAXPAYER ID', 'taxpayer_id'],
  ['TOTAL INCOME', 'total_income'],
  ['TAX WITHHELD', 'tax_withheld'],
  ['TAXPAYER NAME', 'full_name'],
  ['PO NUMBER', 'invoice_number'],
  ['POLICY NUMBER', 'policy_number'],
  ['POLICY HOLDER', 'full_name'],
  ['REGISTRATION NUMBER', 'registration_number'],
  ['STUDENT ID', 'student_id'],
  ['STUDENT NAME', 'full_name'],
  ['CUMULATIVE GPA', 'gpa'],
  ['MEDICAL RECORD NO', 'medical_record_no'],
  ['PATIENT NAME', 'full_name'],
  ['MEMBER ID', 'member_id'],
  ['MEMBER NAME', 'full_name'],
  ['GROUP NUMBER', 'group_number'],
  ['REFERENCE', 'reference'],
  ['MONTHLY RENT', 'monthly_rent'],
  ['SECURITY DEPOSIT', 'security_deposit'],
  ['LANDLORD', 'landlord'],
  ['TENANT', 'tenant'],
  ['RX NUMBER', 'rx_number'],
  ['PATIENT NAME', 'patient_name'],
  ['RESPONDENT NAME', 'full_name'],
  ['MEMBER NAME', 'full_name'],
]);
function truthKeyFor(label) {
  return LABEL_TO_TRUTH.get(norm(label).replace(/\s*\(MRZ\)$/, '')) ?? null;
}
/** Semantic date canonicalization: truth is ISO (YYYY-MM-DD); documents
 *  print locale forms (corpus renders DMY). "31/12/2026" IS "2026-12-31" —
 *  string compare minted 24 fake silents on utility (live-caught). */
/** All plausible ISO readings of a date string — the scorer assumes NO
 *  locale. "23/04/1985" → one reading (23 can't be a month); "05/03/2026"
 *  → two. Matching = plausible-set intersection: a faithful read of the
 *  printed token never scores as a silent whichever locale printed it
 *  (live-caught both ways: DMY-assumed scoring minted 24 false silents on
 *  utility, then computed month 23 on a correct MDY read on forge_193). */
function canonDates(s) {
  const out = new Set();
  const m = String(s).match(/(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (!m) return out;
  const [, a, b, c] = m;
  const iso = (y, mo, d) => {
    if (Number(mo) >= 1 && Number(mo) <= 12 && Number(d) >= 1 && Number(d) <= 31) {
      out.add(`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
  };
  if (a.length === 4) iso(a, b, c);            // ISO Y-M-D
  else if (c.length === 4) {
    iso(c, b, a);                              // DMY reading
    iso(c, a, b);                              // MDY reading
  }
  return out;
}
function valuesMatch(truthKey, truthVal, got) {
  const g = norm(got);
  const t = norm(truthVal);
  if (truthKey.includes('date')) {
    if (g === t || g.replaceAll('/', '-') === t) return true;
    const cg = canonDates(g);
    const ct = canonDates(t);
    for (const iso of cg) if (ct.has(iso)) return true;
    return false;
  }
  // Surname must be EXACT — substring matching scored garbage like "I" as a
  // hit for "LI" (live-caught). Only multi-token fields keep containment.
  if (truthKey === 'vendor' || truthKey === 'full_name') {
    return g.includes(t) || t.includes(g);
  }
  if (truthKey === 'total' || truthKey === 'subtotal' || truthKey === 'tax' ||
      truthKey.includes('balance') || truthKey.includes('credits') || truthKey.includes('debits') ||
      truthKey.includes('pay') || truthKey.includes('due') || truthKey.includes('charges') ||
      truthKey.includes('deductions') || truthKey.includes('income') || truthKey.includes('withheld') ||
      truthKey.includes('rent') || truthKey.includes('deposit')) {
    // Money compares NUMERICALLY: "3,859.60" == "3859.6" == "3859.60".
    // (String compare marked numerically-equal reads as silent errors.)
    const num = (s) => Number.parseFloat(String(s).replace(/[^0-9.\-]/g, ''));
    const a = num(g);
    const b = num(t);
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.005;
  }
  return g === t;
}

/* ------------------------------ scoring ----------------------------------- */
function scoreEntry(entry, gate) {
  const r = {
    file: entry.file,
    class: entry.class,
    degradation: entry.degradation,
    completed: !!gate,
    mrzValid: gate?.mrzValid ?? false,
    silentErrors: [],
    fieldHits: 0,
    fieldTotal: 0,
    conflictSurfaced: null,
    pass: false,
  };
  if (!gate) return r;

  if (entry.truth) {
    const wanted = new Map(
      Object.entries(entry.truth).filter(([k]) => k !== 'mrzLines' && k !== 'barcodePayload' && k !== 'checkedStates'),
    );
    r.fieldTotal = wanted.size;
    const seen = new Map(); // truthKey → best {value,status}
    for (const f of gate.fields) {
      const key = truthKeyFor(f.label);
      if (!key || !wanted.has(key) || f.value === null) continue;
      const match = valuesMatch(key, wanted.get(key), f.value);
      if (match && !seen.has(key)) seen.set(key, f);
      // THE law: confirmed + wrong = silent error.
      if (!match && f.status === 'confirmed') {
        r.silentErrors.push({ field: key, got: f.value, want: wanted.get(key) });
      }
    }
    r.fieldHits = seen.size;
  }

  if (entry.class === 'adversarial') {
    // Refusal is the pass: no MRZ claim on a structurally fake MRZ.
    r.pass = gate.mrzValid === false && r.silentErrors.length === 0;
  } else if (entry.class === 'real_fake') {
    // REAL-WORLD REFUSAL CLASS (anti-bias corpus): photorealistic AI fakes
    // with structurally non-ICAO MRZs. The engine must never claim the MRZ.
    // Silver VIZ labels (independent single-source OCR) police CONFIRMED
    // fields only: a confirmed value contradicting the independent read is
    // a silent-error suspect; review statuses are never penalized.
    let silverContradictions = 0;
    if (entry.silverTruth) {
      for (const f of gate.fields) {
        const key = truthKeyFor(f.label);
        if (!key || !(key in entry.silverTruth) || f.value === null) continue;
        if (f.status === 'confirmed' && !valuesMatch(key, entry.silverTruth[key], f.value)) {
          silverContradictions++;
          r.silentErrors.push({ field: key, got: f.value, want: entry.silverTruth[key], source: 'silver' });
        }
      }
    }
    r.pass = gate.mrzValid === false && silverContradictions === 0;
  } else if (entry.class === 'negative') {
    // Honesty on non-documents: no MRZ claim and nothing identity/money-like
    // CONFIRMED. Review-status noise is acceptable; confident noise is not.
    const confidentNoise = gate.fields.filter(
      (f) => f.status === 'confirmed' && ['id_number', 'amount', 'date', 'mrz'].includes(f.type),
    );
    r.pass = gate.mrzValid === false && confidentNoise.length === 0;
  } else if (entry.class === 'conflict') {
    // The forged VIZ value must never be silently confirmed; MRZ truth wins.
    r.conflictSurfaced = r.silentErrors.length === 0;
    r.pass = r.silentErrors.length === 0 && gate.mrzValid === true;
  } else if (entry.class === 'license') {
    // AAMVA family: the PDF417 payload IS the truth (Reed-Solomon-corrected
    // decode). Pass = the barcode decoded to exactly the rendered payload
    // (whitespace-normalized), zero silents. VIZ recall ratchets separately.
    const bar = gate.fields.find((f) => f.type === 'barcode' && f.value);
    const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
    const barcodeOk = !!bar && clean(bar.value) === clean(entry.truth.barcodePayload);
    r.barcodeOk = barcodeOk;
    r.pass = r.silentErrors.length === 0 && barcodeOk;
  } else if (entry.class.startsWith('boarding_pass') || entry.class.startsWith('shipping_label')) {
    // Barcode-anchored families: payload duplication is the verification
    // anchor — decode must match the rendered payload exactly.
    const bar = gate.fields.find((f) => f.type === 'barcode' && f.value);
    const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
    const barcodeOk = !!bar && clean(bar.value) === clean(entry.truth.barcodePayload);
    r.barcodeOk = barcodeOk;
    r.pass = r.silentErrors.length === 0 && barcodeOk;
  } else if (
    entry.class.startsWith('bank_statement') ||
    entry.class.startsWith('payslip') ||
    entry.class.startsWith('utility_bill') ||
    entry.class.startsWith('vehicle_doc') ||
    entry.class.startsWith('business_card') ||
    entry.class.startsWith('tax_form') ||
    entry.class.startsWith('purchase_order') ||
    entry.class.startsWith('insurance_notice') ||
    entry.class.startsWith('transcript') ||
    entry.class.startsWith('medical_lab') ||
    entry.class.startsWith('insurance_card') ||
    entry.class.startsWith('certificate') ||
    entry.class.startsWith('letter') ||
    entry.class.startsWith('property_lease') ||
    entry.class === 'prescription' ||
    entry.class === 'prescription_degraded' ||
    entry.class.startsWith('composite_')
  ) {
    // Arithmetic/grammar families: SILENT=0 is the law; recall floors start
    // permissive (0.4 clean / 0.2 degraded) and ratchet upward via baselines.
    const floor = entry.degradation === 'clean' ? 0.4 : 0.2;
    r.pass = r.silentErrors.length === 0 && r.fieldHits >= Math.ceil(r.fieldTotal * floor);
  } else if (entry.class.startsWith('blank_form')) {
    // A blank form has NO values — any confident typed claim is invention.
    const inventions = gate.fields.filter(
      (f) => f.status === 'confirmed' && ['id_number', 'amount', 'date', 'email', 'phone'].includes(f.type) && f.value,
    );
    r.pass = inventions.length === 0 && r.silentErrors.length === 0;
  } else if (entry.class.startsWith('foreign_') || entry.class === 'prescription_hw' || entry.class.startsWith('questionnaire')) {
    // Honesty-only classes: recall floor 0 by design — cursive must never be
    // confidently misread, checkbox answers must never be invented, script
    // text must never become confident Latin garbage. SILENT=0 is the law.
    r.pass = r.silentErrors.length === 0;
  } else if (entry.class.startsWith('invoice') || entry.class === 'receipt' || entry.class === 'form') {
    // Extraction floors ratchet upward via the baseline; the LAW is silence.
    const floor = entry.degradation === 'clean' ? 0.5 : 0.25;
    r.pass = r.silentErrors.length === 0 && r.fieldHits >= Math.ceil(r.fieldTotal * floor);
  } else if (entry.class === 'mixed_page') {
    // Multi-document pages: every constituent's truth scores independently.
    // THE mixed silent class: a field CONFIRMED with a value that belongs to
    // the OTHER constituent (cross-document bleed) — checked by testing each
    // confirmed value against every constituent's truth pool.
    const allTruths = entry.constituents.map((c) =>
      new Map(Object.entries(c.truth).filter(([k]) => k !== 'mrzLines' && k !== 'barcodePayload' && k !== 'checkedStates')));
    r.fieldTotal = allTruths.reduce((s, t) => s + t.size, 0);
    const seen = new Set();
    for (const f of gate.fields) {
      const key = truthKeyFor(f.label);
      if (!key || f.value === null) continue;
      // A field matching ANY constituent's truth for that key = hit.
      let matched = false;
      for (let ci = 0; ci < allTruths.length; ci++) {
        if (allTruths[ci].has(key) && valuesMatch(key, allTruths[ci].get(key), f.value)) {
          if (!seen.has(`${ci}:${key}`)) { seen.add(`${ci}:${key}`); }
          matched = true;
          break;
        }
      }
      if (matched) continue;
      // Confirmed + wrong for every constituent that HAS this key = silent.
      if (f.status === 'confirmed' && allTruths.some((t) => t.has(key))) {
        r.silentErrors.push({ field: key, got: f.value, want: allTruths.map((t) => t.get(key)).filter(Boolean).join(' | ') });
      }
    }
    r.fieldHits = seen.size;
    // Floors start permissive (single-doc assumption in the pipeline today);
    // SILENT=0 is the law from day one.
    r.pass = r.silentErrors.length === 0;
  } else {
    r.pass =
      r.silentErrors.length === 0 &&
      gate.mrzValid === (entry.expect.mrzValid ?? true) &&
      r.fieldHits >= Math.ceil(r.fieldTotal * 0.7); // ratcheted upward via baseline
  }
  return r;
}

/* ------------------------------- runner ----------------------------------- */
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  protocolTimeout: 20 * 60 * 1000,
  userDataDir: join(root, '.puppeteer-profile'),
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
page.on('dialog', (d) => d.dismiss().catch(() => {}));

let gateLine = null;
let settle = null;
page.on('console', (m) => {
  const t = m.text();
  if (verbose && /^\[(DIAG|App)\]/.test(t)) {
    console.log(`  | ${t.slice(0, 400)}`);
  }
  if (t.startsWith('[GATE] ')) {
    if (verbose) console.log(`  | ${t.slice(0, 1200)}`);
    try { gateLine = JSON.parse(t.slice(7)); } catch { gateLine = null; }
    settle?.();
  } else if (t.startsWith('Processing failed:')) {
    settle?.();
  }
});
page.on('pageerror', () => settle?.());

const results = [];
const t0 = Date.now();
for (const entry of entries) {
  const imgPath = resolve(CORPUS, entry.file);
  gateLine = null;
  const done = new Promise((r) => { settle = r; });
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const input = await page.waitForSelector('input[type="file"]', { timeout: 30000 });
  const tEntry = Date.now();
  await input.uploadFile(imgPath);
  await Promise.race([done, new Promise((r) => setTimeout(r, 6 * 60 * 1000))]);
  const res = scoreEntry(entry, gateLine);
  res.ms = Date.now() - tEntry;
  results.push(res);
  console.log(
    `${res.pass ? 'PASS' : 'FAIL'}  ${entry.file.padEnd(28)} ${entry.class.padEnd(11)} ` +
      `mrz=${res.mrzValid ? 'Y' : 'N'} fields=${res.fieldHits}/${res.fieldTotal} ` +
      `silent=${res.silentErrors.length} ${res.ms}ms`,
  );
  for (const se of res.silentErrors) {
    console.log(`      SILENT ERROR ${se.field}: got "${se.got}" want "${se.want}"`);
  }
}
await browser.close();

/* ------------------------------ summary ----------------------------------- */
const summary = {
  when: new Date().toISOString(),
  entries: results.length,
  passed: results.filter((r) => r.pass).length,
  silentErrors: results.reduce((n, r) => n + r.silentErrors.length, 0),
  mrzValidRate:
    results.filter((r) => !['adversarial', 'negative', 'invoice', 'invoice_degraded', 'receipt', 'form'].includes(r.class) && r.mrzValid).length /
    Math.max(1, results.filter((r) => !['adversarial', 'negative', 'invoice', 'invoice_degraded', 'receipt', 'form'].includes(r.class)).length),
  fieldHitRate:
    results.reduce((n, r) => n + r.fieldHits, 0) /
    Math.max(1, results.reduce((n, r) => n + r.fieldTotal, 0)),
  adversarialRefusalRate:
    results.filter((r) => r.class === 'adversarial' && r.pass).length /
    Math.max(1, results.filter((r) => r.class === 'adversarial').length),
  totalMs: Date.now() - t0,
  results,
};
console.log('\n=== GATE SUMMARY ===');
console.log(`entries=${summary.entries} passed=${summary.passed} SILENT=${summary.silentErrors}`);
console.log(
  `mrzValidRate=${(summary.mrzValidRate * 100).toFixed(1)}% fieldHitRate=${(summary.fieldHitRate * 100).toFixed(1)}% ` +
    `adversarialRefusal=${(summary.adversarialRefusalRate * 100).toFixed(0)}% in ${(summary.totalMs / 1000).toFixed(0)}s`,
);

// The absolute blocker.
let exitCode = summary.silentErrors > 0 ? 2 : 0;

// Always persist the full report — 27-minute runs must never need repeating
// just to see which entries failed.
mkdirSync(dirname(BASELINE), { recursive: true });
writeFileSync(join(dirname(BASELINE), 'last-run.json'), JSON.stringify(summary, null, 2));

// Ratchet vs committed baseline.
if (existsSync(BASELINE) && !commit) {
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const worse = [];
  if (summary.mrzValidRate < base.mrzValidRate - 1e-9) worse.push('mrzValidRate');
  if (summary.fieldHitRate < base.fieldHitRate - 1e-9) worse.push('fieldHitRate');
  if (summary.adversarialRefusalRate < base.adversarialRefusalRate - 1e-9) worse.push('adversarialRefusal');
  if (worse.length) {
    console.log(`BASELINE REGRESSION: ${worse.join(', ')} (baseline ${base.when})`);
    exitCode = exitCode || 3;
  } else {
    console.log('baseline: no regression');
  }
}
if (commit) {
  mkdirSync(dirname(BASELINE), { recursive: true });
  writeFileSync(BASELINE, JSON.stringify(summary, null, 2));
  console.log(`baseline committed → ${BASELINE}`);
}
process.exit(exitCode);
