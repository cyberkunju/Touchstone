/**
 * TIER-4 NATIVE FILES — digital-born documents where text is EXACT truth.
 *
 * PDFs (puppeteer print), XLSX (exceljs), CSV. No OCR is ever involved for
 * these — the P3 service reads text spans/cells directly; the corpus records
 * the exact expected values so the digital route can be gated bit-for-bit.
 *
 * Usage: node bench/corpus/make-native-files.mjs
 */
import puppeteer from 'puppeteer';
import ExcelJS from 'exceljs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(root, 'test_cases', 'native_files');
mkdirSync(OUT, { recursive: true });

const manifest = [];
const cents = (c) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;

/* ------------------------------- PDFs ------------------------------------- */
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();

for (let i = 0; i < 6; i++) {
  const inv = `INV-D-${2026}${String(100 + i)}`;
  const items = Array.from({ length: 3 + (i % 3) }, (_, k) => ({
    desc: ['Consulting hours', 'License seats', 'Support plan', 'Training day', 'Hardware unit'][k],
    qty: 1 + (k % 4),
    unit: 25000 + k * 13750 + i * 900,
  }));
  const subtotal = items.reduce((s, it) => s + it.qty * it.unit, 0);
  const tax = Math.round(subtotal * 0.1);
  const total = subtotal + tax;
  const rows = items.map((it) => `<tr><td style="padding:8px;border-bottom:1px solid #ccc">${it.desc}</td><td style="text-align:right;padding:8px;border-bottom:1px solid #ccc">${it.qty}</td><td style="text-align:right;padding:8px;border-bottom:1px solid #ccc">${cents(it.unit)}</td><td style="text-align:right;padding:8px;border-bottom:1px solid #ccc">${cents(it.qty * it.unit)}</td></tr>`).join('');
  await page.setContent(`<html><body style="font-family:Arial;padding:40px">
    <h1>INVOICE ${inv}</h1><p>Vendor: Meridian Labs (fictional) — Date: 0${1 + i}/07/2026</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr style="background:#eee"><th style="text-align:left;padding:8px">Description</th><th style="padding:8px">Qty</th><th style="padding:8px">Unit</th><th style="padding:8px">Total</th></tr>${rows}
    </table>
    <h3 style="text-align:right">Subtotal: ${cents(subtotal)} &nbsp; Tax: ${cents(tax)} &nbsp; TOTAL: ${cents(total)}</h3>
  </body></html>`, { waitUntil: 'load' });
  const file = `invoice_digital_${String(i).padStart(2, '0')}.pdf`;
  await page.pdf({ path: join(OUT, file), format: 'A4' });
  manifest.push({
    file, class: 'native_pdf_invoice', route: 'digital',
    truth: { invoice_number: inv, subtotal: cents(subtotal), tax: cents(tax), total: cents(total) },
    expect: { exactText: true, noSilentErrors: true },
  });
  console.log(`✓ ${file}`);
}
await browser.close();

/* ------------------------------- XLSX ------------------------------------- */
for (let i = 0; i < 4; i++) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Ledger');
  ws.addRow(['Date', 'Description', 'Debit', 'Credit', 'Balance']);
  let bal = 250000 + i * 12345;
  const opening = bal;
  // The truth must exist IN the document (gate law): explicit opening row.
  ws.addRow(['2026-05-31', 'Opening balance', 0, 0, opening / 100]);
  for (let r = 0; r < 10; r++) {
    const debit = r % 3 === 0 ? 0 : 1200 + r * 517 + i * 89;
    const credit = r % 3 === 0 ? 30000 + r * 700 : 0;
    bal = bal - debit + credit;
    ws.addRow([`2026-06-${String(r + 1).padStart(2, '0')}`, `Entry ${r + 1}`, debit / 100, credit / 100, bal / 100]);
  }
  const file = `ledger_${String(i).padStart(2, '0')}.xlsx`;
  await wb.xlsx.writeFile(join(OUT, file));
  manifest.push({
    file, class: 'native_xlsx_ledger', route: 'digital',
    truth: { opening_balance: cents(opening), closing_balance: cents(bal) },
    expect: { exactCells: true, noSilentErrors: true },
  });
  console.log(`✓ ${file}`);
}

/* -------------------------------- CSV ------------------------------------- */
for (let i = 0; i < 3; i++) {
  const rows = [['employee_id', 'name', 'gross', 'deductions', 'net']];
  for (let r = 0; r < 6; r++) {
    const gross = 300000 + r * 25000 + i * 1111;
    const ded = Math.round(gross * 0.22);
    rows.push([`E${1000 + r}`, `Person ${r}`, cents(gross), cents(ded), cents(gross - ded)]);
  }
  const file = `payroll_${String(i).padStart(2, '0')}.csv`;
  writeFileSync(join(OUT, file), rows.map((r) => r.join(',')).join('\n'));
  manifest.push({
    file, class: 'native_csv_payroll', route: 'digital',
    truth: { rows: rows.length - 1 },
    expect: { exactCells: true, noSilentErrors: true },
  });
  console.log(`✓ ${file}`);
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Native files: ${manifest.length} → ${OUT} (gated by the P3 digital route when it lands)`);
