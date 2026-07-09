/**
 * Review-lane keyboard state machine (P2.4) — keyboard-first triage of
 * needs_review/conflict fields. Pure reducer; the component dispatches
 * key events and renders state.
 *
 * Keys (spec 22_HANDOFF): Enter = accept current, E = edit, ArrowUp/Down
 * = navigate, Escape = cancel edit. Accepting advances to the next open
 * field; finishing the list closes the lane.
 *
 * DESTINATION: src/workspace/ui/review-lane.ts
 */

export interface ReviewItem {
  recordId: string;
  fieldId: string;
  label: string;
  value: string;
}

export interface ReviewLaneState {
  items: ReviewItem[];
  cursor: number;                    // index into items
  editing: boolean;
  editValue: string;
  /** Emitted effects the component executes (store writes). */
  pendingAction: ReviewAction | null;
  done: boolean;
}

export type ReviewAction =
  | { kind: 'accept'; item: ReviewItem }
  | { kind: 'save_edit'; item: ReviewItem; newValue: string };

export type ReviewEvent =
  | { type: 'KEY'; key: 'Enter' | 'e' | 'E' | 'ArrowUp' | 'ArrowDown' | 'Escape' }
  | { type: 'EDIT_INPUT'; value: string }
  | { type: 'ACTION_DONE' };

export function initReviewLane(items: ReviewItem[]): ReviewLaneState {
  return {
    items,
    cursor: 0,
    editing: false,
    editValue: '',
    pendingAction: null,
    done: items.length === 0,
  };
}

export function reviewLaneReduce(state: ReviewLaneState, event: ReviewEvent): ReviewLaneState {
  if (state.done) return state;
  const current = state.items[state.cursor];

  if (event.type === 'ACTION_DONE') {
    // Store write finished — advance past the acted-on item.
    const nextItems = state.items.filter((_, i) => i !== state.cursor);
    const cursor = Math.min(state.cursor, Math.max(0, nextItems.length - 1));
    return {
      ...state,
      items: nextItems,
      cursor,
      editing: false,
      editValue: '',
      pendingAction: null,
      done: nextItems.length === 0,
    };
  }

  if (event.type === 'EDIT_INPUT') {
    return state.editing ? { ...state, editValue: event.value } : state;
  }

  // KEY events. While an action is pending, input is ignored (single-flight).
  if (state.pendingAction) return state;

  const key = event.key;
  if (state.editing) {
    if (key === 'Escape') {
      return { ...state, editing: false, editValue: '' };
    }
    if (key === 'Enter') {
      return {
        ...state,
        pendingAction: { kind: 'save_edit', item: current, newValue: state.editValue },
      };
    }
    return state; // arrows/E inert while editing
  }

  switch (key) {
    case 'Enter':
      return { ...state, pendingAction: { kind: 'accept', item: current } };
    case 'e':
    case 'E':
      return { ...state, editing: true, editValue: current.value };
    case 'ArrowDown':
      return { ...state, cursor: Math.min(state.items.length - 1, state.cursor + 1) };
    case 'ArrowUp':
      return { ...state, cursor: Math.max(0, state.cursor - 1) };
    default:
      return state;
  }
}
