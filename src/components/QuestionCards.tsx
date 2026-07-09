/**
 * Question cards (P6.2, 12 §6) — the ≤3 questions worth a human's glance.
 * THIN: ranking lives in the certified core (lwt/question-ranking.ts);
 * this renders RankedQuestions and reports answers upward.
 *
 * Card anatomy: conflict cards show every candidate as a one-tap button
 * (answerable in one glance); low-confidence cards show the value with
 * confirm/fix affordances.
 */

import React from 'react';
import type { RankedQuestion } from '../lwt/question-ranking';

interface QuestionCardsProps {
  questions: RankedQuestion[];
  /** Answer: chosen value (conflict pick or confirmed low-confidence). */
  onAnswer: (fieldId: string, value: string) => void;
  /** User chose to fix by hand — route to the field editor. */
  onFix: (fieldId: string) => void;
}

export default function QuestionCards({ questions, onAnswer, onFix }: QuestionCardsProps) {
  if (questions.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-label="Questions">
      {questions.map((q) => (
        <div
          key={q.fieldId}
          style={{
            border: '1px solid var(--border-color)',
            borderLeft: `3px solid ${q.kind === 'conflict' ? '#d97706' : '#6b7280'}`,
            borderRadius: 4,
            padding: '10px 12px',
            background: 'var(--bg-primary, #fff)',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
            {q.kind === 'conflict' ? 'Two sources disagree — which is right?' : 'Low confidence — is this correct?'}
            <strong style={{ marginLeft: 6, color: 'var(--text-primary)' }}>{q.label}</strong>
          </div>

          {q.kind === 'conflict' ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {q.candidates.map((c) => (
                <button
                  key={c}
                  onClick={() => onAnswer(q.fieldId, c)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 3,
                    border: '1px solid var(--border-color)',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontFamily: 'monospace',
                  }}
                >
                  {c}
                </button>
              ))}
              <button
                onClick={() => onFix(q.fieldId)}
                style={{ padding: '4px 10px', border: 'none', background: 'transparent', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.75rem' }}
              >
                neither
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <code style={{ fontSize: '0.9rem' }}>{q.candidates[0] ?? ''}</code>
              <button
                onClick={() => onAnswer(q.fieldId, q.candidates[0] ?? '')}
                style={{ padding: '3px 10px', borderRadius: 3, border: '1px solid #16a34a', color: '#16a34a', background: 'transparent', cursor: 'pointer' }}
              >
                Yes
              </button>
              <button
                onClick={() => onFix(q.fieldId)}
                style={{ padding: '3px 10px', borderRadius: 3, border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer' }}
              >
                Fix
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
