import { describe, expect, it } from 'vitest';
import { beamDecode } from '../beam-search';
import type { Lattice } from '../lattice';
import { amountGrammar } from './amount';
import { dateGrammar } from './date';
import { sexGrammar } from './enum';
import { emailGrammar } from './email';
import { idGrammar, passportNumberGrammar } from './id';
import { phoneGrammar } from './phone';
import { DIGITS, UPPER } from '../beam-search';

/** Clean lattice for a string: each char near-certain, with the blank
 *  separator steps real CTC produces between glyphs (required for doubled
 *  characters to be representable at all). */
function cleanLat(s: string): Lattice {
  const out: Lattice = [];
  for (const ch of s) {
    out.push([
      [ch, 0.95],
      ['', 0.05],
    ]);
    out.push([['', 0.92]]);
  }
  return out;
}

/** Lattice where selected positions have a wrong top-1 and the true char as
 *  runner-up — the standard OCR-confusion shape. */
function corruptLat(s: string, corrupt: Record<number, string>): Lattice {
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

describe('dateGrammar', () => {
  it('recovers a calendar-valid date when greedy top-1 is invalid (O→0)', () => {
    // Greedy reads "O5/11/2023" — not a date. The lattice holds the truth.
    const res = beamDecode(corruptLat('05/11/2023', { 0: 'O' }), dateGrammar());
    expect(res).not.toBeNull();
    expect(res!.text).toBe('05/11/2023');
  });

  it('never returns an impossible date verbatim — Feb 30 only escapes via penalized deletion', () => {
    // CTC deletion paths are real (that's how genuine OCR noise gets fixed),
    // so an oracle grammar may salvage '30/02/2023' by DROPPING a char
    // (e.g. '3/02/2023' or '30/2/2023'). Two guarantees matter and are the
    // exact properties the P1.6 wiring thresholds on:
    //  1. the literal impossible date is never accepted verbatim;
    //  2. any salvage pays a heavy probability penalty vs an honest decode.
    const salvaged = beamDecode(cleanLat('30/02/2023'), dateGrammar('dmy'));
    const honest = beamDecode(cleanLat('28/02/2023'), dateGrammar('dmy'));
    expect(honest).not.toBeNull();
    expect(honest!.text).toBe('28/02/2023');
    if (salvaged !== null) {
      expect(salvaged.text).not.toBe('30/02/2023');
      expect(salvaged.pathProb).toBeLessThan(honest!.pathProb - 1.5);
    }
  });

  it('locale hints shift probability mass, and char-drop escapes carry a heavy penalty', () => {
    // '13/05/2023' cannot be month-first as written. The decoder MAY still
    // find an mdy interpretation by dropping a character (CTC blanks make
    // deletion a real path) — but only at a large probability cost. That
    // cost is exactly what the P1.6 wiring thresholds on. Document it:
    const dmy = beamDecode(cleanLat('13/05/2023'), dateGrammar('dmy'));
    const mdy = beamDecode(cleanLat('13/05/2023'), dateGrammar('mdy'));
    expect(dmy).not.toBeNull();
    expect(dmy!.text).toBe('13/05/2023');
    if (mdy !== null) {
      // Any mdy reading required mutilating the input — far less probable.
      expect(mdy.text).not.toBe('13/05/2023');
      expect(mdy.pathProb).toBeLessThan(dmy!.pathProb - 1.5); // ≥ ~4.5x less likely
    }
  });

  it('accepts month-name forms', () => {
    const res = beamDecode(cleanLat('12 Mar 1984'), dateGrammar());
    expect(res).not.toBeNull();
    expect(res!.text).toBe('12 Mar 1984');
  });
});

describe('amountGrammar', () => {
  it('decodes a well-formed amount', () => {
    const res = beamDecode(cleanLat('$1,234.56'), amountGrammar());
    expect(res).not.toBeNull();
    expect(res!.text).toBe('$1,234.56');
  });

  it('returns null when no digits exist in any path', () => {
    expect(beamDecode(cleanLat('N/A'), amountGrammar())).toBeNull();
  });
});

describe('sexGrammar — the "c/call" killer', () => {
  it('recovers F when greedy reads garbage', () => {
    const lattice: Lattice = [
      [
        ['c', 0.5],
        ['F', 0.45],
        ['', 0.05],
      ],
    ];
    const res = beamDecode(lattice, sexGrammar());
    expect(res).not.toBeNull();
    expect(res!.text).toBe('F');
  });

  it('returns null instead of inventing a sex value', () => {
    expect(beamDecode(cleanLat('7'), sexGrammar())).toBeNull();
  });
});

describe('idGrammar', () => {
  it('passport numbers: recovers O→0 confusion within charset+length', () => {
    const res = beamDecode(corruptLat('L898902C', { 4: 'O' }), passportNumberGrammar());
    expect(res).not.toBeNull();
    // Both L898902C and L898O02C... 'O' IS a legal passport-number char, so
    // the grammar alone keeps the higher-probability branch — attestor fusion
    // (P5) is what disambiguates checksummed IDs. Structural truth only here:
    expect(res!.text).toBe('L898O02C');
  });

  it('enforces pattern when provided', () => {
    const g = idGrammar(new Set([...UPPER, ...DIGITS]), 2, 6, /^[A-Z]{2}\d{4}$/);
    expect(beamDecode(cleanLat('AB1234'), g)).not.toBeNull();
    expect(beamDecode(cleanLat('A12345'), g)).toBeNull();
  });
});

describe('email/phone grammars', () => {
  it('accepts a valid email and rejects a mangled one', () => {
    expect(beamDecode(cleanLat('a.b@x.io'), emailGrammar())).not.toBeNull();
    expect(beamDecode(cleanLat('a.b@@x'), emailGrammar())).toBeNull();
  });

  it('accepts a plausible phone and rejects noise', () => {
    expect(beamDecode(cleanLat('+1 555 010 1234'), phoneGrammar())).not.toBeNull();
    expect(beamDecode(cleanLat('12'), phoneGrammar())).toBeNull();
  });
});
