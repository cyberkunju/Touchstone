import { describe, expect, it } from 'vitest';
import { DocGraphBuilder } from './builder';

describe('DocGraphBuilder hypothesis identity', () => {
  it('preserves the canonical field label used by attestors', () => {
    const builder = new DocGraphBuilder('doc-1', 'passport.png', 'image');
    const pageId = builder.addPage(0, 1000, 700);
    const hypothesisId = builder.addHypothesis(
      'Nationality',
      'South African',
      'country',
      [0.4, 0.3, 0.7, 0.34],
      pageId,
      'nationality',
    );

    const hypothesis = builder.build().hypotheses.find((item) => item.id === hypothesisId);
    expect(hypothesis?.canonicalLabel).toBe('nationality');
  });
});