import { augmentWithConsensus } from '../src/consensus/bridge';
import type { DocGraph, FieldHypothesis } from '../src/core/types';

function hyp(p: Partial<FieldHypothesis> & { label: string; value: unknown }): FieldHypothesis {
  return {
    id: Math.random().toString(36).slice(2),
    documentId: 'd1', valueType: 'text',
    labelNodeIds: [], valueNodeIds: [], assetNodeIds: [], tableNodeIds: [],
    confidence: { overall: 0.9, components: {} } as FieldHypothesis['confidence'],
    status: 'confirmed', evidenceIds: [], validationIds: [], reasons: [], createdAt: 0,
    ...p,
  };
}

// EXACT replication of the burst silent: expiry slot holding the DOB value.
// Probe BOTH value formats the pipeline can carry (raw print + ISO display).
for (const val of ['1953-11-17', '17/11/1953']) {
  const expiry = hyp({
    label: 'Date of Expiry', value: val, valueType: 'date',
    canonicalLabel: 'date_of_expiry', status: 'confirmed',
  });
  const g = {
    documentId: 'd1', metadata: { sourceFileType: 'image' },
    pages: [], nodes: [], edges: [], evidence: [], hypotheses: [expiry], validations: [],
  } as unknown as DocGraph;
  const r = augmentWithConsensus(g);
  console.log(`value=${val} -> status=${expiry.status} downgraded=${r.downgraded.length}`);
  for (const reason of expiry.reasons) console.log('   ', reason);
}
