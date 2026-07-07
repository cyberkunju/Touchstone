/**
 * P2.6 acceptance — THE important one: the exported XLSX is re-imported
 * with exceljs and every cell must equal the record-store value. Export is
 * proven lossless, never assumed. Plus RFC 4180 edge laws and the asset
 * zip round-trip.
 *
 * DESTINATION: src/workspace/export.test.ts.
 */
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { DocRecord, Family, JustificationSummary } from '../../../src/workspace/types';
import { buildAssetsZip, buildCsv, buildJson, buildXlsx, csvField, exportColumns } from './export';

const J: JustificationSummary = { attestations: [], confidence: 0.97, reasons: ['test'] };

function makeFamily(): Family {
  return {
    familyId: 'fam_test01',
    name: 'Invoices (ACME)',
    status: 'active',
    formSchema: [
      { fieldId: 'f_num', label: 'Invoice Number', valueType: 'id', required: true, critical: true, column: true },
      { fieldId: 'f_date', label: 'Date', valueType: 'date', required: true, critical: false, column: true },
      { fieldId: 'f_total', label: 'Total', valueType: 'amount', required: true, critical: true, column: true },
      { fieldId: 'f_memo', label: 'Memo, "quoted"', valueType: 'text', required: false, critical: false, column: true },
      { fieldId: 'f_photo', label: 'Stamp', valueType: 'seal', required: false, critical: false, column: true },
      { fieldId: 'f_internal', label: 'Internal Only', valueType: 'text', required: false, critical: false, column: false },
    ],
    templateIds: ['tpl_a', 'tpl_b'],
    stats: { records: 2, stp: 1, questionsPerDoc: 0 },
    createdAt: '2026-07-07T10:00:00.000Z',
    updatedAt: '2026-07-07T10:00:00.000Z',
  };
}

function makeRecords(): DocRecord[] {
  const base = {
    familyId: 'fam_test01',
    docGraphId: 'g1',
    assetRefs: {} as Record<string, string>,
    sourceFile: { name: 'a.png', sha256: 'a'.repeat(64), opfsPath: 'files/aa', kind: 'image' as const },
    identity: { phash64: '0123456789abcdef' },
    createdAt: '2026-07-07T10:01:00.000Z',
    review: { open: false, openFieldIds: [] as string[] },
  };
  return [
    {
      ...base,
      recordId: 'rec_01',
      values: {
        f_num: { value: 'INV-2026-7745', status: 'confirmed', justification: J },
        f_date: { value: '2026-07-01', status: 'confirmed', justification: J },
        f_total: { value: '1,908.84', status: 'confirmed', justification: J },
        f_memo: { value: 'contains, comma and "quotes"\nand a newline', status: 'needs_review', justification: J },
        f_internal: { value: 'hidden', status: 'confirmed', justification: J },
      },
      assetRefs: { f_photo: 'assets/rec_01/seal_1.png' },
    },
    {
      ...base,
      recordId: 'rec_02',
      values: {
        f_num: { value: 'INV-2026-7746', status: 'confirmed', justification: J },
        f_date: { value: '2026-07-02', status: 'confirmed', justification: J },
        f_total: { value: '88.00', status: 'confirmed', justification: J },
        // f_memo deliberately absent (missing value exports as '')
      },
    } as DocRecord,
  ];
}

describe('THE acceptance: XLSX export re-imports losslessly', () => {
  it('every cell equals the record-store value', async () => {
    const family = makeFamily();
    const records = makeRecords();
    const bytes = await buildXlsx(family, records, '1.0.0-test');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    const ws = wb.getWorksheet('Records');
    expect(ws).toBeDefined();

    const cols = exportColumns(family);
    // Header row must be exactly the schema labels (order preserved).
    for (let c = 0; c < cols.length; c++) {
      expect(ws!.getRow(1).getCell(c + 1).text).toBe(cols[c].label);
    }
    // Every data cell equals the stored value (asset columns = asset path).
    for (let r = 0; r < records.length; r++) {
      const rec = records[r];
      for (let c = 0; c < cols.length; c++) {
        const f = cols[c];
        const want =
          f.valueType === 'photo' || f.valueType === 'signature' || f.valueType === 'seal'
            ? (rec.assetRefs[f.fieldId] ?? '')
            : (rec.values[f.fieldId]?.value ?? '');
        expect(ws!.getRow(r + 2).getCell(c + 1).text, `rec ${r} col ${f.label}`).toBe(want);
      }
    }
  });

  it('column:false fields never leak into the export', async () => {
    const bytes = await buildXlsx(makeFamily(), makeRecords(), '1.0.0-test');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    const header = (wb.getWorksheet('Records')!.getRow(1).values as (string | undefined)[]).filter(Boolean);
    expect(header).not.toContain('Internal Only');
    const flat = JSON.stringify(wb.getWorksheet('Records')!.getSheetValues());
    expect(flat).not.toContain('hidden');
  });

  it('manifest sheet carries family, templates, engine version', async () => {
    const bytes = await buildXlsx(makeFamily(), makeRecords(), '9.9.9-rc');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    const man = wb.getWorksheet('Manifest')!;
    const kv = new Map<string, string>();
    man.eachRow((row) => kv.set(String(row.getCell(1).text), String(row.getCell(2).text)));
    expect(kv.get('family')).toBe('Invoices (ACME)');
    expect(kv.get('engineVersion')).toBe('9.9.9-rc');
    expect(kv.get('templateIds')).toBe('tpl_a;tpl_b');
    expect(kv.get('records')).toBe('2');
  });

  it('provenance block appends status + confidence per column', async () => {
    const bytes = await buildXlsx(makeFamily(), makeRecords(), '1.0.0', { provenance: true });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    const ws = wb.getWorksheet('Records')!;
    const header = (ws.getRow(1).values as (string | undefined)[]).filter(Boolean) as string[];
    expect(header).toContain('Total · status');
    // rec_01 memo is needs_review — provenance must say so.
    const memoStatusCol = header.indexOf('Memo, "quoted" · status') + 1;
    expect(ws.getRow(2).getCell(memoStatusCol).text).toBe('needs_review');
  });
});

describe('CSV strictly RFC 4180', () => {
  it('quotes exactly the fields that need it, doubles embedded quotes, CRLF', () => {
    const csv = buildCsv(makeFamily(), makeRecords());
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Invoice Number,Date,Total,"Memo, ""quoted""",Stamp');
    expect(lines[1]).toContain('INV-2026-7745');
    expect(lines[1]).toContain('"1,908.84"');            // comma → quoted
    expect(lines[1]).toContain('"contains, comma and ""quotes""\nand a newline"');
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('csvField laws: passthrough vs quoting', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('line\nbreak')).toBe('"line\nbreak"');
    expect(csvField('')).toBe('');
  });

  it('missing values export as empty fields, not omitted columns', () => {
    const csv = buildCsv(makeFamily(), makeRecords());
    const row2 = csv.split('\r\n')[2];
    // 5 columns ⇒ 4 commas even with trailing empties.
    expect(row2.split(',').length).toBeGreaterThanOrEqual(5);
  });
});

describe('JSON archival form', () => {
  it('round-trips full records with justifications', () => {
    const family = makeFamily();
    const records = makeRecords();
    const parsed = JSON.parse(buildJson(family, records, '1.0.0'));
    expect(parsed.manifest.familyId).toBe('fam_test01');
    expect(parsed.schema).toHaveLength(6);
    expect(parsed.records[0].values.f_num.justification.confidence).toBe(0.97);
    expect(parsed.records).toHaveLength(2);
  });
});

describe('assets zip', () => {
  it('lays out assets/<recordId>/<filename> and round-trips bytes', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const zipped = await buildAssetsZip([
      { recordId: 'rec_01', filename: 'seal_1.png', bytes },
    ]);
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(zipped);
    const file = zip.file('assets/rec_01/seal_1.png');
    expect(file).not.toBeNull();
    expect(new Uint8Array(await file!.async('uint8array'))).toEqual(bytes);
  });
});
