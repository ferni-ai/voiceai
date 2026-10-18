/**
 * The live senders read messagingPrefs behind MESSAGING_PREFS, per person.
 *
 * All times are New York in October (EDT, UTC-4). A's quiet hours start at
 * 22:30; A2's at 20:00 (earlier than the 21:00 default, so only reading A2's
 * saved value can hold a text at 20:30); B has nothing saved.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeUserDocs } from './fake-user-docs.js';
import { atomicLocks } from '../../outreach/__tests__/atomic-locks.js';
import { followUp } from '../../follow-through/__tests__/fixtures.js';

const h = vi.hoisted(() => ({ db: null as unknown, flags: {} as Record<string, 'on' | 'off'> }));
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => h.db }));
vi.mock('../../platform/cohort-flags.js', async (orig) => ({
  ...(await orig<object>()),
  flagForUser: async (userId: string, flag: string) =>
    flag === 'MESSAGING_PREFS' ? h.flags[userId] : undefined,
}));
vi.mock('../../superhuman/semantic-intelligence/promise-keeper.js', () => ({
  extendReminderPromise: async () => undefined,
}));

const { prefsQuietUntil, proactivePolicyPrefs, quietCheckFor, quietUntil } =
  await import('../prefs-gate.js');
const { DEFAULT_PREFS } = await import('../prefs.js');
const { sendGuardedText } = await import('../../outreach/guarded-text.js');
type TextDeps = import('../../outreach/guarded-text.js').TextDeps;
const { sendDueFollowUpTexts } = await import('../../outreach/follow-up-texts.js');
const { guardReminderText } = await import('../../outreach/reminder-texts.js');
const { chooseChannel } = await import('../../outreach/proactive-channels/channel-policy.js');

const NY = 'America/New_York';
const at = (local: string): Date => new Date(`2026-10-18T${local}:00-04:00`);
const nextDay8am = new Date('2026-10-19T08:00:00-04:00');
const PHONE = '+15551234567';
const ENV = { LOG_HASH_SECRET: 'test-secret' };

const quiet = (start: string, end: string) => ({
  messagingPrefs: { quietStart: start, quietEnd: end, zone: NY },
});
let store: ReturnType<typeof fakeUserDocs>;
beforeEach(() => {
  store = fakeUserDocs({
    A: quiet('22:30', '07:00'),
    A2: quiet('20:00', '08:00'),
    B: { contactInfo: { timezone: NY } },
    smsOff: { messagingPrefs: { channels: { sms: false }, zone: NY } },
  });
  h.db = store.db;
  h.flags = { A: 'on', A2: 'on', B: 'on', smsOff: 'on' };
});

describe('quietUntil: 21:00-08:00 plus their own window, in their zone', () => {
  const prefsOf = async (id: string) => (await import('../prefs.js')).readPrefs(id);

  it("holds A's text at 22:45 (A's quiet starts 22:30) until 08:00; B at 20:45 goes", async () => {
    expect(quietUntil(await prefsOf('A'), at('22:45'))).toEqual(nextDay8am);
    expect(quietUntil(await prefsOf('B'), at('20:45'))).toBeNull();
  });

  it('holds A2 at 20:30 because A2 chose 20:00; B at the same minute goes', async () => {
    expect(quietUntil(await prefsOf('A2'), at('20:30'))).toEqual(nextDay8am);
    expect(quietUntil(await prefsOf('B'), at('20:30'))).toBeNull();
  });

  it('a saved window shorter than the default never lets a text out at 21:30', async () => {
    expect(quietUntil(await prefsOf('A'), at('21:30'))).toEqual(nextDay8am);
  });

  it('with no zone anywhere it is quiet when it is quiet on either US coast', () => {
    // 21:15 in New York is 18:15 in Los Angeles: quiet in one zone is quiet.
    expect(quietUntil(DEFAULT_PREFS, at('21:15'))).not.toBeNull();
    // 06:30 in Los Angeles is 09:30 in New York: still quiet on the west coast.
    expect(quietUntil(DEFAULT_PREFS, at('09:30'))).not.toBeNull();
    expect(quietUntil(DEFAULT_PREFS, at('12:00'))).toBeNull();
  });
});

describe('MESSAGING_PREFS is read per person', () => {
  it('on for A2: their window; off for B: undefined, so the sender keeps its own rule', async () => {
    h.flags.B = 'off';
    expect(await prefsQuietUntil('A2', at('20:30'))).toEqual(nextDay8am);
    expect(await prefsQuietUntil('B', at('20:30'))).toBeUndefined();
  });
});

function textDeps(userId: string) {
  const send = vi.fn(async () => ({ success: true, messageSid: 'SM1' }));
  const deps = {
    env: ENV,
    store: {
      forUser: async () => [],
      forPhoneHash: async () => [],
      add: async () => 'new',
      ...atomicLocks(),
      sponsoredPhone: async () => undefined,
      isOptedOut: async () => false,
      userDoc: async () => store.docs.get(userId),
      legacySmsChannels: async () => undefined,
    },
    authPhone: async () => PHONE,
    send,
    now: () => at('20:30'),
  } as unknown as TextDeps;
  return { deps, send };
}
const text = (userId: string, kind: 'checkin' | 'message') => ({
  userId,
  body: 'How are you doing after our call?',
  kind,
  refId: 's1',
  minGapMs: 60_000,
});

describe('the guarded sender (sendGuardedText)', () => {
  it('SMS off in prefs: no text, on the live guarded path', async () => {
    const { deps, send } = textDeps('smsOff');
    expect(await sendGuardedText(text('smsOff', 'message'), deps)).toEqual({
      sent: false,
      reason: 'sms-off',
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("holds a check-in (Ferni's idea) in their quiet hours; B's goes", async () => {
    const a2 = textDeps('A2');
    expect(await sendGuardedText(text('A2', 'checkin'), a2.deps)).toEqual({
      sent: false,
      reason: 'quiet-hours',
    });
    const b = textDeps('B');
    expect(await sendGuardedText(text('B', 'checkin'), b.deps)).toEqual({ sent: true });
    expect(b.send).toHaveBeenCalledTimes(1);
  });

  it('flag off: today, both go out exactly as before', async () => {
    h.flags = { A2: 'off', smsOff: 'off' };
    for (const id of ['A2', 'smsOff']) {
      const { deps, send } = textDeps(id);
      expect(await sendGuardedText(text(id, 'checkin'), deps)).toEqual({ sent: true });
      expect(send).toHaveBeenCalledTimes(1);
    }
  });
});

describe('follow-through (right moment)', () => {
  async function run(userId: string, flag: string) {
    const due = followUp({ userId, kind: 'commitment', dueAt: at('20:15').toISOString() });
    const sendText = vi.fn(async () => ({ sent: true }));
    const report = await sendDueFollowUpTexts(
      {
        store: { live: async () => [due], save: async () => true },
        optedIn: async () => [userId],
        resolveFlags: async () => ({ FOLLOW_THROUGH_TEXTS: 'on', MESSAGING_PREFS: flag }),
        quietFor: quietCheckFor,
        sendText,
      },
      { now: at('20:30') }
    );
    return { report, sendText };
  }

  it("waits for A2's quiet hours to end; B is texted now", async () => {
    expect((await run('A2', 'on')).sendText).not.toHaveBeenCalled();
    expect((await run('B', 'on')).sendText).toHaveBeenCalledTimes(1);
  });

  it("flag off: A2 is texted at 20:30, today's 21:00 rule", async () => {
    expect((await run('A2', '')).sendText).toHaveBeenCalledTimes(1);
  });
});

describe('reminder texts', () => {
  const reminder = (userId: string) =>
    ({ id: 'r1', userId, message: 'take the pill', timezone: NY, deliveryAddress: PHONE }) as never;

  async function guard(userId: string) {
    const { deps } = textDeps(userId);
    const sendOwn = vi.fn(async () => ({ sent: true as const }));
    const out = await guardReminderText(reminder(userId), {
      text: deps,
      sendOwn,
      sendOther: vi.fn(),
      quietUntil: prefsQuietUntil,
    });
    return { out, sendOwn };
  }

  it("A2's reminder at 20:30 is held to 08:00; B's is texted", async () => {
    const a2 = await guard('A2');
    expect(a2.out).toEqual({ holdUntil: nextDay8am });
    expect(a2.sendOwn).not.toHaveBeenCalled();
    expect(store.subUpdates[0]).toMatchObject({ path: 'A2/reminders/r1' });
    expect((await guard('B')).out).toBe('sent');
  });

  it('flag off: the reminder goes at 20:30, as today', async () => {
    h.flags.A2 = 'off';
    expect((await guard('A2')).out).toBe('sent');
  });
});

describe('the proactive tick and daily check-in policy (chooseChannel)', () => {
  const choose = async (userId: string) => {
    const user = {
      ...store.docs.get(userId),
      outreachPreferences: { enabled: true, channels: ['sms'] },
    };
    const { prefs, timezone } = await proactivePolicyPrefs(userId, user, NY);
    return chooseChannel({
      trigger: { weight: 'light', timely: true },
      now: at('20:30'),
      prefs,
      timezone,
      verifiedPhone: PHONE,
      recent: [],
      canCall: false,
    });
  };

  it('A2 at 20:30 is quiet hours; B gets a text', async () => {
    expect(await choose('A2')).toMatchObject({ channel: null, why: 'quiet hours' });
    expect(await choose('B')).toMatchObject({ channel: 'sms' });
  });

  it('SMS off in prefs: a note in the app instead of a text', async () => {
    expect(await choose('smsOff')).toMatchObject({ channel: 'in_app', why: 'texts not turned on' });
  });

  it('flag off: A2 gets a text at 20:30, as today', async () => {
    h.flags.A2 = 'off';
    const user = {
      ...store.docs.get('A2'),
      outreachPreferences: { enabled: true, channels: ['sms'] },
    };
    expect((await proactivePolicyPrefs('A2', user, NY)).prefs).toBe(user.outreachPreferences);
  });
});
