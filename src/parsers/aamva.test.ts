import { describe, expect, it } from 'vitest';
import { parseAamva } from './aamva';

/** Constructive golden — same builder shape as the corpus compiler. */
function buildPayload(): string {
  const fields = [
    'DAQE46VYDDTE',
    'DCSERIKSSON',
    'DACANNA',
    'DADMARIA',
    'DBB07021992',
    'DBA03152029',
    'DBC2',
    'DAG100 MAIN STREET',
    'DAICAPITAL CITY',
    'DAJUT',
    'DAK00000',
  ].join('\n');
  const sub = `DL${fields}\r`;
  return `@\n\x1e\rANSI 636000100002DL0041${String(sub.length).padStart(4, '0')}${sub}`;
}

describe('parseAamva', () => {
  it('parses the constructive golden into ISO-normalized fields', () => {
    const r = parseAamva(buildPayload());
    expect(r.isAamva).toBe(true);
    expect(r.issuerId).toBe('636000');
    expect(r.fields.documentNumber).toBe('E46VYDDTE');
    expect(r.fields.surname).toBe('ERIKSSON');
    expect(r.fields.givenNames).toBe('ANNA MARIA');
    expect(r.fields.dateOfBirth).toBe('1992-07-02');
    expect(r.fields.expiryDate).toBe('2029-03-15');
    expect(r.fields.sex).toBe('F');
    expect(r.fields.state).toBe('UT');
  });

  it('refuses non-AAMVA payloads honestly (QR text, URLs, random)', () => {
    for (const p of ['https://example.com/x', 'HELLO WORLD 123456', 'P<UTOERIKSSON<<ANNA<<<<']) {
      const r = parseAamva(p);
      expect(r.isAamva).toBe(false);
      expect(r.fields).toEqual({});
    }
  });

  it('rejects implausible dates instead of inventing them', () => {
    const bad = buildPayload().replace('DBB07021992', 'DBB13451992'); // month 13, day 45
    const r = parseAamva(bad);
    expect(r.isAamva).toBe(true);
    expect(r.fields.dateOfBirth).toBeUndefined();
  });

  it('sex code 1 → M, 9 → X, unknown code → undefined', () => {
    expect(parseAamva(buildPayload().replace('DBC2', 'DBC1')).fields.sex).toBe('M');
    expect(parseAamva(buildPayload().replace('DBC2', 'DBC9')).fields.sex).toBe('X');
    expect(parseAamva(buildPayload().replace('DBC2', 'DBC7')).fields.sex).toBeUndefined();
  });

  it('preserves unknown elements for provenance', () => {
    const withExtra = buildPayload().replace('DAK00000', 'DAK00000\nDCF9999ZZ');
    const r = parseAamva(withExtra);
    expect(r.elements.some((e) => e.elementId === 'DCF' && e.value === '9999ZZ')).toBe(true);
  });
});
