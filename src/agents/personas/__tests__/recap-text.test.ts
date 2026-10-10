import { afterEach, describe, expect, it, vi } from 'vitest';
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';

import { gatedReply } from '../crisis-gate.js';
import type { Line } from '../director-notes.js';
import {
  composeRecap,
  liveRecapDeps,
  runRecapText,
  sendTimeFor,
  type RecapDeps,
} from '../recap-text.js';
import type { UnderstandFn } from '../turn-understanding.js';
import { callEnded, rememberReading, setWrapUp, WrapUp, type Decided } from '../wrap-up.js';

const live = vi.hoisted(() => ({
  prefs: new Map<string, Record<string, unknown>>(),
  added: [] as Array<{ path: string; data: Record<string, unknown> }>,
  users: new Map<string, { phoneNumber?: string }>(),
  sms: [] as Array<{ to: string; text: string }>,
}));

vi.mock('../../../services/superhuman/firestore-utils.js', () => {
  const at = (path: string) => ({
    collection: (c: string) => ({
      doc: (d: string) => at(`${path}/${c}/${d}`),
      add: async (data: Record<string, unknown>) => {
        live.added.push({ path: `${path}/${c}`, data });
      },
    }),
    get: async () => ({ data: () => live.prefs.get(path) }),
  });
  return { getFirestoreDb: () => at('') };
});
vi.mock('../../../services/identity/firebase-auth.js', () => ({
  getFirebaseUser: async (uid: string) => live.users.get(uid) ?? null,
}));
vi.mock('../../../services/communication-service.js', () => ({
  sendSMS: async (to: string, text: string) => {
    live.sms.push({ to, text });
    return 'sid';
  },
}));

const ON = { RECAP_TEXT: 'on' };
const PATTERNS_ONLY = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
const PHONE = '+15555550100';
const DENVER = 'America/Denver';
/** 2 pm in Denver (MDT, UTC-6). */
const AFTERNOON = new Date('2026-10-12T20:00:00Z');

const LANDLORD = JSON.stringify({
  items: [
    { who: 'caller', what: 'call the landlord', when: 'tomorrow', detail: '555-0134' },
    { who: 'ferni', what: 'check in', when: 'Thursday', detail: null },
  ],
  heavy: false,
});
const NOTHING = JSON.stringify({ items: [], heavy: false });

const PLAN_CALL: Line[] = [
  { speaker: 'user', text: "The heater's out and he won't answer my texts." },
  { speaker: 'ferni', text: 'Would a call land better? His office line maybe.' },
  { speaker: 'user', text: "Yeah, I'll call him tomorrow, it's 555-0134." },
  { speaker: 'ferni', text: "Good. I'll check in Thursday." },
];

let calls = 0;
/** A finished call whose wrap-up reading answered `reply`, ended and waiting for after-call tasks. */
async function endedCall(reply: string, lines: Line[] = PLAN_CALL): Promise<string> {
  const sessionId = `s-${++calls}`;
  const wrapUp = new WrapUp(async () => reply, undefined, false);
  rememberReading(sessionId, wrapUp);
  await wrapUp.observe(lines);
  callEnded(sessionId);
  return sessionId;
}

function fakeDeps(over: Partial<RecapDeps> = {}) {
  const send = vi.fn<RecapDeps['send']>(async () => undefined);
  const queue = vi.fn<RecapDeps['queue']>(async () => undefined);
  const deps: RecapDeps = {
    optedIn: async () => true,
    verifiedPhone: async () => PHONE,
    send,
    queue,
    now: () => AFTERNOON,
    ...over,
  };
  return { deps, send, queue };
}

const run = (sessionId: string, deps: RecapDeps, env: Record<string, string> = ON) =>
  runRecapText({ userId: 'u1', sessionId, timezone: DENVER }, deps, env);

describe('composeRecap', () => {
  it("names what they'll do and what Ferni will do, in two short lines after the opener", () => {
    const items: Decided[] = [
      { who: 'caller', what: 'call the landlord', when: 'tomorrow', detail: '555-0134' },
      { who: 'ferni', what: 'check in', when: 'Thursday', detail: null },
    ];
    expect(composeRecap(items)).toBe(
      "From our call:\nYou'll call the landlord tomorrow (555-0134).\nI'll check in Thursday."
    );
    expect(composeRecap([])).toBeNull();
  });

  it('drops plans for that night when it goes out the next morning', () => {
    const tonight: Decided[] = [
      { who: 'caller', what: 'text your sister', when: 'tonight', detail: null },
    ];
    expect(composeRecap(tonight)).toContain('tonight');
    expect(composeRecap(tonight, true)).toBeNull();
  });
});

describe('sendTimeFor: quiet hours in their timezone', () => {
  it('sends at once in the afternoon', () => {
    expect(sendTimeFor(AFTERNOON, DENVER)).toEqual(AFTERNOON);
  });

  it('waits for 8am when the call ends late at night or before dawn', () => {
    // 11:30 pm Denver → 8:00 am Denver the next day (14:00 UTC).
    expect(sendTimeFor(new Date('2026-10-13T05:30:00Z'), DENVER).toISOString()).toBe(
      '2026-10-13T14:00:00.000Z'
    );
    // 6:15 am Denver → 8:00 am the same day.
    expect(sendTimeFor(new Date('2026-10-13T12:15:00Z'), DENVER).toISOString()).toBe(
      '2026-10-13T14:00:00.000Z'
    );
    // The same instant is afternoon in Tokyo: no wait.
    const t = new Date('2026-10-13T05:30:00Z');
    expect(sendTimeFor(t, 'Asia/Tokyo')).toEqual(t);
  });
});

describe('runRecapText after a call', () => {
  it('texts the recap to the verified phone after a call that settled something', async () => {
    const { deps, send, queue } = fakeDeps();
    expect(await run(await endedCall(LANDLORD), deps)).toBe('sent');
    expect(send).toHaveBeenCalledWith('u1', PHONE, expect.stringContaining('call the landlord'));
    expect(queue).not.toHaveBeenCalled();
  });

  it('sends nothing with the flag off', async () => {
    const { deps, send, queue } = fakeDeps();
    expect(await run(await endedCall(LANDLORD), deps, {})).toBe('off');
    expect(send).not.toHaveBeenCalled();
    expect(queue).not.toHaveBeenCalled();
  });

  it('sends nothing without the opt-in', async () => {
    const { deps, send, queue } = fakeDeps({ optedIn: async () => false });
    expect(await run(await endedCall(LANDLORD), deps)).toBe('not_opted_in');
    expect(send).not.toHaveBeenCalled();
    expect(queue).not.toHaveBeenCalled();
  });

  it('sends nothing without a verified phone on the account', async () => {
    const { deps, send, queue } = fakeDeps({ verifiedPhone: async () => null });
    expect(await run(await endedCall(LANDLORD), deps)).toBe('no_verified_phone');
    expect(send).not.toHaveBeenCalled();
    expect(queue).not.toHaveBeenCalled();
  });

  it('sends nothing when nothing was decided, or the call had no reading', async () => {
    const { deps, send } = fakeDeps();
    expect(await run(await endedCall(NOTHING), deps)).toBe('nothing_decided');
    expect(await run('never-read', deps)).toBe('nothing_decided');
    expect(send).not.toHaveBeenCalled();
  });

  it('sends nothing after a call with hard news', async () => {
    const { deps, send } = fakeDeps();
    const sessionId = await endedCall(LANDLORD, [
      { speaker: 'user', text: "My dad's in the hospital, I'll drive up tomorrow." },
      { speaker: 'ferni', text: "I'll check in Thursday." },
    ]);
    expect(await run(sessionId, deps)).toBe('heavy_call');
    expect(send).not.toHaveBeenCalled();
  });

  it('sends nothing after a call that took a crisis turn', async () => {
    const sessionId = `s-crisis-${++calls}`;
    const session = { userData: undefined };
    const wrapUp = new WrapUp((async () => LANDLORD) as UnderstandFn, undefined, false);
    setWrapUp(session, wrapUp);
    rememberReading(sessionId, wrapUp);
    await wrapUp.observe(PLAN_CALL);
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'user', content: "I hope I don't wake up tomorrow." });
    const model = async () =>
      new ReadableStream<unknown>({
        start: (c) => {
          c.enqueue('ok');
          c.close();
        },
      });
    await gatedReply(ctx, session, model as never, { wrap: (s: unknown) => s } as never, {
      env: PATTERNS_ONLY,
    });
    setWrapUp(session, null);
    callEnded(sessionId);
    const { deps, send } = fakeDeps();
    expect(await run(sessionId, deps)).toBe('heavy_call');
    expect(send).not.toHaveBeenCalled();
  });

  it('queues the text for 8am when the call ends late at night', async () => {
    const lateNight = new Date('2026-10-13T05:30:00Z'); // 11:30 pm in Denver
    const { deps, send, queue } = fakeDeps({ now: () => lateNight });
    expect(await run(await endedCall(LANDLORD), deps)).toBe('queued');
    expect(send).not.toHaveBeenCalled();
    expect(queue).toHaveBeenCalledWith(
      'u1',
      PHONE,
      // Read the next morning: "tomorrow" is today by then.
      "From our call last night:\nYou'll call the landlord today (555-0134).\nI'll check in Thursday.",
      new Date('2026-10-13T14:00:00.000Z')
    );
  });

  it('keeps "tomorrow" when the morning wait is the same day (a call at 6am)', async () => {
    const dawn = new Date('2026-10-13T12:15:00Z'); // 6:15 am in Denver
    const { deps, queue } = fakeDeps({ now: () => dawn });
    expect(await run(await endedCall(LANDLORD), deps)).toBe('queued');
    expect(queue.mock.calls[0]?.[2]).toContain('call the landlord tomorrow');
  });

  it('texts once per call: the reading is taken', async () => {
    const { deps, send } = fakeDeps();
    const sessionId = await endedCall(LANDLORD);
    expect(await run(sessionId, deps)).toBe('sent');
    expect(await run(sessionId, deps)).toBe('nothing_decided');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('never throws: a failing send is logged and reported', async () => {
    const { deps } = fakeDeps({
      send: async () => {
        throw new Error('twilio down');
      },
    });
    expect(await run(await endedCall(LANDLORD), deps)).toBe('failed');
  });
});

describe('liveRecapDeps: where the opt-in, the phone and the queue live', () => {
  it('is opted out unless the preference doc says optIn: true', async () => {
    const deps = liveRecapDeps();
    expect(await deps.optedIn('u-none')).toBe(false);
    live.prefs.set('/bogle_users/u-maybe/preferences/recap_text', { optIn: 'yes' });
    expect(await deps.optedIn('u-maybe')).toBe(false);
    live.prefs.set('/bogle_users/u-yes/preferences/recap_text', { optIn: true });
    expect(await deps.optedIn('u-yes')).toBe(true);
  });

  it("takes the phone only from the user's verified account", async () => {
    const deps = liveRecapDeps();
    expect(await deps.verifiedPhone('u-nobody')).toBeNull();
    live.users.set('u-nophone', {});
    expect(await deps.verifiedPhone('u-nophone')).toBeNull();
    live.users.set('u-verified', { phoneNumber: PHONE });
    expect(await deps.verifiedPhone('u-verified')).toBe(PHONE);
  });

  it('queues a pending sms reminder for the delivery job, and sends now through sendSMS', async () => {
    const deps = liveRecapDeps();
    const at = new Date('2026-10-13T14:00:00.000Z');
    await deps.queue('u-yes', PHONE, 'From our call last night: ...', at);
    expect(live.added.at(-1)).toEqual({
      path: '/bogle_users/u-yes/reminders',
      data: expect.objectContaining({
        message: 'From our call last night: ...',
        scheduledFor: '2026-10-13T14:00:00.000Z',
        deliveryMethod: 'sms',
        deliveryAddress: PHONE,
        status: 'pending',
      }),
    });
    await deps.send('u-yes', PHONE, 'From our call: ...');
    expect(live.sms.at(-1)).toEqual({ to: PHONE, text: 'From our call: ...' });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
