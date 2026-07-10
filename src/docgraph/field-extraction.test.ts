import { describe, it, expect } from 'vitest';
import { OcrItem } from './ocr-item';
import {
  PASSPORT_FIELDS,
  INVOICE_FIELDS,
  getFieldSpecs,
  normalizeLabelText,
  isLabelItem,
  isWellFormedAmountToken,
  valueTypeScore,
  extractFields,
  subBoxForCharRange,
  ExtractedField,
} from './field-extraction';
import type { Lattice } from '../beam/lattice';

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/** CTC-realistic lattice for a string, with optional per-position corruption
 *  (wrong char as top-1, truth as runner-up). */
function latFor(s: string, corrupt: Record<number, string> = {}): Lattice {
  const out: Lattice = [];
  [...s].forEach((ch, i) => {
    const wrong = corrupt[i];
    if (wrong === undefined) {
      out.push([
        [ch, 0.95],
        ['', 0.05],
      ]);
    } else {
      out.push([
        [wrong, 0.55],
        [ch, 0.42],
        ['', 0.03],
      ]);
    }
    out.push([['', 0.92]]);
  });
  return out;
}

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

describe('extractFields — stacked South African passport labels', () => {
  const fields = extractFields([
    it_('Nationality / Nationalité', 0.36, 0.30, 0.53, 0.32),
    // The printed value is wider and offset, while the following bilingual
    // caption is geometrically tempting. A label must never become a value.
    it_('SOUTH AFRICAN / SUD-AFRICAIN', 0.49, 0.325, 0.82, 0.35),
    it_("Identity No. / No. d'identité", 0.36, 0.355, 0.62, 0.38),
    it_('900101 5234 081', 0.36, 0.385, 0.55, 0.41),
  ], 'passport');

  it('binds nationality to the country value, never the following label', () => {
    const nationality = byCanonical(fields).nationality;
    expect(nationality?.value).toBe('SOUTH AFRICAN / SUD-AFRICAIN');
    expect(nationality?.valueItem.text).not.toMatch(/identity|identit/i);
  });

  it('omits nationality when its value is unreadable instead of consuming the next caption', () => {
    const missingValue = extractFields([
      it_('Nationality / Nationalité', 0.36, 0.30, 0.53, 0.32),
      it_("Identity No. / No. d'identité", 0.36, 0.355, 0.62, 0.38),
      it_('900101 5234 081', 0.36, 0.385, 0.55, 0.41),
    ], 'passport');

    expect(byCanonical(missingValue).nationality).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/*  extractFields — omission of badly-typed strong fields                     */
/* -------------------------------------------------------------------------- */

describe('extractFields — strong-type omission', () => {
  it('extracts insurance policy identity fields from a utility-like notice', () => {
    const items: OcrItem[] = [
      it_('Policy Number', 0.05, 0.2, 0.18, 0.23),
      it_('Policy Holder', 0.3, 0.2, 0.43, 0.23),
      it_('Due Date', 0.62, 0.2, 0.7, 0.23),
      it_('POL-178061', 0.05, 0.25, 0.17, 0.29),
      it_('ANNA ERIKSSON', 0.3, 0.25, 0.46, 0.29),
      it_('20/08/2026', 0.62, 0.25, 0.74, 0.29),
    ];

    const map = byCanonical(extractFields(items, 'utility_bill'));
    expect(map.policy_number?.value).toBe('POL-178061');
    expect(map.policy_holder?.value).toBe('ANNA ERIKSSON');
    expect(map.due_date?.value).toBe('20/08/2026');
  });

  it('refuses a policy number label whose value does not satisfy POL grammar', () => {
    const items: OcrItem[] = [
      it_('Policy Number', 0.05, 0.2, 0.18, 0.23),
      it_('ACCOUNT-178061', 0.05, 0.25, 0.2, 0.29),
    ];
    expect(byCanonical(extractFields(items, 'utility_bill')).policy_number).toBeUndefined();
  });

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

/* -------------------------------------------------------------------------- */
/*  P1.6: typed lattice re-decode + globally optimal assignment               */
/* -------------------------------------------------------------------------- */

describe('type exclusions (silent-error regressions from the corpus gate)', () => {
  it('a calendar-valid date never scores as an id_number', () => {
    // Live gate catch: on a degraded scan the unread passport number's label
    // paired with a nearby DATE and confirmed it — the N1 failure class.
    expect(valueTypeScore('id_number', '24/03/1982')).toBe(0);
    expect(valueTypeScore('id_number', '1982-03-24')).toBe(0);
    // Real document numbers still score perfectly:
    expect(valueTypeScore('id_number', '4Z6ARKD10')).toBe(1);
  });

  it('date-contaminated text never scores as an amount (period-line merge)', () => {
    expect(valueTypeScore('amount', '01/02/2026 - 02/03/2026 5,887.15')).toBe(0);
  });

  it('structurally malformed amounts never score (10 live silents)', () => {
    // Neighboring digit merged in (internal space):
    expect(valueTypeScore('amount', '6 3,707.56')).toBe(0);
    // Dropped digit → comma group ≠ 3 digits:
    expect(valueTypeScore('amount', '1,05.11')).toBe(0);
    expect(valueTypeScore('amount', '2,55.53')).toBe(0);
    // Double decimal point:
    expect(valueTypeScore('amount', '4.511.28')).toBe(0);
  });

  it('well-formed amounts in all supported shapes still score 1', () => {
    for (const ok of ['3,859.60', '3859.6', '12.00', '1,234,567.89', '(1,200.00)', '$ 45.10', 'USD 99.95', '1.234,56', '987,65']) {
      expect(valueTypeScore('amount', ok), ok).toBe(1);
    }
  });

  it('isWellFormedAmountToken edge law', () => {
    expect(isWellFormedAmountToken('')).toBe(false);
    expect(isWellFormedAmountToken('12,34')).toBe(true);   // euro decimals
    expect(isWellFormedAmountToken('12,3456')).toBe(false); // not grouping, not decimals
    expect(isWellFormedAmountToken('1,234')).toBe(true);    // exact 3-group
    expect(isWellFormedAmountToken('1,2345')).toBe(false);  // broken group
  });
});

describe('grammar re-decode rescue (I3) — the "c/call" killer, end to end', () => {
  it('rescues a garbage sex value when the lattice contains the truth', () => {
    // Greedy OCR read "c/" for the sex value (the real observed bug class).
    // The lattice still holds 'F' as runner-up; the enum grammar must find it
    // and the field must emit as F — not "c/", not omitted.
    const sexValue: OcrItem = {
      text: 'c/',
      boxNorm: [0.42, 0.4, 0.47, 0.44],
      nodeId: 'sex-val',
      confidence: 0.6,
      lattice: [
        [
          ['c', 0.5],
          ['F', 0.45],
          ['', 0.05],
        ],
        [
          ['/', 0.55],
          ['', 0.45],
        ],
      ],
    };
    const fields = extractFields(
      [
        { text: 'Sex', boxNorm: [0.3, 0.4, 0.36, 0.44], nodeId: 'sex-lbl', confidence: 0.95 },
        sexValue,
      ],
      'passport'
    );
    const map = byCanonical(fields);
    expect(map.sex?.value).toBe('F');
  });

  it('omits the field honestly when even the lattice holds nothing valid', () => {
    const sexValue: OcrItem = {
      text: '7#',
      boxNorm: [0.42, 0.4, 0.47, 0.44],
      nodeId: 'sex-val',
      confidence: 0.6,
      lattice: latFor('7#'),
    };
    const fields = extractFields(
      [
        { text: 'Sex', boxNorm: [0.3, 0.4, 0.36, 0.44], nodeId: 'sex-lbl', confidence: 0.95 },
        sexValue,
      ],
      'passport'
    );
    expect(byCanonical(fields).sex).toBeUndefined();
  });

  it('rescues a date whose greedy text is O-corrupted', () => {
    const dobValue: OcrItem = {
      text: 'O5/11/1990', // greedy read O for 0 → not a valid date
      boxNorm: [0.42, 0.5, 0.58, 0.54],
      nodeId: 'dob-val',
      confidence: 0.7,
      lattice: latFor('05/11/1990', { 0: 'O' }),
    };
    const fields = extractFields(
      [
        { text: 'Date of Birth', boxNorm: [0.2, 0.5, 0.4, 0.54], nodeId: 'dob-lbl', confidence: 0.95 },
        dobValue,
      ],
      'passport',
      { dateLocale: 'dmy' }
    );
    const map = byCanonical(fields);
    expect(map.date_of_birth?.value).toBe('1990-11-05');
  });

  it('items without lattices behave exactly as before (no rescue, no crash)', () => {
    const fields = extractFields(
      [
        { text: 'Sex', boxNorm: [0.3, 0.4, 0.36, 0.44], nodeId: 'l', confidence: 0.95 },
        { text: 'c/', boxNorm: [0.42, 0.4, 0.47, 0.44], nodeId: 'v', confidence: 0.6 },
      ],
      'passport'
    );
    expect(byCanonical(fields).sex).toBeUndefined();
  });
});

describe('globally optimal assignment (I1-lite)', () => {
  // note: true optimality is exhaustively proven by the brute-force fuzz in
  // consensus/hungarian.test.ts; these tests pin the INTEGRATION — correct
  // behavior of a clean multi-field layout through the assignment path, and
  // one-value-per-field exclusivity.
  it('resolves a clean stacked two-field date layout correctly', () => {
    const issueLbl: OcrItem = { text: 'Date of Issue', boxNorm: [0.1, 0.50, 0.3, 0.54], nodeId: 'il', confidence: 0.95 };
    const issueVal: OcrItem = { text: '01/02/2020', boxNorm: [0.4, 0.50, 0.56, 0.54], nodeId: 'iv', confidence: 0.9 };
    const expiryLbl: OcrItem = { text: 'Date of Expiry', boxNorm: [0.1, 0.60, 0.3, 0.64], nodeId: 'el', confidence: 0.95 };
    const expiryVal: OcrItem = { text: '01/02/2030', boxNorm: [0.4, 0.60, 0.56, 0.64], nodeId: 'ev', confidence: 0.9 };

    const map = byCanonical(
      extractFields([issueLbl, expiryLbl, issueVal, expiryVal], 'passport', { dateLocale: 'dmy' })
    );
    expect(map.date_of_issue?.value).toBe('2020-02-01');
    expect(map.date_of_expiry?.value).toBe('2030-02-01');
  });

  it('never assigns one value node to two fields', () => {
    // Both labels share the row with ONE value: exactly one may win it.
    const lblA: OcrItem = { text: 'Date of Issue', boxNorm: [0.05, 0.5, 0.2, 0.54], nodeId: 'a', confidence: 0.95 };
    const lblB: OcrItem = { text: 'Date of Expiry', boxNorm: [0.22, 0.5, 0.38, 0.54], nodeId: 'b', confidence: 0.95 };
    const val: OcrItem = { text: '01/02/2020', boxNorm: [0.4, 0.5, 0.56, 0.54], nodeId: 'v', confidence: 0.9 };

    const fields = extractFields([lblA, lblB, val], 'passport', { dateLocale: 'dmy' });
    const winners = fields.filter((f) => f.valueItem.nodeId === 'v');
    expect(winners).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/*  Real-world laws (live-caught on the passptest evaluation)                 */
/* -------------------------------------------------------------------------- */

describe('real-world data pages (passptest live-caught)', () => {
  it('folds Latin diacritics: German and French captions match their specs', () => {
    expect(normalizeLabelText('Staatsangehörigkeit/Nationality/Nationalité')).toContain(
      'staatsangehorigkeit',
    );
    expect(normalizeLabelText('Gültig bis/Date of expiry')).toContain('gultig bis');
    expect(normalizeLabelText('Prénoms/Given names')).toContain('prenoms');
    const items: OcrItem[] = [
      it_('3. Staatsangehörigkeit/Nationality/Nationalité', 0.35, 0.36, 0.6, 0.385),
      it_('DEUTSCH', 0.35, 0.39, 0.45, 0.42),
    ];
    const map = byCanonical(extractFields(items, 'passport'));
    expect(map.nationality?.value).toBe('DEUTSCH');
  });

  it("accepts Germany's legitimate short country code 'D' (ICAO table)", () => {
    const items: OcrItem[] = [
      it_('Kode/Code/Code', 0.47, 0.17, 0.55, 0.2),
      it_('D', 0.49, 0.21, 0.51, 0.24),
    ];
    const map = byCanonical(extractFields(items, 'passport'));
    expect(map.country_code?.value).toBe('D');
  });

  it('refuses a shape-valid but UNKNOWN country code (table, not length)', () => {
    const items: OcrItem[] = [
      it_('Country Code', 0.47, 0.17, 0.6, 0.2),
      it_('XQZ', 0.49, 0.21, 0.54, 0.24),
    ];
    const map = byCanonical(extractFields(items, 'passport'));
    expect(map.country_code).toBeUndefined();
  });

  it('merges a wrapped 3-line issuing authority into one value (US layout)', () => {
    const items: OcrItem[] = [
      it_('Authority / Autorité / Autoridad', 0.7, 0.66, 0.9, 0.68),
      it_('UNITED STATES', 0.7, 0.685, 0.83, 0.705),
      it_('DEPARTMENT OF', 0.7, 0.71, 0.83, 0.73),
      it_('STATE', 0.7, 0.735, 0.76, 0.755),
    ];
    const map = byCanonical(extractFields(items, 'passport'));
    expect(map.issuing_authority?.value).toBe('UNITED STATES DEPARTMENT OF STATE');
    expect(map.issuing_authority?.continuationItems).toHaveLength(2);
  });

  it('NEVER merges stacked dates below a date value (p20 counterexample)', () => {
    const items: OcrItem[] = [
      it_('Date of Issue', 0.6, 0.66, 0.7, 0.68),
      it_('01 JAN 2023', 0.6, 0.685, 0.7, 0.705),
      it_('31 DEC 2032', 0.6, 0.71, 0.7, 0.73),
    ];
    const map = byCanonical(extractFields(items, 'passport'));
    expect(map.date_of_issue?.value).not.toContain('2032');
  });

  it('extracts the personal number from its dedicated caption', () => {
    const items: OcrItem[] = [
      it_('Personal No. / No. personnel', 0.72, 0.66, 0.9, 0.68),
      it_('9876543210', 0.72, 0.69, 0.84, 0.71),
    ];
    const map = byCanonical(extractFields(items, 'passport'));
    expect(map.personal_number?.value).toBe('9876543210');
  });
});

/* -------------------------------------------------------------------------- */
/*  P5/P8 — character geometry & gutter partition                             */
/* -------------------------------------------------------------------------- */

describe('subBoxForCharRange (P5)', () => {
  it('uses CTC char spans when available', () => {
    const item: OcrItem = {
      ...it_('AB: XY', 0.1, 0.5, 0.7, 0.55),
      charSpans: [
        { start: 0.0, end: 0.1 },
        { start: 0.1, end: 0.25 },
        { start: 0.25, end: 0.4 },
        { start: 0.4, end: 0.55 },
        { start: 0.55, end: 0.8 },
        { start: 0.8, end: 1.0 },
      ],
    };
    const box = subBoxForCharRange(item, 4, 6); // "XY"
    expect(box[0]).toBeCloseTo(0.1 + 0.6 * 0.55, 5);
    expect(box[2]).toBeCloseTo(0.1 + 0.6 * 1.0, 5);
  });

  it('falls back to uniform fractions without spans', () => {
    const item = it_('ABCD', 0.0, 0.0, 1.0, 0.1);
    const box = subBoxForCharRange(item, 2, 4);
    expect(box[0]).toBeCloseTo(0.5, 5);
    expect(box[2]).toBeCloseTo(1.0, 5);
  });

  it('inline "Label: value" evidence box covers only the value characters', () => {
    const items: OcrItem[] = [
      it_('Invoice Number: INV-99201', 0.1, 0.2, 0.6, 0.24),
    ];
    const map = byCanonical(extractFields(items, 'invoice'));
    expect(map.invoice_number?.value).toBe('INV-99201');
    // The value box must start well past the caption's left edge.
    expect(map.invoice_number!.valueItem.boxNorm[0]).toBeGreaterThan(0.35);
  });
});

describe('gutter partition (P8)', () => {
  it('never binds a caption to a value across page surfaces', () => {
    const caption: OcrItem = { ...it_('Surname', 0.30, 0.4, 0.44, 0.44), regionId: 'L' };
    const value: OcrItem = { ...it_('DLAMINI', 0.56, 0.4, 0.70, 0.44), regionId: 'R' };
    const map = byCanonical(extractFields([caption, value], 'passport'));
    expect(map.surname).toBeUndefined();

    // Same layout WITHOUT regions binds normally (same-row-right).
    const map2 = byCanonical(
      extractFields([it_('Surname', 0.30, 0.4, 0.44, 0.44), it_('DLAMINI', 0.56, 0.4, 0.70, 0.44)], 'passport'),
    );
    expect(map2.surname?.value).toBe('DLAMINI');
  });
});

describe('multiline place of birth (P2-2)', () => {
  it('merges a wrapped two-line place of birth', () => {
    const items: OcrItem[] = [
      it_('Place of Birth / Lieu de naissance', 0.34, 0.6, 0.55, 0.62),
      it_('LONG BEACH', 0.34, 0.625, 0.45, 0.645),
      it_('CALIFORNIA', 0.34, 0.65, 0.45, 0.67),
    ];
    const map = byCanonical(extractFields(items, 'passport'));
    expect(map.place_of_birth?.value).toBe('LONG BEACH CALIFORNIA');
  });
});
