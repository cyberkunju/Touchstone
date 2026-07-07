/**
 * Routing state machine (P2.3) — every upload takes exactly this path.
 *
 * Documentation/11 §4 — the diagram is LAW:
 *
 *   [*] → Hashing → Duplicate            (sha256 hit)
 *                 → Perceiving           (miss)
 *   Perceiving → Identifying             (bundle ready)
 *   Identifying → KnownFamily            (template ≥ 0.75)
 *               → ConfirmFamily          (0.55–0.75 — ask the user)
 *               → Discovery              (< 0.55)
 *   KnownFamily → RecordAppended         (JIT + solver)
 *   ConfirmFamily → KnownFamily          (user confirms)
 *                 → Discovery            (user rejects)
 *   Discovery → DraftFamily              (unknown layout → generated form)
 *   DraftFamily → FamilyApproved         (user approves/edits schema)
 *   RecordAppended → ReviewLane          (unattested fields exist)
 *                  → Done                (fully attested — STP hit)
 *
 * DESIGN: a pure reducer. `route(state, event) → state` with every illegal
 * transition throwing loudly (a mis-route is the workspace equivalent of a
 * silent error — it appends data to the wrong family). Side effects (perceive,
 * solve, append) live in the driver; the machine only decides. This makes the
 * spine exhaustively unit-testable without a browser.
 *
 * Thresholds are FROZEN here as named constants — changing them is a
 * change-control event, not a tweak.
 */

export const TEMPLATE_MATCH_KNOWN = 0.75;
export const TEMPLATE_MATCH_CONFIRM = 0.55;

export type RouteState =
  | { kind: 'hashing' }
  | { kind: 'duplicate'; existingRecordIds: string[] }
  | { kind: 'perceiving' }
  | { kind: 'identifying' }
  | { kind: 'known_family'; familyId: string; matchScore: number; userConfirmed: boolean }
  | { kind: 'confirm_family'; familyId: string; matchScore: number }
  | { kind: 'discovery' }
  | { kind: 'draft_family'; draftFamilyId: string }
  | { kind: 'family_approved'; familyId: string }
  | { kind: 'record_appended'; familyId: string; recordId: string; openFieldIds: string[] }
  | { kind: 'review_lane'; familyId: string; recordId: string; openFieldIds: string[] }
  | { kind: 'done'; familyId: string; recordId: string; straightThrough: boolean }
  | { kind: 'failed'; reason: string };

export type RouteEvent =
  | { type: 'SHA256_HIT'; existingRecordIds: string[] }
  | { type: 'SHA256_MISS' }
  | { type: 'BUNDLE_READY' }
  | { type: 'TEMPLATE_SCORED'; familyId: string | null; score: number }
  | { type: 'USER_CONFIRMED_FAMILY' }
  | { type: 'USER_REJECTED_FAMILY' }
  | { type: 'PROCESS_ANYWAY' } // duplicate override: user chose to re-process
  | { type: 'DRAFT_CREATED'; draftFamilyId: string }
  | { type: 'FAMILY_APPROVED'; familyId: string }
  | { type: 'RECORD_APPENDED'; familyId: string; recordId: string; openFieldIds: string[] }
  | { type: 'REVIEW_RESOLVED' }
  | { type: 'ERROR'; reason: string };

export const INITIAL_ROUTE: RouteState = { kind: 'hashing' };

/** True for states where the flow has terminated. */
export function isTerminal(s: RouteState): boolean {
  return s.kind === 'done' || s.kind === 'failed' || s.kind === 'duplicate';
}

export class IllegalTransition extends Error {
  constructor(state: RouteState, event: RouteEvent) {
    super(`Illegal transition: ${state.kind} × ${event.type}`);
    this.name = 'IllegalTransition';
  }
}

/**
 * The pure reducer. Every (state, event) pair not explicitly allowed throws
 * IllegalTransition — mis-routes must die loudly, never pass silently.
 */
export function route(state: RouteState, event: RouteEvent): RouteState {
  // ERROR is legal from any non-terminal state: per-file isolation (11 §4).
  if (event.type === 'ERROR') {
    if (isTerminal(state)) throw new IllegalTransition(state, event);
    return { kind: 'failed', reason: event.reason };
  }

  switch (state.kind) {
    case 'hashing':
      if (event.type === 'SHA256_HIT') {
        return { kind: 'duplicate', existingRecordIds: event.existingRecordIds };
      }
      if (event.type === 'SHA256_MISS') return { kind: 'perceiving' };
      throw new IllegalTransition(state, event);

    case 'duplicate':
      // Terminal UNLESS the user explicitly overrides ("process again anyway").
      if (event.type === 'PROCESS_ANYWAY') return { kind: 'perceiving' };
      throw new IllegalTransition(state, event);

    case 'perceiving':
      if (event.type === 'BUNDLE_READY') return { kind: 'identifying' };
      throw new IllegalTransition(state, event);

    case 'identifying': {
      if (event.type !== 'TEMPLATE_SCORED') throw new IllegalTransition(state, event);
      const { familyId, score } = event;
      if (familyId !== null && score >= TEMPLATE_MATCH_KNOWN) {
        return { kind: 'known_family', familyId, matchScore: score, userConfirmed: false };
      }
      if (familyId !== null && score >= TEMPLATE_MATCH_CONFIRM) {
        return { kind: 'confirm_family', familyId, matchScore: score };
      }
      return { kind: 'discovery' };
    }

    case 'confirm_family':
      if (event.type === 'USER_CONFIRMED_FAMILY') {
        return {
          kind: 'known_family',
          familyId: state.familyId,
          matchScore: state.matchScore,
          userConfirmed: true,
        };
      }
      if (event.type === 'USER_REJECTED_FAMILY') return { kind: 'discovery' };
      throw new IllegalTransition(state, event);

    case 'known_family':
      if (event.type === 'RECORD_APPENDED') {
        return {
          kind: 'record_appended',
          familyId: event.familyId,
          recordId: event.recordId,
          openFieldIds: event.openFieldIds,
        };
      }
      throw new IllegalTransition(state, event);

    case 'discovery':
      if (event.type === 'DRAFT_CREATED') {
        return { kind: 'draft_family', draftFamilyId: event.draftFamilyId };
      }
      throw new IllegalTransition(state, event);

    case 'draft_family':
      if (event.type === 'FAMILY_APPROVED') {
        return { kind: 'family_approved', familyId: event.familyId };
      }
      // Draft records park until approval — appends are queued by the driver,
      // never routed through while in draft (11 §5).
      throw new IllegalTransition(state, event);

    case 'family_approved':
      if (event.type === 'RECORD_APPENDED') {
        return {
          kind: 'record_appended',
          familyId: event.familyId,
          recordId: event.recordId,
          openFieldIds: event.openFieldIds,
        };
      }
      throw new IllegalTransition(state, event);

    case 'record_appended':
      // Auto-fork: unattested fields → review lane; else done (STP).
      if (event.type === 'REVIEW_RESOLVED') {
        // Explicit resolution event covers both forks deterministically.
        return state.openFieldIds.length > 0
          ? {
              kind: 'review_lane',
              familyId: state.familyId,
              recordId: state.recordId,
              openFieldIds: state.openFieldIds,
            }
          : {
              kind: 'done',
              familyId: state.familyId,
              recordId: state.recordId,
              straightThrough: true,
            };
      }
      throw new IllegalTransition(state, event);

    case 'review_lane':
      if (event.type === 'REVIEW_RESOLVED') {
        return {
          kind: 'done',
          familyId: state.familyId,
          recordId: state.recordId,
          straightThrough: false,
        };
      }
      throw new IllegalTransition(state, event);

    case 'done':
    case 'failed':
      throw new IllegalTransition(state, event);
  }
}

/* ------------------------------- bulk queue -------------------------------- */

/** Per-file bulk item: one state machine instance, fully isolated (11 §4). */
export interface BulkItem {
  fileId: string;
  fileName: string;
  state: RouteState;
}

/**
 * Bulk queue driver state: concurrency-2 scheduler over per-file machines.
 * One file's failure sets ITS terminal state and never touches siblings.
 * Pure data — the async driver lives in the UI layer.
 */
export interface BulkQueue {
  items: BulkItem[];
  /** fileIds currently being driven (≤ concurrency). */
  active: string[];
  concurrency: number;
}

export function createBulkQueue(files: { fileId: string; fileName: string }[], concurrency = 2): BulkQueue {
  return {
    items: files.map((f) => ({ ...f, state: INITIAL_ROUTE })),
    active: [],
    concurrency,
  };
}

/** Advance one file's machine; isolation by construction (only that item
 *  changes). Throws IllegalTransition for driver bugs — loudly. */
export function bulkRoute(queue: BulkQueue, fileId: string, event: RouteEvent): BulkQueue {
  const idx = queue.items.findIndex((i) => i.fileId === fileId);
  if (idx === -1) throw new Error(`Unknown fileId: ${fileId}`);
  const next = route(queue.items[idx].state, event);
  const items = queue.items.slice();
  items[idx] = { ...items[idx], state: next };
  const active = isTerminal(next)
    ? queue.active.filter((id) => id !== fileId)
    : queue.active;
  return { ...queue, items, active };
}

/** Picks the next idle files to activate, up to concurrency. Deterministic:
 *  queue order. */
export function bulkNextToActivate(queue: BulkQueue): string[] {
  const slots = queue.concurrency - queue.active.length;
  if (slots <= 0) return [];
  return queue.items
    .filter((i) => i.state.kind === 'hashing' && !queue.active.includes(i.fileId))
    .slice(0, slots)
    .map((i) => i.fileId);
}
