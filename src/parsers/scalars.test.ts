/**
 * @file scalars.test.ts
 *
 * Thorough unit tests for the deterministic scalar parsers in `scalars.ts`.
 */

import { describe, it, expect } from 'vitest';
import {
  parseDate,
  isExpiryAfterIssue,
  parseAmount,
  normalizeId,
  matchesIdPattern,
  isValidEmail,
  isPlausiblePhone,
} from './scalars';

/* -------------------------------------------------------------------------- */
/*  parseDate                                                                 */
/* -------------------------------------------------------------------------- */

describe('parseDate — unambiguous year-first (ymd)', () => {
  it('parses YYYY-MM-DD', () => {
    const r = parseDate('2023-05-09');
    expect(r.valid).toBe(true);
    expect(r.ambiguous).toBe(false);
    expect(r.iso).toBe('2023-05-09');
    expect(r.candidates).toEqual(['2023-05-09']);
    expect(r.raw).toBe('2023-05-09');
  });

  it('parses YYYY.MM.DD', () => {
    const r = parseDate('2023.05.09');
    expect(r.iso).toBe('2023-05-09');
    expect(r.ambiguous).toBe(false);
  });

  it('parses YYYY/MM/DD', () => {
    const r = parseDate('2023/05/09');
    expect(r.iso).toBe('2023-05-09');
    expect(r.valid).toBe(true);
  });

  it('zero-pads single-digit month/day', () => {
    expect(parseDate('2023-1-2').iso).toBe('2023-01-02');
  });
});

describe('parseDate — ambiguous numeric year-last', () => {
  it('flags 01/02/1999 as ambiguous with two candidates and no iso', () => {
    const r = parseDate('01/02/1999');
    expect(r.valid).toBe(true);
    expect(r.ambiguous).toBe(true);
    expect(r.iso).toBeUndefined();
    expect(r.candidates).toEqual(['1999-01-02', '1999-02-01']);
  });

  it('resolves 01/02/1999 with locale dmy to 1999-02-01', () => {
    const r = parseDate('01/02/1999', 'dmy');
    expect(r.ambiguous).toBe(false);
    expect(r.iso).toBe('1999-02-01');
    expect(r.candidates).toEqual(['1999-02-01']);
  });

  it('resolves 01/02/1999 with locale mdy to 1999-01-02', () => {
    const r = parseDate('01/02/1999', 'mdy');
    expect(r.ambiguous).toBe(false);
    expect(r.iso).toBe('1999-01-02');
  });

  it('disambiguates 25/12/2020 by day > 12 to 2020-12-25', () => {
    const r = parseDate('25/12/2020');
    expect(r.ambiguous).toBe(false);
    expect(r.valid).toBe(true);
    expect(r.iso).toBe('2020-12-25');
    expect(r.candidates).toEqual(['2020-12-25']);
  });

  it('disambiguates 12/25/2020 by day > 12 to 2020-12-25', () => {
    const r = parseDate('12/25/2020');
    expect(r.ambiguous).toBe(false);
    expect(r.iso).toBe('2020-12-25');
  });

  it('handles DD-MM-YYYY separator', () => {
    expect(parseDate('25-12-2020').iso).toBe('2020-12-25');
  });

  it('handles DD.MM.YYYY separator', () => {
    expect(parseDate('25.12.2020').iso).toBe('2020-12-25');
  });

  it('treats equal day/month (05/05/1999) as a single candidate, not ambiguous', () => {
    const r = parseDate('05/05/1999');
    expect(r.ambiguous).toBe(false);
    expect(r.iso).toBe('1999-05-05');
    expect(r.candidates).toEqual(['1999-05-05']);
  });
});

describe('parseDate — calendar validation', () => {
  it('rejects 2023-02-30', () => {
    const r = parseDate('2023-02-30');
    expect(r.valid).toBe(false);
    expect(r.iso).toBeUndefined();
    expect(r.reason).toBeDefined();
  });

  it('rejects month 13', () => {
    expect(parseDate('2023-13-01').valid).toBe(false);
  });

  it('rejects April 31', () => {
    expect(parseDate('2023-04-31').valid).toBe(false);
  });

  it('accepts leap-year Feb 29 (2020)', () => {
    const r = parseDate('2020-02-29');
    expect(r.valid).toBe(true);
    expect(r.iso).toBe('2020-02-29');
  });

  it('rejects non-leap Feb 29 (2021)', () => {
    expect(parseDate('2021-02-29').valid).toBe(false);
  });

  it('rejects a date where neither numeric interpretation is valid', () => {
    // 13/13/2020: month 13 invalid in both orders.
    expect(parseDate('13/13/2020').valid).toBe(false);
  });
});

describe('parseDate — month-name formats', () => {
  it('parses "15 Jan 1990"', () => {
    const r = parseDate('15 Jan 1990');
    expect(r.valid).toBe(true);
    expect(r.ambiguous).toBe(false);
    expect(r.iso).toBe('1990-01-15');
  });

  it('parses "15 January 1990" (full name)', () => {
    expect(parseDate('15 January 1990').iso).toBe('1990-01-15');
  });

  it('parses "Jan 15, 1990" (MMM DD, YYYY)', () => {
    expect(parseDate('Jan 15, 1990').iso).toBe('1990-01-15');
  });

  it('parses "January 15, 1990"', () => {
    expect(parseDate('January 15, 1990').iso).toBe('1990-01-15');
  });

  it('parses an abbreviation with a trailing period "15 Jan. 1990"', () => {
    expect(parseDate('15 Jan. 1990').iso).toBe('1990-01-15');
  });

  it('rejects an unknown month name', () => {
    expect(parseDate('15 Foo 1990').valid).toBe(false);
  });

  it('rejects an impossible month-name date "31 Feb 1990"', () => {
    expect(parseDate('31 Feb 1990').valid).toBe(false);
  });
});

describe('parseDate — bare 6 digits and junk', () => {
  it('rejects bare 6 digits for general parsing', () => {
    const r = parseDate('991231');
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('6-digit');
  });

  it('accepts bare 6 digits as YYMMDD only when locale is ymd', () => {
    const r = parseDate('991231', 'ymd');
    expect(r.valid).toBe(true);
    expect(r.iso).toBe('2099-12-31');
  });

  it('rejects an invalid YYMMDD even with ymd locale', () => {
    expect(parseDate('990230', 'ymd').valid).toBe(false);
  });

  it('rejects empty input', () => {
    expect(parseDate('').valid).toBe(false);
  });

  it('rejects unrecognized formats', () => {
    expect(parseDate('not a date').valid).toBe(false);
  });

  it('always preserves the raw input', () => {
    expect(parseDate('  weird  ').raw).toBe('  weird  ');
  });

  it('never throws on arbitrary input', () => {
    expect(() => parseDate('@@@///')).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/*  isExpiryAfterIssue                                                        */
/* -------------------------------------------------------------------------- */

describe('isExpiryAfterIssue', () => {
  it('returns true when expiry is after issue', () => {
    expect(isExpiryAfterIssue('2020-01-01', '2025-01-01')).toBe(true);
  });

  it('returns false when expiry is before issue', () => {
    expect(isExpiryAfterIssue('2025-01-01', '2020-01-01')).toBe(false);
  });

  it('returns false when the dates are equal', () => {
    expect(isExpiryAfterIssue('2025-01-01', '2025-01-01')).toBe(false);
  });

  it('compares within the same year correctly', () => {
    expect(isExpiryAfterIssue('2025-01-01', '2025-12-31')).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  parseAmount                                                               */
/* -------------------------------------------------------------------------- */

describe('parseAmount', () => {
  it('parses 1,200.00 (comma thousands) and defaults currency to USD', () => {
    const r = parseAmount('1,200.00');
    expect(r.valid).toBe(true);
    expect(r.value).toBe(1200);
    expect(r.currency).toBe('USD');
    expect(r.negative).toBe(false);
    expect(r.raw).toBe('1,200.00');
  });

  it('parses $1,200.00 with USD symbol', () => {
    const r = parseAmount('$1,200.00');
    expect(r.value).toBe(1200);
    expect(r.currency).toBe('USD');
  });

  it('parses ₹1,200.00 with INR symbol', () => {
    const r = parseAmount('₹1,200.00');
    expect(r.value).toBe(1200);
    expect(r.currency).toBe('INR');
  });

  it('parses €1.234,56 with EUR symbol and European separators', () => {
    const r = parseAmount('€1.234,56');
    expect(r.value).toBe(1234.56);
    expect(r.currency).toBe('EUR');
  });

  it('parses £999.99 with GBP symbol', () => {
    const r = parseAmount('£999.99');
    expect(r.value).toBe(999.99);
    expect(r.currency).toBe('GBP');
  });

  it('parses 1.200,00 (European dot-thousands) to 1200', () => {
    const r = parseAmount('1.200,00');
    expect(r.value).toBe(1200);
    expect(r.valid).toBe(true);
  });

  it('treats (1200.00) as negative', () => {
    const r = parseAmount('(1200.00)');
    expect(r.negative).toBe(true);
    expect(r.value).toBe(-1200);
    expect(r.valid).toBe(true);
  });

  it('parses -50.5 as a negative decimal', () => {
    const r = parseAmount('-50.5');
    expect(r.negative).toBe(true);
    expect(r.value).toBe(-50.5);
  });

  it('treats a single comma with non-3 trailing digits as a decimal (1,2 -> 1.2)', () => {
    expect(parseAmount('1,2').value).toBe(1.2);
  });

  it('treats a single comma with 3 trailing digits as thousands (1,200 -> 1200)', () => {
    expect(parseAmount('1,200').value).toBe(1200);
  });

  it('handles multiple thousands separators (1,200,000 -> 1200000)', () => {
    expect(parseAmount('1,200,000').value).toBe(1200000);
  });

  it('detects an explicit ISO currency code', () => {
    const r = parseAmount('USD 1,200.00');
    expect(r.currency).toBe('USD');
    expect(r.value).toBe(1200);
  });

  it('returns valid:false for non-numeric input', () => {
    const r = parseAmount('abc');
    expect(r.valid).toBe(false);
    expect(r.value).toBeUndefined();
    expect(r.reason).toBeDefined();
  });

  it('preserves the raw input and never throws', () => {
    expect(() => parseAmount('???')).not.toThrow();
    expect(parseAmount('???').raw).toBe('???');
  });
});

/* -------------------------------------------------------------------------- */
/*  normalizeId / matchesIdPattern                                            */
/* -------------------------------------------------------------------------- */

describe('normalizeId', () => {
  it('uppercases, strips spaces and hyphens: "a1 23-45" -> "A12345"', () => {
    const r = normalizeId('a1 23-45');
    expect(r.normalized).toBe('A12345');
    expect(r.changed).toBe(true);
    expect(r.raw).toBe('a1 23-45');
  });

  it('strips dots as well', () => {
    expect(normalizeId('A.B.1.2').normalized).toBe('AB12');
  });

  it('reports changed:false when already normalized', () => {
    const r = normalizeId('ABC123');
    expect(r.normalized).toBe('ABC123');
    expect(r.changed).toBe(false);
  });
});

describe('matchesIdPattern', () => {
  it('matches a normalized value against a pattern', () => {
    expect(matchesIdPattern('a 1234567', /^[A-Z]\d{7}$/)).toBe(true);
  });

  it('returns false when the normalized value does not match', () => {
    expect(matchesIdPattern('ab123', /^[A-Z]\d{7}$/)).toBe(false);
  });

  it('is deterministic with a global-flagged pattern across calls', () => {
    const pattern = /^[A-Z]\d{7}$/g;
    expect(matchesIdPattern('A1234567', pattern)).toBe(true);
    expect(matchesIdPattern('A1234567', pattern)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  isValidEmail                                                              */
/* -------------------------------------------------------------------------- */

describe('isValidEmail', () => {
  it('accepts a typical address', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
  });

  it('accepts subdomains', () => {
    expect(isValidEmail('a.b@mail.example.co')).toBe(true);
  });

  it('rejects an address with no @', () => {
    expect(isValidEmail('userexample.com')).toBe(false);
  });

  it('rejects an address with two @', () => {
    expect(isValidEmail('user@@example.com')).toBe(false);
  });

  it('rejects an empty local part', () => {
    expect(isValidEmail('@example.com')).toBe(false);
  });

  it('rejects an empty domain', () => {
    expect(isValidEmail('user@')).toBe(false);
  });

  it('rejects a domain without a dot', () => {
    expect(isValidEmail('user@example')).toBe(false);
  });

  it('rejects whitespace', () => {
    expect(isValidEmail('user @example.com')).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*  isPlausiblePhone                                                          */
/* -------------------------------------------------------------------------- */

describe('isPlausiblePhone', () => {
  it('accepts a 10-digit number', () => {
    expect(isPlausiblePhone('1234567890')).toBe(true);
  });

  it('accepts a number with separators', () => {
    expect(isPlausiblePhone('(123) 456-7890')).toBe(true);
  });

  it('accepts an international number with leading +', () => {
    expect(isPlausiblePhone('+1 415 555 2671')).toBe(true);
  });

  it('accepts the minimum of 7 digits', () => {
    expect(isPlausiblePhone('123-4567')).toBe(true);
  });

  it('accepts the maximum of 15 digits', () => {
    expect(isPlausiblePhone('+123456789012345')).toBe(true);
  });

  it('rejects fewer than 7 digits', () => {
    expect(isPlausiblePhone('123456')).toBe(false);
  });

  it('rejects more than 15 digits', () => {
    expect(isPlausiblePhone('1234567890123456')).toBe(false);
  });

  it('rejects letters', () => {
    expect(isPlausiblePhone('123-ABC-7890')).toBe(false);
  });

  it('rejects a + that is not leading', () => {
    expect(isPlausiblePhone('123+4567')).toBe(false);
  });
});
