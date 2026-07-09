/**
 * Workspace view (P2.4 IA) — families → records table → record detail.
 *
 * THIN by law: all data logic lives in the stores (family-store,
 * record-store) and export.ts; this component renders and routes clicks.
 * Statuses render verbatim — a needs_review value looks like one.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Download, FolderOpen, RefreshCw } from 'lucide-react';

import { listFamilies, approveFamily } from '../storage/family-store';
import { listRecordsByFamily, applyUserEdit } from '../storage/record-store';
import { getDocGraph } from '../storage/db';
import { putBenchRun } from '../storage/workspace-db';
import { buildBenchRun, replayGraph, type RecordReplay } from '../workspace/replay';
import { buildCsv, exportColumns } from '../workspace/export';
import type { DocRecord, Family } from '../workspace/types';
import WorkspaceTable, { type WorkspaceRow } from './WorkspaceTable';

const STATUS_COLORS: Record<string, string> = {
  confirmed: 'var(--status-confirmed)',
  needs_review: 'var(--status-review)',
  conflict: 'var(--status-conflict)',
  invalid: 'var(--status-conflict)',
  missing: 'var(--text-tertiary)',
  unsupported: 'var(--text-tertiary)',
  rejected: 'var(--status-conflict)',
};

export default function WorkspaceView() {
  const [families, setFamilies] = useState<Family[]>([]);
  const [activeFamily, setActiveFamily] = useState<Family | null>(null);
  const [records, setRecords] = useState<DocRecord[]>([]);
  const [activeRecord, setActiveRecord] = useState<DocRecord | null>(null);
  const [replayState, setReplayState] = useState<
    | { phase: 'idle' }
    | { phase: 'running'; done: number; total: number }
    | { phase: 'done'; verdict: string; diffs: number; records: number }
  >({ phase: 'idle' });

  /** P6.3 shadow-CI: replay every stored graph through the CURRENT engine
   *  and persist the verdict. Regressions show loudly — that is the point. */
  const runReplay = async () => {
    const fams = await listFamilies();
    const all: DocRecord[] = [];
    for (const f of fams) all.push(...(await listRecordsByFamily(f.familyId)));
    if (all.length === 0) {
      setReplayState({ phase: 'done', verdict: 'identical', diffs: 0, records: 0 });
      return;
    }
    setReplayState({ phase: 'running', done: 0, total: all.length });
    const replays: RecordReplay[] = [];
    for (let k = 0; k < all.length; k++) {
      const rec = all[k];
      try {
        const g = await getDocGraph(rec.docGraphId);
        if (g) replays.push(replayGraph(rec.recordId, g));
      } catch {
        /* an unreadable graph is skipped — replay judges engines, not storage */
      }
      setReplayState({ phase: 'running', done: k + 1, total: all.length });
    }
    const run = buildBenchRun('stored', 'current', replays);
    await putBenchRun(run).catch(() => {});
    setReplayState({
      phase: 'done',
      verdict: run.verdict,
      diffs: run.perRecord.reduce((s, r) => s + r.fieldDiffs.length, 0),
      records: replays.length,
    });
  };

  const refresh = useCallback(async () => {
    const fams = await listFamilies();
    setFamilies(fams);
    if (activeFamily) {
      const fam = fams.find((f) => f.familyId === activeFamily.familyId) ?? null;
      setActiveFamily(fam);
      setRecords(fam ? await listRecordsByFamily(fam.familyId) : []);
    }
  }, [activeFamily]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openFamily = async (fam: Family) => {
    setActiveFamily(fam);
    setActiveRecord(null);
    setRecords(await listRecordsByFamily(fam.familyId));
  };

  const columns = useMemo(
    () => (activeFamily ? exportColumns(activeFamily) : []),
    [activeFamily],
  );

  const rows: WorkspaceRow[] = useMemo(
    () =>
      records.map((r) => ({
        id: r.recordId,
        cells: [
          r.sourceFile.name,
          ...columns.map((c) => r.values[c.fieldId]?.value ?? ''),
          r.review.open ? `${r.review.openFieldIds.length} open` : '—',
        ],
      })),
    [records, columns],
  );

  const downloadCsv = () => {
    if (!activeFamily) return;
    const csv = buildCsv(activeFamily, records);
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${activeFamily.name.replace(/[^\w-]+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /* ---------------------------- record detail --------------------------- */
  if (activeFamily && activeRecord) {
    return (
      <div style={{ padding: 24, overflowY: 'auto', height: '100%' }}>
        <Breadcrumb
          parts={[
            { label: 'Families', onClick: () => { setActiveFamily(null); setActiveRecord(null); } },
            { label: activeFamily.name, onClick: () => setActiveRecord(null) },
            { label: activeRecord.sourceFile.name },
          ]}
        />
        <h2 style={h2Style}>{activeRecord.sourceFile.name}</h2>
        <p style={subStyle}>
          Added {new Date(activeRecord.createdAt).toLocaleString()} · sha256{' '}
          {activeRecord.sourceFile.sha256.slice(0, 12)}…
          {activeRecord.review.open && (
            <strong style={{ color: 'var(--status-review)' }}>
              {' '}· {activeRecord.review.openFieldIds.length} field(s) need review
            </strong>
          )}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 720, marginTop: 16 }}>
          {activeFamily.formSchema.map((f) => {
            const v = activeRecord.values[f.fieldId];
            if (!v) return null;
            const isAsset = f.valueType === 'photo' || f.valueType === 'signature' || f.valueType === 'seal';
            return (
              <div key={f.fieldId} style={fieldRowStyle}>
                <div style={{ flex: '0 0 220px' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{f.label}</div>
                  <div style={{ fontSize: '0.7rem', color: STATUS_COLORS[v.status] ?? 'var(--text-tertiary)' }}>
                    {v.status}
                    {v.justification.confidence > 0 && ` · ${(v.justification.confidence * 100).toFixed(0)}%`}
                  </div>
                </div>
                {isAsset ? (
                  <span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                    Visual asset — inspect in the Process view{activeRecord.assetRefs[f.fieldId] ? ` (${activeRecord.assetRefs[f.fieldId]})` : ''}
                  </span>
                ) : (
                  <input
                    defaultValue={v.value}
                    onBlur={async (e) => {
                      if (e.target.value !== v.value) {
                        const updated = await applyUserEdit(activeRecord.recordId, f.fieldId, e.target.value);
                        setActiveRecord(updated);
                        void refresh();
                      }
                    }}
                    style={inputStyle}
                  />
                )}
              </div>
            );
          })}
        </div>
        {activeRecord.values && Object.values(activeRecord.values).some((v) => v.justification.reasons.length > 0) && (
          <details style={{ marginTop: 20, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Justifications</summary>
            <ul style={{ marginTop: 8, paddingLeft: 20 }}>
              {activeFamily.formSchema.flatMap((f) => {
                const v = activeRecord.values[f.fieldId];
                return v && v.justification.reasons.length > 0
                  ? [<li key={f.fieldId}><strong>{f.label}:</strong> {v.justification.reasons.join('; ')}</li>]
                  : [];
              })}
            </ul>
          </details>
        )}
      </div>
    );
  }

  /* ---------------------------- records table --------------------------- */
  if (activeFamily) {
    return (
      <div style={{ padding: 24, overflowY: 'auto', height: '100%' }}>
        <Breadcrumb
          parts={[
            { label: 'Families', onClick: () => setActiveFamily(null) },
            { label: activeFamily.name },
          ]}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0 16px' }}>
          <div>
            <h2 style={h2Style}>{activeFamily.name}</h2>
            <p style={subStyle}>
              {records.length} record(s) · STP {(activeFamily.stats.stp * 100).toFixed(0)}% ·{' '}
              {activeFamily.stats.questionsPerDoc.toFixed(1)} questions/doc
              {activeFamily.status === 'draft' && (
                <strong style={{ color: 'var(--status-review)' }}> · DRAFT — not exported</strong>
              )}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {activeFamily.status === 'draft' && (
              <button
                style={btnStyle}
                onClick={async () => { await approveFamily(activeFamily.familyId); void refresh(); }}
              >
                Approve family
              </button>
            )}
            <button style={btnStyle} onClick={downloadCsv} disabled={activeFamily.status === 'draft'}>
              <Download size={13} /> CSV
            </button>
          </div>
        </div>
        <WorkspaceTable
          columns={['Source', ...columns.map((c) => c.label), 'Review']}
          rows={rows}
          onRowClick={(id) => setActiveRecord(records.find((r) => r.recordId === id) ?? null)}
        />
      </div>
    );
  }

  /* ---------------------------- families list --------------------------- */
  return (
    <div style={{ padding: 24, overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={h2Style}>Workspace</h2>
          <p style={subStyle}>Every processed document, grouped into families. Click a family to see its records.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {replayState.phase === 'running' && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
              Replaying {replayState.done}/{replayState.total}…
            </span>
          )}
          {replayState.phase === 'done' && (
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color:
                  replayState.verdict === 'regressed'
                    ? 'var(--status-conflict)'
                    : replayState.verdict === 'improved'
                      ? 'var(--status-confirmed)'
                      : 'var(--text-secondary)',
              }}
            >
              Replay: {replayState.verdict.toUpperCase()} ({replayState.records} record(s), {replayState.diffs} diff(s))
            </span>
          )}
          <button style={btnStyle} onClick={() => void runReplay()} disabled={replayState.phase === 'running'}>
            Replay engine check
          </button>
          <button style={btnStyle} onClick={() => void refresh()}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>
      {families.length === 0 ? (
        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
          No families yet — process a document and it will file itself here.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 720 }}>
          {families.map((f) => (
            <button key={f.familyId} onClick={() => void openFamily(f)} style={familyCardStyle}>
              <FolderOpen size={16} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                  {f.name}
                  {f.status === 'draft' && (
                    <span style={{ marginLeft: 8, fontSize: '0.7rem', color: 'var(--status-review)' }}>DRAFT</span>
                  )}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                  {f.stats.records} record(s) · {f.formSchema.length} fields · STP {(f.stats.stp * 100).toFixed(0)}%
                </div>
              </div>
              <ChevronRight size={14} style={{ color: 'var(--text-tertiary)' }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- bits ---------------------------------- */

function Breadcrumb({ parts }: { parts: { label: string; onClick?: () => void }[] }) {
  return (
    <nav style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'flex', gap: 6, alignItems: 'center' }}>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span>/</span>}
          {p.onClick ? (
            <button onClick={p.onClick} style={{ border: 'none', background: 'none', color: 'var(--accent-blue)', cursor: 'pointer', padding: 0, fontSize: 'inherit' }}>
              {p.label}
            </button>
          ) : (
            <span>{p.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

const h2Style: React.CSSProperties = {
  fontSize: '1.2rem', fontWeight: 600, fontFamily: 'var(--font-display)',
};
const subStyle: React.CSSProperties = { fontSize: '0.8rem', color: 'var(--text-secondary)' };
const btnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
  border: '1px solid var(--border-color)', borderRadius: 3, background: 'var(--bg-secondary)',
  fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-primary)',
};
const familyCardStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
  border: '1px solid var(--border-color)', borderRadius: 4, background: 'var(--bg-secondary)',
  cursor: 'pointer', width: '100%',
};
const fieldRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
  border: '1px solid var(--border-color)', borderRadius: 3, background: 'var(--bg-secondary)',
};
const inputStyle: React.CSSProperties = {
  flex: 1, padding: '6px 10px', border: '1px solid var(--border-color)', borderRadius: 2,
  fontSize: '0.85rem', background: 'var(--bg-primary)', color: 'var(--text-primary)',
};
