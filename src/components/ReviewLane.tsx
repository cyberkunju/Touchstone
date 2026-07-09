/**
 * Review lane (P2.4, 12 §6) — keyboard-first triage over needs_review /
 * conflict fields. THIN by law: every decision lives in the certified
 * reducer (workspace/ui/review-lane.ts); this component only dispatches
 * key events, renders state, and executes emitted actions.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  initReviewLane,
  reviewLaneReduce,
  type ReviewAction,
  type ReviewItem,
  type ReviewLaneState,
} from '../workspace/ui/review-lane';

interface ReviewLaneProps {
  items: ReviewItem[];
  /** Executes an accepted/edited value (store write). Resolve to advance. */
  onAction: (action: ReviewAction) => Promise<void> | void;
  onSelectField?: (fieldId: string) => void;
  onClose: () => void;
}

export default function ReviewLane({ items, onAction, onSelectField, onClose }: ReviewLaneProps) {
  const [state, setState] = useState<ReviewLaneState>(() => initReviewLane(items));
  const editRef = useRef<HTMLInputElement>(null);

  // Execute pending actions single-flight; ACTION_DONE advances the lane.
  useEffect(() => {
    if (!state.pendingAction) return;
    let cancelled = false;
    Promise.resolve(onAction(state.pendingAction)).then(() => {
      if (!cancelled) setState((s) => reviewLaneReduce(s, { type: 'ACTION_DONE' }));
    });
    return () => {
      cancelled = true;
    };
  }, [state.pendingAction, onAction]);

  // Keyboard capture while the lane is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (state.editing && e.key !== 'Escape' && e.key !== 'Enter') return; // typing
      const keys = ['Enter', 'e', 'E', 'ArrowUp', 'ArrowDown', 'Escape'] as const;
      const key = keys.find((k) => k === e.key);
      if (!key) return;
      e.preventDefault();
      setState((s) => reviewLaneReduce(s, { type: 'KEY', key }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.editing]);

  useEffect(() => {
    if (state.editing) editRef.current?.focus();
  }, [state.editing]);

  useEffect(() => {
    const current = state.items[state.cursor];
    if (current && onSelectField) onSelectField(current.fieldId);
  }, [state.cursor, state.items, onSelectField]);

  useEffect(() => {
    if (state.done) onClose();
  }, [state.done, onClose]);

  if (state.done) return null;
  const current = state.items[state.cursor];

  return (
    <div
      role="dialog"
      aria-label="Review lane"
      style={{
        border: '1px solid var(--border-color)',
        borderRadius: 4,
        padding: 12,
        background: 'var(--bg-secondary, #f8f8f8)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
        <strong>
          Review {state.cursor + 1} / {state.items.length}
        </strong>
        <span style={{ color: 'var(--text-secondary)' }}>
          Enter accept · E edit · ↑↓ move · Esc cancel
        </span>
      </div>

      <div style={{ fontSize: '0.9rem' }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{current.label}</div>
        {state.editing ? (
          <input
            ref={editRef}
            value={state.editValue}
            onChange={(e) => setState((s) => reviewLaneReduce(s, { type: 'EDIT_INPUT', value: e.target.value }))}
            style={{ width: '100%', padding: '4px 6px', fontFamily: 'inherit' }}
            aria-label={`Edit ${current.label}`}
          />
        ) : (
          <div style={{ fontWeight: 600 }}>{current.value || <em>(empty)</em>}</div>
        )}
      </div>

      {state.pendingAction && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Saving…</div>
      )}
    </div>
  );
}
