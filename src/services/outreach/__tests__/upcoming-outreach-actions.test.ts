/**
 * Cancel and move in "When I'll Reach Out" change the store the sender reads, so
 * a cancelled item is really never sent: the real deferred-calls job and the real
 * follow-up text job run after the change and skip it. Only Firestore (in-memory
 * fakes), the dial and the text send are faked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakeFirestore as schedulingFake,
  type Row,
} from '../../scheduling/__tests__/fake-firestore.js';
import { fakeFirestore as storesFake } from '../../stores/__tests__/fake-firestore.js';
import { followUp as fixture } from '../../follow-through/__tests__/fixtures.js';
import type { FollowUp } from '../../follow-through/index.js';

let rows: Row[] = [];
vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => schedulingFake(rows),
}));
const dial = vi.hoisted(() => vi.fn(async (_r: Record<string, unknown>) => ({ success: true })));
vi.mock('../conversational-calls.js', () => ({ scheduleProactiveCall: dial }));
vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: class {},
  AgentDispatchClient: class {},
  SipClient: class {},
}));
vi.mock('@livekit/agents', () => ({
  llm: { tool: (config: Record<string, unknown>) => config },
  log: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../global-services.js', () => ({ getGlobalServicesSync: () => null }));

const { executeDueDeferredCalls } = await import('../deferred-calls.js');
const { sendDueFollowUpTexts } = await import('../follow-up-texts.js');
const { createFollowUpStore } = await import('../../stores/follow-through-store.js');
const { listUpcomingOutreach } = await import('../upcoming-outreach.js');
const { cancelUpcoming, rescheduleUpcoming, MOVE_HORIZON_MS } =
  await import('../upcoming-outreach-actions.js');
type Deps = import('../upcoming-outreach-actions.js').UpcomingActionDeps;

const NOW = new Date('2026-10-13T16:10:00.000Z');
const at = (min: number) => new Date(NOW.getTime() + min * 60_000).toISOString();
const held = (id: string, userId: string, over: Record<string, unknown> = {}): Row => ({
  id,
  userId,
  collection: 'deferred_calls',
  data: {
    kind: 'proactive',
    status: 'pending',
    scheduledFor: at(-5),
    request: { personaId: 'ferni', message: 'Thinking of you', phoneNumber: '+15550000000' },
    ...over,
  },
});
const rowOf = (id: string) => rows.find((r) => r.id === id)?.data ?? {};

let fs = storesFake();
let deps: Deps;
const allowed = vi.fn(async () => true);
const quiet = vi.fn(async () => false);
const putFollowUp = (f: FollowUp) =>
  fs.docs.set(`bogle_users/${f.userId}/follow_through/${f.id}`, { ...f });
const followUp = (id: string, over: Partial<FollowUp> = {}) =>
  fixture({ id, source: { store: 'summaries', ref: id }, ...over });

beforeEach(() => {
  rows = [];
  fs = storesFake();
  dial.mockClear();
  allowed.mockReset().mockResolvedValue(true);
  quiet.mockReset().mockResolvedValue(false);
  deps = {
    db: schedulingFake(rows) as unknown as Deps['db'],
    followUps: createFollowUpStore(fs.db),
    callAllowedAt: allowed,
    savedQuietAt: quiet,
  };
});

describe('a held call', () => {
  it('cancelled is never placed by the per-minute job; the other one still rings', async () => {
    rows.push(held('deferred_a', 'u1'), held('deferred_b', 'u1'));
    expect(await cancelUpcoming(deps, 'u1', { kind: 'held_call', id: 'deferred_a' }, NOW)).toEqual({
      ok: true,
    });

    const run = await executeDueDeferredCalls({ now: NOW });

    expect(run).toMatchObject({ due: 1, placed: 1 });
    expect(dial).toHaveBeenCalledTimes(1);
    expect(rowOf('deferred_a').status).toBe('cancelled');
    expect(rowOf('deferred_b').status).toBe('placed');
  });

  it('is not found for someone else, and their call stays set', async () => {
    rows.push(held('deferred_a', 'u1'));
    expect(await cancelUpcoming(deps, 'u2', { kind: 'held_call', id: 'deferred_a' }, NOW)).toEqual({
      ok: false,
      reason: 'not-found',
    });
    expect(rowOf('deferred_a').status).toBe('pending');
  });

  it('already taken by the job is gone, never "cancelled"; an on-behalf call is not listed', async () => {
    rows.push(
      held('deferred_a', 'u1', { status: 'placing' }),
      held('deferred_c', 'u1', { kind: 'on_behalf' })
    );
    expect(
      await cancelUpcoming(deps, 'u1', { kind: 'held_call', id: 'deferred_a' }, NOW)
    ).toMatchObject({
      reason: 'gone',
    });
    expect(
      await cancelUpcoming(deps, 'u1', { kind: 'held_call', id: 'deferred_c' }, NOW)
    ).toMatchObject({
      reason: 'not-found',
    });
    expect(rowOf('deferred_a').status).toBe('placing');
    expect(rowOf('deferred_c').status).toBe('pending');
  });

  it('moves to a time the call-hours guard allows, and the job waits for it', async () => {
    rows.push(held('deferred_a', 'u1'));
    const out = await rescheduleUpcoming(
      deps,
      'u1',
      { kind: 'held_call', id: 'deferred_a' },
      at(120),
      NOW
    );
    expect(out).toEqual({ ok: true, scheduledFor: at(120) });
    expect(allowed).toHaveBeenCalledWith(
      'u1',
      new Date(at(120)),
      expect.objectContaining({ kind: 'proactive' })
    );
    expect(await executeDueDeferredCalls({ now: NOW })).toMatchObject({ due: 0 });
    expect(dial).not.toHaveBeenCalled();
  });

  it('taken by the job after the first read and before the write is gone, and left as the job set it', async () => {
    rows.push(held('deferred_a', 'u1'));
    // The guard check runs between the first read and the transaction: the job claims it there.
    allowed.mockImplementation(async () => {
      rowOf('deferred_a').status = 'placing';
      return true;
    });
    const out = await rescheduleUpcoming(
      deps,
      'u1',
      { kind: 'held_call', id: 'deferred_a' },
      at(120),
      NOW
    );
    expect(out).toEqual({ ok: false, reason: 'gone' });
    expect(rowOf('deferred_a')).toMatchObject({ status: 'placing', scheduledFor: at(-5) });
  });

  it('refuses a time outside their call hours, in the past or too far out, and keeps the old one', async () => {
    rows.push(held('deferred_a', 'u1'));
    allowed.mockResolvedValue(false);
    const move = (when: unknown) =>
      rescheduleUpcoming(deps, 'u1', { kind: 'held_call', id: 'deferred_a' }, when, NOW);
    expect(await move(at(120))).toMatchObject({ reason: 'quiet' });
    expect(await move(at(-1))).toMatchObject({ reason: 'bad-time' });
    expect(
      await move(new Date(NOW.getTime() + MOVE_HORIZON_MS + 60_000).toISOString())
    ).toMatchObject({
      reason: 'bad-time',
    });
    expect(await move('tomorrow')).toMatchObject({ reason: 'bad-time' });
    expect(rowOf('deferred_a').scheduledFor).toBe(at(-5));
  });
});

describe('a follow-up text', () => {
  const textJob = (send: ReturnType<typeof vi.fn>, dryRun = false) =>
    sendDueFollowUpTexts(
      {
        store: deps.followUps,
        optedIn: async () => ['u1'],
        resolveFlags: async () => ({ FOLLOW_THROUGH_TEXTS: 'on' }),
        sendText: send as never,
        forgotten: async () => [],
      },
      { now: NOW, dryRun }
    );

  it('cancelled is never texted by the follow-up job; the next one is', async () => {
    putFollowUp(followUp('f_cancel', { dueAt: at(-15) }));
    putFollowUp(followUp('f_keep', { dueAt: at(-10) }));
    const send = vi.fn(async () => ({ sent: true }));
    // Before the cancel the job would text the older one.
    expect((await textJob(send, true)).wouldSendIds).toEqual(['f_cancel']);

    expect(await cancelUpcoming(deps, 'u1', { kind: 'follow_up', id: 'f_cancel' }, NOW)).toEqual({
      ok: true,
    });
    await textJob(send);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ refId: 'f_keep' }));
    expect(fs.docs.get('bogle_users/u1/follow_through/f_cancel')?.status).toBe('released');
  });

  it('is not found for someone else, and theirs stays open', async () => {
    putFollowUp(followUp('f1'));
    expect(await cancelUpcoming(deps, 'u2', { kind: 'follow_up', id: 'f1' }, NOW)).toMatchObject({
      reason: 'not-found',
    });
    expect(fs.docs.get('bogle_users/u1/follow_through/f1')?.status).toBe('open');
  });

  it('made from a reminder is not offered: the reminder job texts it', async () => {
    putFollowUp(fixture({ id: 'f1' })); // source: reminders
    expect(await cancelUpcoming(deps, 'u1', { kind: 'follow_up', id: 'f1' }, NOW)).toMatchObject({
      reason: 'not-actionable',
    });
    expect(fs.docs.get('bogle_users/u1/follow_through/f1')?.status).toBe('open');
  });

  it('moves its due time, but not into saved quiet hours, and not once raised', async () => {
    putFollowUp(followUp('f1', { kind: 'commitment', dueAt: at(60) }));
    putFollowUp(followUp('f2', { kind: 'commitment', status: 'surfaced', dueAt: at(60) }));
    expect(
      await rescheduleUpcoming(deps, 'u1', { kind: 'follow_up', id: 'f1' }, at(240), NOW)
    ).toEqual({
      ok: true,
      scheduledFor: at(240),
    });
    expect(fs.docs.get('bogle_users/u1/follow_through/f1')?.dueAt).toBe(at(240));

    quiet.mockResolvedValue(true);
    expect(
      await rescheduleUpcoming(deps, 'u1', { kind: 'follow_up', id: 'f1' }, at(300), NOW)
    ).toMatchObject({
      reason: 'quiet',
    });
    expect(
      await rescheduleUpcoming(deps, 'u1', { kind: 'follow_up', id: 'f2' }, at(300), NOW)
    ).toMatchObject({
      reason: 'not-actionable',
    });
    expect(fs.docs.get('bogle_users/u1/follow_through/f1')?.dueAt).toBe(at(240));
  });

  it('already texted by the job is gone, never "cancelled" (verifier probe on #3294)', async () => {
    putFollowUp(followUp('f1', { dueAt: at(-10) }));
    const send = vi.fn(async () => ({ sent: true }));
    await textJob(send);
    expect(send).toHaveBeenCalledTimes(1);

    expect(await cancelUpcoming(deps, 'u1', { kind: 'follow_up', id: 'f1' }, NOW)).toEqual({
      ok: false,
      reason: 'gone',
    });
    expect(fs.docs.get('bogle_users/u1/follow_through/f1')?.status).toBe('surfaced');
  });

  it('claimed by the job while the text is still sending is gone too', async () => {
    putFollowUp(followUp('f1', { dueAt: at(-10) }));
    let during: unknown;
    const send = vi.fn(async () => {
      during = await cancelUpcoming(deps, 'u1', { kind: 'follow_up', id: 'f1' }, NOW);
      return { sent: true };
    });
    await textJob(send);
    expect(during).toEqual({ ok: false, reason: 'gone' });
  });

  it('held by the sender (nothing went out) is back to open and still cancellable', async () => {
    putFollowUp(followUp('f1', { dueAt: at(-10) }));
    await textJob(vi.fn(async () => ({ sent: false, reason: 'quiet-hours' })));
    expect(await cancelUpcoming(deps, 'u1', { kind: 'follow_up', id: 'f1' }, NOW)).toEqual({
      ok: true,
    });
  });

  it('raised only on a call stays cancellable: nothing was texted', async () => {
    const raised = { at: at(-30), via: 'in-call' as const };
    putFollowUp(followUp('f1', { status: 'surfaced', surfaced: [raised], dueAt: at(60) }));
    expect(await cancelUpcoming(deps, 'u1', { kind: 'follow_up', id: 'f1' }, NOW)).toEqual({
      ok: true,
    });
    expect(fs.docs.get('bogle_users/u1/follow_through/f1')?.status).toBe('released');
  });

  it('changed by the job between read and save is gone, never "cancelled"', async () => {
    putFollowUp(followUp('f1'));
    const store = deps.followUps;
    deps.followUps = { live: store.live, save: async () => false };
    expect(await cancelUpcoming(deps, 'u1', { kind: 'follow_up', id: 'f1' }, NOW)).toMatchObject({
      reason: 'gone',
    });
  });
});

describe('what the list offers', () => {
  const list = (actions: boolean) =>
    listUpcomingOutreach(
      'u1',
      {
        heldCalls: async () => [
          { id: 'deferred_a', data: held('deferred_a', 'u1', { scheduledFor: at(60) }).data },
        ],
        followUps: async () => [
          followUp('f_open', { dueAt: at(60) }),
          followUp('f_raised', { dueAt: at(60), status: 'surfaced' }),
          followUp('f_texted', {
            dueAt: at(60),
            status: 'surfaced',
            surfaced: [{ at: at(-5), via: 'text' }],
          }),
          fixture({ id: 'f_reminder', dueAt: at(60) }),
        ],
        followUpTextsOn: async () => true,
      },
      { now: NOW, actions }
    );
  const offers = async (actions: boolean) =>
    Object.fromEntries((await list(actions)).map((i) => [i.id, [i.canCancel, i.canReschedule]]));

  it('offers nothing while REACH_OUT_ACTIONS is off', async () => {
    expect(Object.values(await offers(false)).flat()).not.toContain(true);
  });

  it('offers only what really works when it is on', async () => {
    expect(await offers(true)).toEqual({
      deferred_a: [true, true],
      f_open: [true, true],
      f_raised: [true, false],
      f_texted: [false, false],
      f_reminder: [false, false],
    });
  });
});
