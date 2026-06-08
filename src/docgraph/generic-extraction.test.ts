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

  it('extracts inline "Label: value" pairs', () => {
    const items: OcrItem[] = [mk("Father's Name: RAHUL", 0.05, 0.2, 0.5, 0.23)];

    const fields = extractGenericFields(items);
    expect(fields).toHaveLength(1);
    expect(fields[0].label).toBe("Father's Name");
    expect(fields[0].value).toBe('RAHUL');
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
