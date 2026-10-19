/**
 * The deferred-calls job logs one PROMISE_OUTCOME per held call it picks up
 * (placed → pending, held again → held call-hours, failed, missed) and one
 * PROMISE_JOB_RUN per run, nothing due included: prod went weeks with this job
 * failing every minute and nothing said so.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore, type Row } from '../../scheduling/__tests__/fake-firestore.js';

let rows: Row[] = [];
vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fakeFirestore(rows),
}));
const initiateCall = vi.fn(async (_r: { contactQuery: string }) => 'call_1');
vi.mock('../on-behalf-call-orchestrator.js', () => ({
  getOnBehalfCallOrchestrator: () => ({ initiateCall }),
}));
const { logPromiseOutcome, logPromiseJobRun } = vi.hoisted(() => ({
  logPromiseOutcome: vi.fn(),
  logPromiseJobRun: vi.fn(),
}));
vi.mock('../../follow-through/promise-outcomes.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../follow-through/promise-outcomes.js')>()),
  logPromiseOutcome,
  logPromiseJobRun,
}));

const { executeDueDeferredCalls } = await import('../deferred-calls.js');

const NOW = new Date('2026-10-18T16:00:00.000Z');
const held = (id: string, contactQuery: string, minutesLate: number): Row => ({
  id,
  userId: 'u1',
  collection: 'deferred_calls',
  data: {
    kind: 'on_behalf',
    request: { contactQuery, purpose: 'say hi' },
    status: 'pending',
    scheduledFor: new Date(NOW.getTime() - minutesLate * 60_000).toISOString(),
  },
});

beforeEach(() => {
  rows = [];
  vi.clearAllMocks();
});

describe('executeDueDeferredCalls outcome lines', () => {
  it('placed is pending (its result comes from the call), held again, failed, missed', async () => {
    initiateCall.mockImplementation(async (r) => {
      if (r.contactQuery === 'held') return 'deferred_next';
      if (r.contactQuery === 'broken') throw new Error('sip down');
      return 'call_1';
    });
    rows = [
      held('a', 'placed', 1),
      held('b', 'held', 2),
      held('c', 'broken', 3),
      held('d', 'stale', 13 * 60),
    ];
    await executeDueDeferredCalls({ now: NOW });

    const kinds = new Set(logPromiseOutcome.mock.calls.map((c) => c[0]));
    expect(kinds).toEqual(new Set(['deferred-call']));
    expect(logPromiseOutcome.mock.calls.map((c) => c.slice(1))).toEqual([
      // oldest first: d (missed), c (broken), b (held again), a (placed)
      [{ outcome: 'failed', reason: 'missed-window' }, { userId: 'u1' }],
      [{ outcome: 'failed', reason: 'provider-error' }, { userId: 'u1' }],
      [{ outcome: 'held', reason: 'call-hours' }, { userId: 'u1' }],
      [{ outcome: 'pending' }, { userId: 'u1' }],
    ]);
    expect(logPromiseJobRun).toHaveBeenCalledWith('deferred-calls', {
      due: 4,
      done: 1,
      failed: 1,
      held: 1,
      missed: 1,
    });
  });

  it('logs a run with nothing due', async () => {
    await executeDueDeferredCalls({ now: NOW });
    expect(logPromiseOutcome).not.toHaveBeenCalled();
    expect(logPromiseJobRun).toHaveBeenCalledWith('deferred-calls', {
      due: 0,
      done: 0,
      failed: 0,
      held: 0,
      missed: 0,
    });
  });

  it('a run whose query throws (a missing index) logs no run line, so the absence alert fires', async () => {
    rows = [held('a', 'placed', 1)];
    vi.doMock('../../scheduling/due-items.js', () => ({
      claimDueItems: async () => {
        throw new Error('FAILED_PRECONDITION: The query requires an index');
      },
    }));
    await expect(executeDueDeferredCalls({ now: NOW })).rejects.toThrow(/FAILED_PRECONDITION/);
    vi.doUnmock('../../scheduling/due-items.js');
    expect(logPromiseJobRun).not.toHaveBeenCalled();
  });
});
