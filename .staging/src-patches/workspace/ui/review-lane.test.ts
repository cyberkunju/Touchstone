/**
 * Review-lane reducer laws (P2.4) — keyboard-first, single-flight actions,
 * cursor safety. DESTINATION: src/workspace/ui/review-lane.test.ts
 */
import { describe, expect, it } from 'vitest';
import { initReviewLane, reviewLaneReduce, type ReviewItem } from './review-lane';

const ITEMS: ReviewItem[] = [
  { recordId: 'r1', fieldId: 'f1', label: 'Total', value: '1,908.84' },
  { recordId: 'r1', fieldId: 'f2', label: 'Memo', value: 'urgent' },
  { recordId: 'r2', fieldId: 'f1', label: 'Total', value: '88.00' },
];

const key = (k: 'Enter' | 'e' | 'E' | 'ArrowUp' | 'ArrowDown' | 'Escape') =>
  ({ type: 'KEY', key: k }) as const;

describe('review lane keyboard flow', () => {
  it('Enter accepts the current item and advances after ACTION_DONE', () => {
    let s = initReviewLane(ITEMS);
    s = reviewLaneReduce(s, key('Enter'));
    expect(s.pendingAction).toMatchObject({ kind: 'accept', item: ITEMS[0] });
    s = reviewLaneReduce(s, { type: 'ACTION_DONE' });
    expect(s.items).toHaveLength(2);
    expect(s.items[0]).toBe(ITEMS[1]);
    expect(s.cursor).toBe(0);
    expect(s.done).toBe(false);
  });

  it('E opens edit seeded with the current value; Enter saves the edit', () => {
    let s = initReviewLane(ITEMS);
    s = reviewLaneReduce(s, key('E'));
    expect(s.editing).toBe(true);
    expect(s.editValue).toBe('1,908.84');
    s = reviewLaneReduce(s, { type: 'EDIT_INPUT', value: '1908.84' });
    s = reviewLaneReduce(s, key('Enter'));
    expect(s.pendingAction).toMatchObject({ kind: 'save_edit', newValue: '1908.84' });
  });

  it('Escape cancels an edit without any action', () => {
    let s = initReviewLane(ITEMS);
    s = reviewLaneReduce(s, key('e'));
    s = reviewLaneReduce(s, { type: 'EDIT_INPUT', value: 'garbage' });
    s = reviewLaneReduce(s, key('Escape'));
    expect(s.editing).toBe(false);
    expect(s.pendingAction).toBeNull();
    expect(s.items[0].value).toBe('1,908.84');
  });

  it('arrows navigate and clamp at both ends', () => {
    let s = initReviewLane(ITEMS);
    s = reviewLaneReduce(s, key('ArrowUp'));
    expect(s.cursor).toBe(0);
    s = reviewLaneReduce(s, key('ArrowDown'));
    s = reviewLaneReduce(s, key('ArrowDown'));
    s = reviewLaneReduce(s, key('ArrowDown'));
    expect(s.cursor).toBe(2);
  });

  it('single-flight: keys are inert while an action is pending', () => {
    let s = initReviewLane(ITEMS);
    s = reviewLaneReduce(s, key('Enter'));
    const pending = s.pendingAction;
    s = reviewLaneReduce(s, key('ArrowDown'));
    s = reviewLaneReduce(s, key('Enter'));
    expect(s.pendingAction).toBe(pending);
    expect(s.cursor).toBe(0);
  });

  it('finishing the last item closes the lane', () => {
    let s = initReviewLane([ITEMS[0]]);
    s = reviewLaneReduce(s, key('Enter'));
    s = reviewLaneReduce(s, { type: 'ACTION_DONE' });
    expect(s.done).toBe(true);
    // Further input is inert — no crashes on empty state.
    expect(reviewLaneReduce(s, key('Enter'))).toBe(s);
  });

  it('cursor stays valid when the LAST item is accepted', () => {
    let s = initReviewLane(ITEMS);
    s = reviewLaneReduce(s, key('ArrowDown'));
    s = reviewLaneReduce(s, key('ArrowDown'));   // cursor = 2 (last)
    s = reviewLaneReduce(s, key('Enter'));
    s = reviewLaneReduce(s, { type: 'ACTION_DONE' });
    expect(s.cursor).toBe(1);                    // clamped to new last
    expect(s.items).toHaveLength(2);
  });

  it('empty lane initializes done', () => {
    expect(initReviewLane([]).done).toBe(true);
  });
});
