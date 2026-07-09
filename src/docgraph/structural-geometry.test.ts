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

describe('INTERPOSITION (the lease archetype)', () => {
  it('a name never steals the amount below the NEXT label — below means DIRECTLY below', () => {
    const items = [
      mk('LANDLORD', 0.08, 0.3, 0.2, 0.33),
      mk('TENANT', 0.55, 0.3, 0.65, 0.33),
      mk('ANNA ERIKSSON', 0.08, 0.36, 0.24, 0.39),
      mk('LAYLA ALFARSI', 0.55, 0.36, 0.7, 0.39),
      mk('MONTHLY RENT', 0.08, 0.44, 0.23, 0.47),
      mk('SECURITY DEPOSIT', 0.55, 0.44, 0.74, 0.47),
      mk('1,334.77', 0.08, 0.5, 0.18, 0.53),
      mk('2,669.54', 0.55, 0.5, 0.65, 0.53),
    ];
    const map = byCanonical(extractGenericFields(items));
    expect(map['landlord']?.value).toBe('ANNA ERIKSSON');
    expect(map['tenant']?.value).toBe('LAYLA ALFARSI');
    expect(map['monthly_rent']?.value).toBe('1,334.77');
    expect(map['security_deposit']?.value).toBe('2,669.54');
    // The steal that killed leases 31→24: names must claim no AMOUNTS.
    // (Leftover label→label pairs are review-capped noise, not theft.)
    expect(map['anna_eriksson']?.value ?? '').not.toMatch(/\d/);
    expect(map['layla_alfarsi']?.value ?? '').not.toMatch(/\d/);
  });

  it('REAL lease geometry (live boxes from lease_id00): all six pairs land', () => {
    // Exact boxNorms dumped from the live pipeline — the flex-wrap grid the
    // idealized fixture failed to reproduce (tight 0.003 vertical gaps,
    // detector-order jitter, five labels sharing the top band).
    const items = [
      mk('RESIDENTIAL LEASE AGREEMENT', 0.06, 0.061, 0.409, 0.077),
      mk('Fictional tenancy contract — deposit = 2 × rent by construction', 0.06, 0.085, 0.341, 0.096),
      mk('TENANT', 0.222, 0.119, 0.261, 0.132),
      mk('PROPERTY ADDRESS', 0.385, 0.12, 0.482, 0.13),
      mk('LEASE START', 0.64, 0.12, 0.703, 0.13),
      mk('LEASE END', 0.802, 0.12, 0.856, 0.13),
      mk('LANDLORD', 0.059, 0.12, 0.111, 0.13),
      mk('31/08/2027', 0.801, 0.131, 0.878, 0.149),
      mk('10 WILLOW CRESCENT, UNIT 1', 0.384, 0.132, 0.606, 0.149),
      mk('ANNA ERIKSSON', 0.059, 0.133, 0.184, 0.147),
      mk('LAYLA ALFARSI', 0.222, 0.133, 0.338, 0.147),
      mk('01/09/2026', 0.639, 0.133, 0.715, 0.147),
      mk('SECURITY DEPOSIT', 0.22, 0.165, 0.313, 0.178),
      mk('MONTHLY RENT', 0.059, 0.165, 0.134, 0.178),
      mk('2,669.54', 0.22, 0.178, 0.282, 0.196),
      mk('1,334.77', 0.059, 0.178, 0.119, 0.196),
      mk('1. The Tenant shall pay the Monthly Rent stated above on the first day of each calendar month.', 0.061, 0.35, 0.542, 0.364),
      mk("2. The Security Deposit equals two months' rent and is refundable per clause 9.", 0.06, 0.384, 0.463, 0.398),
      mk('3. This agreement is a fictional training specimen for document analysis systems.', 0.06, 0.418, 0.473, 0.432),
      mk('LANDLORD SIGNATURE', 0.059, 0.883, 0.168, 0.894),
      mk('TENANT SIGNATURE', 0.274, 0.883, 0.368, 0.894),
    ];
    const map = byCanonical(extractGenericFields(items));
    expect(map['landlord']?.value).toBe('ANNA ERIKSSON');
    expect(map['tenant']?.value).toBe('LAYLA ALFARSI');
    expect(map['monthly_rent']?.value).toBe('1,334.77');
    expect(map['security_deposit']?.value).toBe('2,669.54');
    expect(map['property_address']?.value).toBe('10 WILLOW CRESCENT, UNIT 1');
    expect(map['lease_start']?.value).toBe('01/09/2026');
    expect(map['lease_end']?.value).toBe('31/08/2027');
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
    // Headers own columns, not values: no header may claim a NUMERIC result
    // (a header→header same-row remnant like result=Units is review-capped
    // noise, never a stolen measurement).
    expect(map['result']?.value ?? '').not.toMatch(/\d/);
    expect(map['reference']?.value ?? '').not.toMatch(/^\d/);
  });
});
