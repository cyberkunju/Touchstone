import { describe, it, expect } from 'vitest';
import { OcrItem } from './ocr-item';
import { mrzLineScore, isMrzLine, detectMrzZone } from './mrz-zone';

let counter = 0;
function item(
  text: string,
  boxNorm: [number, number, number, number],
  confidence = 0.9
): OcrItem {
  return { text, boxNorm, nodeId: `node-${counter++}`, confidence };
}

const MRZ_LINE_1 = 'P<AREALHASHIMI<<KHALED<AL<<<<<<<<<<<<<<<<<<';
const MRZ_LINE_2 = 'Y34B678901ARE9005149M2207052<<<<<<<<<<<<<<06';

describe('mrzLineScore', () => {
  it('scores a strong MRZ line above 0.85', () => {
    expect(mrzLineScore(MRZ_LINE_1)).toBeGreaterThan(0.85);
    expect(mrzLineScore(MRZ_LINE_2)).toBeGreaterThan(0.85);
  });

  it('scores a plain sentence below 0.7', () => {
    expect(mrzLineScore('United Arab Emirates')).toBeLessThan(0.7);
  });
});

describe('isMrzLine', () => {
  it('rejects normal text', () => {
    expect(isMrzLine('United Arab Emirates')).toBe(false);
    expect(isMrzLine('Date of Birth')).toBe(false);
  });

  it('accepts a real MRZ line', () => {
    expect(
      isMrzLine('P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<<')
    ).toBe(true);
    expect(isMrzLine(MRZ_LINE_1)).toBe(true);
    expect(isMrzLine(MRZ_LINE_2)).toBe(true);
  });
});

describe('detectMrzZone', () => {
  it('detects the two MRZ lines in a passport and excludes normal text', () => {
    const items: OcrItem[] = [
      item('United Arab Emirates', [0.1, 0.2, 0.4, 0.23]),
      item('Date of Birth', [0.1, 0.3, 0.2, 0.33]),
      item(MRZ_LINE_1, [0.05, 0.86, 0.95, 0.89]),
      item(MRZ_LINE_2, [0.05, 0.9, 0.95, 0.93]),
    ];

    const zone = detectMrzZone(items);
    expect(zone).not.toBeNull();
    const z = zone!;

    expect(z.lines.length).toBe(2);
    expect(z.itemIds.length).toBe(2);

    // Top-to-bottom order.
    expect(z.lines[0]).toBe(MRZ_LINE_1.toUpperCase().replace(/\s+/g, ''));
    expect(z.lines[1]).toBe(MRZ_LINE_2.toUpperCase().replace(/\s+/g, ''));

    // Enclosing box roughly [0.05, 0.86, 0.95, 0.93].
    expect(z.boxNorm[0]).toBeCloseTo(0.05, 5);
    expect(z.boxNorm[1]).toBeCloseTo(0.86, 5);
    expect(z.boxNorm[2]).toBeCloseTo(0.95, 5);
    expect(z.boxNorm[3]).toBeCloseTo(0.93, 5);

    // Normal-text items are not part of the zone.
    expect(z.lines.some((l) => l.includes('UNITED'))).toBe(false);
    expect(z.lines.some((l) => l.includes('BIRTH'))).toBe(false);
  });

  it('returns null when there is no MRZ', () => {
    const items: OcrItem[] = [
      item('United Arab Emirates', [0.1, 0.2, 0.4, 0.23]),
      item('Date of Birth', [0.1, 0.3, 0.2, 0.33]),
      item('Passport No 12345', [0.1, 0.4, 0.3, 0.43]),
    ];
    expect(detectMrzZone(items)).toBeNull();
  });
});
