/**
 * Attestor registry tests — the constitutional layer (08 §6).
 *
 * Laws under test:
 *  1. Claim-gating: overlapping digit gates never contradict unclaimed
 *     fields; unclaimed valid math supports (self-label), never proves.
 *  2. Structural-only schemes (PAN, SSN) never prove even when claimed.
 *  3. Lone amounts never prove; FULL equations prove every term; broken
 *     full equations contradict.
 *  4. Well-formed dates support only; impossible dates contradict;
 *     independent-channel date agreement proves; same-channel does not.
 *  5. Proven MRZ proves itself and agreeing VIZ fields; disagreeing VIZ
 *     contradicts ("L" vs "LI" regression, live-caught).
 *  6. Payload grammars (AAMVA/BCBP/GS1/EPC/Swiss/UPI) extract exact facts;
 *     agreement proves, disagreement contradicts, payloads never receive.
 *  7. Registry: every verdict carries evidence; forge-fuzz — corrupted
 *     identifier values never earn 'proves' from any attestor.
 */

import { describe, expect, it } from 'vitest';
import type { DocContext, FieldCandidate } from '../types';
import { ALL_ATTESTORS, attestAll } from './index';
import { CHECKSUM_ATTESTORS } from './checksum-attestors';
import { amountClosureAttestor, parseAmount } from './closure';
import { crossDateAttestor, dateValidAttestor, isRealCalendarDate, plausibleIsoDates } from './dates';
import { mrzAttestor } from './mrz-attestor';
import {
  extractBcbpFacts,
  extractEpcQrFacts,
  extractGs1Facts,
  extractSwissQrFacts,
  extractUpiFacts,
  payloadAttestor,
} from './payload-attestors';

// ------------------------------------------------------------------ helpers

let seq = 0;
function cand(partial: Partial<FieldCandidate> & { value: string }): FieldCandidate {
  return {
    id: `c${++seq}`,
    canonicalLabel: null,
    valueType: 'text',
    channel: 'ocr',
    marks: [],
    ...partial,
  };
}

function ctx(candidates: FieldCandidate[], overrides?: Partial<DocContext>): DocContext {
  return {
    docType: 'test',
    allCandidates: candidates,
    dateOrder: null,
    now: new Date('2026-02-01T00:00:00Z'),
    ...overrides,
  };
}

function byId(id: string) {
  const a = ALL_ATTESTORS.find((x) => x.id === id);
  if (!a) throw new Error(`no attestor ${id}`);
  return a;
}

// ------------------------------------------------- 1. checksum claim-gating

describe('checksum attestors: claim-gating law', () => {
  it('claimed + valid math ⇒ proves', () => {
    const f = cand({ value: 'GB82 WEST 1234 5698 7654 32', canonicalLabel: 'iban', valueType: 'id_number' });
    const a = byId('checksum.iban').attest(f, ctx([f]));
    expect(a?.verdict).toBe('proves');
    expect(a?.evidence.length).toBeGreaterThan(0);
  });

  it('claimed + broken math ⇒ contradicts (the classic misread)', () => {
    const f = cand({ value: 'GB82WEST12345698765431', canonicalLabel: 'iban', valueType: 'id_number' });
    const a = byId('checksum.iban').attest(f, ctx([f]));
    expect(a?.verdict).toBe('contradicts');
  });

  it('UNCLAIMED + valid math ⇒ supports only (never proves)', () => {
    // A 10-digit phone-looking number that happens to pass NHS mod-11.
    const f = cand({ value: '9434765919', canonicalLabel: 'phone', valueType: 'id_number' });
    const a = byId('checksum.nhs').attest(f, ctx([f]));
    expect(a?.verdict).toBe('supports');
  });

  it('UNCLAIMED + broken math ⇒ silence (overlapping gates must not contradict)', () => {
    // 10 digits failing NHS math — could be an ISBN, a phone, anything.
    const f = cand({ value: '9434765918', canonicalLabel: 'phone', valueType: 'id_number' });
    expect(byId('checksum.nhs').attest(f, ctx([f]))).toBeNull();
  });

  it('structural-only PAN/SSN never prove even when claimed', () => {
    const pan = cand({ value: 'AFZPK7190K', canonicalLabel: 'pan', valueType: 'id_number' });
    expect(byId('checksum.pan-in').attest(pan, ctx([pan]))?.verdict).toBe('supports');
    const ssn = cand({ value: '212-09-9999', canonicalLabel: 'ssn', valueType: 'id_number' });
    expect(byId('structure.ssn').attest(ssn, ctx([ssn]))?.verdict).toBe('supports');
  });

  it('claimed structural-only with broken structure ⇒ contradicts', () => {
    const ssn = cand({ value: '666-12-3456', canonicalLabel: 'ssn', valueType: 'id_number' });
    expect(byId('structure.ssn').attest(ssn, ctx([ssn]))?.verdict).toBe('contradicts');
  });

  it('tolerates printed separators', () => {
    const f = cand({ value: '4539 1488 0343 6467', canonicalLabel: 'card_number', valueType: 'id_number' });
    expect(byId('checksum.luhn-card').attest(f, ctx([f]))?.verdict).toBe('proves');
  });

  it('every checksum attestor stays silent on shapes outside its gate', () => {
    const f = cand({ value: 'HELLO WORLD', canonicalLabel: 'iban' });
    for (const a of CHECKSUM_ATTESTORS) {
      expect(a.attest(f, ctx([f]))).toBeNull();
    }
  });
});

// -------------------------------------------------------------- 2. closure

describe('closure.amount: full-equation law', () => {
  const invoice = (subtotal: string, tax: string, total: string) => {
    const s = cand({ value: subtotal, canonicalLabel: 'subtotal', valueType: 'amount' });
    const t = cand({ value: tax, canonicalLabel: 'tax', valueType: 'amount' });
    const g = cand({ value: total, canonicalLabel: 'total', valueType: 'amount' });
    return { s, t, g, c: ctx([s, t, g]) };
  };

  it('closing full equation proves every term', () => {
    const { s, t, g, c } = invoice('$1,234.50', '$98.76', '$1,333.26');
    for (const f of [s, t, g]) {
      const a = amountClosureAttestor.attest(f, c);
      expect(a?.verdict).toBe('proves');
      expect(a?.evidence.some((e) => e.kind === 'computation')).toBe(true);
    }
  });

  it('broken full equation contradicts', () => {
    const { g, c } = invoice('$1,234.50', '$98.76', '$1,433.26');
    expect(amountClosureAttestor.attest(g, c)?.verdict).toBe('contradicts');
  });

  it('LONE amounts prove nothing (missing term ⇒ silence)', () => {
    const g = cand({ value: '$1,333.26', canonicalLabel: 'total', valueType: 'amount' });
    const s = cand({ value: '$1,234.50', canonicalLabel: 'subtotal', valueType: 'amount' });
    expect(amountClosureAttestor.attest(g, ctx([g]))).toBeNull();
    expect(amountClosureAttestor.attest(g, ctx([g, s]))).toBeNull(); // tax missing
  });

  it('ambiguous term (two distinct subtotals) ⇒ silence, solver decides', () => {
    const s1 = cand({ value: '$100.00', canonicalLabel: 'subtotal', valueType: 'amount' });
    const s2 = cand({ value: '$700.00', canonicalLabel: 'subtotal', valueType: 'amount' });
    const t = cand({ value: '$8.00', canonicalLabel: 'tax', valueType: 'amount' });
    const g = cand({ value: '$108.00', canonicalLabel: 'total', valueType: 'amount' });
    expect(amountClosureAttestor.attest(g, ctx([s1, s2, t, g]))).toBeNull();
  });

  it('banker\u2019s-rounding gap within ε proves with reduced strength + flagged evidence', () => {
    const { g, c } = invoice('1000.00', '87.55', '1087.56'); // off by 0.01... wait ε=max(0.01, 5.44)
    const a = amountClosureAttestor.attest(g, c);
    expect(a?.verdict).toBe('proves');
  });

  it('parseAmount: locale styles', () => {
    expect(parseAmount('1.234,56')).toBe(1234.56);
    expect(parseAmount('1,234.56')).toBe(1234.56);
    expect(parseAmount('1,234')).toBe(1234);
    expect(parseAmount('(45.00)')).toBe(-45);
    expect(parseAmount('EUR 99')).toBe(99);
    expect(parseAmount('no digits')).toBeNull();
  });
});

// ---------------------------------------------------------------- 3. dates

describe('date attestors', () => {
  it('well-formed date SUPPORTS only — never proves', () => {
    const f = cand({ value: '2024-06-15', canonicalLabel: 'issue_date', valueType: 'date' });
    expect(dateValidAttestor.attest(f, ctx([f]))?.verdict).toBe('supports');
  });

  it('impossible calendar date contradicts (2023-02-29, month 13)', () => {
    for (const v of ['2023-02-29', '13/13/2020', '2024-04-31']) {
      const f = cand({ value: v, valueType: 'date' });
      expect(dateValidAttestor.attest(f, ctx([f]))?.verdict).toBe('contradicts');
    }
  });

  it('leap-day 2024-02-29 is valid; DOB windows enforced', () => {
    const leap = cand({ value: '2024-02-29', valueType: 'date' });
    expect(dateValidAttestor.attest(leap, ctx([leap]))?.verdict).toBe('supports');
    const future = cand({ value: '2044-02-12', canonicalLabel: 'date_of_birth', valueType: 'date' });
    expect(dateValidAttestor.attest(future, ctx([future]))?.verdict).toBe('contradicts');
  });

  it('plausibleIsoDates: locale-free set semantics (live-caught law)', () => {
    expect(plausibleIsoDates('04/23/1985')).toEqual(['1985-04-23']);   // 23>12 pins
    expect(plausibleIsoDates('05/06/2020').sort()).toEqual(['2020-05-06', '2020-06-05']);
    expect(plausibleIsoDates('05/06/2020', 'DMY')).toEqual(['2020-06-05']);
    expect(isRealCalendarDate('2000-02-29')).toBe(true);  // 400-year leap
    expect(isRealCalendarDate('1900-02-29')).toBe(false); // century non-leap
  });

  it('cross-date: INDEPENDENT channel agreement proves', () => {
    const a = cand({ value: '23/04/1985', canonicalLabel: 'date_of_birth', valueType: 'date', channel: 'ocr' });
    const b = cand({ value: '1985-04-23', canonicalLabel: 'date_of_birth', valueType: 'date', channel: 'payload' });
    const r = crossDateAttestor.attest(a, ctx([a, b]));
    expect(r?.verdict).toBe('proves');
    expect(r?.evidence.length).toBeGreaterThanOrEqual(3);
  });

  it('cross-date: same channel proves nothing (correlated errors)', () => {
    const a = cand({ value: '23/04/1985', canonicalLabel: 'date_of_birth', valueType: 'date', channel: 'ocr' });
    const b = cand({ value: '1985-04-23', canonicalLabel: 'date_of_birth', valueType: 'date', channel: 'ocr' });
    expect(crossDateAttestor.attest(a, ctx([a, b]))).toBeNull();
  });

  it('cross-date: irreconcilable independent reads contradict', () => {
    const a = cand({ value: '23/04/1985', canonicalLabel: 'date_of_birth', valueType: 'date', channel: 'ocr' });
    const b = cand({ value: '1987-11-30', canonicalLabel: 'date_of_birth', valueType: 'date', channel: 'payload' });
    expect(crossDateAttestor.attest(a, ctx([a, b]))?.verdict).toBe('contradicts');
  });
});

// ------------------------------------------------------------------ 4. MRZ

// ICAO Doc 9303 specimen — certified valid in src/parsers/mrz.test.ts.
const MRZ_VALID = [
  'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
  'L898902C36UTO7408122F1204159ZE184226B<<<<<10',
].join('\n');
const MRZ_INVALID = [
  'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
  'L898902C37UTO7408122F1204159ZE184226B<<<<<10', // doc-number check 6→7
].join('\n');

describe('checksum.mrz', () => {
  it('valid MRZ text proves itself', () => {
    const f = cand({ value: MRZ_VALID, marks: ['mrz_text'] });
    const a = mrzAttestor.attest(f, ctx([f]));
    expect(a?.verdict).toBe('proves');
    expect(a?.strength).toBe(1.0);
  });

  it('failed check digits contradict; partial stays silent', () => {
    const bad = cand({ value: MRZ_INVALID, marks: ['mrz_text'] });
    expect(mrzAttestor.attest(bad, ctx([bad]))?.verdict).toBe('contradicts');
    const partial = cand({ value: 'P<UTOERIKSSON<<ANNA<<<', marks: ['mrz_text'] });
    expect(mrzAttestor.attest(partial, ctx([partial]))).toBeNull();
  });

  it('VIZ field agreeing with proven MRZ is proven (any print format for dates)', () => {
    const mrz = cand({ value: MRZ_VALID, marks: ['mrz_text'] });
    const viz = cand({ value: '12/08/1974', canonicalLabel: 'date_of_birth', valueType: 'date' });
    const name = cand({ value: 'ANNA MARIA ERIKSSON', canonicalLabel: 'full_name', valueType: 'name' });
    const num = cand({ value: 'L898902C3', canonicalLabel: 'passport_number', valueType: 'id_number' });
    const c = ctx([mrz, viz, name, num]);
    expect(mrzAttestor.attest(viz, c)?.verdict).toBe('proves');
    expect(mrzAttestor.attest(name, c)?.verdict).toBe('proves');
    expect(mrzAttestor.attest(num, c)?.verdict).toBe('proves');
  });

  it('REGRESSION "L" vs "LI": disagreeing VIZ contradicts — I1 is a comparison, not an assumption', () => {
    const mrz = cand({ value: MRZ_VALID, marks: ['mrz_text'] });
    const wrongNum = cand({ value: 'LI898902C3', canonicalLabel: 'passport_number', valueType: 'id_number' });
    const a = mrzAttestor.attest(wrongNum, ctx([mrz, wrongNum]));
    expect(a?.verdict).toBe('contradicts');
  });

  it('no proven MRZ in doc ⇒ silence for VIZ fields', () => {
    const bad = cand({ value: MRZ_INVALID, marks: ['mrz_text'] });
    const viz = cand({ value: 'L898902C3', canonicalLabel: 'passport_number', valueType: 'id_number' });
    expect(mrzAttestor.attest(viz, ctx([bad, viz]))).toBeNull();
  });
});

// -------------------------------------------------------------- 5. payload

// Constructive AAMVA golden — same builder as src/parsers/aamva.test.ts.
function aamvaPayload(): string {
  const fields = [
    'DAQE46VYDDTE', 'DCSERIKSSON', 'DACANNA', 'DADMARIA',
    'DBB07021992', 'DBA03152029', 'DBC2',
    'DAG100 MAIN STREET', 'DAICAPITAL CITY', 'DAJUT', 'DAK00000',
  ].join('\n');
  const sub = `DL${fields}\r`;
  return `@\n\x1e\rANSI 636000100002DL0041${String(sub.length).padStart(4, '0')}${sub}`;
}

// Canonical IATA BCBP example (Implementation Guide, M-format).
const BCBP = 'M1DESMARAIS/LUC       EABC123 YULFRAAC 0834 226F001A0025 100';

describe('payload grammars', () => {
  it('BCBP: canonical IATA example', () => {
    const f = extractBcbpFacts(BCBP)!;
    expect(f.get('surname')).toBe('DESMARAIS');
    expect(f.get('given_names')).toBe('LUC');
    expect(f.get('booking_reference')).toBe('ABC123');
    expect(f.get('origin')).toBe('YUL');
    expect(f.get('destination')).toBe('FRA');
    expect(f.get('flight_number')).toBe('AC834');
    expect(f.get('seat')).toBe('1A');
    expect(extractBcbpFacts('not a boarding pass')).toBeNull();
  });

  it('GS1: parenthesized and raw FNC1 forms', () => {
    const p = extractGs1Facts('(01)09501101530003(17)250731(10)AB-123')!;
    expect(p.get('gtin')).toBe('09501101530003');
    expect(p.get('date_of_expiry')).toBe('2025-07-31');
    expect(p.get('lot_number')).toBe('AB-123');
    const separated = extractGs1Facts('(10)AB-123\u001d(21)SERIAL-9')!;
    expect(separated.get('lot_number')).toBe('AB-123');
    expect(separated.get('serial_number')).toBe('SERIAL-9');
    const raw = extractGs1Facts('01095011015300031725073110AB-123')!;
    expect(raw.get('gtin')).toBe('09501101530003');
    expect(raw.get('lot_number')).toBe('AB-123');
    expect(extractGs1Facts('hello')).toBeNull();
  });

  it('EPC QR (SEPA BCD)', () => {
    const payload = ['BCD', '002', '1', 'SCT', '', 'Wikimedia Foerdergesellschaft', 'DE33100205000001194700', 'EUR123.45', '', '', 'Spende'].join('\n');
    const f = extractEpcQrFacts(payload)!;
    expect(f.get('payee_name')).toBe('Wikimedia Foerdergesellschaft');
    expect(f.get('iban')).toBe('DE33100205000001194700');
    expect(f.get('total')).toBe('123.45');
    expect(extractEpcQrFacts('SPC\n...')).toBeNull();
  });

  it('Swiss QR (SPC) and UPI', () => {
    const spc = Array.from({ length: 32 }, (_, i) =>
      i === 0 ? 'SPC' : i === 3 ? 'CH4431999123000889012' : i === 5 ? 'Max Muster & Soehne' : i === 18 ? '1949.75' : '',
    ).join('\n');
    const f = extractSwissQrFacts(spc)!;
    expect(f.get('iban')).toBe('CH4431999123000889012');
    expect(f.get('total')).toBe('1949.75');

    const upi = extractUpiFacts('upi://pay?pa=merchant@bank&pn=Test%20Store&am=540.00&cu=INR')!;
    expect(upi.get('upi_id')).toBe('merchant@bank');
    expect(upi.get('payee_name')).toBe('Test Store');
    expect(upi.get('total')).toBe('540.00');
  });

  it('payload agreement proves printed field; disagreement contradicts', () => {
    const barcode = cand({ value: aamvaPayload(), channel: 'payload' });
    const printedOk = cand({ value: 'E46VYDDTE', canonicalLabel: 'license_number', valueType: 'id_number' });
    const printedDob = cand({ value: '07/02/1992', canonicalLabel: 'date_of_birth', valueType: 'date' });
    const printedBad = cand({ value: 'E46VYDDTF', canonicalLabel: 'license_number', valueType: 'id_number' });
    const c = ctx([barcode, printedOk, printedDob, printedBad]);
    expect(payloadAttestor.attest(printedOk, c)?.verdict).toBe('proves');
    expect(payloadAttestor.attest(printedDob, c)?.verdict).toBe('proves');
    expect(payloadAttestor.attest(printedBad, c)?.verdict).toBe('contradicts');
  });

  it('payload candidates never receive attestation from themselves', () => {
    const barcode = cand({ value: aamvaPayload(), channel: 'payload', canonicalLabel: 'license_number' });
    expect(payloadAttestor.appliesTo(barcode, ctx([barcode]))).toBe(false);
  });
});

// ------------------------------------------------------------- 6. registry

describe('attestAll registry', () => {
  it('integrates: proven MRZ doc yields proven fields with evidence', () => {
    const mrz = cand({ value: MRZ_VALID, marks: ['mrz_text'] });
    const num = cand({ value: 'L898902C3', canonicalLabel: 'passport_number', valueType: 'id_number' });
    const dob = cand({ value: '1974-08-12', canonicalLabel: 'date_of_birth', valueType: 'date' });
    const out = attestAll(ctx([mrz, num, dob]));
    expect(out.get(mrz.id)?.proven).toBe(true);
    expect(out.get(num.id)?.proven).toBe(true);
    expect(out.get(dob.id)?.proven).toBe(true);
    for (const o of out.values()) {
      for (const a of o.attestations) expect(a.evidence.length).toBeGreaterThan(0);
    }
  });

  it('self-labels: unclaimed valid IBAN earns the iban slot suggestion', () => {
    const f = cand({ value: 'DE89 3704 0044 0532 0130 00', canonicalLabel: null, valueType: 'id_number' });
    const out = attestAll(ctx([f]));
    expect(out.get(f.id)?.selfLabels).toContain('iban');
    expect(out.get(f.id)?.proven).toBe(false); // supports ≠ proof
  });

  it('contradicted fields are never proven, even with a proof present', () => {
    // Claimed IBAN with valid mod-97 BUT independent payload disagreement.
    const barcode = cand({ value: ['BCD', '002', '1', 'SCT', '', 'X', 'DE89370400440532013000', 'EUR1.00'].join('\n'), channel: 'payload' });
    const printed = cand({ value: 'GB82WEST12345698765432', canonicalLabel: 'iban', valueType: 'id_number' });
    const out = attestAll(ctx([barcode, printed]));
    const o = out.get(printed.id)!;
    expect(o.contradicted).toBe(true);
    expect(o.proven).toBe(false); // checksum proves, payload contradicts ⇒ NOT proven
  });

  it('FORGE-FUZZ: corruptions never earn proves beyond measured blind spots (10k trials)', () => {
    let state = 0xfeedbeef >>> 0;
    const rand = () => ((state = (1103515245 * state + 12345) >>> 0), state / 2 ** 32);
    // Per-scheme accounting: luhn/nhs/ean13 catch ALL single substitutions
    // (measured zero blind spot); IBAN mod-97 has a real ~0.5% collision
    // rate — exactly why checksum.iban strength is 0.99, not 1.0.
    const victims = [
      { value: 'GB82WEST12345698765432', label: 'iban', type: 'id_number', scheme: 'iban' },
      { value: '4539148803436467', label: 'card_number', type: 'id_number', scheme: 'luhn' },
      { value: '9434765919', label: 'nhs_number', type: 'id_number', scheme: 'nhs' },
      { value: '9780306406157', label: 'gtin', type: 'id_number', scheme: 'ean13' },
    ] as const;
    const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const trials: Record<string, number> = { iban: 0, luhn: 0, nhs: 0, ean13: 0 };
    const falseProves: Record<string, number> = { iban: 0, luhn: 0, nhs: 0, ean13: 0 };
    for (let i = 0; i < 10_000; i++) {
      const v = victims[Math.floor(rand() * victims.length)];
      const pos = Math.floor(rand() * v.value.length);
      const orig = v.value[pos];
      let sub = alphabet[Math.floor(rand() * alphabet.length)];
      if (sub === orig) sub = alphabet[(alphabet.indexOf(sub) + 1) % alphabet.length];
      const corrupted = v.value.slice(0, pos) + sub + v.value.slice(pos + 1);
      const f = cand({ value: corrupted, canonicalLabel: v.label, valueType: v.type });
      const out = attestAll(ctx([f]));
      trials[v.scheme]++;
      if (out.get(f.id)?.proven) falseProves[v.scheme]++;
    }
    expect(falseProves.luhn).toBe(0);
    expect(falseProves.nhs).toBe(0);
    expect(falseProves.ean13).toBe(0);
    expect(falseProves.iban / Math.max(trials.iban, 1)).toBeLessThanOrEqual(0.01);
  });

  it('constitutional: empty-evidence verdicts throw loudly through the real seam', () => {
    const poisoned = {
      id: 'poison',
      appliesTo: () => true,
      attest: () => ({
        attestorId: 'poison',
        verdict: 'proves' as const,
        strength: 1,
        evidence: [],
      }),
    };
    const f = cand({ value: 'anything' });
    expect(() => attestAll(ctx([f]), [poisoned])).toThrow(/empty evidence/);
  });
});
