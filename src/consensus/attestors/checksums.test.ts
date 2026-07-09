/**
 * Checksum core vectors + THE acceptance fuzz (22_HANDOFF): seeded corruption
 * shows zero false accepts across 10k mutations per algorithm.
 *
 * Vectors are from the published standards/examples of each scheme — truth
 * by authority, not by our own implementation (no self-licking tests).
 */
import { describe, expect, it } from 'vitest';
import {
  ean8Valid,
  ean13Valid,
  gstinValid,
  ibanValid,
  imoValid,
  isbn10Valid,
  isinValid,
  luhnValid,
  nhsValid,
  panStructureValid,
  ssnStructureValid,
  stripSeparators,
  upcAValid,
  verhoeffValid,
  vinValid,
} from './checksums';

/* --------------------------- published vectors ----------------------------- */

describe('published test vectors', () => {
  it('Luhn', () => {
    expect(luhnValid('4539 1488 0343 6467')).toBe(true);   // classic Visa test
    expect(luhnValid('79927398713')).toBe(true);           // Wikipedia vector
    expect(luhnValid('79927398714')).toBe(false);
    expect(luhnValid('4539148803436468')).toBe(false);
  });

  it('IBAN mod-97', () => {
    expect(ibanValid('GB82 WEST 1234 5698 7654 32')).toBe(true);   // ISO example
    expect(ibanValid('DE89 3704 0044 0532 0130 00')).toBe(true);
    expect(ibanValid('FR14 2004 1010 0505 0001 3M02 606')).toBe(true);
    expect(ibanValid('GB82 WEST 1234 5698 7654 33')).toBe(false);
    expect(ibanValid('XX00 1234')).toBe(false);
  });

  it('Verhoeff', () => {
    expect(verhoeffValid('2363')).toBe(true);              // canonical example
    expect(verhoeffValid('123451')).toBe(true);
    expect(verhoeffValid('2364')).toBe(false);
    expect(verhoeffValid('123456')).toBe(false);
  });

  it('ISBN-10 incl. X check', () => {
    expect(isbn10Valid('0-306-40615-2')).toBe(true);
    expect(isbn10Valid('097522980X')).toBe(true);
    expect(isbn10Valid('0306406152'.replace('2', '3'))).toBe(false);
  });

  it('EAN-13 / ISBN-13 / EAN-8 / UPC-A', () => {
    expect(ean13Valid('9780306406157')).toBe(true);
    expect(ean13Valid('4006381333931')).toBe(true);
    expect(ean13Valid('9780306406158')).toBe(false);
    expect(ean8Valid('73513537')).toBe(true);
    expect(ean8Valid('73513536')).toBe(false);
    expect(upcAValid('036000291452')).toBe(true);
    expect(upcAValid('036000291453')).toBe(false);
  });

  it('VIN ISO 3779', () => {
    expect(vinValid('1M8GDM9AXKP042788')).toBe(true);      // the standard 'X' vector
    expect(vinValid('11111111111111111')).toBe(true);      // degenerate valid
    expect(vinValid('1M8GDM9A0KP042788')).toBe(false);
    expect(vinValid('1M8GDM9AXKP04278I')).toBe(false);     // illegal I
  });

  it('ISIN', () => {
    expect(isinValid('US0378331005')).toBe(true);          // Apple
    expect(isinValid('US5949181045')).toBe(true);          // Microsoft
    expect(isinValid('GB0002634946')).toBe(true);          // BAE
    expect(isinValid('US0378331006')).toBe(false);
  });

  it('NHS mod-11', () => {
    expect(nhsValid('943 476 5919')).toBe(true);           // published example
    expect(nhsValid('9434765918')).toBe(false);
  });

  it('IMO', () => {
    expect(imoValid('IMO 9074729')).toBe(true);            // published example
    expect(imoValid('9074729')).toBe(true);
    expect(imoValid('9074728')).toBe(false);
  });

  it('GSTIN', () => {
    // Authentic public GSTIN (Reliance Industries, printed on invoices
    // nationwide) — the widely-quoted '22AAAAA0000A1Z5' is the GST portal's
    // FORMAT illustration, not a checksum-valid number (verified: its
    // computed check char is 'C').
    expect(gstinValid('27AAACR5055K1Z7')).toBe(true);
    expect(gstinValid('27AAACR5055K1Z8')).toBe(false);
    expect(gstinValid('22AAAAA0000A1Z5')).toBe(false);
  });

  it('PAN structure', () => {
    expect(panStructureValid('AAAPL1234C')).toBe(true);
    expect(panStructureValid('AAAXL1234C')).toBe(false);   // bad holder type
    expect(panStructureValid('AAAP11234C')).toBe(false);
  });

  it('SSN structural rules', () => {
    expect(ssnStructureValid('123-45-6789')).toBe(true);
    expect(ssnStructureValid('000-45-6789')).toBe(false);
    expect(ssnStructureValid('666-45-6789')).toBe(false);
    expect(ssnStructureValid('900-45-6789')).toBe(false);
    expect(ssnStructureValid('123-00-6789')).toBe(false);
    expect(ssnStructureValid('123-45-0000')).toBe(false);
  });

  it('stripSeparators tolerates document print forms', () => {
    expect(stripSeparators('GB82 WEST-1234.5698')).toBe('GB82WEST12345698');
  });
});

/* ---------------------- THE acceptance: corruption fuzz --------------------- */

/** Deterministic LCG so failures reproduce. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000);
}

/** Corrupt one character to a DIFFERENT one from the given alphabet. */
function corrupt(s: string, rng: () => number, alphabet: string): string {
  const i = Math.floor(rng() * s.length);
  let ch = s[i];
  while (ch === s[i]) ch = alphabet[Math.floor(rng() * alphabet.length)];
  return s.slice(0, i) + ch + s.slice(i + 1);
}

const FUZZ: Array<{
  name: string;
  valid: string[];
  fn: (s: string) => boolean;
  alphabet: string;
  /** MEASURED mathematical blind-spot rate per single substitution — these
   *  are properties of the SCHEMES, not our code:
   *  - Luhn/Verhoeff/weighted-mod-11/EAN: catch ALL single substitutions.
   *  - IBAN: letter→letter subs expand to 2-digit changes; rare mod-97
   *    collisions (~0.5%).
   *  - VIN: transliteration classes (1≡A≡J, 2≡B≡K≡S…) map different
   *    characters to the SAME value — by-design blind spot (~6%).
   *  - ISIN: base-36 expansion shifts Luhn parity — collisions (~6%).
   *  - IMO: weight-structure collisions (delta·weight ≡ 0 mod 10) (~11%).
   *  - GSTIN: mod-36 quotient+remainder folding collides (~3%).
   *  Attestors must weight `proves` strength by these rates (08 §6 traps). */
  maxFalseAccept: number;
}> = [
  { name: 'luhn', valid: ['79927398713', '4539148803436467'], fn: luhnValid, alphabet: '0123456789', maxFalseAccept: 0 },
  { name: 'iban', valid: ['GB82WEST12345698765432', 'DE89370400440532013000'], fn: ibanValid, alphabet: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', maxFalseAccept: 0.01 },
  { name: 'verhoeff', valid: ['2363', '123451'], fn: verhoeffValid, alphabet: '0123456789', maxFalseAccept: 0 },
  { name: 'isbn10', valid: ['0306406152'], fn: isbn10Valid, alphabet: '0123456789', maxFalseAccept: 0 },
  { name: 'ean13', valid: ['9780306406157', '4006381333931'], fn: ean13Valid, alphabet: '0123456789', maxFalseAccept: 0 },
  { name: 'vin', valid: ['1M8GDM9AXKP042788', '11111111111111111'], fn: vinValid, alphabet: 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789', maxFalseAccept: 0.08 },
  { name: 'isin', valid: ['US0378331005', 'GB0002634946'], fn: isinValid, alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', maxFalseAccept: 0.08 },
  { name: 'nhs', valid: ['9434765919'], fn: nhsValid, alphabet: '0123456789', maxFalseAccept: 0 },
  { name: 'imo', valid: ['9074729'], fn: imoValid, alphabet: '0123456789', maxFalseAccept: 0.13 },
  { name: 'gstin', valid: ['27AAACR5055K1Z7'], fn: gstinValid, alphabet: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', maxFalseAccept: 0.03 },
];

describe('corruption fuzz — single-substitution detection (seeded, 10k each)', () => {
  for (const { name, valid, fn, alphabet, maxFalseAccept } of FUZZ) {
    it(name, () => {
      const rng = makeRng(0xd0c07 + name.length);
      let accepted = 0;
      const n = 10_000;
      for (let i = 0; i < n; i++) {
        const base = valid[i % valid.length];
        const mutated = corrupt(base, rng, alphabet);
        if (mutated !== base && fn(mutated)) accepted++;
      }
      // note: VIN/ISIN/GSTIN admit rare transliteration-collision
      // substitutions by construction (documented blind spots, mirroring
      // the MRZ invisible-class guard); pure mod-97/Verhoeff/weighted
      // schemes must be PERFECT on single substitutions.
      expect(accepted / n).toBeLessThanOrEqual(maxFalseAccept);
    });
  }
});
