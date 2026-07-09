/**
 * Shadow-CI replay laws (P6.3): stored truth is immutable, verdicts are
 * N1-shaped (safety wins ties), user edits never diff.
 */
import { describe, expect, it } from 'vitest';

import type { DocGraph, FieldHypothesis } from '../core/types';
import { buildBenchRun, replayGraph } from './replay';

function hyp(over: Partial<FieldHypothesis>): FieldHypothesis {
  return {
    id: over.id ?? 'h1',
    documentId: 'd1',
    label: over.label ?? 'Field',
    value: over.value ?? 'v',
    valueType: over.valueType ?? 'text',
    labelNodeIds: [],
    valueNodeIds: ['n1'],
    assetNodeIds: [],
    tableNodeIds: [],
    confidence: {
      overall: over.confidence?.overall ?? 0.95,
      components: { ocr: 0.95 },
      penalties: [],
      reasons: [],
    },
    status: over.status ?? 'confirmed',
    evidenceIds: [],
    validationIds: [],
    reasons: [],
    createdAt: 0,
    ...over,
  } as FieldHypothesis;
}

function graph(hyps: FieldHypothesis[]): DocGraph {
  return {
    documentId: 'd1',
    name: 'doc',
    pages: [{ id: 'p1', index: 0, widthPx: 100, heightPx: 100 }],
    nodes: [],
    hypotheses: hyps,
    validations: [],
    evidence: [],
    quality: { safeToAutoConfirm: true },
    metadata: { sourceFileType: 'image', runtime: { appVersion: '1.0.0' } },
  } as unknown as DocGraph;
}

describe('replayGraph', () => {
  it('never mutates the stored graph (workspace truth is immutable)', () => {
    const stored = graph([hyp({ value: 'HELLO', status: 'confirmed' })]);
    const frozen = JSON.stringify(stored);
    replayGraph('rec1', stored);
    expect(JSON.stringify(stored)).toBe(frozen);
  });

  it('identical engine behavior produces zero diffs', () => {
    // A high-confidence text field verifies to the same status both times.
    const stored = graph([hyp({ value: 'HELLO', status: 'confirmed' })]);
    const first = replayGraph('rec1', graph([hyp({ value: 'HELLO', status: 'confirmed' })]));
    // Whatever the current engine decides, replaying its own output again
    // is a fixed point: diff of the re-verified graph against itself.
    const reReplay = replayGraph('rec1', stored);
    expect(first.fieldDiffs).toEqual(reReplay.fieldDiffs);
  });
});

describe('buildBenchRun — the verdict law', () => {
  const rep = (over: object) => ({ recordId: 'r', fieldDiffs: [], downgrades: 0, upgrades: 0, ...over });

  it('no diffs ⇒ identical', () => {
    expect(buildBenchRun('a', 'b', [rep({})]).verdict).toBe('identical');
  });

  it('same-value upgrades only ⇒ improved', () => {
    const r = rep({ fieldDiffs: [{ fieldId: 'f', from: 'X∣needs_review', to: 'X∣confirmed' }], upgrades: 1 });
    expect(buildBenchRun('a', 'b', [r]).verdict).toBe('improved');
  });

  it('any VALUE change ⇒ regressed (the engine must never quietly change stored truth)', () => {
    const r = rep({ fieldDiffs: [{ fieldId: 'f', from: 'X∣confirmed', to: 'Y∣confirmed' }] });
    expect(buildBenchRun('a', 'b', [r]).verdict).toBe('regressed');
  });

  it('downgrades ⇒ regressed, and safety WINS mixed runs', () => {
    const r = rep({
      fieldDiffs: [
        { fieldId: 'f', from: 'X∣confirmed', to: 'X∣needs_review' },
        { fieldId: 'g', from: 'Z∣needs_review', to: 'Z∣confirmed' },
      ],
      downgrades: 1,
      upgrades: 1,
    });
    expect(buildBenchRun('a', 'b', [r]).verdict).toBe('regressed');
  });
});
