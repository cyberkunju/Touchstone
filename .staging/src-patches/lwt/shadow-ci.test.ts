/**
 * P6.3 acceptance: a deliberately-regressed build is caught and blocked;
 * identical and improved builds pass. DESTINATION: src/lwt/shadow-ci.test.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  defaultBlockPredicate,
  diffDoc,
  runShadowReplay,
  shadowCiGate,
  type EngineRun,
  type StoredDoc,
} from './shadow-ci';

const DOCS: StoredDoc[] = [
  {
    docId: 'doc1',
    fields: {
      'Invoice Number': { value: 'INV-2026-7745', status: 'confirmed' },
      Total: { value: '1,908.84', status: 'confirmed' },
      Memo: { value: 'urgent', status: 'needs_review' },
    },
  },
  {
    docId: 'doc2',
    fields: {
      'Passport Number': { value: 'L898902C3', status: 'confirmed', userConfirmed: true },
      Surname: { value: 'ERIKSSON', status: 'confirmed' },
    },
  },
];

/** An engine that reproduces storage exactly. */
const identicalEngine: EngineRun = async (docId) => {
  const doc = DOCS.find((d) => d.docId === docId)!;
  return Object.fromEntries(
    Object.entries(doc.fields).map(([k, v]) => [k, { value: v.value, status: v.status }]),
  );
};

describe('shadow-CI verdicts', () => {
  it('identical build → identical, not blocked', async () => {
    const { blocked, report } = await shadowCiGate(DOCS, identicalEngine);
    expect(report.verdict).toBe('identical');
    expect(blocked).toBe(false);
    expect(report.fieldsCompared).toBe(5);
    expect(report.docsReplayed).toBe(2);
  });

  it('THE acceptance: deliberately-regressed build is caught and BLOCKED', async () => {
    const regressed: EngineRun = async (docId) => {
      const base = await identicalEngine(docId);
      if (docId === 'doc1') {
        // The classic silent killer: a confirmed amount changes value.
        base.Total = { value: '1,908.84'.replace('9', '8'), status: 'confirmed' };
      }
      return base;
    };
    const { blocked, report } = await shadowCiGate(DOCS, regressed);
    expect(report.verdict).toBe('regressed');
    expect(blocked).toBe(true);
    expect(report.regressions).toHaveLength(1);
    expect(report.regressions[0]).toMatchObject({
      docId: 'doc1',
      label: 'Total',
      kind: 'value_changed',
    });
  });

  it('losing a confirmed field is a regression', async () => {
    const lossy: EngineRun = async (docId) => {
      const base = await identicalEngine(docId);
      if (docId === 'doc2') delete base['Passport Number'];
      return base;
    };
    const report = await runShadowReplay(DOCS, lossy);
    expect(report.verdict).toBe('regressed');
    expect(report.regressions[0].kind).toBe('field_lost');
  });

  it('confirmed → review downgrade is a regression (silent confidence loss)', async () => {
    const shy: EngineRun = async (docId) => {
      const base = await identicalEngine(docId);
      if (docId === 'doc1') base['Invoice Number'] = { value: 'INV-2026-7745', status: 'needs_review' };
      return base;
    };
    const report = await runShadowReplay(DOCS, shy);
    expect(report.verdict).toBe('regressed');
    expect(report.regressions[0].kind).toBe('status_downgraded');
  });

  it('same-value review→confirmed upgrade is an improvement, not blocked', async () => {
    const better: EngineRun = async (docId) => {
      const base = await identicalEngine(docId);
      if (docId === 'doc1') base.Memo = { value: 'urgent', status: 'confirmed' };
      return base;
    };
    const { blocked, report } = await shadowCiGate(DOCS, better);
    expect(report.verdict).toBe('improved');
    expect(blocked).toBe(false);
    expect(report.improvements[0].kind).toBe('status_upgraded');
  });

  it('a DIFFERENT confident value over an unreviewed field is NOT an improvement', () => {
    const stored: StoredDoc = {
      docId: 'd',
      fields: { Memo: { value: 'urgent', status: 'needs_review' } },
    };
    const { improvements, regressions } = diffDoc(stored, {
      Memo: { value: 'argent', status: 'confirmed' },
    });
    expect(improvements).toHaveLength(0);
    expect(regressions).toHaveLength(0); // not provably wrong either — neutral
  });

  it('new fields surface as improvements (never silently dropped)', () => {
    const stored: StoredDoc = { docId: 'd', fields: {} };
    const { improvements } = diffDoc(stored, {
      Tax: { value: '260.00', status: 'confirmed' },
    });
    expect(improvements[0].kind).toBe('new_field');
  });

  it('block policy is pluggable', async () => {
    const paranoid = () => true;
    const { blocked } = await shadowCiGate(DOCS, identicalEngine, paranoid);
    expect(blocked).toBe(true);
    expect(defaultBlockPredicate({ verdict: 'improved', regressions: [], improvements: [], docsReplayed: 0, fieldsCompared: 0 })).toBe(false);
  });
});
