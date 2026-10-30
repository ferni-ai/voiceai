/**
 * The owner hears about each call once (outreach audit 2026-10-29, C): main
 * sent two pushes per call, and two emails when a callback was wanted, because
 * captureCallResult pushed and emailed and then storeInUnifiedResults handed the
 * same result to captureBackgroundResult, which pushed and (priority 'high')
 * emailed again. And three paths can capture one call (the agent's report, the
 * voicemail screen, the Twilio webhook), each telling the owner again.
 *
 * Real paths: captureCallResult -> call-result-once -> push, email (fake Gmail
 * transport), unified While You Were Away, guarded text; a fake Firestore that
 * runs transactions one at a time, as Firestore's own commit does for one doc.
 * Fictional people and numbers only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailSendResult, EmailSender, OutgoingEmail } from '../../../types/email-sender.js';
import type { CallOutcome, OnBehalfCallRequest } from '../../../tools/domains/telephony/types.js';

const store = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const isObj = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);
  const deep = (
    a: Record<string, unknown>,
    b: Record<string, unknown>
  ): Record<string, unknown> => {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(a[k]) ? deep(a[k] as Record<string, unknown>, v) : v; // prettier-ignore
    return out;
  };
  type Opts = { merge?: boolean; mergeFields?: string[] };
  const write = (path: string, data: Record<string, unknown>, opts?: Opts): void => {
    const before = docs.get(path) ?? {};
    if (opts?.merge) docs.set(path, deep(before, data));
    else if (opts?.mergeFields) {
      const next = { ...before };
      for (const f of opts.mergeFields) next[f] = data[f];
      docs.set(path, next);
    } else docs.set(path, { ...data });
  };
  const ref = (path: string): Record<string, unknown> => ({
    path,
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
    set: async (data: Record<string, unknown>, opts?: Opts) => write(path, data, opts),
    update: async (data: Record<string, unknown>) => write(path, data, { merge: true }),
    collection: (name: string) => col(`${path}/${name}`),
  });
  const col = (path: string): Record<string, unknown> => {
    const query = { where: () => query, orderBy: () => query, limit: () => query, get: async () => ({ docs: [], empty: true }) }; // prettier-ignore
    return {
      ...query,
      doc: (id: string) => ref(`${path}/${id}`),
      add: async () => ({ id: 'n-1' }),
    };
  };
  let lock: Promise<unknown> = Promise.resolve();
  const db = {
    collection: (name: string) => col(name),
    batch: () => ({ update: () => undefined, commit: async () => undefined }),
    // One transaction at a time, as Firestore commits one doc's transactions in order.
    runTransaction: <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const run = lock.then(() =>
        fn({
          get: (r: { get: () => Promise<unknown> }) => r.get(),
          set: (r: { path: string }, data: Record<string, unknown>, opts?: Opts) => write(r.path, data, opts), // prettier-ignore
        })
      );
      lock = run.catch(() => undefined);
      return run;
    },
  };
  return { docs, db, on: { value: true } };
});
vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => (store.on.value ? store.db : null),
}));
const push = vi.hoisted(() => vi.fn(async (_p: { title: string; body: string }) => [{ success: true }])); // prettier-ignore
vi.mock('../delivery/push-notifications.js', () => ({
  isPushNotificationsAvailable: () => true,
  sendPushNotification: push,
}));
const text = vi.hoisted(() => vi.fn(async (_t: { body: string }) => ({ sent: true })));
vi.mock('../guarded-text.js', () => ({ sendGuardedText: text }));
vi.mock('../../calendar/index.js', () => ({
  hasAnyProviderConnected: async () => false,
  createEvent: vi.fn(),
}));

const send = vi.fn(async (_e: OutgoingEmail): Promise<EmailSendResult> => ({ ok: true, provider: 'gmail', messageId: 'gm-1' })); // prettier-ignore
const fakeGmail: EmailSender = { provider: 'gmail', isConfigured: () => true, send };

const { setEmailSenderForTests } = await import('../../email-transport/index.js');
const { captureCallResult } = await import('../call-result-capture.js');
const { resetToldClaimsForTests } = await import('../call-result-once.js');
const { crisisCallerLine } = await import('../caller-text.js');
const { buildCallOutcome, toOnBehalfCallRequest } =
  await import('../../../agents/outbound-call/on-behalf-call-lifecycle.js');
const { buildOnBehalfDispatch } = await import('../on-behalf-dispatch.js');
const { noteLiveSession } = await import('../../../tools/registry/live-session.js');
const { registerVoiceCallbackHandler } =
  await import('../../../tools/domains/simple-utilities/voice-callbacks.js');

const NAME = 'Aunt Rosa';
let seq = 0;
function call(edit: Partial<CallOutcome> = {}, userId = `u-${++seq}`) {
  const callId = `call-${seq}`;
  store.docs.set(`bogle_users/${userId}`, { email: 'sam.example@example.com' });
  const request: OnBehalfCallRequest = {
    contactQuery: 'my aunt',
    resolvedContact: { name: NAME, phone: '+15555550100' },
    purpose: 'check in',
    objective: 'check_in',
    callType: 'personal',
    originalSessionId: `session-${seq}`,
    userId,
    userTimezone: 'UTC',
    userName: 'Sam',
    recordingConsent: false,
  };
  const outcome: CallOutcome = { callId, status: 'completed', objectiveAchieved: true, outcome: `Talked with ${NAME}.`, ...edit }; // prettier-ignore
  return { callId, userId, request, outcome, capture: (o = outcome) => captureCallResult(callId, o, request) }; // prettier-ignore
}

const emails = (): OutgoingEmail[] => send.mock.calls.map(([e]) => e);
const CALLBACK: Partial<CallOutcome> = { callbackRequired: true, message: 'Please call me back tonight.' }; // prettier-ignore
const VOICEMAIL: Partial<CallOutcome> = { status: 'voicemail', objectiveAchieved: false, voicemailLeft: true, callbackRequired: false, outcome: `Left ${NAME} a voicemail.` }; // prettier-ignore

let release: Array<() => void> = [];
function ownerLive(userId: string, sessionId: string): void {
  const session = {};
  release.push(registerVoiceCallbackHandler(userId, (async () => undefined) as never, session));
  release.push(noteLiveSession(session, sessionId));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-29T15:00:00Z')); // 15:00 UTC: no quiet hours
  store.docs.clear();
  store.on.value = true;
  resetToldClaimsForTests();
  push.mockClear();
  text.mockReset();
  text.mockResolvedValue({ sent: true });
  send.mockClear();
  setEmailSenderForTests(fakeGmail);
});
afterEach(() => {
  vi.useRealTimers();
  setEmailSenderForTests(null);
  release.forEach((r) => r());
  release = [];
  for (const k of ['CALL_RESULT_ONE_CHANNEL', 'CALL_RESULT_TEXT', 'CALL_RESULT_LIVE_REPORT']) delete process.env[k]; // prettier-ignore
});

describe('one capture tells the owner once (the double fire)', () => {
  it('a callback wanted: one push and one email, not two of each', async () => {
    const c = call(CALLBACK);
    await c.capture();
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0].title).toContain(NAME); // the call's own push, not the generic one
    expect(emails()).toHaveLength(1);
    expect(emails()[0].subject).toContain(NAME);
    // While You Were Away still has it, callback and all.
    const kept = [...store.docs.entries()].filter(([k]) => k.startsWith(`bogle_users/${c.userId}/background_results/`)); // prettier-ignore
    expect(kept).toHaveLength(1);
    expect(kept[0][1]).toMatchObject({ requiresCallback: true, relatedTaskId: c.callId });
  });

  it('records what was told on the call doc, and a second capture does not wipe it', async () => {
    const c = call(CALLBACK);
    await c.capture();
    await c.capture();
    const doc = store.docs.get(`bogle_users/${c.userId}/on_behalf_calls/${c.callId}`);
    expect(doc?.told).toMatchObject({ push: 1, email: 1, record: 1 });
    expect(doc?.outcome).toMatchObject({ callbackRequired: true });
    expect(push).toHaveBeenCalledTimes(1);
    expect(emails()).toHaveLength(1);
  });
});

describe('several captures of one call', () => {
  it('two concurrent captures of the same callId send once', async () => {
    const c = call(CALLBACK);
    await Promise.all([c.capture(), c.capture()]);
    expect(push).toHaveBeenCalledTimes(1);
    expect(emails()).toHaveLength(1);
  });

  it('holds with Firestore off too (in process)', async () => {
    store.on.value = false;
    const c = call(CALLBACK);
    await Promise.all([c.capture(), c.capture(), c.capture()]);
    expect(push).toHaveBeenCalledTimes(1); // (no email: the address is read from Firestore)
  });

  it('the voicemail screen and the agent report both capture: one push', async () => {
    const c = call(VOICEMAIL);
    await c.capture();
    await c.capture({ ...c.outcome, outcome: `I got ${NAME}'s voicemail and left a message.` });
    expect(push).toHaveBeenCalledTimes(1);
    expect(emails()).toHaveLength(1);
  });

  it('status first (Twilio), their words later (the agent): the words still reach the owner', async () => {
    const c = call();
    await c.capture(); // status only
    await c.capture({ ...c.outcome, ...CALLBACK, transcriptSummary: `${NAME} is well.` });
    expect(push).toHaveBeenCalledTimes(2);
    expect(emails()).toHaveLength(2);
    expect(emails()[1].text).toContain('callback');
  });
});

describe('a crisis line is never lost to dedupe or channel choice', () => {
  function crisisCall() {
    const dispatch = buildOnBehalfDispatch({
      callId: `call-crisis-${++seq}`,
      requester: { userId: `u-crisis-${seq}`, name: 'Sam', timezone: 'UTC', originalSessionId: `s-crisis-${seq}` }, // prettier-ignore
      contact: { name: NAME, phone: '+15555550100' },
      purpose: 'check in',
      objective: 'check_in',
      callType: 'personal',
    });
    store.docs.set(`bogle_users/${dispatch.requester.userId}`, { email: 'sam.example@example.com' }); // prettier-ignore
    const turns = [
      { role: 'agent' as const, content: "Hi, it's Ferni, calling for Sam." },
      { role: 'recipient' as const, content: "Honestly I don't want to be alive anymore." },
    ];
    const outcome = buildCallOutcome(dispatch, turns, null, 'completed', 60);
    return { dispatch, outcome, request: toOnBehalfCallRequest(dispatch) };
  }

  it('a later capture carrying a crisis line tells again, after a status-only one', async () => {
    const { dispatch, outcome, request } = crisisCall();
    const status: CallOutcome = { callId: dispatch.callId, status: 'completed', objectiveAchieved: false, outcome: `Talked with ${NAME}.` }; // prettier-ignore
    await captureCallResult(dispatch.callId, status, request);
    await captureCallResult(dispatch.callId, outcome, request);
    await captureCallResult(dispatch.callId, outcome, request); // and only once more
    expect(push).toHaveBeenCalledTimes(2);
    expect(push.mock.calls[1][0].body).toContain("don't want to be alive");
  });

  it('flag on, owner live: the crisis call is still pushed, with the words', async () => {
    process.env.CALL_RESULT_ONE_CHANNEL = 'on';
    process.env.CALL_RESULT_LIVE_REPORT = 'on';
    const { dispatch, outcome, request } = crisisCall();
    ownerLive(request.userId, request.originalSessionId);
    await captureCallResult(dispatch.callId, outcome, request);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0].body).toContain("don't want to be alive");
  });

  it("flag on: a crisis line only in the message leads the push in Ferni's words", async () => {
    process.env.CALL_RESULT_ONE_CHANNEL = 'on';
    const c = call({ message: crisisCallerLine(NAME) });
    await c.capture();
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0].body.startsWith(crisisCallerLine(NAME))).toBe(true);
  });
});

describe('CALL_RESULT_ONE_CHANNEL on: one channel per result', () => {
  type Row = [string, Partial<CallOutcome>, { live?: boolean; textOn?: boolean; textSent?: boolean }, { push: number; text: number }]; // prettier-ignore
  const rows: Row[] = [
    ['live, callback wanted', CALLBACK, { live: true, textOn: true }, { push: 0, text: 0 }],
    ['live, FYI', VOICEMAIL, { live: true }, { push: 0, text: 0 }],
    ['not live, callback, text on and sent', CALLBACK, { textOn: true }, { push: 0, text: 1 }],
    ['not live, callback, text on but held', CALLBACK, { textOn: true, textSent: false }, { push: 1, text: 1 }], // prettier-ignore
    ['not live, callback, text off', CALLBACK, {}, { push: 1, text: 0 }],
    ['not live, a message passed on', { message: 'Tell him hello.' }, { textOn: true }, { push: 0, text: 1 }], // prettier-ignore
    ['not live, the call failed', { status: 'failed', objectiveAchieved: false }, { textOn: true }, { push: 0, text: 1 }], // prettier-ignore
    ['not live, FYI (voicemail left), text on', VOICEMAIL, { textOn: true }, { push: 1, text: 0 }],
  ];
  it.each(rows)('%s', async (_name, edit, when, want) => {
    process.env.CALL_RESULT_ONE_CHANNEL = 'on';
    process.env.CALL_RESULT_LIVE_REPORT = 'on';
    if (when.textOn) process.env.CALL_RESULT_TEXT = 'on';
    if (when.textSent === false) text.mockResolvedValue({ sent: false });
    const c = call(edit);
    if (when.live) ownerLive(c.userId, c.request.originalSessionId);
    await c.capture();
    expect({ push: push.mock.calls.length, text: text.mock.calls.length }).toEqual(want);
    expect(emails()).toHaveLength(1); // the written record, always once
  });
});

describe('CALL_RESULT_ONE_CHANNEL off: as main, only once', () => {
  it('owner live: still a push and an email, as main', async () => {
    process.env.CALL_RESULT_LIVE_REPORT = 'on';
    const c = call(VOICEMAIL);
    ownerLive(c.userId, c.request.originalSessionId);
    await c.capture();
    expect(push).toHaveBeenCalledTimes(1);
    expect(emails()).toHaveLength(1);
  });

  it('CALL_RESULT_TEXT on: the text replaces the push, even for FYI, as main', async () => {
    process.env.CALL_RESULT_TEXT = 'on';
    const c = call(VOICEMAIL);
    await c.capture();
    expect(push).not.toHaveBeenCalled();
    expect(text).toHaveBeenCalledTimes(1);
    expect(emails()).toHaveLength(1);
  });

  it('CALL_RESULT_TEXT on, text held: no push, as main', async () => {
    process.env.CALL_RESULT_TEXT = 'on';
    text.mockResolvedValue({ sent: false });
    const c = call(CALLBACK);
    await c.capture();
    expect(push).not.toHaveBeenCalled();
    expect(emails()).toHaveLength(1);
  });
});
