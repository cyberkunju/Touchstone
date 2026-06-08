/**
 * End-to-end extraction pipeline test mirroring App.tsx's logic for a
 * passport with a clear MRZ but GARBLED visual OCR (the real-world failure:
 * nationality printed-OCR'd as "HRA /INIAN").
 *
 * It proves the MRZ-first contract: the checksum-verified MRZ overrides noisy
 * visual fields, so nationality resolves to "India" (from MRZ code IND), the
 * passport number, full name, DOB, sex and expiry are correct, and the garbage
 * visual value never wins.
 */

import { describe, it, expect } from 'vitest';
import { OcrItem } from './ocr-item';
import { detectMrzZone } from './mrz-zone';
import { parseMrz, computeCheckDigit } from '../parsers/mrz';
import { mrzToFields } from './mrz-fields';
import { extractFields } from './field-extraction';

let __id = 0;
function item(text: string, x1: number, y1: number, x2: number, y2: number, conf = 0.9): OcrItem {
  __id += 1;
  return { text, boxNorm: [x1, y1, x2, y2], nodeId: `n${__id}`, confidence: conf };
}

/** Build a valid Indian TD3 passport MRZ with correct check digits. */
function buildIndianMrz(): { line1: string; line2: string } {
  // Line 1: type P, issuer IND, name PATEL<<MEHUL<NARENDRA padded to 44.
  const name = 'PATEL<<MEHUL<NARENDRA';
  const line1 = ('P<IND' + name).padEnd(44, '<');

  // Line 2 fields.
  const docNum = 'Z5698297<'; // 9 wide (8-char number + filler)
  const docCheck = String(computeCheckDigit(docNum));
  const nationality = 'IND';
  const dob = '920321'; // 21 Mar 1992
  const dobCheck = String(computeCheckDigit(dob));
  const sex = 'M';
  const expiry = '320413'; // 13 Apr 2032
  const expiryCheck = String(computeCheckDigit(expiry));
  const optional = '<'.repeat(14);
  const optionalCheck = String(computeCheckDigit(optional));

  const partial = `${docNum}${docCheck}${nationality}${dob}${dobCheck}${sex}${expiry}${expiryCheck}${optional}${optionalCheck}`;
  const compositeInput = partial.slice(0, 10) + partial.slice(13, 20) + partial.slice(21, 43);
  const line2 = `${partial}${String(computeCheckDigit(compositeInput))}`;
  return { line1, line2 };
}

/**
 * Replicates App.tsx's MRZ-first merge: MRZ-derived fields are authoritative
 * and suppress same-canonical visual fields.
 */
function runPipeline(items: OcrItem[]) {
  const mrzZone = detectMrzZone(items);
  const result: Record<string, { value: string; source: 'mrz' | 'visual' }> = {};

  const mrzCanonical = new Set<string>();
  if (mrzZone) {
    const parsed = parseMrz(mrzZone.lines.join('\n'), { autoCorrect: true });
    for (const mf of mrzToFields(parsed)) {
      mrzCanonical.add(mf.canonicalLabel);
      result[mf.canonicalLabel] = { value: mf.value, source: 'mrz' };
    }
  }
  for (const f of extractFields(items, 'passport')) {
    if (mrzCanonical.has(f.canonicalLabel)) continue;
    result[f.canonicalLabel] = { value: f.value, source: 'visual' };
  }
  return { mrzZone, result };
}

describe('passport pipeline — MRZ overrides garbled visual OCR', () => {
  const { line1, line2 } = buildIndianMrz();

  const items: OcrItem[] = [
    // Garbled / noisy VISUAL fields (what poor print-OCR produced).
    item('Nationality', 0.05, 0.30, 0.18, 0.33),
    item('HRA /INIAN', 0.20, 0.30, 0.40, 0.33), // garbage visual nationality
    item('Passport No', 0.45, 0.10, 0.60, 0.13),
    item('Z5698297', 0.62, 0.10, 0.78, 0.13),
    item('Place of Birth', 0.05, 0.46, 0.20, 0.49),
    item('AHMEDABAD', 0.22, 0.46, 0.40, 0.49),
    item('Date of Birth', 0.05, 0.38, 0.20, 0.41),
    item('21/03/1992', 0.22, 0.38, 0.36, 0.41),
    // The clean, checksum-protected MRZ at the bottom.
    item(line1, 0.05, 0.88, 0.95, 0.91, 0.7),
    item(line2, 0.05, 0.92, 0.95, 0.95, 0.7),
  ];

  it('detects the MRZ zone (2 lines)', () => {
    const zone = detectMrzZone(items);
    expect(zone).not.toBeNull();
    expect(zone?.lines.length).toBe(2);
  });

  it('parses the MRZ as a valid TD3', () => {
    const zone = detectMrzZone(items)!;
    const parsed = parseMrz(zone.lines.join('\n'), { autoCorrect: true });
    expect(parsed.format).toBe('TD3');
    expect(parsed.status).toBe('valid');
    expect(parsed.fields.nationality).toBe('IND');
    expect(parsed.fields.documentNumber).toBe('Z5698297');
  });

  it('resolves nationality to "India" from the MRZ, NOT the garbled visual', () => {
    const { result } = runPipeline(items);
    expect(result.nationality.value).toBe('India');
    expect(result.nationality.source).toBe('mrz');
    // The garbage visual value never wins.
    expect(result.nationality.value).not.toBe('HRA /INIAN');
  });

  it('produces correct passport number, name, DOB, sex and expiry from MRZ', () => {
    const { result } = runPipeline(items);
    expect(result.passport_number).toEqual({ value: 'Z5698297', source: 'mrz' });
    expect(result.full_name.value).toBe('MEHUL NARENDRA PATEL');
    expect(result.date_of_birth.value).toBe('1992-03-21');
    expect(result.sex.value).toBe('M');
    expect(result.date_of_expiry.value).toBe('2032-04-13');
  });

  it('keeps non-MRZ visual fields (place of birth) from the printed text', () => {
    const { result } = runPipeline(items);
    expect(result.place_of_birth.value).toBe('AHMEDABAD');
    expect(result.place_of_birth.source).toBe('visual');
  });

  it('self-corrects a single OCR error in the MRZ document number', () => {
    // Corrupt the doc number '0'->'O' style: change a digit to a confusable letter.
    const corrupt = line2.slice(0, 1) + 'S' + line2.slice(2); // '5'->'S' at index 1
    const corruptItems = items.map((it) =>
      it.text === line2 ? { ...it, text: corrupt } : it,
    );
    const zone = detectMrzZone(corruptItems)!;
    const parsed = parseMrz(zone.lines.join('\n'), { autoCorrect: true });
    // Auto-correction restores the valid document number.
    expect(parsed.fields.documentNumber).toBe('Z5698297');
    expect(parsed.status).toBe('valid');
  });
});
