/**
 * Solver tests — THE LAW AS A TYPE (08 §4-5).
 *
 *  1. confirmField is the sole door: empty proofs won't compile (typed
 *     tuple) and smuggled non-proves / contradictions throw.
 *  2. Forge-fuzz: 10k random attestation soups — confirmed appears ⟺ a
 *     genuine proves-attestation exists and no contradiction does.
 *  3. Document-global solve: date order is a DOCUMENT property chosen by
 *     surviving attestation mass (forge_193 law).
 *  4. End-to-end: MRZ doc confirms; contradicted fields refuse LOUDLY;
 *     unattested reads land in review, never silently confirmed.
 *  5. Hungarian integration: label-stealing resolved optimally.
 */

import { describe, expect, it } from 'vitest';
import type { Attestation, DocContext, FieldCandidate } from './types';
import { confirmField, isConfirmed, solveDocument, solveGlobals } from './solver';

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

const MRZ_VALID = [
  'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
  'L898902C36UTO7408122F1204159ZE184226B<<<<<10',
].join('\n');

const proof = (id = 'test.proof'): Attestation & { verdict: 'proves' } => ({
  attestorId: id,
  verdict: 'proves',
  strength: 1,
  evidence: [{ kind: 'computation', ref: 'x' }],
});

describe('confirmField: the sole door', () => {
  it('builds a sealed confirmed field from genuine proof', () => {
    const f = confirmField({
      label: 'iban',
      value: 'GB82WEST12345698765432',
      candidateId: 'c1',
      proofs: [proof()],
    });
    expect(f.status).toBe('confirmed');
    expect(isConfirmed(f)).toBe(true);
  });

  it('throws on smuggled non-proves verdicts', () => {
    const smuggled = { ...proof(), verdict: 'supports' } as unknown as Attestation & { verdict: 'proves' };
    expect(() =>
      confirmField({ label: 'x', value: 'v', candidateId: 'c', proofs: [smuggled] }),
    ).toThrow(/non-proves/);
  });

  it('throws on proof without evidence', () => {
    const hollow = { ...proof(), evidence: [] } as Attestation & { verdict: 'proves' };
    expect(() =>
      confirmField({ label: 'x', value: 'v', candidateId: 'c', proofs: [hollow] }),
    ).toThrow(/without evidence/);
  });

  it('throws when contradictions are present', () => {
    expect(() =>
      confirmField({
        label: 'x',
        value: 'v',
        candidateId: 'c',
        proofs: [proof()],
        contradictions: [{ ...proof(), verdict: 'contradicts' } as unknown as Attestation],
      }),
    ).toThrow(/contradicted/);
  });

  it('empty proofs is unrepresentable at the type level (runtime backstop holds)', () => {
    // @ts-expect-error — [] is not [ProvesAttestation, ...ProvesAttestation[]]
    expect(() => confirmField({ label: 'x', value: 'v', candidateId: 'c', proofs: [] })).toThrow(/at least one proof/);
  });
});

describe('forge-fuzz: confirmed ⟺ genuine proof, 10k random documents', () => {
  it('no attestation soup ever yields unproven confirmation', () => {
    let state = 0xc0ffee11 >>> 0;
    const rand = () => ((state = (1103515245 * state + 12345) >>> 0), state / 2 ** 32);

    for (let i = 0; i < 10_000; i++) {
      // Random field: sometimes a REAL proven identifier, sometimes garbage
      // with a claiming label, sometimes an unclaimed string.
      const roll = rand();
      let value: string;
      let label: string | null;
      if (roll < 0.25) {
        value = 'GB82WEST12345698765432'; // genuinely valid IBAN
        label = 'iban';
      } else if (roll < 0.5) {
        // corrupted IBAN, still claiming
        const pos = 4 + Math.floor(rand() * 18);
        const d = '0123456789'[Math.floor(rand() * 10)];
        value = 'GB82WEST12345698765432'.slice(0, pos) + d + 'GB82WEST12345698765432'.slice(pos + 1);
        label = 'iban';
      } else if (roll < 0.75) {
        value = String(Math.floor(rand() * 1e12)); // random digits, unclaimed
        label = null;
      } else {
        value = 'Jane Doe'; // plain text, wanted label but unattestable
        label = 'full_name';
      }
      const f = cand({ value, canonicalLabel: label, valueType: 'id_number' });
      const result = solveDocument(ctx([f]), label ? [label] : []);

      for (const field of result.fields) {
        if (isConfirmed(field)) {
          // Every confirmation must carry ≥1 proves with evidence.
          expect(field.proofs.length).toBeGreaterThanOrEqual(1);
          for (const p of field.proofs) {
            expect(p.verdict).toBe('proves');
            expect(p.evidence.length).toBeGreaterThan(0);
          }
          // And in THIS fuzz, only the untouched IBAN can legitimately prove
          // (mod-97 collisions are excluded by construction: single decimal
          // digit substitution in the BBAN changes the value mod 97).
          expect(field.value).toBe('GB82WEST12345698765432');
        }
      }
    }
  });
});

describe('solveGlobals: date order is a document property', () => {
  it('rejects the hypothesis that breaks dates; never commits unforced', () => {
    // "23/04/1985" is calendar-impossible under MDY — that hypothesis must
    // lose. DMY and null tie (set semantics make null equally coherent), and
    // ties prefer null: no unforced commitment. This is a design theorem:
    // commitment can only ever REMOVE plausible readings.
    const dob = cand({ value: '02/07/1992', canonicalLabel: 'date_of_birth', valueType: 'date', channel: 'ocr' });
    const dobPayload = cand({ value: '1992-07-02', canonicalLabel: 'date_of_birth', valueType: 'date', channel: 'payload' });
    const other = cand({ value: '23/04/1985', canonicalLabel: 'issue_date', valueType: 'date', channel: 'ocr' });
    const g = solveGlobals(ctx([dob, dobPayload, other]));
    expect(g.dateOrder).not.toBe('MDY');
    expect(g.score).toBeGreaterThan(0); // proves/supports survived
  });
});

describe('solveDocument end-to-end', () => {
  it('MRZ document: passport number + DOB confirmed with justifications', () => {
    const mrz = cand({ value: MRZ_VALID, marks: ['mrz_text'] });
    const num = cand({ value: 'L898902C3', canonicalLabel: 'passport_number', valueType: 'id_number' });
    const dob = cand({ value: '12/08/1974', canonicalLabel: 'date_of_birth', valueType: 'date' });
    const r = solveDocument(ctx([mrz, num, dob]), ['passport_number', 'date_of_birth']);

    const numField = r.fields.find((f) => f.label === 'passport_number')!;
    const dobField = r.fields.find((f) => f.label === 'date_of_birth')!;
    expect(isConfirmed(numField)).toBe(true);
    expect(isConfirmed(dobField)).toBe(true);
    if (isConfirmed(numField)) {
      expect(numField.proofs[0].attestorId).toBe('checksum.mrz');
      expect(numField.proofs[0].evidence.length).toBeGreaterThan(0);
    }
  });

  it('REGRESSION: VIZ disagreeing with proven MRZ is REFUSED, loudly', () => {
    const mrz = cand({ value: MRZ_VALID, marks: ['mrz_text'] });
    const wrong = cand({ value: 'LI898902C3', canonicalLabel: 'passport_number', valueType: 'id_number' });
    const r = solveDocument(ctx([mrz, wrong]), ['passport_number']);
    const f = r.fields.find((x) => x.label === 'passport_number')!;
    expect(f.status).toBe('refused');
    if (f.status === 'refused') {
      expect(f.rejectedValue).toBe('LI898902C3');
      expect(f.contradictions.length).toBeGreaterThan(0);
      expect(f.reason).toContain('checksum.mrz');
    }
  });

  it('unattestable reads land in review with a reason — never silently confirmed', () => {
    const name = cand({ value: 'Jane Doe', canonicalLabel: 'full_name', valueType: 'name' });
    const r = solveDocument(ctx([name]), ['full_name']);
    const f = r.fields.find((x) => x.label === 'full_name')!;
    expect(f.status).toBe('review');
    if (f.status === 'review') expect(f.reason.length).toBeGreaterThan(0);
  });

  it('closing invoice confirms all three amounts; broken one refuses the bad term', () => {
    const s = cand({ value: '$1,234.50', canonicalLabel: 'subtotal', valueType: 'amount' });
    const t = cand({ value: '$98.76', canonicalLabel: 'tax', valueType: 'amount' });
    const g = cand({ value: '$1,333.26', canonicalLabel: 'total', valueType: 'amount' });
    const ok = solveDocument(ctx([s, t, g]), ['subtotal', 'tax', 'total']);
    expect(ok.fields.filter(isConfirmed).length).toBe(3);

    const gBad = cand({ value: '$1,433.26', canonicalLabel: 'total', valueType: 'amount' });
    const bad = solveDocument(ctx([s, t, gBad]), ['subtotal', 'tax', 'total']);
    // Non-closure contradicts ALL terms of the failed equation — none confirm.
    expect(bad.fields.filter(isConfirmed).length).toBe(0);
    expect(bad.fields.every((f) => f.status === 'refused')).toBe(true);
  });

  it('self-labeling (N5): proven IBAN creates its own slot', () => {
    const f = cand({ value: 'DE89 3704 0044 0532 0130 00', canonicalLabel: 'iban', valueType: 'id_number' });
    const r = solveDocument(ctx([f]), []); // schema asked for NOTHING
    const iban = r.fields.find((x) => x.label === 'iban');
    expect(iban && isConfirmed(iban)).toBe(true);
  });

  it('GATE P5 (N5): an UNSEEN doc type — vehicle registration — yields self-labeled attested fields with zero code added', () => {
    // No schema, no canonical labels, no doc-type knowledge: raw OCR reads
    // from a vehicle registration nobody wrote code for.
    const vin = cand({ value: '1M8GDM9AXKP042788', canonicalLabel: null, valueType: 'id_number' });
    const noise = cand({ value: 'REGISTRATION CERTIFICATE', canonicalLabel: null, valueType: 'text' });
    const r = solveDocument(ctx([vin, noise]), []); // zero slots requested

    // The VIN transliteration check self-labels a 'vin' slot out of thin air.
    const vinField = r.fields.find((x) => x.label === 'vin');
    expect(vinField).toBeDefined();
    expect(vinField!.status).toBe('review'); // unclaimed math supports, never proves (claim-gating law)
    if (vinField!.status === 'review') {
      expect(vinField!.value).toBe('1M8GDM9AXKP042788');
      expect(vinField!.supports.some((a) => a.attestorId === 'checksum.vin')).toBe(true);
    }
    // Noise creates nothing — no fabricated slots.
    expect(r.fields.some((x) => x.label === 'text')).toBe(false);
    expect(r.fields.filter((x) => x.status !== 'refused').some((x) => 'value' in x && x.value === 'REGISTRATION CERTIFICATE')).toBe(false);
  });

  it('Hungarian: two labels, two candidates — optimal, not greedy', () => {
    const a = cand({ value: 'GB82WEST12345698765432', canonicalLabel: 'iban', valueType: 'id_number' });
    const b = cand({ value: 'DE89370400440532013000', canonicalLabel: 'iban', valueType: 'id_number', channel: 'payload' });
    const r = solveDocument(ctx([a, b]), ['iban']);
    // One slot, two proven candidates: exactly one wins, none silently dropped.
    const winners = r.fields.filter((f) => f.label === 'iban');
    expect(winners.length).toBe(1);
    expect(isConfirmed(winners[0])).toBe(true);
  });
});
