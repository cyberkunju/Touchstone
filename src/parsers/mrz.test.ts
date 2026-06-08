import { describe, it, expect } from 'vitest';
import {
  mrzCharValue,
  computeCheckDigit,
  detectMrzFormat,
  parseMrz,
} from './mrz';

/**
 * Tests for the ICAO 9303 MRZ parser.
 *
 * The TD3 vectors are the canonical ICAO specimen and are asserted
 * verbatim. The TD1 and TD2 samples are constructed at runtime by
 * computing their check digits with {@link computeCheckDigit}, so the
 * tests prove that the parser and the check-digit routine agree.
 */

// ---------------------------------------------------------------------------
// mrzCharValue
// ---------------------------------------------------------------------------
describe('mrzCharValue', () => {
  it('maps digits to their numeric value', () => {
    expect(mrzCharValue('0')).toBe(0);
    expect(mrzCharValue('9')).toBe(9);
  });

  it('maps letters A-Z to 10..35', () => {
    expect(mrzCharValue('A')).toBe(10);
    expect(mrzCharValue('B')).toBe(11);
    expect(mrzCharValue('Z')).toBe(35);
  });

  it('maps filler and illegal characters to 0', () => {
    expect(mrzCharValue('<')).toBe(0);
    expect(mrzCharValue(' ')).toBe(0);
    expect(mrzCharValue('!')).toBe(0);
    expect(mrzCharValue('')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeCheckDigit
// ---------------------------------------------------------------------------
describe('computeCheckDigit', () => {
  it('matches verified ICAO vectors', () => {
    expect(computeCheckDigit('L898902C3')).toBe(6);
    expect(computeCheckDigit('740812')).toBe(2);
    expect(computeCheckDigit('120415')).toBe(9);
  });

  it('returns 0 for an empty string', () => {
    expect(computeCheckDigit('')).toBe(0);
  });

  it('applies the cycling [7,3,1] weights', () => {
    // '1' at index 0 -> 1*7 = 7
    expect(computeCheckDigit('1')).toBe(7);
    // '1','0','0' -> 1*7 + 0 + 0 = 7
    expect(computeCheckDigit('100')).toBe(7);
    // '0','1','0' -> 0 + 1*3 + 0 = 3
    expect(computeCheckDigit('010')).toBe(3);
    // '0','0','1' -> 0 + 0 + 1*1 = 1
    expect(computeCheckDigit('001')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// detectMrzFormat
// ---------------------------------------------------------------------------
describe('detectMrzFormat', () => {
  it('detects TD1 (3 lines x 30)', () => {
    expect(detectMrzFormat(['x'.repeat(30), 'x'.repeat(30), 'x'.repeat(30)])).toBe('TD1');
  });

  it('detects TD2 (2 lines x 36)', () => {
    expect(detectMrzFormat(['x'.repeat(36), 'x'.repeat(36)])).toBe('TD2');
  });

  it('detects TD3 (2 lines x 44)', () => {
    expect(detectMrzFormat(['x'.repeat(44), 'x'.repeat(44)])).toBe('TD3');
  });

  it('tolerates +/-1 length from OCR', () => {
    expect(detectMrzFormat(['x'.repeat(43), 'x'.repeat(43)])).toBe('TD3');
    expect(detectMrzFormat(['x'.repeat(31), 'x'.repeat(30), 'x'.repeat(30)])).toBe('TD1');
  });

  it('returns unknown for unrecognised shapes', () => {
    expect(detectMrzFormat([])).toBe('unknown');
    expect(detectMrzFormat(['short'])).toBe('unknown');
    expect(detectMrzFormat(['x'.repeat(40), 'x'.repeat(40)])).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// Canonical TD3
// ---------------------------------------------------------------------------
describe('parseMrz - canonical TD3', () => {
  const line1 = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<';
  const line2 = 'L898902C36UTO7408122F1204159ZE184226B<<<<<10';
  const result = parseMrz(`${line1}\n${line2}`);

  it('detects the TD3 format', () => {
    expect(result.format).toBe('TD3');
  });

  it('extracts all fields correctly', () => {
    expect(result.fields.documentNumber).toBe('L898902C3');
    expect(result.fields.issuingCountry).toBe('UTO');
    expect(result.fields.nationality).toBe('UTO');
    expect(result.fields.dateOfBirth).toBe('1974-08-12');
    expect(result.fields.sex).toBe('F');
    expect(result.fields.expiryDate).toBe('2012-04-15');
    expect(result.fields.surname).toBe('ERIKSSON');
    expect(result.fields.givenNames).toBe('ANNA MARIA');
  });

  it('passes every check digit and is valid', () => {
    expect(result.status).toBe('valid');
    expect(result.checkDigits.every((c) => c.passed)).toBe(true);
  });

  it('requires no normalization for clean input', () => {
    expect(result.normalizationChanges).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tampered TD3 -> invalid
// ---------------------------------------------------------------------------
describe('parseMrz - tampered TD3', () => {
  const line1 = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<';
  // Document number check digit changed from 6 to 7.
  const line2 = 'L898902C37UTO7408122F1204159ZE184226B<<<<<10';
  const result = parseMrz(`${line1}\n${line2}`);

  it('reports the document number check digit as failed', () => {
    const docCheck = result.checkDigits.find((c) => c.field === 'documentNumber');
    expect(docCheck).toBeDefined();
    expect(docCheck?.expected).toBe('7');
    expect(docCheck?.computed).toBe('6');
    expect(docCheck?.passed).toBe(false);
  });

  it('has status invalid when a critical check digit fails', () => {
    expect(result.status).toBe('invalid');
  });
});

// ---------------------------------------------------------------------------
// TD1 - constructed with computed check digits
// ---------------------------------------------------------------------------
describe('parseMrz - TD1', () => {
  const docNumber = 'D23145890';
  const dob = '740812';
  const expiry = '120415';

  const docNumberCheck = String(computeCheckDigit(docNumber));
  const dobCheck = String(computeCheckDigit(dob));
  const expiryCheck = String(computeCheckDigit(expiry));

  const line1 = `I<UTO${docNumber}${docNumberCheck}${'<'.repeat(15)}`;
  const line2Partial = `${dob}${dobCheck}F${expiry}${expiryCheck}UTO${'<'.repeat(11)}`;
  const compositeInput =
    line1.slice(5, 30) +
    line2Partial.slice(0, 7) +
    line2Partial.slice(8, 15) +
    line2Partial.slice(18, 29);
  const line2 = `${line2Partial}${String(computeCheckDigit(compositeInput))}`;
  const line3 = `ERIKSSON<<ANNA<MARIA${'<'.repeat(10)}`;

  const result = parseMrz(`${line1}\n${line2}\n${line3}`);

  it('has correct canonical line lengths', () => {
    expect(line1).toHaveLength(30);
    expect(line2).toHaveLength(30);
    expect(line3).toHaveLength(30);
  });

  it('detects the TD1 format', () => {
    expect(result.format).toBe('TD1');
  });

  it('extracts all fields correctly', () => {
    expect(result.fields.documentType).toBe('I');
    expect(result.fields.issuingCountry).toBe('UTO');
    expect(result.fields.documentNumber).toBe('D23145890');
    expect(result.fields.nationality).toBe('UTO');
    expect(result.fields.dateOfBirth).toBe('1974-08-12');
    expect(result.fields.sex).toBe('F');
    expect(result.fields.expiryDate).toBe('2012-04-15');
    expect(result.fields.surname).toBe('ERIKSSON');
    expect(result.fields.givenNames).toBe('ANNA MARIA');
  });

  it('passes every check digit and is valid', () => {
    expect(result.status).toBe('valid');
    expect(result.checkDigits.every((c) => c.passed)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TD2 - constructed with computed check digits
// ---------------------------------------------------------------------------
describe('parseMrz - TD2', () => {
  const docNumber = 'D23145890';
  const dob = '740812';
  const expiry = '120415';

  const docNumberCheck = String(computeCheckDigit(docNumber));
  const dobCheck = String(computeCheckDigit(dob));
  const expiryCheck = String(computeCheckDigit(expiry));

  const line1 = `I<UTOERIKSSON<<ANNA<MARIA${'<'.repeat(11)}`;
  const line2Partial =
    `${docNumber}${docNumberCheck}UTO${dob}${dobCheck}F${expiry}${expiryCheck}${'<'.repeat(7)}`;
  const compositeInput =
    line2Partial.slice(0, 10) + line2Partial.slice(13, 20) + line2Partial.slice(21, 35);
  const line2 = `${line2Partial}${String(computeCheckDigit(compositeInput))}`;

  const result = parseMrz(`${line1}\n${line2}`);

  it('has correct canonical line lengths', () => {
    expect(line1).toHaveLength(36);
    expect(line2).toHaveLength(36);
  });

  it('detects the TD2 format', () => {
    expect(result.format).toBe('TD2');
  });

  it('extracts all fields correctly', () => {
    expect(result.fields.documentType).toBe('I');
    expect(result.fields.issuingCountry).toBe('UTO');
    expect(result.fields.documentNumber).toBe('D23145890');
    expect(result.fields.nationality).toBe('UTO');
    expect(result.fields.dateOfBirth).toBe('1974-08-12');
    expect(result.fields.sex).toBe('F');
    expect(result.fields.expiryDate).toBe('2012-04-15');
    expect(result.fields.surname).toBe('ERIKSSON');
    expect(result.fields.givenNames).toBe('ANNA MARIA');
  });

  it('passes every check digit and is valid', () => {
    expect(result.status).toBe('valid');
    expect(result.checkDigits.every((c) => c.passed)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// OCR-B normalization
// ---------------------------------------------------------------------------
describe('parseMrz - OCR-B normalization', () => {
  const line1 = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<';
  // DOB is 740812 at line2[13..18]; corrupt the '0' at position 15 to 'O'.
  const line2 = 'L898902C36UTO74O8122F1204159ZE184226B<<<<<10';
  const result = parseMrz(`${line1}\n${line2}`);

  it('converts a letter O to digit 0 in a numeric date position', () => {
    expect(result.normalizedLines[1][15]).toBe('0');
  });

  it('records the substitution in normalizationChanges', () => {
    const change = result.normalizationChanges.find(
      (c) => c.line === 1 && c.position === 15,
    );
    expect(change).toBeDefined();
    expect(change?.from).toBe('O');
    expect(change?.to).toBe('0');
  });

  it('recovers the correct date of birth after normalization', () => {
    expect(result.fields.dateOfBirth).toBe('1974-08-12');
  });
});

// ---------------------------------------------------------------------------
// Unknown format
// ---------------------------------------------------------------------------
describe('parseMrz - unknown format', () => {
  it('returns partial status for unrecognised input', () => {
    const result = parseMrz('this is not an mrz');
    expect(result.format).toBe('unknown');
    expect(result.status).toBe('partial');
    expect(result.checkDigits).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Check-digit-guided auto-correction (opt-in)
// ---------------------------------------------------------------------------
describe('parseMrz - autoCorrect', () => {
  const line1 = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<';
  // Canonical valid TD3 line 2. Document number is L898902C3 (check 6).
  const cleanLine2 = 'L898902C36UTO7408122F1204159ZE184226B<<<<<10';
  // Corrupt the document number: the '0' at index 5 misread as letter 'O'.
  // Document number positions are alphanumeric, so normalization cannot
  // disambiguate this; the doc-number check digit therefore fails.
  const corruptLine2 = 'L8989O2C36UTO7408122F1204159ZE184226B<<<<<10';

  const cleanMrz = `${line1}\n${cleanLine2}`;
  const corruptMrz = `${line1}\n${corruptLine2}`;

  it('default behavior is unchanged: corrupted doc number stays invalid', () => {
    const result = parseMrz(corruptMrz);
    const docCheck = result.checkDigits.find((c) => c.field === 'documentNumber');
    expect(docCheck?.passed).toBe(false);
    expect(result.status).toBe('invalid');
    // No correction changes are recorded without the opt-in flag.
    const corrections = result.normalizationChanges.filter(
      (c) => c.reason === 'check-digit guided correction',
    );
    expect(corrections).toHaveLength(0);
  });

  it('repairs a single OCR error so the doc-number check passes', () => {
    const result = parseMrz(corruptMrz, { autoCorrect: true });

    const docCheck = result.checkDigits.find((c) => c.field === 'documentNumber');
    expect(docCheck?.passed).toBe(true);
    // The recovered field value equals the original correct value.
    expect(result.fields.documentNumber).toBe('L898902C3');
    // The full document is valid again after correction.
    expect(result.status).toBe('valid');

    // The substitution is recorded with provenance.
    const correction = result.normalizationChanges.find(
      (c) => c.reason === 'check-digit guided correction',
    );
    expect(correction).toBeDefined();
    expect(correction?.line).toBe(1);
    expect(correction?.position).toBe(5);
    expect(correction?.from).toBe('O');
    expect(correction?.to).toBe('0');
  });

  it('leaves a clean MRZ unchanged (no spurious corrections)', () => {
    const baseline = parseMrz(cleanMrz);
    const result = parseMrz(cleanMrz, { autoCorrect: true });

    expect(result.status).toBe('valid');
    expect(result.fields).toEqual(baseline.fields);
    expect(result.normalizedLines).toEqual(baseline.normalizedLines);
    const corrections = result.normalizationChanges.filter(
      (c) => c.reason === 'check-digit guided correction',
    );
    expect(corrections).toHaveLength(0);
  });

  it('leaves an uncorrectable MRZ invalid even with autoCorrect', () => {
    // Replace the whole document number with characters that cannot be
    // repaired to a passing check digit by <= 2 OCR-confusion swaps.
    const garbageLine2 = 'XYZXYZXYZ6UTO7408122F1204159ZE184226B<<<<<10';
    const result = parseMrz(`${line1}\n${garbageLine2}`, { autoCorrect: true });

    expect(result.format).toBe('TD3');
    const docCheck = result.checkDigits.find((c) => c.field === 'documentNumber');
    expect(docCheck?.passed).toBe(false);
    expect(result.status).toBe('invalid');
  });

  it('does not change the exported signature for existing single-arg calls', () => {
    // Regression guard: calling without options behaves as before.
    const result = parseMrz(cleanMrz);
    expect(result.status).toBe('valid');
  });
});
