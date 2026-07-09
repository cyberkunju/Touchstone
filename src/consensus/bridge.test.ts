/**
 * Consensus bridge tests — the additive law under fire.
 */

import { describe, expect, it } from 'vitest';
import type { DocGraph, FieldHypothesis } from '../core/types';
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

  it('NEVER upgrades: proven-but-review stays review', () => {
    const iban = hyp({
      label: 'IBAN', value: 'GB82WEST12345698765432', valueType: 'id_number',
      canonicalLabel: 'iban', status: 'needs_review',
    });
    const g = graph([iban]);
    const r = augmentWithConsensus(g);
    expect(r.justified).toContain(iban.id);
    expect(iban.status).toBe('needs_review'); // promotion needs the A/B
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
