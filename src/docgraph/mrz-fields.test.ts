import { describe, it, expect } from 'vitest';
import { MrzParseResult, MrzCheckDigitResult } from '../parsers/mrz';
import {
  countryCodeForValue,
  countryName,
  mrzFieldAgreesWithVisual,
  mrzToFields,
  projectMrzFieldBox,
  MrzDerivedField,
} from './mrz-fields';

/** Build a passed/failed check-digit result for a field. */
function check(field: string, passed: boolean): MrzCheckDigitResult {
  return {
    field,
    expected: passed ? '4' : '4',
    // `computed` mirrors `expected` only when the check passes.
    computed: passed ? '4' : '7',
    passed,
  } as MrzCheckDigitResult;
}

/** Convenience lookup of a derived field by canonical label. */
function byLabel(fields: MrzDerivedField[], label: string): MrzDerivedField | undefined {
  return fields.find((field) => field.canonicalLabel === label);
}

/** A fully valid TD3 passport fixture with all check digits passing. */
function validTd3(): MrzParseResult {
  return {
    format: 'TD3',
    rawLines: [],
    normalizedLines: [],
    normalizationChanges: [],
    fields: {
      documentType: 'P',
      issuingCountry: 'IND',
      documentNumber: 'Z5698297',
      surname: 'PATEL',
      givenNames: 'MEHUL NARENDRA',
      nationality: 'IND',
      dateOfBirth: '1992-03-21',
      sex: 'M',
      expiryDate: '2032-04-13',
    },
    checkDigits: [
      check('documentNumber', true),
      check('dateOfBirth', true),
      check('expiryDate', true),
      check('optionalData', true),
      check('composite', true),
    ],
    status: 'valid',
  } as MrzParseResult;
}

describe('mrzToFields - valid TD3 passport', () => {
  const fields = mrzToFields(validTd3());

  it('emits the passport number with high confidence', () => {
    const f = byLabel(fields, 'passport_number');
    expect(f).toBeDefined();
    expect(f?.value).toBe('Z5698297');
    expect(f?.valueType).toBe('id_number');
    expect(f?.confidence).toBeGreaterThanOrEqual(0.95);
    expect(f?.source).toBe('mrz');
  });

  it('resolves nationality code to an English country name', () => {
    const f = byLabel(fields, 'nationality');
    expect(f?.value).toBe('India');
    expect(f?.valueType).toBe('country');
  });

  it('composes full name as "given surname"', () => {
    const f = byLabel(fields, 'full_name');
    expect(f?.value).toBe('MEHUL NARENDRA PATEL');
  });

  it('passes through the ISO date of birth', () => {
    const f = byLabel(fields, 'date_of_birth');
    expect(f?.value).toBe('1992-03-21');
    expect(f?.valueType).toBe('date');
  });

  it('emits sex', () => {
    const f = byLabel(fields, 'sex');
    expect(f?.value).toBe('M');
  });

  it('emits surname and given names separately', () => {
    expect(byLabel(fields, 'surname')?.value).toBe('PATEL');
    expect(byLabel(fields, 'given_names')?.value).toBe('MEHUL NARENDRA');
  });

  it('emits expiry date', () => {
    expect(byLabel(fields, 'date_of_expiry')?.value).toBe('2032-04-13');
  });

  it('marks ONLY dedicated-check-digit fields checksum-passed; uncovered fields carry null', () => {
    // CHECKSUM HONESTY: ICAO gives document number, DOB and expiry their own
    // check digits. Names, nationality, sex, type and issuing state have NO
    // digit covering them (the composite spans only the checksummed data
    // fields) — claiming otherwise promoted a misread country code as
    // "checksum-proven" (live-caught silent error).
    expect(fields.length).toBeGreaterThan(0);
    const covered = new Set(['passport_number', 'date_of_birth', 'date_of_expiry']);
    for (const f of fields) {
      expect(f.source).toBe('mrz');
      if (covered.has(f.canonicalLabel)) {
        expect(f.checksumPassed, f.canonicalLabel).toBe(true);
      } else {
        expect(f.checksumPassed, f.canonicalLabel).toBeNull();
      }
    }
  });

  it('orders fields canonically', () => {
    expect(fields.map((f) => f.canonicalLabel)).toEqual([
      'passport_number',
      'full_name',
      'surname',
      'given_names',
      'nationality',
      'date_of_birth',
      'sex',
      'date_of_expiry',
      'document_type',
      'country_code',
    ]);
  });
});

describe('mrzToFields - failed document number check', () => {
  function partialTd3(): MrzParseResult {
    const base = validTd3();
    return {
      ...base,
      status: 'partial',
      checkDigits: [
        check('documentNumber', false),
        check('dateOfBirth', true),
        check('expiryDate', true),
        check('optionalData', true),
        check('composite', true),
      ],
    } as MrzParseResult;
  }

  const fields = mrzToFields(partialTd3());

  it('lowers passport number confidence to the review threshold', () => {
    const f = byLabel(fields, 'passport_number');
    expect(f?.checksumPassed).toBe(false);
    expect(f?.confidence).toBeCloseTo(0.55, 5);
  });

  it('still emits the other fields', () => {
    expect(byLabel(fields, 'nationality')?.value).toBe('India');
    expect(byLabel(fields, 'date_of_birth')?.value).toBe('1992-03-21');
    expect(byLabel(fields, 'full_name')?.value).toBe('MEHUL NARENDRA PATEL');
  });

  it('keeps date_of_birth checksum passing independently', () => {
    expect(byLabel(fields, 'date_of_birth')?.checksumPassed).toBe(true);
  });
});

describe('countryName', () => {
  it('resolves common alpha-3 codes', () => {
    expect(countryName('IND')).toBe('India');
    expect(countryName('ARE')).toBe('United Arab Emirates');
    expect(countryName('USA')).toBe('United States');
  });

  it('resolves MRZ special and legacy codes', () => {
    expect(countryName('D')).toBe('Germany');
    expect(countryName('XXX')).toBe('Unspecified');
  });

  it('returns unknown codes unchanged', () => {
    expect(countryName('ZZZ')).toBe('ZZZ');
  });

  it('trims and uppercases input', () => {
    expect(countryName('ind')).toBe('India');
    expect(countryName('  usa  ')).toBe('United States');
  });

  it('canonicalizes names, codes, and bilingual South African demonyms', () => {
    expect(countryCodeForValue('ZAF')).toBe('ZAF');
    expect(countryCodeForValue('South Africa')).toBe('ZAF');
    expect(countryCodeForValue('SOUTH AFRICAN / SUD-AFRICAIN')).toBe('ZAF');
    expect(countryCodeForValue("Identity No. / No. d'identité")).toBeNull();
  });
});

describe('MRZ field presentation geometry', () => {
  it('compares visual values by semantic type', () => {
    const fields = mrzToFields(validTd3());
    expect(mrzFieldAgreesWithVisual(byLabel(fields, 'passport_number')!, 'Z5698297')).toBe(true);
    expect(mrzFieldAgreesWithVisual(byLabel(fields, 'date_of_birth')!, '21/03/1992')).toBe(true);
    expect(mrzFieldAgreesWithVisual(byLabel(fields, 'nationality')!, 'INDIA')).toBe(true);
    expect(mrzFieldAgreesWithVisual(byLabel(fields, 'passport_number')!, 'Z5698298')).toBe(false);
  });

  it('projects a TD3 field to its character-level source box', () => {
    const lineBoxes: [[number, number, number, number], [number, number, number, number]] = [
      [0.1, 0.8, 0.9, 0.84],
      [0.1, 0.86, 0.9, 0.9],
    ];
    const box = projectMrzFieldBox('TD3', 'date_of_birth', lineBoxes, [44, 44]);
    expect(box?.[0]).toBeCloseTo(0.1 + 0.8 * (13 / 44), 8);
    expect(box?.[2]).toBeCloseTo(0.1 + 0.8 * (19 / 44), 8);
    expect(box?.[1]).toBe(0.86);
    expect(box?.[3]).toBe(0.9);
  });
});

describe('mrzToFields - edge cases', () => {
  it('returns [] for an unknown format', () => {
    const mrz = {
      format: 'unknown',
      rawLines: [],
      normalizedLines: [],
      normalizationChanges: [],
      fields: {},
      checkDigits: [],
      status: 'partial',
    } as MrzParseResult;
    expect(mrzToFields(mrz)).toEqual([]);
  });

  it('omits fields whose underlying value is missing', () => {
    const base = validTd3();
    const mrz = {
      ...base,
      fields: {
        ...base.fields,
        expiryDate: undefined,
        sex: undefined,
      },
    } as MrzParseResult;
    const fields = mrzToFields(mrz);
    expect(byLabel(fields, 'date_of_expiry')).toBeUndefined();
    expect(byLabel(fields, 'sex')).toBeUndefined();
    // Other fields remain present.
    expect(byLabel(fields, 'passport_number')).toBeDefined();
  });
});
