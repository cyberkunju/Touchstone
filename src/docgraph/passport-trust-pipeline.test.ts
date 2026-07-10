import { describe, expect, it } from 'vitest';
import { augmentWithConsensus } from '../consensus/bridge';
import { computeCheckDigit, parseMrz } from '../parsers/mrz';
import { VerifierService } from '../verifier/verifier';
import { DocGraphBuilder } from './builder';
import { extractFields } from './field-extraction';
import { normalizeFieldValue } from './hypotheses';
import type { OcrItem } from './ocr-item';

let nodeSequence = 0;
function item(text: string, boxNorm: OcrItem['boxNorm']): OcrItem {
  nodeSequence += 1;
  return { text, boxNorm, nodeId: `ocr-${nodeSequence}`, confidence: 0.96 };
}

function buildSouthAfricanMrz(): string {
  const line1 = 'P<ZAFDLAMINI<<THABO<LOGAN'.padEnd(44, '<');
  const documentNumber = 'A12345678';
  const documentCheck = String(computeCheckDigit(documentNumber));
  const birth = '900101';
  const birthCheck = String(computeCheckDigit(birth));
  const expiry = '300215';
  const expiryCheck = String(computeCheckDigit(expiry));
  const optional = '<'.repeat(14);
  const optionalCheck = String(computeCheckDigit(optional));
  const partial = `${documentNumber}${documentCheck}ZAF${birth}${birthCheck}M${expiry}${expiryCheck}${optional}${optionalCheck}`;
  const compositeInput = partial.slice(0, 10) + partial.slice(13, 20) + partial.slice(21, 43);
  return `${line1}\n${partial}${computeCheckDigit(compositeInput)}`;
}

describe('South African passport visual binding and trust pipeline', () => {
  it('keeps nationality on the country crop and refuses confidence-only confirmation', () => {
    const nationalityBox: OcrItem['boxNorm'] = [0.49, 0.325, 0.82, 0.35];
    const ocrItems = [
      item('Passport No.', [0.66, 0.20, 0.78, 0.22]),
      item('A12345678', [0.66, 0.225, 0.79, 0.25]),
      item('Nationality / Nationalité', [0.36, 0.30, 0.53, 0.32]),
      item('SOUTH AFRICAN / SUD-AFRICAIN', nationalityBox),
      item("Identity No. / No. d'identité", [0.36, 0.355, 0.62, 0.38]),
      item('900101 5234 081', [0.36, 0.385, 0.55, 0.41]),
      item('Date of Birth', [0.36, 0.43, 0.50, 0.45]),
      item('1990-01-01', [0.47, 0.455, 0.62, 0.48]),
      item('Date of Expiry', [0.36, 0.53, 0.50, 0.55]),
      item('2030-02-15', [0.47, 0.555, 0.62, 0.58]),
    ];
    const mrz = parseMrz(buildSouthAfricanMrz());
    expect(mrz.status).toBe('valid');

    const builder = new DocGraphBuilder('za-passport', 'south-africa.jpg', 'image');
    const pageId = builder.addPage(0, 1600, 1000);
    const linkedItems = ocrItems.map((ocr) => ({
      ...ocr,
      nodeId: builder.addNode('text_line', pageId, ocr.boxNorm, ocr.text, ocr.confidence),
    }));
    const mrzId = builder.addHypothesis('MRZ Payload', mrz, 'mrz', [0.02, 0.84, 0.96, 0.96], pageId, 'mrz');
    expect(mrzId).toBeTruthy();

    for (const field of extractFields(linkedItems, 'passport', { dateLocale: 'dmy' })) {
      const value = normalizeFieldValue(field.valueType, field.value).value;
      const hypothesisId = builder.addHypothesis(
        field.label,
        value,
        field.valueType,
        field.valueItem.boxNorm,
        pageId,
        field.canonicalLabel,
      );
      builder.linkHypothesisNodes(hypothesisId, {
        valueNodeId: field.valueItem.nodeId,
        labelNodeId: field.labelItem?.nodeId,
      });
    }

    const graph = VerifierService.verify(builder.build());
    augmentWithConsensus(graph);

    const nationality = graph.hypotheses.find((field) => field.canonicalLabel === 'nationality');
    expect(nationality?.value).toBe('SOUTH AFRICAN / SUD-AFRICAIN');
    expect(nationality?.boxNorm).toEqual(nationalityBox);
    expect(nationality?.status).toBe('needs_review');
    expect(nationality?.reasons.some((reason) => reason.includes('checksum.mrz supports'))).toBe(true);

    const passportNumber = graph.hypotheses.find((field) => field.canonicalLabel === 'passport_number');
    const birth = graph.hypotheses.find((field) => field.canonicalLabel === 'date_of_birth');
    const expiry = graph.hypotheses.find((field) => field.canonicalLabel === 'date_of_expiry');
    expect(passportNumber?.status).toBe('confirmed');
    expect(birth?.status).toBe('confirmed');
    expect(expiry?.status).toBe('confirmed');
  });
});