/**
 * Question ranking laws (P6.2/I12). DESTINATION: src/lwt/question-ranking.test.ts
 */
import { describe, expect, it } from 'vitest';
import { foldQuestionsPerDoc, MAX_QUESTIONS_PER_DOC, rankQuestions, type QuestionCandidate } from './question-ranking';

const F = (over: Partial<QuestionCandidate>): QuestionCandidate => ({
  fieldId: over.fieldId ?? 'f',
  label: over.label ?? 'Field',
  status: over.status ?? 'needs_review',
  confidence: over.confidence ?? 0.5,
  critical: over.critical ?? false,
  required: over.required ?? false,
  column: over.column ?? true,
  candidates: over.candidates,
});

describe('rankQuestions', () => {
  it('never questions a confirmed field (the trust law)', () => {
    const ranked = rankQuestions([
      F({ fieldId: 'a', status: 'confirmed', confidence: 0.51 }),
      F({ fieldId: 'b', status: 'needs_review' }),
    ]);
    expect(ranked.map((q) => q.fieldId)).toEqual(['b']);
  });

  it('critical fields outrank required outrank column-only', () => {
    const ranked = rankQuestions([
      F({ fieldId: 'col', column: true, confidence: 0.1 }),
      F({ fieldId: 'req', required: true, confidence: 0.9 }),
      F({ fieldId: 'crit', critical: true, confidence: 0.9 }),
    ]);
    expect(ranked.map((q) => q.fieldId)).toEqual(['crit', 'req', 'col']);
  });

  it('within a tier, conflicts outrank low confidence', () => {
    const ranked = rankQuestions([
      F({ fieldId: 'low', critical: true, confidence: 0.05 }),
      F({ fieldId: 'con', critical: true, status: 'conflict', confidence: 0.8, candidates: ['A', 'B'] }),
    ]);
    expect(ranked[0].fieldId).toBe('con');
    expect(ranked[0].kind).toBe('conflict');
    expect(ranked[0].candidates).toEqual(['A', 'B']);
  });

  it('within a tier, lower confidence asks first', () => {
    const ranked = rankQuestions([
      F({ fieldId: 'hi', confidence: 0.9 }),
      F({ fieldId: 'lo', confidence: 0.2 }),
    ]);
    expect(ranked.map((q) => q.fieldId)).toEqual(['lo', 'hi']);
  });

  it('caps questions per doc', () => {
    const many = Array.from({ length: 10 }, (_, i) => F({ fieldId: `f${i}` }));
    expect(rankQuestions(many)).toHaveLength(MAX_QUESTIONS_PER_DOC);
    expect(rankQuestions(many, 1)).toHaveLength(1);
    expect(rankQuestions(many, 0)).toHaveLength(0);
  });

  it('a conflict without 2+ candidates is a low-confidence card, not a lie', () => {
    const ranked = rankQuestions([F({ fieldId: 'c', status: 'conflict', candidates: ['only'] })]);
    expect(ranked[0].kind).toBe('low_confidence');
  });

  it('deterministic tiebreak by fieldId', () => {
    const a = rankQuestions([F({ fieldId: 'b' }), F({ fieldId: 'a' })]);
    const b = rankQuestions([F({ fieldId: 'a' }), F({ fieldId: 'b' })]);
    expect(a.map((q) => q.fieldId)).toEqual(b.map((q) => q.fieldId));
  });
});

describe('foldQuestionsPerDoc', () => {
  it('is an exact rolling mean', () => {
    let s = { mean: 0, docs: 0 };
    for (const asked of [3, 1, 2, 0]) s = foldQuestionsPerDoc(s.mean, s.docs, asked);
    expect(s.docs).toBe(4);
    expect(s.mean).toBeCloseTo(1.5, 10);
  });
});
