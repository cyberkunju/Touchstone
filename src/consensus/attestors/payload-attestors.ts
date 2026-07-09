/**
 * Payload attestors (08 §6 #3-8) — machine-decoded payload vs printed field.
 *
 * A barcode/QR payload is exact BY CONSTRUCTION (checksummed symbology
 * decode). When a payload field agrees with an OCR/template candidate for
 * the same canonical label, the printed value is cross-channel PROVEN.
 * When it disagrees, that is a hard contradiction — barcodes don't misread.
 *
 * Structured payload grammars handled:
 *  - AAMVA PDF417 (US/CA licenses) via the certified parseAamva.
 *  - IATA BCBP (boarding passes) — M-format inline parse.
 *  - GS1-128 / GS1 DataMatrix AIs — (01) GTIN, (17) expiry, (10) lot, (21) serial.
 *  - EPC QR (SEPA credit transfer) — BCD grammar: IBAN, amount, name.
 *  - Swiss QR-bill — SPC grammar: IBAN, amount, creditor.
 *  - UPI QR — upi://pay query params: pa (VPA), am (amount), pn (name).
 *
 * Each grammar yields (canonicalLabel → exact value) pairs; the shared
 * matcher does normalization-aware equality (dates via ISO, amounts via
 * numeric compare, ids via separator-stripped uppercase).
 */

import { parseAamva } from '../../parsers/aamva';
import { stripSeparators } from './checksums';
import { parseAmount } from './closure';
import type { Attestation, Attestor, DocContext, FieldCandidate } from '../types';

/** label → exact value extracted from one decoded payload. */
export type PayloadFacts = ReadonlyMap<string, string>;

// ---------------------------------------------------------------- grammars

export function extractAamvaFacts(payload: string): PayloadFacts | null {
  const parsed = parseAamva(payload);
  if (!parsed.isAamva) return null;
  const m = new Map<string, string>();
  const f = parsed.fields;
  if (f.documentNumber) m.set('document_number', f.documentNumber);
  if (f.documentNumber) m.set('license_number', f.documentNumber);
  if (f.surname) m.set('surname', f.surname);
  if (f.givenNames) m.set('given_names', f.givenNames);
  if (f.surname && f.givenNames) m.set('full_name', `${f.givenNames} ${f.surname}`);
  if (f.dateOfBirth) m.set('date_of_birth', f.dateOfBirth);
  if (f.expiryDate) m.set('date_of_expiry', f.expiryDate);
  if (f.sex) m.set('sex', f.sex);
  if (f.address) m.set('address', f.address);
  return m.size > 0 ? m : null;
}

/** IATA BCBP 'M' format (Resolution 792): fixed-offset mandatory items. */
export function extractBcbpFacts(payload: string): PayloadFacts | null {
  if (!/^M\d/.test(payload) || payload.length < 58) return null;
  const name = payload.slice(2, 22).trim();          // NAME (surname/given)
  const pnr = payload.slice(23, 30).trim();          // operating carrier PNR
  const from = payload.slice(30, 33).trim();
  const to = payload.slice(33, 36).trim();
  const carrier = payload.slice(36, 39).trim();
  const flight = payload.slice(39, 44).trim();
  const seat = payload.slice(48, 52).trim().replace(/^0+(?=\d)/, '');
  const m = new Map<string, string>();
  if (name.includes('/')) {
    const [surname, given] = name.split('/');
    m.set('surname', surname.trim());
    if (given) m.set('given_names', given.trim());
    m.set('full_name', `${(given ?? '').trim()} ${surname.trim()}`.trim());
  } else if (name) {
    m.set('full_name', name);
  }
  if (pnr) m.set('booking_reference', pnr);
  if (/^[A-Z]{3}$/.test(from)) m.set('origin', from);
  if (/^[A-Z]{3}$/.test(to)) m.set('destination', to);
  if (carrier && flight) m.set('flight_number', `${carrier}${flight.replace(/^0+/, '')}`);
  if (seat) m.set('seat', seat);
  return m.size > 0 ? m : null;
}

/** GS1 Application Identifiers from a FNC1-decoded string (AIs in parens or
 *  with ASCII 29 group separators). */
export function extractGs1Facts(payload: string): PayloadFacts | null {
  const m = new Map<string, string>();
  // Parenthesized human-readable form: (01)09501101530003(17)250731(10)AB12
  const paren = /\((\d{2,4})\)([^(]*)/g;
  let matched = false;
  let g: RegExpExecArray | null;
  while ((g = paren.exec(payload)) !== null) {
    matched = true;
    applyGs1Ai(m, g[1], g[2].split('\u001d').join('').trim());
  }
  if (!matched) {
    // Raw FNC1 form: parse fixed-length AIs greedily.
    let rest = payload.replace(/^\]C1|^\]d2|^\]Q3/, '');
    while (rest.length >= 2) {
      const ai2 = rest.slice(0, 2);
      if (ai2 === '01' && rest.length >= 16) { applyGs1Ai(m, '01', rest.slice(2, 16)); rest = rest.slice(16); matched = true; continue; }
      if (ai2 === '17' && rest.length >= 8) { applyGs1Ai(m, '17', rest.slice(2, 8)); rest = rest.slice(8); matched = true; continue; }
      if (ai2 === '10' || ai2 === '21') {
        const gs = rest.indexOf('\u001d');
        const val = gs >= 0 ? rest.slice(2, gs) : rest.slice(2);
        applyGs1Ai(m, ai2, val);
        rest = gs >= 0 ? rest.slice(gs + 1) : '';
        matched = true;
        continue;
      }
      break;
    }
  }
  return matched && m.size > 0 ? m : null;
}

function applyGs1Ai(m: Map<string, string>, ai: string, value: string): void {
  if (ai === '01' && /^\d{14}$/.test(value)) m.set('gtin', value);
  else if (ai === '17' && /^\d{6}$/.test(value)) {
    const yy = Number(value.slice(0, 2));
    const century = yy >= 51 ? '19' : '20'; // GS1 general spec window
    const dd = value.slice(4, 6) === '00' ? '01' : value.slice(4, 6); // 00 = end of month; approximate as 01 is WRONG — keep month precision only
    if (value.slice(4, 6) !== '00') m.set('date_of_expiry', `${century}${value.slice(0, 2)}-${value.slice(2, 4)}-${dd}`);
  } else if (ai === '10' && value) m.set('lot_number', value);
  else if (ai === '21' && value) m.set('serial_number', value);
}

/** EPC QR (SEPA): line-oriented BCD grammar. */
export function extractEpcQrFacts(payload: string): PayloadFacts | null {
  const lines = payload.split(/\r?\n/);
  if (lines[0]?.trim() !== 'BCD') return null;
  const m = new Map<string, string>();
  const name = lines[5]?.trim();
  const iban = lines[6]?.trim();
  const amount = lines[7]?.trim();
  if (name) m.set('payee_name', name);
  if (iban && /^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) m.set('iban', iban);
  if (amount?.startsWith('EUR')) m.set('total', amount.slice(3));
  const remittance = lines[9]?.trim() || lines[10]?.trim();
  if (remittance) m.set('payment_reference', remittance);
  return m.size > 0 ? m : null;
}

/** Swiss QR-bill: SPC grammar (fixed line positions per v2 spec). */
export function extractSwissQrFacts(payload: string): PayloadFacts | null {
  const lines = payload.split(/\r?\n/);
  if (lines[0]?.trim() !== 'SPC') return null;
  const m = new Map<string, string>();
  const iban = lines[3]?.trim();
  if (iban && /^(CH|LI)\d{2}[A-Z0-9]+$/.test(iban)) m.set('iban', iban);
  const creditor = lines[5]?.trim();
  if (creditor) m.set('payee_name', creditor);
  const amount = lines[18]?.trim();
  if (amount && /^\d+(\.\d{1,2})?$/.test(amount)) m.set('total', amount);
  return m.size > 0 ? m : null;
}

/** UPI QR: upi://pay?pa=...&pn=...&am=... */
export function extractUpiFacts(payload: string): PayloadFacts | null {
  if (!payload.toLowerCase().startsWith('upi://pay')) return null;
  const qs = payload.slice(payload.indexOf('?') + 1);
  const params = new Map<string, string>();
  for (const pair of qs.split('&')) {
    const eq = pair.indexOf('=');
    if (eq > 0) params.set(pair.slice(0, eq).toLowerCase(), decodeURIComponent(pair.slice(eq + 1)));
  }
  const m = new Map<string, string>();
  const pa = params.get('pa');
  const pn = params.get('pn');
  const am = params.get('am');
  if (pa) m.set('upi_id', pa);
  if (pn) m.set('payee_name', pn);
  if (am) m.set('total', am);
  return m.size > 0 ? m : null;
}

const GRAMMARS: ReadonlyArray<{ name: string; extract: (p: string) => PayloadFacts | null }> = [
  { name: 'aamva', extract: extractAamvaFacts },
  { name: 'bcbp', extract: extractBcbpFacts },
  { name: 'epc-qr', extract: extractEpcQrFacts },
  { name: 'swiss-qr', extract: extractSwissQrFacts },
  { name: 'upi-qr', extract: extractUpiFacts },
  { name: 'gs1', extract: extractGs1Facts },
];

// ---------------------------------------------------------------- matching

/** Normalization-aware equality between a payload fact and a printed value. */
export function factAgrees(label: string, printed: string, fact: string): boolean {
  if (label.includes('date')) {
    // Set semantics (canonDates law): agree when ANY plausible locale
    // reading of the print equals the exact payload date.
    return plausibleIsoReadings(printed).includes(fact);
  }
  if (label === 'total' || label.includes('amount')) {
    const a = parseAmount(printed);
    const b = parseAmount(fact);
    return a !== null && b !== null && Math.abs(a - b) < 0.005;
  }
  if (label.includes('name')) {
    return normName(printed) === normName(fact);
  }
  return stripSeparators(printed).toUpperCase() === stripSeparators(fact).toUpperCase();
}

function normName(s: string): string {
  return s.toUpperCase().replace(/['’\-,.]/g, ' ').replace(/\s+/g, ' ').trim();
}

function plausibleIsoReadings(printed: string): string[] {
  const out: string[] = [];
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(printed);
  if (iso) out.push(iso[0]);
  const m = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/.exec(printed);
  if (m) {
    const [, a, b, y] = m;
    if (Number(a) <= 12) out.push(`${y}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`); // MDY
    if (Number(b) <= 12) out.push(`${y}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`); // DMY
  }
  return out;
}

/** Decode all payload candidates in the doc once; cache per-ctx via WeakMap. */
const factsCache = new WeakMap<readonly FieldCandidate[], Array<{ sourceId: string; grammar: string; facts: PayloadFacts }>>();

function docFacts(ctx: DocContext): Array<{ sourceId: string; grammar: string; facts: PayloadFacts }> {
  const cached = factsCache.get(ctx.allCandidates);
  if (cached) return cached;
  const out: Array<{ sourceId: string; grammar: string; facts: PayloadFacts }> = [];
  for (const c of ctx.allCandidates) {
    if (c.channel !== 'payload' && !c.marks.includes('barcode_payload')) continue;
    for (const g of GRAMMARS) {
      const facts = g.extract(c.value);
      if (facts) {
        out.push({ sourceId: c.id, grammar: g.name, facts });
        break; // first matching grammar wins — grammars are mutually exclusive
      }
    }
  }
  factsCache.set(ctx.allCandidates, out);
  return out;
}

export const payloadAttestor: Attestor = {
  id: 'payload.cross-channel',

  appliesTo(field: FieldCandidate, ctx: DocContext): boolean {
    if (field.channel === 'payload') return false; // payloads witness, not receive
    if (field.canonicalLabel === null) return false;
    return docFacts(ctx).some((d) => d.facts.has(field.canonicalLabel!));
  },

  attest(field: FieldCandidate, ctx: DocContext): Attestation | null {
    const label = field.canonicalLabel;
    if (label === null) return null;
    for (const d of docFacts(ctx)) {
      const fact = d.facts.get(label);
      if (fact === undefined) continue;
      if (factAgrees(label, field.value, fact)) {
        return {
          attestorId: this.id,
          verdict: 'proves',
          strength: 0.99,
          evidence: [
            { kind: 'candidate', ref: d.sourceId, note: `${d.grammar} payload` },
            { kind: 'payload_field', ref: `${d.grammar}.${label} = "${fact}"` },
            { kind: 'computation', ref: `printed "${field.value}" agrees with decoded payload` },
          ],
        };
      }
      return {
        attestorId: this.id,
        verdict: 'contradicts',
        strength: 0.97,
        evidence: [
          { kind: 'candidate', ref: d.sourceId, note: `${d.grammar} payload` },
          { kind: 'payload_field', ref: `${d.grammar}.${label} = "${fact}"` },
          { kind: 'computation', ref: `printed "${field.value}" ≠ decoded payload`, note: 'barcodes decode exactly — the printed read is suspect' },
        ],
      };
    }
    return null;
  },
};
