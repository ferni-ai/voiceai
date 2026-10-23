/**
 * FORGET_EVERY_READER and held calls: a call the call-hours guard held is
 * checked again when it is placed, so one whose purpose or script names a
 * topic the caller has since asked Ferni to forget is cancelled, not dialed;
 * while the forget list can't be read it waits (pending) for the next run.
 * The real executeDueDeferredCalls; Firestore, the dialers and the forget
 * list are stubs at their edges.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore, type Row } from '../../scheduling/__tests__/fake-firestore.js';

const edge = vi.hoisted(() => ({ topics: ['Mindy'] as string[] | null, dialed: [] as string[] }));
let rows: Row[] = [];
vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fakeFirestore(rows),
}));
vi.mock('../on-behalf-call-orchestrator.js', () => ({
  getOnBehalfCallOrchestrator: () => ({
    initiateCall: async (r: { purpose: string }) => (edge.dialed.push(r.purpose), 'call_1'),
  }),
}));
vi.mock('../conversational-calls.js', () => ({
  scheduleProactiveCall: async (r: { message: string }) => (
    edge.dialed.push(r.message),
    { success: true }
  ),
}));
vi.mock('../../../memory/recall/forget.js', async (original) => ({
  ...(await original<typeof import('../../../memory/recall/forget.js')>()),
  forgottenTopicsOrNull: async () => edge.topics,
}));

const { executeDueDeferredCalls } = await import('../deferred-calls.js');
const { resetForgetTopicsSource } = await import('../../../memory/recall/forget-topics-source.js');

const USER = 'member-deferred-forget';
const NOW = new Date('2026-10-18T16:00:00.000Z');
const due = (id: string, data: Record<string, unknown>): Row => ({
  id,
  userId: USER,
  collection: 'deferred_calls',
  data: {
    ...data,
    status: 'pending',
    scheduledFor: new Date(NOW.getTime() - 60_000).toISOString(),
  },
});
const onBehalf = (id: string, purpose: string) =>
  due(id, { kind: 'on_behalf', request: { contactQuery: 'the clinic', purpose } });
const proactive = (id: string, message: string) =>
  due(id, {
    kind: 'proactive',
    request: { phoneNumber: '+15555550100', message, reason: 'check-in' },
  });
const status = (id: string) => rows.find((r) => r.id === id)?.data.status;

beforeEach(() => {
  rows = [];
  edge.topics = ['Mindy'];
  edge.dialed = [];
  resetForgetTopicsSource();
  vi.stubEnv('FORGET_EVERY_READER', 'on');
});
afterEach(() => vi.unstubAllEnvs());

describe('held calls and a forgotten topic', () => {
  it('on: a call whose purpose or script names it is cancelled, not dialed', async () => {
    rows = [
      onBehalf('a', 'ask about Mindy and her test results'),
      proactive('b', 'Hi, just calling to see how Mindy is'),
      onBehalf('c', 'reschedule the dentist'),
    ];
    const result = await executeDueDeferredCalls({ now: NOW });
    expect(edge.dialed).toEqual(['reschedule the dentist']);
    expect([status('a'), status('b'), status('c')]).toEqual(['forgotten', 'forgotten', 'placed']);
    expect(result.placed).toBe(1);
  });

  it('on: a forget list that cannot be read dials nothing and waits for the next run', async () => {
    edge.topics = null;
    rows = [onBehalf('a', 'reschedule the dentist')];
    const result = await executeDueDeferredCalls({ now: NOW });
    expect(edge.dialed).toEqual([]);
    expect(status('a')).toBe('pending');
    expect(result.rescheduled).toBe(1);
  });

  it('off: as before', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'off');
    rows = [onBehalf('a', 'ask about Mindy and her test results')];
    await executeDueDeferredCalls({ now: NOW });
    expect(edge.dialed).toEqual(['ask about Mindy and her test results']);
  });
});
