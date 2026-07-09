/**
 * Structural geometry laws (certificates/labs resurrection): the three
 * archetypes that pairwise geometry alone mis-pairs, locked as fixtures.
 *
 *  1. LABEL-ABOVE GRID (certificate): three labels in a row, values below —
 *     same-row neighbors must not steal aligned below-values.
 *  2. HEADER ROW (lab patient block): four labels in a row, values below.
 *  3. RESULTS TABLE (lab analytes): column headers + wide-gap rows —
 *     analyte→result must pair across the gap; headers own no values.
 */
import { describe, expect, it } from 'vitest';

import { extractGenericFields } from './generic-extraction';
import type { OcrItem } from './ocr-item';

let n = 0;
const mk = (text: string, x1: number, y1: number, x2: number, y2: number): OcrItem => ({
  text,
  boxNorm: [x1, y1, x2, y2],
  nodeId: `n${n++}`,
  confidence: 0.97,
});

const byCanonical = (fields: ReturnType<typeof extractGenericFields>) =>
  Object.fromEntries(fields.map((f) => [f.canonicalLabel, f]));

describe('LABEL-ABOVE GRID (the certificate archetype)', () => {
  it('pairs each label with the value stacked beneath it — no row steals', () => {
    const items = [
      mk('DATE OF BIRTH', 0.08, 0.4, 0.24, 0.43),
      mk('PLACE OF BIRTH', 0.38, 0.4, 0.55, 0.43),
      mk('REGISTRATION NUMBER', 0.66, 0.4, 0.9, 0.43),
      mk('01/01/1970', 0.08, 0.46, 0.2, 0.49),
      mk('CAPITAL CITY', 0.38, 0.46, 0.52, 0.49),
      mk('REG-2026-67325', 0.66, 0.46, 0.84, 0.49),
    ];
    const map = byCanonical(extractGenericFields(items));
    expect(map['date_of_birth']?.value).toBe('01/01/1970');
    expect(map['place_of_birth']?.value).toBe('CAPITAL CITY');
    expect(map['registration_number']?.value).toBe('REG-2026-67325');
  });
});

describe('HEADER ROW (the lab patient-block archetype)', () => {
  it('pairs each header with its below value even when the value is name-like', () => {
    const items = [
      mk('PATIENT NAME', 0.06, 0.2, 0.2, 0.23),
      mk('MEDICAL RECORD NO', 0.3, 0.2, 0.5, 0.23),
      mk('COLLECTED', 0.6, 0.2, 0.72, 0.23),
      mk('PHYSICIAN', 0.8, 0.2, 0.92, 0.23),
      mk('ANNA ERIKSSON', 0.06, 0.26, 0.22, 0.29),
      mk('MRN-259393', 0.3, 0.26, 0.42, 0.29),
      mk('01/07/2026', 0.6, 0.26, 0.72, 0.29),
      mk('DR. R. VANCE', 0.8, 0.26, 0.93, 0.29),
    ];
    const map = byCanonical(extractGenericFields(items));
    expect(map['patient_name']?.value).toBe('ANNA ERIKSSON');
    expect(map['medical_record_no']?.value).toBe('MRN-259393');
    expect(map['collected']?.value).toBe('01/07/2026');
    expect(map['physician']?.value).toBe('DR. R. VANCE');
  });
});

describe('RESULTS TABLE (the lab analyte archetype)', () => {
  it('pairs analytes with their results across the column gap; headers get no values', () => {
    const items = [
      // header row
      mk('Analyte', 0.06, 0.45, 0.15, 0.48),
      mk('Result', 0.36, 0.45, 0.44, 0.48),
      mk('Units', 0.56, 0.45, 0.63, 0.48),
      mk('Reference', 0.72, 0.45, 0.84, 0.48),
      // rows
      mk('Hemoglobin', 0.06, 0.51, 0.19, 0.54),
      mk('13.7', 0.36, 0.51, 0.41, 0.54),
      mk('g/dL', 0.56, 0.51, 0.61, 0.54),
      mk('13 - 17', 0.72, 0.51, 0.8, 0.54),
      mk('Glucose (fasting)', 0.06, 0.57, 0.24, 0.6),
      mk('83.4', 0.36, 0.57, 0.41, 0.6),
      mk('mg/dL', 0.56, 0.57, 0.63, 0.6),
      mk('70 - 100', 0.72, 0.57, 0.81, 0.6),
      mk('Creatinine', 0.06, 0.63, 0.18, 0.66),
      mk('1.1', 0.36, 0.63, 0.4, 0.66),
      mk('mg/dL', 0.56, 0.63, 0.63, 0.66),
      mk('0.7 - 1.3', 0.72, 0.63, 0.82, 0.66),
      mk('TSH', 0.06, 0.69, 0.11, 0.72),
      mk('2.8', 0.36, 0.69, 0.4, 0.72),
      mk('mIU/L', 0.56, 0.69, 0.63, 0.72),
      mk('0.4 - 4', 0.72, 0.69, 0.8, 0.72),
    ];
    const map = byCanonical(extractGenericFields(items));
    expect(map['hemoglobin']?.value).toBe('13.7');
    expect(map['glucose_fasting']?.value).toBe('83.4');
    expect(map['creatinine']?.value).toBe('1.1');
    expect(map['tsh']?.value).toBe('2.8');
    // Headers own columns, not values: Result must not claim a number.
    expect(map['result']).toBeUndefined();
  });
});
