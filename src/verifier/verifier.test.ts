/**
 * Tests for the VerifierService — the single trust authority.
 *
 * These tests construct minimal but schema-valid DocGraphs and assert the
 * status the Verifier assigns under the prime directive: never silently
 * confirm a wrong value; prefer needs_review / conflict.
 */

import { describe, it, expect } from 'vitest';
import { VerifierService, VerifierOptions } from './verifier';
import {
  DocGraph,
  FieldHypothesis,
  FieldValueType,
  GraphNode,
  PageQualityReport,
} from '../core/types';
import { MrzParseResult } from '../parsers/mrz';

function goodQuality(): PageQualityReport {
  const sig = { score: 1, level: 'good' as const };
  return {
    blur: sig,
    glare: sig,
    contrast: sig,
    resolution: sig,
    cropCompleteness: sig,
    perspective: sig,
    orientation: sig,
    safeToExtract: true,
    warnings: [],
  };
}

let nodeSeq = 0;
function makeNode(confidence: number): GraphNode {
  nodeSeq += 1;
  return {
    id: `node-${nodeSeq}`,
    type: 'text_line',
    pageId: 'page-1',
    evidenceIds: [],
    confidence,
    createdAt: Date.now(),
  };
}

interface HypInput {
  id?: string;
  label?: string;
  value?: unknown;
  valueType?: FieldValueType;
  required?: boolean;
  userEdited?: boolean;
  rejected?: boolean;
  ocrConfidence?: number;
}

function makeHyp(input: HypInput, nodes: GraphNode[]): FieldHypothesis {
  const valueNodeIds: string[] = [];
  if (input.ocrConfidence !== undefined) {
    const n = makeNode(input.ocrConfidence);
    nodes.push(n);
    valueNodeIds.push(n.id);
  }
  return {
    id: input.id ?? `hyp-${Math.random().toString(36).slice(2, 8)}`,
    documentId: 'doc-1',
    pageId: 'page-1',
    label: input.label ?? 'Field',
    value: input.value ?? '',
    valueType: input.valueType ?? 'text',
    labelNodeIds: [],
    valueNodeIds,
    assetNodeIds: [],
    tableNodeIds: [],
    confidence: { overall: 1, components: {}, penalties: [], reasons: [] },
    status: 'needs_review',
    evidenceIds: [],
    validationIds: [],
    required: input.required,
    userEdited: input.userEdited,
    rejected: input.rejected,
    reasons: [],
    createdAt: Date.now(),
  };
}

function makeGraph(hyps: FieldHypothesis[], nodes: GraphNode[]): DocGraph {
  return {
    id: 'graph-1',
    documentId: 'doc-1',
    schemaVersion: '1.0.0',
    metadata: {
      sourceFileType: 'image',
      pageCount: 1,
      processingMode: 'unknown_document',
      runtime: { appVersion: '1.0.0' },
    },
    pages: [
      {
        id: 'page-1',
        type: 'page',
        documentId: 'doc-1',
        pageIndex: 0,
        original: { widthPx: 1000, heightPx: 1000 },
        transforms: [],
        quality: goodQuality(),
        evidenceIds: [],
      },
    ],
    nodes,
    edges: [],
    evidence: [],
    hypotheses: hyps,
    validations: [],
    provenance: [],
    quality: { pageQuality: {}, warnings: [], safeToAutoConfirm: true },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function verifyOne(input: HypInput, options?: VerifierOptions): FieldHypothesis {
  const nodes: GraphNode[] = [];
  const hyp = makeHyp(input, nodes);
  const graph = makeGraph([hyp], nodes);
  VerifierService.verify(graph, options);
  return graph.hypotheses[0];
}

describe('VerifierService — single-field statuses', () => {
  it('keeps a high-confidence OCR-only field in review because confidence is not proof', () => {
    const h = verifyOne({ label: 'Name', value: 'JOHN DOE', valueType: 'text', ocrConfidence: 0.98 });
    expect(h.status).toBe('needs_review');
    expect(h.reasons.some((reason) => /independent proof/i.test(reason))).toBe(true);
  });

  it('flags needs_review when OCR confidence is low', () => {
    const h = verifyOne({ label: 'Name', value: 'JOHN DOE', valueType: 'text', ocrConfidence: 0.4 });
    expect(h.status).toBe('needs_review');
  });

  it('marks invalid on an impossible date', () => {
    const h = verifyOne({ label: 'DOB', value: '2023-02-30', valueType: 'date', ocrConfidence: 0.99 });
    expect(h.status).toBe('invalid');
  });

  it('marks missing when a required field is empty', () => {
    const h = verifyOne({ label: 'Name', value: '', valueType: 'text', required: true, ocrConfidence: 0.99 });
    expect(h.status).toBe('missing');
  });

  it('confirms a user-edited field regardless of confidence', () => {
    const h = verifyOne({ label: 'Name', value: 'JANE', valueType: 'text', userEdited: true, ocrConfidence: 0.1 });
    expect(h.status).toBe('confirmed');
    expect(h.confidence.overall).toBe(1);
  });

  it('marks rejected fields rejected and runs no validators', () => {
    const h = verifyOne({ label: 'DOB', value: '2023-02-30', valueType: 'date', rejected: true, ocrConfidence: 0.99 });
    expect(h.status).toBe('rejected');
  });

  it('flags ambiguous dates as needs_review', () => {
    const h = verifyOne({ label: 'DOB', value: '01/02/2020', valueType: 'date', ocrConfidence: 0.99 });
    expect(h.status).toBe('needs_review');
  });
});

describe('VerifierService — table arithmetic', () => {
  it('marks conflict when line items do not sum to the total', () => {
    const nodes: GraphNode[] = [];
    const hyp = makeHyp(
      { id: 'total', label: 'Total', value: '300.00', valueType: 'amount', ocrConfidence: 0.99 },
      nodes,
    );
    const graph = makeGraph([hyp], nodes);
    VerifierService.verify(graph, {
      fieldConfig: { total: { lineValues: [100, 150], expectedSum: 300 } },
    });
    expect(graph.hypotheses[0].status).toBe('conflict');
  });
});

/* ------------------------------------------------------------------ */
/* Cross-field MRZ ↔ visual checks                                    */
/* ------------------------------------------------------------------ */

function mrzResult(fields: Partial<MrzParseResult['fields']>, status: MrzParseResult['status'] = 'valid'): MrzParseResult {
  return {
    format: 'TD3',
    rawLines: [],
    normalizedLines: [],
    normalizationChanges: [],
    fields,
    checkDigits: [],
    status,
  } as MrzParseResult;
}

describe('VerifierService — MRZ cross-field checks', () => {
  it('marks the visible DOB as conflict when it disagrees with the MRZ', () => {
    const nodes: GraphNode[] = [];
    const mrzHyp = makeHyp(
      { id: 'mrz', label: 'MRZ', valueType: 'mrz', value: mrzResult({ dateOfBirth: '1974-08-12' }), ocrConfidence: 0.99 },
      nodes,
    );
    const dobHyp = makeHyp(
      { id: 'dob', label: 'Date of Birth', valueType: 'date', value: '1990-01-01', ocrConfidence: 0.99 },
      nodes,
    );
    const graph = makeGraph([mrzHyp, dobHyp], nodes);
    VerifierService.verify(graph);
    const dob = graph.hypotheses.find((h) => h.id === 'dob')!;
    expect(dob.status).toBe('conflict');
  });

  it('uses the MRZ to disambiguate an ambiguous visible DOB without conflict', () => {
    const nodes: GraphNode[] = [];
    const mrzHyp = makeHyp(
      { id: 'mrz', label: 'MRZ', valueType: 'mrz', value: mrzResult({ dateOfBirth: '1974-08-12' }), ocrConfidence: 0.99 },
      nodes,
    );
    // 12/08/1974 is ambiguous (dmy -> 1974-08-12, mdy -> invalid here but candidates include 1974-08-12)
    const dobHyp = makeHyp(
      { id: 'dob', label: 'Date of Birth', valueType: 'date', value: '12/08/1974', ocrConfidence: 0.99 },
      nodes,
    );
    const graph = makeGraph([mrzHyp, dobHyp], nodes);
    VerifierService.verify(graph);
    const dob = graph.hypotheses.find((h) => h.id === 'dob')!;
    expect(dob.status).not.toBe('conflict');
    expect(dob.reasons).toContain('Confirmed by MRZ date of birth.');
  });

  it('does not cross-confirm from an invalid MRZ', () => {
    const nodes: GraphNode[] = [];
    const mrzHyp = makeHyp(
      { id: 'mrz', label: 'MRZ', valueType: 'mrz', value: mrzResult({ dateOfBirth: '1974-08-12' }, 'invalid'), ocrConfidence: 0.99 },
      nodes,
    );
    const dobHyp = makeHyp(
      { id: 'dob', label: 'Date of Birth', valueType: 'date', value: '1990-01-01', ocrConfidence: 0.99 },
      nodes,
    );
    const graph = makeGraph([mrzHyp, dobHyp], nodes);
    VerifierService.verify(graph);
    const dob = graph.hypotheses.find((h) => h.id === 'dob')!;
    expect(dob.status).not.toBe('conflict');
  });

  it('marks document number conflict when MRZ disagrees with the visible value', () => {
    const nodes: GraphNode[] = [];
    const mrzHyp = makeHyp(
      { id: 'mrz', label: 'MRZ', valueType: 'mrz', value: mrzResult({ documentNumber: 'A1234567' }), ocrConfidence: 0.99 },
      nodes,
    );
    const docHyp = makeHyp(
      { id: 'docno', label: 'Passport Number', valueType: 'id_number', value: 'B7654321', ocrConfidence: 0.99 },
      nodes,
    );
    const graph = makeGraph([mrzHyp, docHyp], nodes);
    VerifierService.verify(graph);
    const docno = graph.hypotheses.find((h) => h.id === 'docno')!;
    expect(docno.status).toBe('conflict');
  });
});
