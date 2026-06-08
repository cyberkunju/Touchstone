import { describe, it, expect } from 'vitest';
import { OcrItem } from './ocr-item';
import {
  PASSPORT_FIELDS,
  INVOICE_FIELDS,
  getFieldSpecs,
  normalizeLabelText,
  isLabelItem,
  valueTypeScore,
  extractFields,
  ExtractedField,
} from './field-extraction';

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

let __id = 0;
/** Build an OcrItem with a normalized box and a unique nodeId. */
function it_(
  text: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  conf = 0.95
): OcrItem {
  __id += 1;
  return {
    text,
    boxNorm: [x1, y1, x2, y2],
    nodeId: `n${__id}`,
    confidence: conf,
  };
}

function byCanonical(fields: ExtractedField[]): Record<string, ExtractedField> {
  const map: Record<string, ExtractedField> = {};
  for (const f of fields) map[f.canonicalLabel] = f;
  return map;
}

/* -------------------------------------------------------------------------- */
/*  Registry                                                                  */
/* -------------------------------------------------------------------------- */

describe('registry', () => {
  it('maps doc types to specs', () => {
    expect(getFieldSpecs('passport')).toBe(PASSPORT_FIELDS);
    expect(getFieldSpecs('id_card')).toBe(PASSPORT_FIELDS);
    expect(getFieldSpecs('invoice')).toBe(INVOICE_FIELDS);
    expect(getFieldSpecs('receipt')).toBe(INVOICE_FIELDS);
    expect(getFieldSpecs('generic')).toEqual([]);
  });

  it("'birth' alone is NOT a synonym of date_of_birth", () => {
    const dob = PASSPORT_FIELDS.find((s) => s.canonicalLabel === 'date_of_birth')!;
    expect(dob.synonyms).not.toContain('birth');
  });
});

/* -------------------------------------------------------------------------- */
/*  normalizeLabelText                                                        */
/* -------------------------------------------------------------------------- */

describe('normalizeLabelText', () => {
  it('lowercases, collapses spaces, strips punctuation but keeps slashes', () => {
    expect(normalizeLabelText('No./No.Passeport')).toBe('no / no passeport');
    expect(normalizeLabelText('Passport No./No.Passeport')).toBe('passport no / no passeport');
    expect(normalizeLabelText('  Date   of  Birth ')).toBe('date of birth');
    expect(normalizeLabelText('Place of Birth:')).toBe('place of birth');
  });
});

/* -------------------------------------------------------------------------- */
/*  isLabelItem                                                               */
/* -------------------------------------------------------------------------- */

describe('isLabelItem', () => {
  const specs = PASSPORT_FIELDS;

  it('matches Place of Birth to place_of_birth (NOT date_of_birth)', () => {
    const spec = isLabelItem(it_('Place of Birth', 0, 0, 0.1, 0.03), specs);
    expect(spec?.canonicalLabel).toBe('place_of_birth');
  });

  it('matches Date of Birth to date_of_birth', () => {
    const spec = isLabelItem(it_('Date of Birth', 0, 0, 0.1, 0.03), specs);
    expect(spec?.canonicalLabel).toBe('date_of_birth');
  });

  it('matches Passport No./No.Passeport to passport_number', () => {
    const spec = isLabelItem(it_('Passport No./No.Passeport', 0, 0, 0.2, 0.03), specs);
    expect(spec?.canonicalLabel).toBe('passport_number');
  });

  it('returns null for a value like SHARJAH', () => {
    expect(isLabelItem(it_('SHARJAH', 0, 0, 0.1, 0.03), specs)).toBeNull();
  });

  it('prefers the longest (most specific) synonym match', () => {
    // 'Names' must hit full_name's 'names' synonym, not a shorter accidental one.
    const spec = isLabelItem(it_('Names', 0, 0, 0.1, 0.03), specs);
    expect(spec?.canonicalLabel).toBe('full_name');
  });
});

/* -------------------------------------------------------------------------- */
/*  valueTypeScore                                                            */
/* -------------------------------------------------------------------------- */

describe('valueTypeScore', () => {
  it('scores dates', () => {
    expect(valueTypeScore('date', '14/05/1990')).toBe(1);
    expect(valueTypeScore('date', 'Place of Birth')).toBe(0);
  });

  it('scores amounts', () => {
    expect(valueTypeScore('amount', '$1,250.00')).toBe(1);
    expect(valueTypeScore('amount', 'no money here')).toBe(0);
  });

  it('scores id numbers', () => {
    expect(valueTypeScore('id_number', 'Y34B67890')).toBe(1);
    expect(valueTypeScore('id_number', 'AB')).toBe(0);
  });

  it('scores names and countries', () => {
    expect(valueTypeScore('name', 'KHALED AL-HASHIMI')).toBe(1);
    expect(valueTypeScore('name', '12345')).toBe(0.2);
    expect(valueTypeScore('country', 'United Arab Emirates')).toBe(0.8);
    expect(valueTypeScore('text', 'anything')).toBe(0.6);
    expect(valueTypeScore('text', '   ')).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  extractFields — critical UAE passport scenario                            */
/* -------------------------------------------------------------------------- */

describe('extractFields — UAE passport (the bug)', () => {
  const items: OcrItem[] = [
    it_('Date of Birth', 0.05, 0.4, 0.18, 0.43),
    it_('14/05/1990', 0.2, 0.4, 0.33, 0.43),
    it_('Place of Birth', 0.05, 0.46, 0.18, 0.49),
    it_('SHARJAH', 0.2, 0.46, 0.33, 0.49),
    it_('Passport No', 0.4, 0.1, 0.55, 0.13),
    it_('Y34B67890', 0.58, 0.1, 0.75, 0.13),
    it_('Names', 0.4, 0.2, 0.5, 0.23),
    it_('KHALED AL-HASHIMI', 0.4, 0.24, 0.7, 0.27),
    it_('Nationality', 0.4, 0.3, 0.55, 0.33),
    it_('United Arab Emirates', 0.4, 0.34, 0.7, 0.37),
    it_('Sex', 0.75, 0.4, 0.8, 0.43),
    it_('M', 0.82, 0.4, 0.86, 0.43),
  ];

  const fields = extractFields(items, 'passport');
  const map = byCanonical(fields);

  it('pairs Date of Birth with the date, NOT Place of Birth/SHARJAH', () => {
    expect(map.date_of_birth).toBeDefined();
    expect(map.date_of_birth.value).toBe('14/05/1990');
    expect(map.date_of_birth.labelItem?.text).toBe('Date of Birth');
  });

  it('extracts place_of_birth correctly', () => {
    expect(map.place_of_birth.value).toBe('SHARJAH');
  });

  it('extracts passport_number', () => {
    expect(map.passport_number.value).toBe('Y34B67890');
  });

  it('extracts full_name', () => {
    expect(map.full_name.value).toBe('KHALED AL-HASHIMI');
  });

  it('extracts nationality', () => {
    expect(map.nationality.value).toBe('United Arab Emirates');
  });

  it('extracts sex', () => {
    expect(map.sex.value).toBe('M');
  });

  it('never uses a label phrase as a value', () => {
    const labelTexts = new Set([
      'Date of Birth',
      'Place of Birth',
      'Passport No',
      'Names',
      'Nationality',
      'Sex',
    ]);
    for (const f of fields) {
      expect(labelTexts.has(f.value)).toBe(false);
    }
  });

  it('emits fields in label reading order (top-to-bottom, left-to-right)', () => {
    const ys = fields.map((f) => f.labelItem!.boxNorm[1]);
    const sorted = [...ys].sort((a, b) => a - b);
    expect(ys).toEqual(sorted);
  });

  it('no two emitted fields share the same valueItem.nodeId', () => {
    const seen = new Set<string>();
    for (const f of fields) {
      expect(seen.has(f.valueItem.nodeId)).toBe(false);
      seen.add(f.valueItem.nodeId);
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  extractFields — omission of badly-typed strong fields                     */
/* -------------------------------------------------------------------------- */

describe('extractFields — strong-type omission', () => {
  it('omits a date field that has no valid date neighbor', () => {
    const items: OcrItem[] = [
      it_('Date of Birth', 0.05, 0.4, 0.18, 0.43),
      it_('NOT A DATE', 0.2, 0.4, 0.33, 0.43),
    ];
    const fields = extractFields(items, 'passport');
    const map = byCanonical(fields);
    expect(map.date_of_birth).toBeUndefined();
  });

  it('omits an id_number field with no well-typed neighbor', () => {
    const items: OcrItem[] = [
      it_('Passport No', 0.4, 0.1, 0.55, 0.13),
      it_('--', 0.58, 0.1, 0.75, 0.13),
    ];
    const fields = extractFields(items, 'passport');
    const map = byCanonical(fields);
    expect(map.passport_number).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/*  extractFields — invoice                                                   */
/* -------------------------------------------------------------------------- */

describe('extractFields — invoice', () => {
  const items: OcrItem[] = [
    it_('Vendor', 0.05, 0.1, 0.15, 0.13),
    it_('Acme Corp', 0.18, 0.1, 0.4, 0.13),
    it_('Date', 0.05, 0.2, 0.12, 0.23),
    it_('2023-04-15', 0.18, 0.2, 0.35, 0.23),
    it_('Total', 0.05, 0.3, 0.13, 0.33),
    it_('$1,250.00', 0.18, 0.3, 0.35, 0.33),
  ];

  const fields = extractFields(items, 'invoice');
  const map = byCanonical(fields);

  it('extracts vendor', () => {
    expect(map.vendor.value).toBe('Acme Corp');
  });

  it('extracts invoice_date', () => {
    expect(map.invoice_date.value).toBe('2023-04-15');
  });

  it('extracts total as an amount', () => {
    expect(map.total.value).toBe('$1,250.00');
    expect(map.total.valueType).toBe('amount');
  });

  it('no two emitted fields share the same valueItem.nodeId', () => {
    const seen = new Set<string>();
    for (const f of fields) {
      expect(seen.has(f.valueItem.nodeId)).toBe(false);
      seen.add(f.valueItem.nodeId);
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  extractFields — generic                                                   */
/* -------------------------------------------------------------------------- */

describe('extractFields — generic', () => {
  it('returns [] for generic docType', () => {
    const items: OcrItem[] = [it_('Anything', 0, 0, 0.1, 0.03)];
    expect(extractFields(items, 'generic')).toEqual([]);
  });
});

describe('inline "Label: value" extraction', () => {
  it('extracts an inline invoice number and date merged on one OCR line', () => {
    const items = [
      it_('INVOICE', 0.1, 0.05, 0.4, 0.09),
      it_('Invoice Number: INV-99201', 0.1, 0.12, 0.5, 0.16),
      it_('Date: 2026-06-05', 0.1, 0.18, 0.4, 0.22),
      it_('Vendor', 0.1, 0.26, 0.25, 0.30),
      it_('Acme Corp Ltd.', 0.1, 0.31, 0.45, 0.35),
    ];
    const fields = byCanonical(extractFields(items, 'invoice'));
    expect(fields.invoice_number?.value).toBe('INV-99201');
    expect(fields.invoice_date?.value).toBe('2026-06-05');
    expect(fields.vendor?.value).toBe('Acme Corp Ltd.');
  });

  it('does not produce an inline value when the prefix is not a label', () => {
    const items = [
      it_('Remark: nothing important here', 0.1, 0.1, 0.6, 0.14),
    ];
    const fields = extractFields(items, 'invoice');
    // "Remark" is not a known invoice label, so nothing is extracted.
    expect(fields.length).toBe(0);
  });

  it('omits a strongly-typed inline value that does not match its type', () => {
    const items = [
      // 'Date:' label but the inline value is not a valid date.
      it_('Date: not-a-date', 0.1, 0.1, 0.5, 0.14),
    ];
    const fields = byCanonical(extractFields(items, 'invoice'));
    expect(fields.invoice_date).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/*  extractFields — 3-column passport header layout                           */
/* -------------------------------------------------------------------------- */

describe('extractFields — 3-column passport header', () => {
  // Headers on one row, values on the row directly BELOW each header.
  const items: OcrItem[] = [
    it_('Type', 0.05, 0.1, 0.12, 0.13),
    it_('Country Code', 0.18, 0.1, 0.34, 0.13),
    it_('Passport No', 0.4, 0.1, 0.55, 0.13),
    it_('P', 0.05, 0.15, 0.09, 0.18),
    it_('ARE', 0.18, 0.15, 0.26, 0.18),
    it_('Y34B67890', 0.4, 0.15, 0.6, 0.18),
  ];

  const map = byCanonical(extractFields(items, 'passport'));

  it('pairs document_type header with the value below it', () => {
    expect(map.document_type?.value).toBe('P');
  });

  it('pairs country_code header with the value below it', () => {
    expect(map.country_code?.value).toBe('ARE');
  });

  it('pairs passport_number header with the value below it', () => {
    expect(map.passport_number?.value).toBe('Y34B67890');
  });
});

/* -------------------------------------------------------------------------- */
/*  extractFields — valuePattern noise rejection                              */
/* -------------------------------------------------------------------------- */

describe('extractFields — valuePattern constraints', () => {
  it("rejects a stray 'c' and picks the valid 'M' for sex", () => {
    const items: OcrItem[] = [
      it_('Sex', 0.7, 0.4, 0.75, 0.43),
      it_('c', 0.76, 0.4, 0.79, 0.43, 0.34),
      it_('M', 0.7, 0.45, 0.74, 0.48, 0.95),
    ];
    const map = byCanonical(extractFields(items, 'passport'));
    expect(map.sex?.value).toBe('M');
  });

  it("yields NO sex field when only a noise 'c' is present (pattern rejects)", () => {
    const items: OcrItem[] = [
      it_('Sex', 0.7, 0.4, 0.75, 0.43),
      it_('c', 0.76, 0.4, 0.79, 0.43, 0.34),
    ];
    const map = byCanonical(extractFields(items, 'passport'));
    expect(map.sex).toBeUndefined();
  });

  it('rejects an over-long country_code value, accepts the 3-letter code', () => {
    const items: OcrItem[] = [
      it_('Country Code', 0.05, 0.1, 0.2, 0.13),
      it_('United Arab Emirates', 0.05, 0.15, 0.4, 0.18),
    ];
    const map = byCanonical(extractFields(items, 'passport'));
    // 'United Arab Emirates' fails /^[A-Z]{2,3}$/i → no country_code emitted.
    expect(map.country_code).toBeUndefined();

    const items2: OcrItem[] = [
      it_('Country Code', 0.05, 0.1, 0.2, 0.13),
      it_('ARE', 0.05, 0.15, 0.13, 0.18),
    ];
    const map2 = byCanonical(extractFields(items2, 'passport'));
    expect(map2.country_code?.value).toBe('ARE');
  });
});

/* -------------------------------------------------------------------------- */
/*  extractFields — date locale disambiguation                                */
/* -------------------------------------------------------------------------- */

describe('extractFields — dateLocale', () => {
  const items: OcrItem[] = [
    it_('Date of Birth', 0.05, 0.4, 0.18, 0.43),
    it_('14/05/1990', 0.2, 0.4, 0.33, 0.43),
  ];

  it("normalizes a dmy date to ISO when dateLocale='dmy'", () => {
    const map = byCanonical(extractFields(items, 'passport', { dateLocale: 'dmy' }));
    expect(map.date_of_birth?.value).toBe('1990-05-14');
  });

  it('leaves the raw date untouched when no options are passed', () => {
    const map = byCanonical(extractFields(items, 'passport'));
    expect(map.date_of_birth?.value).toBe('14/05/1990');
  });
});
