/**
 * P2.3 tests — the routing state machine, exhaustively.
 * Property: every (state, event) pair is either an explicit legal transition
 * or throws IllegalTransition. Mis-routes must be unrepresentable.
 */
import { describe, expect, it } from 'vitest';
import {
  INITIAL_ROUTE,
  IllegalTransition,
  TEMPLATE_MATCH_CONFIRM,
  TEMPLATE_MATCH_KNOWN,
  bulkNextToActivate,
  bulkRoute,
  createBulkQueue,
  isTerminal,
  route,
  type RouteEvent,
  type RouteState,
} from './routing';

const E = {
  hit: { type: 'SHA256_HIT', existingRecordIds: ['r1'] } as RouteEvent,
  miss: { type: 'SHA256_MISS' } as RouteEvent,
  bundle: { type: 'BUNDLE_READY' } as RouteEvent,
  scoreHigh: { type: 'TEMPLATE_SCORED', familyId: 'fam1', score: 0.9 } as RouteEvent,
  scoreMid: { type: 'TEMPLATE_SCORED', familyId: 'fam1', score: 0.6 } as RouteEvent,
  scoreLow: { type: 'TEMPLATE_SCORED', familyId: 'fam1', score: 0.3 } as RouteEvent,
  scoreNone: { type: 'TEMPLATE_SCORED', familyId: null, score: 0.99 } as RouteEvent,
  confirm: { type: 'USER_CONFIRMED_FAMILY' } as RouteEvent,
  reject: { type: 'USER_REJECTED_FAMILY' } as RouteEvent,
  again: { type: 'PROCESS_ANYWAY' } as RouteEvent,
  draft: { type: 'DRAFT_CREATED', draftFamilyId: 'draft1' } as RouteEvent,
  approved: { type: 'FAMILY_APPROVED', familyId: 'fam2' } as RouteEvent,
  appendClean: { type: 'RECORD_APPENDED', familyId: 'fam1', recordId: 'rec1', openFieldIds: [] } as RouteEvent,
  appendReview: { type: 'RECORD_APPENDED', familyId: 'fam1', recordId: 'rec1', openFieldIds: ['f1'] } as RouteEvent,
  resolve: { type: 'REVIEW_RESOLVED' } as RouteEvent,
  error: { type: 'ERROR', reason: 'boom' } as RouteEvent,
};

describe('the golden paths (11 §4 diagram)', () => {
  it('J1: known family, straight-through (STP)', () => {
    let s = INITIAL_ROUTE;
    s = route(s, E.miss);
    s = route(s, E.bundle);
    s = route(s, E.scoreHigh);
    expect(s).toMatchObject({ kind: 'known_family', familyId: 'fam1', userConfirmed: false });
    s = route(s, E.appendClean);
    s = route(s, E.resolve);
    expect(s).toMatchObject({ kind: 'done', straightThrough: true });
    expect(isTerminal(s)).toBe(true);
  });

  it('J2: mid-confidence asks the user; confirm → known → review lane', () => {
    let s = route(route(INITIAL_ROUTE, E.miss), E.bundle);
    s = route(s, E.scoreMid);
    expect(s.kind).toBe('confirm_family');
    s = route(s, E.confirm);
    expect(s).toMatchObject({ kind: 'known_family', userConfirmed: true });
    s = route(s, E.appendReview);
    s = route(s, E.resolve);
    expect(s.kind).toBe('review_lane');
    s = route(s, E.resolve);
    expect(s).toMatchObject({ kind: 'done', straightThrough: false });
  });

  it('J4: unknown layout → discovery → draft → approval → append', () => {
    let s = route(route(INITIAL_ROUTE, E.miss), E.bundle);
    s = route(s, E.scoreLow);
    expect(s.kind).toBe('discovery');
    s = route(s, E.draft);
    expect(s).toMatchObject({ kind: 'draft_family', draftFamilyId: 'draft1' });
    s = route(s, E.approved);
    s = route(s, E.appendClean);
    s = route(s, E.resolve);
    expect(s.kind).toBe('done');
  });

  it('duplicate is terminal unless the user overrides', () => {
    const dup = route(INITIAL_ROUTE, E.hit);
    expect(dup.kind).toBe('duplicate');
    expect(isTerminal(dup)).toBe(true);
    const reprocess = route(dup, E.again);
    expect(reprocess.kind).toBe('perceiving');
  });

  it('user rejection at confirm falls to discovery', () => {
    let s = route(route(INITIAL_ROUTE, E.miss), E.bundle);
    s = route(s, E.scoreMid);
    s = route(s, E.reject);
    expect(s.kind).toBe('discovery');
  });

  it('null family with any score goes to discovery (no family to match)', () => {
    let s = route(route(INITIAL_ROUTE, E.miss), E.bundle);
    s = route(s, E.scoreNone);
    expect(s.kind).toBe('discovery');
  });
});

describe('threshold law (frozen constants)', () => {
  it('boundaries are exact: ≥0.75 known, ≥0.55 confirm, else discovery', () => {
    const at = (score: number) =>
      route(route(route(INITIAL_ROUTE, E.miss), E.bundle), {
        type: 'TEMPLATE_SCORED', familyId: 'f', score,
      }).kind;
    expect(at(TEMPLATE_MATCH_KNOWN)).toBe('known_family');
    expect(at(TEMPLATE_MATCH_KNOWN - 1e-9)).toBe('confirm_family');
    expect(at(TEMPLATE_MATCH_CONFIRM)).toBe('confirm_family');
    expect(at(TEMPLATE_MATCH_CONFIRM - 1e-9)).toBe('discovery');
  });
});

describe('illegality is loud (the anti-misroute property)', () => {
  const STATES: RouteState[] = [
    { kind: 'hashing' },
    { kind: 'duplicate', existingRecordIds: [] },
    { kind: 'perceiving' },
    { kind: 'identifying' },
    { kind: 'known_family', familyId: 'f', matchScore: 0.9, userConfirmed: false },
    { kind: 'confirm_family', familyId: 'f', matchScore: 0.6 },
    { kind: 'discovery' },
    { kind: 'draft_family', draftFamilyId: 'd' },
    { kind: 'family_approved', familyId: 'f' },
    { kind: 'record_appended', familyId: 'f', recordId: 'r', openFieldIds: [] },
    { kind: 'review_lane', familyId: 'f', recordId: 'r', openFieldIds: ['x'] },
    { kind: 'done', familyId: 'f', recordId: 'r', straightThrough: true },
    { kind: 'failed', reason: 'x' },
  ];
  const EVENTS = Object.values(E);

  it('every (state, event) pair either transitions or throws — nothing silent', () => {
    let legal = 0;
    let illegal = 0;
    for (const s of STATES) {
      for (const e of EVENTS) {
        try {
          const next = route(s, e);
          expect(next).toBeTruthy();
          legal++;
        } catch (err) {
          expect(err).toBeInstanceOf(IllegalTransition);
          illegal++;
        }
      }
    }
    // The diagram allows exactly these many legal pairs; a new legal pair
    // appearing without this number changing = an unreviewed route.
    // Count: hashing 2 + duplicate 1 + perceiving 1 + identifying 4 +
    // confirm 2 + known 2 + discovery 1 + draft 1 + approved 2 +
    // appended 1 + review 1 = 18 legal, plus ERROR from each of the 10
    // non-terminal states = 28.
    expect(legal + illegal).toBe(STATES.length * EVENTS.length);
    expect(legal).toBe(28);
  });

  it('terminal states accept nothing (except duplicate override)', () => {
    expect(() => route({ kind: 'done', familyId: 'f', recordId: 'r', straightThrough: true }, E.resolve)).toThrow(IllegalTransition);
    expect(() => route({ kind: 'failed', reason: 'x' }, E.miss)).toThrow(IllegalTransition);
    expect(() => route({ kind: 'failed', reason: 'x' }, E.error)).toThrow(IllegalTransition);
  });

  it('ERROR is legal from every non-terminal state (per-file isolation)', () => {
    for (const s of STATES.filter((x) => !isTerminal(x))) {
      const next = route(s, E.error);
      expect(next).toMatchObject({ kind: 'failed', reason: 'boom' });
    }
  });
});

describe('bulk queue (concurrency-2, per-file isolation)', () => {
  it('activates at most `concurrency` files, in order', () => {
    const q = createBulkQueue(
      [1, 2, 3, 4].map((n) => ({ fileId: `f${n}`, fileName: `doc${n}.png` })),
    );
    expect(bulkNextToActivate(q)).toEqual(['f1', 'f2']);
  });

  it('one file failing never touches siblings', () => {
    let q = createBulkQueue([{ fileId: 'a', fileName: 'a.png' }, { fileId: 'b', fileName: 'b.png' }]);
    q = bulkRoute(q, 'a', E.miss);
    q = bulkRoute(q, 'a', E.error);
    expect(q.items.find((i) => i.fileId === 'a')!.state).toMatchObject({ kind: 'failed' });
    expect(q.items.find((i) => i.fileId === 'b')!.state).toMatchObject({ kind: 'hashing' });
  });

  it('terminal items free their active slot', () => {
    let q = createBulkQueue([{ fileId: 'a', fileName: 'a.png' }, { fileId: 'b', fileName: 'b.png' }, { fileId: 'c', fileName: 'c.png' }]);
    q = { ...q, active: ['a', 'b'] };
    q = bulkRoute(q, 'a', E.hit); // duplicate = terminal
    expect(q.active).toEqual(['b']);
    expect(bulkNextToActivate(q)).toEqual(['c']);
  });

  it('unknown fileId throws', () => {
    const q = createBulkQueue([{ fileId: 'a', fileName: 'a.png' }]);
    expect(() => bulkRoute(q, 'zz', E.miss)).toThrow(/Unknown fileId/);
  });
});
