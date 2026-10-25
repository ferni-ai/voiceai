/**
 * QUIET_HOURS_FROM_PREFS: quiet hours saved in the menu that cover all of someone's call hours
 * (here 00:00 to 23:59, Chicago). A call Ferni starts that day is not placed: it waits for their
 * next day, is looked at once more then, and is dropped if the window still covers it all, never
 * held again and again. Flag off or unset, every decision is main's (a grid of times and windows).
 * Instants are UTC; 2026-10-20 is CDT (UTC-5).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore, type Row } from '../../scheduling/__tests__/fake-firestore.js';

let rows: Row[] = [];
const docs: Record<string, Record<string, unknown>> = {};
const db = () => {
  const base = fakeFirestore(rows);
  return {
    ...base,
    collection: (name: string) => ({
      doc: (id: string) => ({
        ...base.collection().doc(id),
        get: async () => ({ exists: !!docs[`${name}/${id}`], data: () => docs[`${name}/${id}`] }),
      }),
    }),
  };
};
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => db() }));
vi.mock('../user-contact.js', () => ({
  getUserContactInfo: async () => ({ timezone: 'America/Chicago' }),
}));
vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: class {
    createRoom = vi.fn(async () => ({}));
  },
  AgentDispatchClient: class {
    createDispatch = vi.fn(async () => ({}));
  },
  SipClient: class {
    createSipParticipant = vi.fn(async () => ({ participantId: 'PA_1' }));
  },
}));
vi.mock('@livekit/agents', () => ({
  llm: { tool: (config: Record<string, unknown>) => config },
  log: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../global-services.js', () => ({ getGlobalServicesSync: () => null }));

const { executeDueDeferredCalls, holdForCallHours } = await import('../deferred-calls.js');
const { scheduleProactiveCall } = await import('../conversational-calls.js');
const { checkCallHours, nextCallableTime } = await import('../call-hours-guard.js');

const CHI = 'America/Chicago';
const NOON = new Date('2026-10-20T17:00:00Z'); // Tue 12:00 Chicago
const NINE_NEXT = '2026-10-21T14:00:00.000Z'; // Wed 09:00 Chicago: call hours open
const request = {
  userId: 'u1',
  phoneNumber: '+13125550100',
  message: 'Thinking of you',
  ssml: '<speak>Thinking of you</speak>',
  personaId: 'ferni',
  reason: 'thinking_of_you',
};
const deferred = () => rows.filter((r) => r.collection === 'deferred_calls');
const placed = () => rows.filter((r) => r.collection === 'scheduled_calls');
const saveWindow = (quietStart: string, quietEnd: string) => {
  docs['bogle_users/u1'] = {
    messagingPrefs: { quietStart, quietEnd, zone: CHI },
    outreachPreferences: { timezone: CHI },
  };
};

beforeEach(() => {
  rows = [];
  for (const k of Object.keys(docs)) delete docs[k];
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.stubEnv('CALL_HOURS_GUARD', 'on');
  vi.stubEnv('QUIET_HOURS_FROM_PREFS', 'on');
  saveWindow('00:00', '23:59');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('a saved window over all their call hours', () => {
  it('no call that day: held for 09:00 their next day, not for 23:59 tonight', async () => {
    vi.setSystemTime(NOON);
    expect(await scheduleProactiveCall(request)).toMatchObject({ status: 'scheduled' });
    expect(placed()).toHaveLength(0);
    expect(deferred()).toHaveLength(1);
    expect(deferred()[0].data).toMatchObject({
      kind: 'proactive',
      status: 'pending',
      scheduledFor: NINE_NEXT,
      quietAllDay: { recipientUserId: 'u1', recipientPhone: '+13125550100' },
    });
  });

  it('still all day at the re-check: dropped, nothing placed, nothing held again', async () => {
    vi.setSystemTime(NOON);
    await scheduleProactiveCall(request);
    vi.setSystemTime(new Date('2026-10-21T14:01:00Z'));
    const run = await executeDueDeferredCalls();
    expect(run).toMatchObject({ due: 1, placed: 0, rescheduled: 0, failed: 0, quietAllDay: 1 });
    expect(deferred()).toHaveLength(1); // no second deferral
    expect(deferred()[0].data.status).toBe('quiet-all-day');
    expect(placed()).toHaveLength(0);
    // Days later nothing is waiting: the chain ended.
    vi.setSystemTime(new Date('2026-10-24T14:01:00Z'));
    expect(await executeDueDeferredCalls()).toMatchObject({ due: 0 });
  });

  it('window changed before the re-check: the call is held to the new opening as usual', async () => {
    vi.setSystemTime(NOON);
    await scheduleProactiveCall(request);
    saveWindow('20:00', '09:30');
    vi.setSystemTime(new Date('2026-10-21T14:01:00Z'));
    const run = await executeDueDeferredCalls();
    expect(run.quietAllDay).toBeUndefined();
    const [first, again] = deferred();
    expect(first.data.status).not.toBe('quiet-all-day');
    expect(again.data).toMatchObject({
      status: 'pending',
      scheduledFor: '2026-10-21T14:30:00.000Z',
    });
    expect(again.data.quietAllDay).toBeUndefined();
  });

  it('the guard says when to look again: call hours on their next day', async () => {
    const decision = await checkCallHours({ now: NOON, recipientUserId: 'u1' });
    expect(decision).toMatchObject({ allowed: false, none: true });
    expect(decision.recheckAt?.toISOString()).toBe(NINE_NEXT);
  });
});

// Flag off or unset: the guard's decision is main's (its own hours only), and so is the deferral.
const DAYS = ['2026-03-08', '2026-10-25'];
const TIMES = DAYS.flatMap((d) => {
  const base = Date.parse(`${d}T00:00:00Z`);
  const out: Date[] = [];
  for (let m = 0; m < 24 * 60; m += 50) out.push(new Date(base + m * 60_000));
  out.push(new Date(base + (20 * 60 + 29) * 60_000 + 30_000));
  return out;
});
const WINDOWS: Array<[string, string]> = [
  ['00:00', '23:59'],
  ['20:00', '09:30'],
  ['12:00', '14:00'],
  ['08:00', '21:00'],
];

describe('flag off or unset: identical to main over a time grid', () => {
  it.each(['off', undefined])('QUIET_HOURS_FROM_PREFS=%s', async (flag) => {
    if (flag) vi.stubEnv('QUIET_HOURS_FROM_PREFS', flag);
    else delete process.env.QUIET_HOURS_FROM_PREFS;
    let n = 0;
    for (const [start, end] of WINDOWS) {
      saveWindow(start, end);
      for (const now of TIMES) {
        vi.setSystemTime(now);
        rows = [];
        const decision = await checkCallHours({ now, recipientUserId: 'u1' });
        const main = nextCallableTime(now, [CHI], []);
        expect(decision).toEqual({
          allowed: main.getTime() === now.getTime(),
          at: main,
          timezone: CHI,
          source: 'stored',
        });
        const call = { kind: 'proactive' as const, request };
        const held = await holdForCallHours('u1', call, { recipientUserId: 'u1' });
        expect(!!held).toBe(!decision.allowed);
        if (held) {
          expect(deferred()[0].data.scheduledFor).toBe(main.toISOString());
          expect(deferred()[0].data).not.toHaveProperty('quietAllDay');
        }
        n++;
      }
    }
    expect(n).toBe(WINDOWS.length * TIMES.length);
  });
});
