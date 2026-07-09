/**
 * MRZ attestor (08 §6 #1) — the strongest single-source proof in the system.
 *
 * Wraps the certified parseMrz (checksum-guided, ICAO 9303). Only
 * status === 'valid' MRZ (EVERY applicable check digit passes) proves — the
 * mrzProven law from the certified engine. 'partial' supports nothing here;
 * 'invalid' contradicts the fields the failing digits guard.
 *
 * A proven MRZ radiates proof onto sibling candidates whose canonical label
 * maps to an MRZ field and whose normalized value AGREES — this is
 * mrzWitnessAgrees (I1 as a real comparison, live-caught: "L" vs "LI").
 */

import { parseMrz } from '../../parsers/mrz';
import type { MrzFields } from '../../parsers/mrz';
import type { Attestation, Attestor, DocContext, FieldCandidate } from '../types';

/** Canonical label → MRZ field extractor. */
const MRZ_FIELD_MAP: Record<string, (f: MrzFields) => string | undefined> = {
  passport_number: (f) => f.documentNumber,
  document_number: (f) => f.documentNumber,
  date_of_birth: (f) => f.dateOfBirth,
  date_of_expiry: (f) => f.expiryDate,
  nationality: (f) => f.nationality,
  issuing_country: (f) => f.issuingCountry,
  sex: (f) => f.sex,
  surname: (f) => f.surname,
  given_names: (f) => f.givenNames,
  full_name: (f) =>
    f.surname || f.givenNames ? `${f.surname ?? ''} ${f.givenNames ?? ''}`.trim() : undefined,
};

/** Name-grade normalization: uppercase, strip apostrophes/hyphens/commas,
 *  collapse whitespace. EXACT equality after that — never fuzzy. */
export function mrzNormalize(s: string): string {
  return s.toUpperCase().replace(/['’\-,]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Does `value` agree with the MRZ witness for `label`? full_name accepts
 *  either ordering (surname-first or given-first). Unknown ≠ agreed. */
export function mrzAgrees(label: string, value: string, fields: MrzFields): boolean {
  const extract = MRZ_FIELD_MAP[label];
  if (!extract) return false;
  const witness = extract(fields);
  if (!witness) return false;
  const v = mrzNormalize(value);
  const w = mrzNormalize(witness);
  if (v === w) return true;
  if (label === 'full_name' && fields.surname && fields.givenNames) {
    const a = mrzNormalize(`${fields.surname} ${fields.givenNames}`);
    const b = mrzNormalize(`${fields.givenNames} ${fields.surname}`);
    return v === a || v === b;
  }
  if (label === 'date_of_birth' || label === 'date_of_expiry') {
    // Set semantics (canonDates law): the print agrees when ANY plausible
    // locale reading equals the proven MRZ ISO date — the MRZ pins the
    // interpretation of an otherwise-ambiguous print like "12/08/1974".
    return plausibleReadings(value).includes(witness);
  }
  return false;
}

function plausibleReadings(value: string): string[] {
  const out: string[] = [];
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) out.push(iso[0]);
  const m = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/.exec(value);
  if (m) {
    const [, a, b, y] = m;
    if (Number(a) <= 12) out.push(`${y}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`); // MDY
    if (Number(b) <= 12) out.push(`${y}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`); // DMY
  }
  return out;
}

/** Find the proven MRZ in the document, if any (parse once per doc). */
function findProvenMrz(ctx: DocContext): { fields: MrzFields; sourceId: string } | null {
  for (const c of ctx.allCandidates) {
    if (!c.marks.includes('mrz_text') && c.canonicalLabel !== 'mrz') continue;
    const parsed = parseMrz(c.value);
    if (parsed.status === 'valid') return { fields: parsed.fields, sourceId: c.id };
  }
  return null;
}

export const mrzAttestor: Attestor = {
  id: 'checksum.mrz',

  appliesTo(field: FieldCandidate, ctx: DocContext): boolean {
    if (field.marks.includes('mrz_text') || field.canonicalLabel === 'mrz') return true;
    return (
      field.canonicalLabel !== null &&
      field.canonicalLabel in MRZ_FIELD_MAP &&
      ctx.allCandidates.some((c) => c.marks.includes('mrz_text') || c.canonicalLabel === 'mrz')
    );
  },

  attest(field: FieldCandidate, ctx: DocContext): Attestation | null {
    // Case 1: the field IS the MRZ text.
    if (field.marks.includes('mrz_text') || field.canonicalLabel === 'mrz') {
      const parsed = parseMrz(field.value);
      if (parsed.status === 'valid') {
        return {
          attestorId: this.id,
          verdict: 'proves',
          strength: 1.0,
          evidence: [{
            kind: 'computation',
            ref: `all ${parsed.checkDigits.length} ICAO check digits pass (${parsed.format})`,
          }],
        };
      }
      if (parsed.status === 'invalid') {
        const failed = parsed.checkDigits.filter((c) => !c.passed).map((c) => c.field);
        return {
          attestorId: this.id,
          verdict: 'contradicts',
          strength: 1.0,
          evidence: [{
            kind: 'computation',
            ref: `check digits fail: ${failed.join(', ')}`,
          }],
        };
      }
      return null; // partial — cannot judge
    }

    // Case 2: a VIZ field beside a proven MRZ — witness comparison.
    if (field.canonicalLabel === null) return null;
    const mrz = findProvenMrz(ctx);
    if (!mrz) return null;
    const extract = MRZ_FIELD_MAP[field.canonicalLabel];
    if (!extract || !extract(mrz.fields)) return null; // MRZ lacks this field
    if (mrzAgrees(field.canonicalLabel, field.value, mrz.fields)) {
      return {
        attestorId: this.id,
        verdict: 'proves',
        strength: 0.99,
        evidence: [
          { kind: 'candidate', ref: mrz.sourceId, note: 'proven MRZ (all check digits pass)' },
          { kind: 'computation', ref: `VIZ "${field.value}" agrees with MRZ ${field.canonicalLabel}` },
        ],
      };
    }
    return {
      attestorId: this.id,
      verdict: 'contradicts',
      strength: 0.95,
      evidence: [
        { kind: 'candidate', ref: mrz.sourceId, note: 'proven MRZ (all check digits pass)' },
        {
          kind: 'computation',
          ref: `VIZ "${field.value}" ≠ MRZ ${field.canonicalLabel} "${extract(mrz.fields)}"`,
          note: 'proven machine zone disagrees with the visual zone read',
        },
      ],
    };
  },
};
