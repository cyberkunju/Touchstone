import { describe, expect, it } from 'vitest';
import { DocGraphBuilder } from '../docgraph/builder';
import { parseMrz } from '../parsers/mrz';
import { TemplateEngine } from './template';

function graphWithField(status: 'confirmed' | 'needs_review') {
  const builder = new DocGraphBuilder('doc-1', 'passport.png', 'image');
  const pageId = builder.addPage(0, 1200, 800);
  const labelNodeId = builder.addNode('text_line', pageId, [0.1, 0.1, 0.25, 0.14], 'Nationality', 0.98);
  const valueNodeId = builder.addNode('text_line', pageId, [0.1, 0.15, 0.3, 0.2], 'South African', 0.98);
  const hypothesisId = builder.addHypothesis(
    'Nationality',
    'South African',
    'country',
    [0.1, 0.15, 0.3, 0.2],
    pageId,
    'nationality',
  );
  builder.linkHypothesisNodes(hypothesisId, { labelNodeId, valueNodeId });
  builder.setHypothesisStatus(hypothesisId, status, []);
  return { builder, hypothesisId, labelNodeId };
}

describe('TemplateEngine learning safety', () => {
  it('refuses to fossilize unresolved field bindings', () => {
    const { builder } = graphWithField('needs_review');
    expect(() => TemplateEngine.learnTemplate(builder.build(), 'Unsafe')).toThrow(/unresolved/i);
  });

  it('compiles only the CONFIRMED subset when review noise coexists', () => {
    const { builder, hypothesisId } = graphWithField('confirmed');
    const pageId = builder.build().pages[0].id;
    const noisy = builder.addHypothesis(
      'Garbage Caption',
      'IMMIGRATION 2019',
      'text',
      [0.6, 0.6, 0.8, 0.65],
      pageId,
    );
    builder.setHypothesisStatus(noisy, 'needs_review', []);
    const template = TemplateEngine.learnTemplate(builder.build(), 'Mixed');
    expect(template.fields).toHaveLength(1);
    expect(template.fields[0].createdFromHypothesisId).toBe(hypothesisId);
  });

  it('compiles only confirmed semantic fields and uses caption geometry for anchors', () => {
    const { builder, hypothesisId, labelNodeId } = graphWithField('confirmed');
    const pageId = builder.build().pages[0].id;
    const mrzId = builder.addHypothesis(
      'MRZ Payload',
      parseMrz([
        'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
        'L898902C36UTO7408122F1204159ZE184226B<<<<<10',
      ].join('\n')),
      'mrz',
      [0.05, 0.85, 0.95, 0.95],
      pageId,
      'mrz',
    );
    builder.setHypothesisStatus(mrzId, 'confirmed', []);

    const template = TemplateEngine.learnTemplate(builder.build(), 'Safe');
    expect(template.fields).toHaveLength(1);
    expect(template.fields[0].createdFromHypothesisId).toBe(hypothesisId);
    expect(template.fields[0].canonicalLabel).toBe('nationality');
    expect(template.anchors).toHaveLength(1);
    expect(template.anchors[0].createdFromNodeIds).toContain(labelNodeId);
    expect(template.anchors[0].boxNorm).toEqual([0.1, 0.1, 0.25, 0.14]);
  });
});