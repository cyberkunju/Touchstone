/**
 * Generates a minimal 2-page digital PDF (Helvetica text, valid xref) for
 * multi-page continuation e2e. Page 1: invoice header fields. Page 2:
 * continuation sheet with a distinct field (PO Number) + grand total.
 */
const fs = require('fs');

function textStream(lines) {
  const parts = ['BT', '/F1 18 Tf', '50 760 Td', '20 TL'];
  for (const l of lines) parts.push(`(${l.replace(/[()\\]/g, '\\$&')}) Tj`, 'T*');
  parts.push('ET');
  return parts.join('\n');
}

const p1 = textStream([
  'INVOICE',
  'Invoice Number: INV-2031-889',
  'Invoice Date: 12/03/2031',
  'Vendor: Northwind Traders',
  'Subtotal: $1,200.00',
  'Tax: $96.00',
  'Total: $1,296.00',
]);
const p2 = textStream([
  'CONTINUATION SHEET - PAGE 2',
  'PO Number: PO-77-4412',
  'Delivery Date: 15/03/2031',
  'Contact Email: billing@northwind.example',
]);

const objects = [];
objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
objects[2] = '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>';
objects[3] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /Font << /F1 7 0 R >> >> >>';
objects[4] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>';
objects[5] = `<< /Length ${p1.length} >>\nstream\n${p1}\nendstream`;
objects[6] = `<< /Length ${p2.length} >>\nstream\n${p2}\nendstream`;
objects[7] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

let pdf = '%PDF-1.4\n';
const offsets = [0];
for (let i = 1; i < objects.length; i++) {
  offsets[i] = Buffer.byteLength(pdf, 'latin1');
  pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
}
const xrefAt = Buffer.byteLength(pdf, 'latin1');
pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
for (let i = 1; i < objects.length; i++) {
  pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;

fs.writeFileSync('test_cases/native_files/invoice_multipage.pdf', Buffer.from(pdf, 'latin1'));
console.log('wrote test_cases/native_files/invoice_multipage.pdf', pdf.length, 'bytes');
