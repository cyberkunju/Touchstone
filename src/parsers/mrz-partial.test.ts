import { describe, expect, it } from 'vitest';
import { recoverFromPartialTd3Line2 } from './mrz-partial';

// Canonical valid TD3 line 2 (ICAO 9303 specimen):
// L898902C36UTO7408122F1204159ZE184226B<<<<<10
//  doc L898902C3 check 6 · dob 740812 check 2 · expiry 120415 check 9
//  personal ZE184226B<<<<< check 1
const LINE2 = 'L898902C36UTO7408122F1204159ZE184226B<<<<<10';

describe('recoverFromPartialTd3Line2', () => {
  it('recovers dob+expiry from a RIGHT fragment (left edge cropped)', () => {
    const fragment = LINE2.slice(10); // lost the doc number entirely
    const fields = recoverFromPartialTd3Line2(fragment, 'left');
    const map = Object.fromEntries(fields.map((f) => [f.canonicalLabel, f.value]));
    expect(map.date_of_birth).toBe('1974-08-12');
    expect(map.date_of_expiry).toBe('2012-04-15');
    expect(map.passport_number).toBeUndefined(); // window not covered
  });

  it('recovers the document number from a LEFT fragment (right edge cropped)', () => {
    const fragment = LINE2.slice(0, 22); // doc+check+nat+dob+check present
    const fields = recoverFromPartialTd3Line2(fragment, 'right');
    const map = Object.fromEntries(fields.map((f) => [f.canonicalLabel, f.value]));
    expect(map.passport_number).toBe('L898902C3');
    expect(map.date_of_birth).toBe('1974-08-12');
    expect(map.date_of_expiry).toBeUndefined();
  });

  it('recovers under UNKNOWN edge only when the alignment is unambiguous', () => {
    const fragment = LINE2.slice(10, 30);
    const fields = recoverFromPartialTd3Line2(fragment, 'unknown');
    // Whatever it recovers must be TRUE values — never fabrications.
    for (const f of fields) {
      if (f.canonicalLabel === 'date_of_birth') expect(f.value).toBe('1974-08-12');
      if (f.canonicalLabel === 'date_of_expiry') expect(f.value).toBe('2012-04-15');
    }
  });

  it('refuses a corrupted fragment (check digit fails at every alignment)', () => {
    const corrupted = LINE2.slice(10).replace('740812', '740813'); // dob altered
    const fields = recoverFromPartialTd3Line2(corrupted, 'left');
    expect(fields.find((f) => f.canonicalLabel === 'date_of_birth')).toBeUndefined();
  });

  it('refuses fragments too short to cover any checked window', () => {
    expect(recoverFromPartialTd3Line2('L898902', 'right')).toEqual([]);
  });

  it('never invents letters into a date window (position-class law)', () => {
    // A fragment whose dob window would hold letters at the claimed offset.
    const garbage = 'ABCDEF1GHIJKL2MNOPQ3';
    expect(recoverFromPartialTd3Line2(garbage, 'right')).toEqual([]);
  });
});
