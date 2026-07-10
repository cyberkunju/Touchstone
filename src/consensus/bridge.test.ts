/**
 * Consensus bridge tests — the additive law under fire.
 */

import { describe, expect, it } from 'vitest';
import type { DocGraph, FieldHypothesis } from '../core/types';
import { parseMrz } from '../parsers/mrz';
import { augmentWithConsensus, hypothesesToCandidates } from './bridge';

let seq = 0;
function hyp(partial: Partial<FieldHypothesis> & { label: string; value: unknown }): FieldHypothesis {
  return {
    id: `h${++seq}`,
    documentId: 'd1',
    valueType: 'text',
    labelNodeIds: [],
    valueNodeIds: [],
    assetNodeIds: [],
    tableNodeIds: [],
    confidence: { overall: 0.8, components: {} } as FieldHypothesis['confidence'],
    status: 'needs_review',
    evidenceIds: [],
    validationIds: [],
    reasons: [],
    createdAt: 0,
    ...partial,
  };
}

function graph(hypotheses: FieldHypothesis[]): DocGraph {
  return {
    documentId: 'd1',
    metadata: { sourceFileType: 'image' },
    pages: [],
    nodes: [],
    edges: [],
    hypotheses,
    evidence: [],
    validations: [],
  } as unknown as DocGraph;
}

const MRZ_VALID = [
  'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
  'L898902C36UTO7408122F1204159ZE184226B<<<<<10',
].join('\n');

describe('hypothesesToCandidates', () => {
  it('maps values, labels, marks and channels', () => {
    const c = hypothesesToCandidates([
      hyp({ label: 'MRZ', value: MRZ_VALID, valueType: 'mrz' }),
      hyp({ label: 'Barcode', value: 'upi://pay?pa=x@y&am=5', valueType: 'barcode' }),
      hyp({ label: 'Total', value: '$5.00', valueType: 'amount', canonicalLabel: 'total' }),
      hyp({ label: 'Table', value: { rows: [] }, valueType: 'table' }), // non-string skipped
    ]);
    expect(c.length).toBe(3);
    expect(c[0].marks).toContain('mrz_text');
    expect(c[1].channel).toBe('payload');
    expect(c[2].canonicalLabel).toBe('total');
  });

  it('maps the parsed MRZ object shape produced by App into a canonical MRZ candidate', () => {
    const parsed = parseMrz(MRZ_VALID);
    const candidates = hypothesesToCandidates([
      hyp({ label: 'MRZ Payload', value: parsed, valueType: 'mrz' }),
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].canonicalLabel).toBe('mrz');
    expect(candidates[0].marks).toContain('mrz_text');
    expect(candidates[0].value).toBe(MRZ_VALID);
  });

  it('does not grant the MRZ proof mark to a legacy/review-capped parse', () => {
    const parsed = parseMrz(MRZ_VALID);
    const legacy = hyp({
      label: 'MRZ Payload',
      value: parsed,
      valueType: 'mrz',
      reviewCap: 'Legacy MRZ parse without checksum-guided beam proof.',
    });
    const number = hyp({
      label: 'Passport Number',
      value: 'L898902C3',
      valueType: 'id_number',
      canonicalLabel: 'passport_number',
      status: 'needs_review',
    });
    const candidates = hypothesesToCandidates([legacy, number]);
    expect(candidates[0].marks).not.toContain('mrz_text');
    expect(candidates[0].canonicalLabel).toBeNull();

    const result = augmentWithConsensus(graph([legacy, number]));
    expect(number.status).toBe('needs_review');
    expect(result.promoted).toEqual([]);
  });
});

describe('augmentWithConsensus: the additive law', () => {
  it('attaches printable justification chains to proven fields (GATE P5)', () => {
    const mrz = hyp({ label: 'MRZ', value: MRZ_VALID, valueType: 'mrz' });
    const num = hyp({
      label: 'Passport Number', value: 'L898902C3', valueType: 'id_number',
      canonicalLabel: 'passport_number', status: 'confirmed',
    });
    const g = graph([mrz, num]);
    const r = augmentWithConsensus(g);
    expect(r.justified).toContain(num.id);
    expect(num.status).toBe('confirmed'); // untouched
    expect(num.reasons.some((x) => x.includes('checksum.mrz proves'))).toBe(true);
    expect(num.reasons.some((x) => x.includes('agrees with MRZ'))).toBe(true);
  });

  it('proven review field promotes under the default (post-A/B) law', () => {
    const iban = hyp({
      label: 'IBAN', value: 'GB82WEST12345698765432', valueType: 'id_number',
      canonicalLabel: 'iban', status: 'needs_review',
    });
    const g = graph([iban]);
    const r = augmentWithConsensus(g);
    expect(r.justified).toContain(iban.id);
    expect(iban.status).toBe('confirmed'); // checksum.iban strength 0.99 ≥ 0.9
  });

  it('DOWNGRADES a confirmed field the attestors contradict — silent killer', () => {
    const mrz = hyp({ label: 'MRZ', value: MRZ_VALID, valueType: 'mrz' });
    const wrong = hyp({
      label: 'Passport Number', value: 'LI898902C3', valueType: 'id_number',
      canonicalLabel: 'passport_number', status: 'confirmed',
    });
    const g = graph([mrz, wrong]);
    const r = augmentWithConsensus(g);
    expect(wrong.status).toBe('needs_review');
    expect(r.downgraded.length).toBe(1);
    expect(r.downgraded[0].reason).toContain('checksum.mrz');
  });

  it('user-edited confirmations are NEVER downgraded (human overrides machine)', () => {
    const mrz = hyp({ label: 'MRZ', value: MRZ_VALID, valueType: 'mrz' });
    const edited = hyp({
      label: 'Passport Number', value: 'LI898902C3', valueType: 'id_number',
      canonicalLabel: 'passport_number', status: 'confirmed', userEdited: true,
    });
    augmentWithConsensus(graph([mrz, edited]));
    expect(edited.status).toBe('confirmed');
    // The contradiction is still VISIBLE in the reasons (informed override).
    expect(edited.reasons.some((x) => x.includes('contradicts'))).toBe(true);
  });

  it('claimed IBAN with broken mod-97 that slipped to confirmed gets caught', () => {
    const bad = hyp({
      label: 'IBAN', value: 'GB82WEST12345698765431', valueType: 'id_number',
      canonicalLabel: 'iban', status: 'confirmed',
    });
    const r = augmentWithConsensus(graph([bad]));
    expect(bad.status).toBe('needs_review');
    expect(r.downgraded[0].reason).toContain('checksum.iban');
  });

  it('unattested fields are untouched — no noise', () => {
    const name = hyp({ label: 'Notes', value: 'hello world', valueType: 'text' });
    const before = JSON.stringify(name);
    augmentWithConsensus(graph([name]));
    expect(JSON.stringify(name)).toBe(before);
  });
});

describe('promotion authority (post-A/B law)', () => {
  it('PROMOTES a plain review field the attestors prove', () => {
    const mrz = hyp({ label: 'MRZ', value: MRZ_VALID, valueType: 'mrz' });
    const num = hyp({
      label: 'Passport Number', value: 'L898902C3', valueType: 'id_number',
      canonicalLabel: 'passport_number', status: 'needs_review',
    });
    const r = augmentWithConsensus(graph([mrz, num]));
    expect(num.status).toBe('confirmed');
    const numPromotion = r.promoted.find((p) => p.id === num.id);
    expect(numPromotion?.attestors).toContain('checksum.mrz');
    // The MRZ hypothesis itself also promotes — all check digits ARE proof.
    expect(r.promoted.some((p) => p.id === mrz.id)).toBe(true);
    expect(num.reasons.some((x) => x.includes('⚡ promoted'))).toBe(true);
    expect(num.confidence.overall).toBeGreaterThanOrEqual(0.9);
  });

  it('IRON GUARD 1: reviewCap is NEVER bought back by the same math', () => {
    const iban = hyp({
      label: 'IBAN', value: 'GB82WEST12345698765432', valueType: 'id_number',
      canonicalLabel: 'iban', status: 'needs_review',
      reviewCap: 'checksum-invisible ambiguity in source read',
    });
    const r = augmentWithConsensus(graph([iban]));
    expect(iban.status).toBe('needs_review');
    expect(r.promoted).toEqual([]);
    // Justification still attaches — visible, not authoritative.
    expect(r.justified).toContain(iban.id);
  });

  it('IRON GUARD 2: weak-scheme proof (below 0.9) supports, never auto-confirms', () => {
    // IMO strength is 0.87 (measured ~11% blind spot) < PROMOTION_MIN_STRENGTH.
    const imo = hyp({
      label: 'IMO Number', value: 'IMO9074729', valueType: 'id_number',
      canonicalLabel: 'imo', status: 'needs_review',
    });
    const r = augmentWithConsensus(graph([imo]));
    expect(imo.status).toBe('needs_review');
    expect(r.promoted).toEqual([]);
  });

  it('IRON GUARD 3: contradicted fields never promote (proven ⇒ zero contradictions)', () => {
    const mrz = hyp({ label: 'MRZ', value: MRZ_VALID, valueType: 'mrz' });
    // Claimed IBAN with VALID mod-97 but the label ALSO maps to MRZ… simpler:
    // a passport_number in review that DISAGREES with the proven MRZ.
    const wrong = hyp({
      label: 'Passport Number', value: 'LI898902C3', valueType: 'id_number',
      canonicalLabel: 'passport_number', status: 'needs_review',
    });
    const r = augmentWithConsensus(graph([mrz, wrong]));
    expect(wrong.status).toBe('needs_review');
    expect(r.promoted.some((p) => p.id === wrong.id)).toBe(false); // the contradicted field never promotes
  });

  it('promote=false reproduces additive-only behavior exactly (A/B control arm)', () => {
    const mrz = hyp({ label: 'MRZ', value: MRZ_VALID, valueType: 'mrz' });
    const num = hyp({
      label: 'Passport Number', value: 'L898902C3', valueType: 'id_number',
      canonicalLabel: 'passport_number', status: 'needs_review',
    });
    const r = augmentWithConsensus(graph([mrz, num]), new Date(), false);
    expect(num.status).toBe('needs_review');
    expect(r.promoted).toEqual([]);
    expect(r.justified).toContain(num.id);
  });
});
