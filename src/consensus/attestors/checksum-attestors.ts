/**
 * The checksum attestor family (08 §6 rows 2-16) — every attestor whose
 * judgment is "this string satisfies a self-verifying scheme".
 *
 * One declarative table, one factory: the fifteen attestors differ ONLY in
 * (gate, predicate, claim labels, strength, self-label) — separate classes
 * would be ceremony. Genuinely different algorithms (dates, closure,
 * cross-channel, payload grammars) live in their own files.
 *
 * VERDICT LAW (overlapping-gate safety): digit gates overlap (a 10-digit
 * string matches both NHS and ISBN-10 shapes), so an attestor may only
 * CONTRADICT a candidate that CLAIMS its kind (canonical label ∈
 * claimLabels, or marks include the self-label). For unclaimed candidates:
 *  - math passes → 'supports' + self-label suggestion (N5 slot creation);
 *    never 'proves' — a phone number that happens to satisfy NHS mod-11
 *    proves nothing about the read.
 *  - math fails  → null (silence; the string simply isn't this kind).
 * For claimed candidates:
 *  - math passes → 'proves' (structural-only schemes: 'supports', 08 §6 #16).
 *  - math fails  → 'contradicts' (a labeled IBAN failing mod-97 is the
 *    classic misread).
 *
 * Strength = 1 − measured single-substitution blind-spot rate of the scheme
 * (checksums.test.ts fuzz measures these — evidence, not vibes).
 */

import type { Attestation, Attestor, DocContext, FieldCandidate } from '../types';
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

interface ChecksumSpec {
  id: string;
  /** Cheap shape gate on the SEPARATOR-STRIPPED, uppercased value. */
  gate: RegExp;
  /** The mathematical predicate. */
  valid: (s: string) => boolean;
  /** Canonical labels that CLAIM this kind (enables proves/contradicts). */
  claimLabels: readonly string[];
  /** 1 − measured blind-spot rate. */
  strength: number;
  /** Self-label mark attached on valid math (N5 self-labeling). */
  selfLabel: string;
  /** Structural-only schemes support but NEVER prove (08 §6 #16). */
  structuralOnly?: boolean;
}

const SPECS: readonly ChecksumSpec[] = [
  {
    id: 'checksum.iban', gate: /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/, valid: ibanValid,
    claimLabels: ['iban', 'bank_account', 'account_number'], strength: 0.99, selfLabel: 'iban',
  },
  {
    id: 'checksum.luhn-card', gate: /^\d{13,19}$/, valid: luhnValid,
    claimLabels: ['card_number', 'credit_card_number'], strength: 1.0, selfLabel: 'card_number',
  },
  {
    id: 'checksum.verhoeff-aadhaar', gate: /^\d{12}$/, valid: verhoeffValid,
    claimLabels: ['aadhaar', 'aadhaar_number'], strength: 1.0, selfLabel: 'aadhaar',
  },
  {
    id: 'checksum.gstin', gate: /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/, valid: gstinValid,
    claimLabels: ['gstin', 'gst_number', 'tax_id'], strength: 0.97, selfLabel: 'gstin',
  },
  {
    id: 'checksum.pan-in', gate: /^[A-Z]{5}\d{4}[A-Z]$/, valid: panStructureValid,
    claimLabels: ['pan', 'pan_number'], strength: 0.5, selfLabel: 'pan', structuralOnly: true,
  },
  {
    id: 'checksum.vin', gate: /^[A-HJ-NPR-Z0-9]{17}$/, valid: vinValid,
    claimLabels: ['vin', 'vehicle_identification_number', 'chassis_number'], strength: 0.92, selfLabel: 'vin',
  },
  {
    id: 'checksum.isbn10', gate: /^\d{9}[\dX]$/, valid: isbn10Valid,
    claimLabels: ['isbn'], strength: 1.0, selfLabel: 'isbn',
  },
  {
    id: 'checksum.ean13', gate: /^\d{13}$/, valid: ean13Valid,
    claimLabels: ['ean', 'gtin', 'barcode', 'product_code'], strength: 1.0, selfLabel: 'ean13',
  },
  {
    id: 'checksum.ean8', gate: /^\d{8}$/, valid: ean8Valid,
    claimLabels: ['ean', 'barcode', 'product_code'], strength: 1.0, selfLabel: 'ean8',
  },
  {
    id: 'checksum.upc-a', gate: /^\d{12}$/, valid: upcAValid,
    claimLabels: ['upc', 'barcode', 'product_code'], strength: 1.0, selfLabel: 'upc',
  },
  {
    id: 'checksum.isin', gate: /^[A-Z]{2}[A-Z0-9]{9}\d$/, valid: isinValid,
    claimLabels: ['isin'], strength: 0.92, selfLabel: 'isin',
  },
  {
    id: 'checksum.imei', gate: /^\d{15}$/, valid: luhnValid,
    claimLabels: ['imei'], strength: 1.0, selfLabel: 'imei',
  },
  {
    id: 'checksum.imo', gate: /^(IMO)?\d{7}$/, valid: imoValid,
    claimLabels: ['imo', 'imo_number'], strength: 0.87, selfLabel: 'imo',
  },
  {
    id: 'checksum.nhs', gate: /^\d{10}$/, valid: nhsValid,
    claimLabels: ['nhs_number'], strength: 1.0, selfLabel: 'nhs_number',
  },
  {
    id: 'structure.ssn', gate: /^\d{9}$/, valid: ssnStructureValid,
    claimLabels: ['ssn', 'social_security_number'], strength: 0.3, selfLabel: 'ssn', structuralOnly: true,
  },
];

function makeChecksumAttestor(spec: ChecksumSpec): Attestor {
  return {
    id: spec.id,

    appliesTo(field: FieldCandidate): boolean {
      return spec.gate.test(stripSeparators(field.value).toUpperCase());
    },

    attest(field: FieldCandidate, _ctx: DocContext): Attestation | null {
      const normalized = stripSeparators(field.value).toUpperCase();
      if (!spec.gate.test(normalized)) return null; // cannot judge
      const claimed =
        (field.canonicalLabel !== null && spec.claimLabels.includes(field.canonicalLabel)) ||
        field.marks.includes(spec.selfLabel);
      const ok = spec.valid(normalized);

      if (!ok) {
        if (!claimed) return null; // not this kind — silence, not contradiction
        return {
          attestorId: spec.id,
          verdict: 'contradicts',
          strength: spec.strength,
          evidence: [{
            kind: 'computation',
            ref: `${spec.id}(${normalized}) = invalid`,
            note: `field claims ${spec.selfLabel} but its ${spec.structuralOnly ? 'structure' : 'check digit'} fails`,
          }],
        };
      }

      const verdict: Attestation['verdict'] =
        claimed && !spec.structuralOnly ? 'proves' : 'supports';
      return {
        attestorId: spec.id,
        verdict,
        strength: spec.strength,
        evidence: [{
          kind: 'computation',
          ref: `${spec.id}(${normalized}) = valid`,
          note: spec.structuralOnly
            ? `structural rules hold (no checksum exists for ${spec.selfLabel})`
            : claimed
              ? `check digit verifies (${spec.selfLabel})`
              : `check digit verifies — suggests ${spec.selfLabel} (unclaimed: supports only)`,
        }],
      };
    },
  };
}

/** All checksum-family attestors, ready for the registry. */
export const CHECKSUM_ATTESTORS: readonly Attestor[] = SPECS.map(makeChecksumAttestor);

/** Self-label lookup: attestor id → semantic tag (N5 slot creation). */
export const CHECKSUM_SELF_LABELS: ReadonlyMap<string, string> =
  new Map(SPECS.map((s) => [s.id, s.selfLabel]));
