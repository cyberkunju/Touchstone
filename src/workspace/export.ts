/**
 * Export (P2.6, Documentation/11 §7) — XLSX / CSV / JSON + asset zip.
 *
 * Pure functions over (family, records): no store access, no OPFS — the UI
 * layer feeds data in and hands buffers to downloads. THE law of this
 * module: export is proven LOSSLESS by the re-import acceptance test, not
 * assumed (a lossy export silently corrupts downstream spreadsheets — the
 * whole product exists to prevent silent corruption).
 *
 * DESTINATION: src/workspace/export.ts (staged during the certification
 * freeze; move verbatim when the chain ends).
 */

import ExcelJS from 'exceljs';
import type { DocRecord, Family, FormField } from './types';

/** Fields that appear as export columns, in schema order. */
export function exportColumns(family: Family): FormField[] {
  return family.formSchema.filter((f) => f.column);
}

/** The engine-version + provenance manifest embedded in every export. */
export interface ExportManifest {
  family: string;
  familyId: string;
  templateIds: string[];
  engineVersion: string;
  exportedAt: string; // ISO
  records: number;
}

export function buildManifest(
  family: Family,
  records: DocRecord[],
  engineVersion: string,
  now: () => string = () => new Date().toISOString(),
): ExportManifest {
  return {
    family: family.name,
    familyId: family.familyId,
    templateIds: [...family.templateIds],
    engineVersion,
    exportedAt: now(),
    records: records.length,
  };
}

/* --------------------------------- XLSX ---------------------------------- */

export interface XlsxOptions {
  /** Append a provenance block (status + confidence per field column). */
  provenance?: boolean;
}

/**
 * Sheet 1 "Records": one row per record, one column per `column: true`
 * field (asset-type fields export their relative OPFS path). Sheet 2
 * "Manifest": the export manifest, one key per row.
 */
export async function buildXlsx(
  family: Family,
  records: DocRecord[],
  engineVersion: string,
  options: XlsxOptions = {},
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const cols = exportColumns(family);
  const ws = wb.addWorksheet('Records');

  const isAsset = (f: FormField) =>
    f.valueType === 'photo' || f.valueType === 'signature' || f.valueType === 'seal';

  const header = cols.map((f) => f.label);
  if (options.provenance) {
    for (const f of cols) {
      header.push(`${f.label} · status`, `${f.label} · confidence`);
    }
  }
  ws.addRow(header);

  for (const rec of records) {
    const row: (string | number)[] = cols.map((f) =>
      isAsset(f) ? (rec.assetRefs[f.fieldId] ?? '') : (rec.values[f.fieldId]?.value ?? ''),
    );
    if (options.provenance) {
      for (const f of cols) {
        const v = rec.values[f.fieldId];
        row.push(v?.status ?? '', v ? v.justification.confidence : '');
      }
    }
    ws.addRow(row);
  }

  const man = wb.addWorksheet('Manifest');
  const manifest = buildManifest(family, records, engineVersion);
  for (const [key, value] of Object.entries(manifest)) {
    man.addRow([key, Array.isArray(value) ? value.join(';') : String(value)]);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

/* ---------------------------------- CSV ----------------------------------- */

/** RFC 4180 field quoting: quote when the field contains comma, quote, CR
 *  or LF; embedded quotes double. Everything else passes through verbatim. */
export function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Values only, RFC 4180 (CRLF line endings, header row of labels). */
export function buildCsv(family: Family, records: DocRecord[]): string {
  const cols = exportColumns(family);
  const lines: string[] = [cols.map((f) => csvField(f.label)).join(',')];
  for (const rec of records) {
    lines.push(
      cols
        .map((f) => csvField(rec.values[f.fieldId]?.value ?? ''))
        .join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}

/* ---------------------------------- JSON ---------------------------------- */

/** Full records with justifications — the lossless archival form. */
export function buildJson(
  family: Family,
  records: DocRecord[],
  engineVersion: string,
): string {
  return JSON.stringify(
    {
      manifest: buildManifest(family, records, engineVersion),
      schema: family.formSchema,
      records,
    },
    null,
    2,
  );
}

/* ------------------------------- assets zip -------------------------------- */

/**
 * Zip of asset files, laid out `assets/<recordId>/<filename>`. The caller
 * reads OPFS and passes bytes — this stays a pure function (testable
 * without a browser).
 */
export async function buildAssetsZip(
  assets: { recordId: string; filename: string; bytes: Uint8Array }[],
): Promise<Uint8Array> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const a of assets) {
    zip.file(`assets/${a.recordId}/${a.filename}`, a.bytes);
  }
  return zip.generateAsync({ type: 'uint8array' });
}
