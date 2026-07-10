import { describe, it, expect } from 'vitest';
import { OcrItem } from './ocr-item';
import {
  GenericField,
  slugifyLabel,
  cleanLabelText,
  looksLikeLabel,
  inferValueType,
  extractGenericFields,
} from './generic-extraction';

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

let __id = 0;
/** Build an OcrItem with a normalized box and a unique nodeId. */
function mk(
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

/** Index emitted fields by canonical label. */
function byCanonical(fields: GenericField[]): Record<string, GenericField> {
  const map: Record<string, GenericField> = {};
  for (const f of fields) map[f.canonicalLabel] = f;
  return map;
}

/* -------------------------------------------------------------------------- */
/*  slugifyLabel                                                              */
/* -------------------------------------------------------------------------- */

describe('slugifyLabel', () => {
  it('lower-cases, replaces non-alphanumeric runs with _ and trims', () => {
    expect(slugifyLabel('Place of Birth')).toBe('place_of_birth');
    expect(slugifyLabel("Father's Name")).toBe('father_s_name');
    expect(slugifyLabel('  Date / Time  ')).toBe('date_time');
    expect(slugifyLabel('Surname')).toBe('surname');
  });
});

/* -------------------------------------------------------------------------- */
/*  cleanLabelText                                                            */
/* -------------------------------------------------------------------------- */

describe('cleanLabelText', () => {
  it('keeps the Latin segment of a bilingual label', () => {
    expect(cleanLabelText('उपनाम / Surname')).toBe('Surname');
    expect(cleanLabelText('Date of Birth / जन्म तिथि')).toBe('Date of Birth');
  });

  it('strips a trailing colon and collapses whitespace', () => {
    expect(cleanLabelText('Place of Birth:')).toBe('Place of Birth');
    expect(cleanLabelText('  Place   of  Birth ')).toBe('Place of Birth');
  });

  it('returns the whole cleaned text when there is no Latin segment', () => {
    expect(cleanLabelText('जन्म तिथि')).toBe('जन्म तिथि');
  });
});

/* -------------------------------------------------------------------------- */
/*  inferValueType                                                            */
/* -------------------------------------------------------------------------- */

describe('inferValueType', () => {
  it('detects dates', () => {
    expect(inferValueType('23/09/2021')).toBe('date');
  });

  it('detects amounts with currency / decimals', () => {
    expect(inferValueType('$1,250.00')).toBe('amount');
  });

  it('detects id numbers', () => {
    expect(inferValueType('V8673092')).toBe('id_number');
  });

  it('falls back to text', () => {
    expect(inferValueType('MUMBAI')).toBe('text');
  });
});

/* -------------------------------------------------------------------------- */
/*  looksLikeLabel                                                            */
/* -------------------------------------------------------------------------- */

describe('looksLikeLabel', () => {
  it('treats short alphabetic phrases as labels', () => {
    expect(looksLikeLabel('Place of Birth')).toBe(true);
  });

  it('rejects long all-caps banners (6+ words)', () => {
    // Documented edge case: a short value like 'SURAT, GUJARAT' is textually
    // label-like, so the engine relies on geometry + the -0.5 penalty to keep
    // it as a value. A long banner, however, is rejected outright by word count.
    expect(looksLikeLabel('MINISTRY OF EXTERNAL AFFAIRS GOVT OF INDIA')).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*  extractGenericFields                                                      */
/* -------------------------------------------------------------------------- */

describe('extractGenericFields', () => {
  it('extracts registry-free fields from a passport-ish layout', () => {
    const items: OcrItem[] = [
      mk('Place of Birth', 0.05, 0.4, 0.18, 0.43),
      mk('SURAT, GUJARAT', 0.2, 0.4, 0.4, 0.43),
      mk('Place of Issue', 0.05, 0.46, 0.18, 0.49),
      mk('MUMBAI', 0.2, 0.46, 0.33, 0.49),
      mk('Signature of Holder', 0.05, 0.7, 0.25, 0.73),
    ];

    const fields = extractGenericFields(items);
    const map = byCanonical(fields);

    expect(map['place_of_birth']).toBeDefined();
    expect(map['place_of_birth'].value).toBe('SURAT, GUJARAT');
    expect(map['place_of_birth'].label).toBe('Place of Birth');

    expect(map['place_of_issue']).toBeDefined();
    expect(map['place_of_issue'].value).toBe('MUMBAI');
    expect(map['place_of_issue'].label).toBe('Place of Issue');

    // 'Signature of Holder' has no value, so it is omitted.
    expect(map['signature_of_holder']).toBeUndefined();
  });

  it('handles a bilingual label and keeps the Latin slug/label', () => {
    const items: OcrItem[] = [
      mk('उपनाम / Surname', 0.05, 0.3, 0.2, 0.33),
      mk('MEHTA', 0.22, 0.3, 0.38, 0.33),
    ];

    const fields = extractGenericFields(items);
    const map = byCanonical(fields);

    expect(map['surname']).toBeDefined();
    expect(map['surname'].label).toBe('Surname');
    expect(map['surname'].value).toBe('MEHTA');
  });

  it('binds a wide nationality value instead of the narrower caption below it', () => {
    const map = byCanonical(extractGenericFields([
      mk('Nationality / Nationalité', 0.36, 0.30, 0.53, 0.32),
      mk('SOUTH AFRICAN / SUD-AFRICAIN', 0.49, 0.325, 0.82, 0.35),
      mk("Identity No. / No. d'identité", 0.36, 0.355, 0.62, 0.38),
      mk('900101 5234 081', 0.36, 0.385, 0.55, 0.41),
    ]));

    expect(map.nationality?.value).toBe('SOUTH AFRICAN / SUD-AFRICAIN');
  });

  it('omits nationality when only the following identity caption remains', () => {
    const map = byCanonical(extractGenericFields([
      mk('Nationality / Nationalité', 0.36, 0.30, 0.53, 0.32),
      mk("Identity No. / No. d'identité", 0.36, 0.355, 0.62, 0.38),
      mk('900101 5234 081', 0.36, 0.385, 0.55, 0.41),
    ]));

    expect(map.nationality).toBeUndefined();
  });

  it('extracts inline "Label: value" pairs', () => {
    const items: OcrItem[] = [mk("Father's Name: RAHUL", 0.05, 0.2, 0.5, 0.23)];

    const fields = extractGenericFields(items);
    expect(fields).toHaveLength(1);
    expect(fields[0].label).toBe("Father's Name");
    expect(fields[0].value).toBe('RAHUL');
  });

  it('extracts colonless card contacts and the structural identity heading', () => {
    const items: OcrItem[] = [
      mk('ANNA ERIKSSON', 0.05, 0.15, 0.3, 0.2),
      mk('Senior Engineer', 0.05, 0.22, 0.25, 0.26),
      mk('Cobalt Ridge Consulting', 0.05, 0.3, 0.36, 0.34),
      mk('Email  anna@cobaltridgeconsulting.example', 0.05, 0.68, 0.55, 0.72),
      mk('Phone  +1-555-0100', 0.05, 0.75, 0.3, 0.79),
      mk('Web    www.cobaltridgeconsulting.example', 0.05, 0.82, 0.55, 0.86),
    ];

    const map = byCanonical(extractGenericFields(items));
    expect(map.email?.value).toBe('anna@cobaltridgeconsulting.example');
    expect(map.email?.valueType).toBe('email');
    expect(map.phone?.value).toBe('+1-555-0100');
    expect(map.phone?.valueType).toBe('phone');
    expect(map.full_name?.value).toBe('ANNA ERIKSSON');
    expect(map.full_name?.valueType).toBe('name');
  });

  it('does not invent a contact name without both validated channels', () => {
    const titleBlock: OcrItem[] = [
      mk('QUARTERLY REPORT', 0.05, 0.1, 0.3, 0.14),
      mk('NORTHWIND TRADERS', 0.05, 0.18, 0.32, 0.22),
      mk('Email not-an-email', 0.05, 0.8, 0.3, 0.84),
    ];
    expect(byCanonical(extractGenericFields(titleBlock)).full_name).toBeUndefined();

    const oneChannel = [
      ...titleBlock.slice(0, 2),
      mk('Email audit@northwind.example', 0.05, 0.8, 0.38, 0.84),
    ];
    expect(byCanonical(extractGenericFields(oneChannel)).full_name).toBeUndefined();
  });

  it('ignores items in excludeNodeIds', () => {
    const items: OcrItem[] = [
      mk('Place of Birth', 0.05, 0.4, 0.18, 0.43),
      mk('SURAT, GUJARAT', 0.2, 0.4, 0.4, 0.43),
    ];
    const exclude = new Set<string>([items[1].nodeId]);

    const fields = extractGenericFields(items, exclude);
    const map = byCanonical(fields);

    // With the value excluded, no place_of_birth field can be formed.
    expect(map['place_of_birth']).toBeUndefined();
  });

  it('never emits two fields sharing a valueItem.nodeId', () => {
    const items: OcrItem[] = [
      mk('Place of Birth', 0.05, 0.4, 0.18, 0.43),
      mk('SURAT, GUJARAT', 0.2, 0.4, 0.4, 0.43),
      mk('Place of Issue', 0.05, 0.46, 0.18, 0.49),
      mk('MUMBAI', 0.2, 0.46, 0.33, 0.49),
      mk("Father's Name: RAHUL", 0.05, 0.2, 0.5, 0.23),
    ];

    const fields = extractGenericFields(items);
    const valueNodeIds = fields.map((f) => f.valueItem.nodeId);
    expect(new Set(valueNodeIds).size).toBe(valueNodeIds.length);
  });
});

describe('stamps-page admission gate (live-caught: 40 garbage pairs)', () => {
  it('refuses caption→value pairing on a rotated-stamps chaos page', () => {
    const items: OcrItem[] = [
      mk('MICRATION', 0.72, 0.3, 0.8, 0.32, 0.5),
      mk('+ 8 JUN 2019', 0.73, 0.33, 0.8, 0.35, 0.6),
      mk('广', 0.23, 0.21, 0.37, 0.28, 0.4),
      mk('41-)', 0.6, 0.26, 0.62, 0.27, 0.4),
      mk('19S', 0.73, 0.36, 0.78, 0.37, 0.5),
      mk('DEPARTEO', 0.75, 0.36, 0.79, 0.37, 0.52),
      mk('Jt', 0.59, 0.31, 0.62, 0.33, 0.4),
      mk('本', 0.55, 0.31, 0.57, 0.33, 0.4),
      mk('HONG KONG', 0.57, 0.25, 0.64, 0.26, 0.7),
      mk('3023', 0.6, 0.31, 0.62, 0.33, 0.6),
    ];
    expect(extractGenericFields(items)).toHaveLength(0);
  });

  it('refuses an anchor-less page whose lines tilt in scattered directions', () => {
    const tiltQuad = (x: number, y: number, deg: number): [number, number][] => {
      const w = 0.12;
      const h = 0.02;
      const rad = (deg * Math.PI) / 180;
      const dx = Math.cos(rad) * w;
      const dy = Math.sin(rad) * w;
      return [
        [x, y],
        [x + dx, y + dy],
        [x + dx, y + dy + h],
        [x, y + h],
      ];
    };
    const rotated = (text: string, x: number, y: number, deg: number): OcrItem => ({
      ...mk(text, x, y, x + 0.12, y + 0.04, 0.8),
      quadNorm: tiltQuad(x, y, deg),
    });
    const items: OcrItem[] = [
      rotated('MALAYSIA IMMIGRATION', 0.1, 0.2, 12),
      rotated('SYDNEY AIRPORT', 0.4, 0.25, -20),
      rotated('24 MAR 2019', 0.15, 0.4, 33),
      rotated('REPUBLIC OF KOREA', 0.6, 0.5, -8),
      mk('HONG KONG', 0.57, 0.7, 0.69, 0.72, 0.8),
      mk('ARRIVAL DATE STAMP HERE', 0.1, 0.8, 0.4, 0.82, 0.8),
    ];
    expect(extractGenericFields(items)).toHaveLength(0);
  });

  it('still admits a clean colon-labeled form page', () => {
    const items: OcrItem[] = [
      mk("Father's Name: RAHUL", 0.05, 0.2, 0.5, 0.23),
      mk('Place of Birth', 0.05, 0.4, 0.18, 0.43),
      mk('SURAT, GUJARAT', 0.2, 0.4, 0.4, 0.43),
    ];
    expect(extractGenericFields(items).length).toBeGreaterThan(0);
  });

  it('still admits a colonless business card (coherent Latin text)', () => {
    const items: OcrItem[] = [
      mk('ANNA ERIKSSON', 0.05, 0.15, 0.3, 0.2),
      mk('Senior Engineer', 0.05, 0.22, 0.25, 0.26),
      mk('Cobalt Ridge Consulting', 0.05, 0.3, 0.36, 0.34),
      mk('Email  anna@cobaltridgeconsulting.example', 0.05, 0.68, 0.55, 0.72),
      mk('Phone  +1-555-0100', 0.05, 0.75, 0.3, 0.79),
    ];
    const map = byCanonical(extractGenericFields(items));
    expect(map.email?.value).toBe('anna@cobaltridgeconsulting.example');
  });
});
