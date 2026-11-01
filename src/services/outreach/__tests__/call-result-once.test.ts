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
  interface Opts {
    merge?: boolean;
    mergeFields?: string[];
  }
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
const { resetToldClaimsForTests } = await import('../call-result-claims.js');
const { crisisCallerLine, screenedCallerText } = await import('../caller-text.js');
const { buildPendingResultsContext } =
  await import('../../background-agents/unified-result-capture.js');
const { buildCallOutcome, toOnBehalfCallRequest } =
  await import('../../../agents/outbound-call/on-behalf-call-lifecycle.js');
const { buildOnBehalfDispatch } = await import('../on-behalf-dispatch.js');
const { noteLiveSession } = await import('../../../tools/registry/live-session.js');
const { registerVoiceCallbackHandler } =
  await import('../../../tools/domains/simple-utilities/voice-callbacks.js');

const NAME = 'Aunt Rosa';
let seq = 0;
function call(edit: Partial<CallOutcome> = {}, userId = `u-${++seq}`, timeZone = 'UTC') {
  const callId = `call-${++seq}`;
  store.docs.set(`bogle_users/${userId}`, { email: 'sam.example@example.com' });
  const request: OnBehalfCallRequest = {
    contactQuery: 'my aunt',
    resolvedContact: { name: NAME, phone: '+15555550100' },
    purpose: 'check in',
    objective: 'check_in',
    callType: 'personal',
    originalSessionId: `session-${seq}`,
    userId,
    userTimezone: timeZone,
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

/** Ferni's crisis line leads a push or an email: the owner hears it at once (verifier, round 1). */
const crisisFirst = {
  push: (): boolean => push.mock.calls.some(([p]) => p.body.startsWith(crisisCallerLine(NAME))),
  // The transport adds its own 'Hey.'; the report's first words are the crisis line.
  email: (): boolean =>
    emails().some((e) => {
      const at = e.text?.indexOf(`**${crisisCallerLine(NAME)}**`) ?? -1;
      return at >= 0 && at < (e.text?.indexOf('Just wanted to let you know') ?? -1);
    }),
};
const RAW = "Honestly I don't want to be alive anymore.";
type Shape = 'messageOnlyCallback' | 'noAnalysis' | 'summaryOnlyCallback' | 'summaryOnly' | 'messageOnly' | 'messageAndItems'; // prettier-ignore
/** The verifier's crisis shapes: the crisis words held in one field or another. */
function crisisIn(shape: Shape, callId: string): CallOutcome {
  if (shape === 'noAnalysis') {
    const dispatch = buildOnBehalfDispatch({ callId, requester: { userId: 'u-x', name: 'Sam', timezone: 'UTC', originalSessionId: '' }, contact: { name: NAME, phone: '+15555550100' }, purpose: 'check in', objective: 'check_in', callType: 'personal' }); // prettier-ignore
    return buildCallOutcome(dispatch, [{ role: 'agent', content: "Hi, it's Ferni." }, { role: 'recipient', content: RAW }], null, 'completed', 60); // prettier-ignore
  }
  const sum = screenedCallerText(`${NAME} asked Sam to call back tonight. She also said: ${RAW}`, NAME, 600); // prettier-ignore
  const msg = screenedCallerText(RAW, NAME, 200);
  const benign: CallOutcome = { callId, status: 'completed', objectiveAchieved: true, outcome: `I talked with ${NAME}; she'd love a call back tonight.` }; // prettier-ignore
  if (shape === 'summaryOnlyCallback') return { ...benign, transcriptSummary: sum, callbackRequired: true, callbackTime: 'tonight', message: 'Please call me back tonight.' }; // prettier-ignore
  if (shape === 'messageOnlyCallback') return { ...benign, message: msg, callbackRequired: true };
  if (shape === 'summaryOnly') return { ...benign, transcriptSummary: sum };
  if (shape === 'messageOnly') return { ...benign, message: msg };
  return { ...benign, message: msg, actionItems: [`${NAME} said: ${msg}`] };
}

describe('every crisis line reaches the owner at once: a push and the email, led by it', () => {
  const shapes: Shape[] = ['messageOnlyCallback', 'noAnalysis', 'summaryOnlyCallback', 'summaryOnly', 'messageOnly', 'messageAndItems']; // prettier-ignore
  const orders = ['single', 'statusFirst', 'crisisTwice', 'crisisThenStatus'] as const;
  const cases: string[] = [];
  for (const shape of shapes) for (const order of orders) for (const flag of [0, 1]) for (const live of [0, 1]) // prettier-ignore
    for (const text of ['off', 'sent', 'quiet', 'not-sent']) cases.push(`${shape} ${order} flag=${flag} live=${live} text=${text}`); // prettier-ignore
  it.each(cases)('%s', async (name) => {
    const [shape, order, flag, live, textAs] = name.split(' ') as [Shape, (typeof orders)[number], string, string, string]; // prettier-ignore
    process.env.CALL_RESULT_LIVE_REPORT = 'on';
    if (flag.endsWith('1')) process.env.CALL_RESULT_ONE_CHANNEL = 'on';
    if (!textAs.endsWith('off')) process.env.CALL_RESULT_TEXT = 'on';
    if (textAs.endsWith('not-sent')) text.mockResolvedValue({ sent: false });
    const c = call({}, undefined, textAs.endsWith('quiet') ? 'Asia/Tokyo' : 'UTC'); // 00:00 in Tokyo
    if (live.endsWith('1')) ownerLive(c.userId, c.request.originalSessionId);
    const crisis = crisisIn(shape, c.callId);
    const status: CallOutcome = { ...c.outcome, objectiveAchieved: false };
    const steps = { single: [crisis], statusFirst: [status, crisis], crisisTwice: [crisis, crisis], crisisThenStatus: [crisis, status] }[order]; // prettier-ignore
    // eslint-disable-next-line no-await-in-loop -- captures of one call land in order
    for (const o of steps) await c.capture(o);
    expect(crisisFirst.push()).toBe(true);
    expect(crisisFirst.email()).toBe(true);
    // Once, however many captures carried it.
    expect(push.mock.calls.filter(([p]) => p.body.startsWith(crisisCallerLine(NAME)))).toHaveLength(1); // prettier-ignore
  });

  it('the crisis push has its own claim: a push already told (even at crisis level) never eats it', async () => {
    const c = call();
    store.docs.set(`bogle_users/${c.userId}/on_behalf_calls/${c.callId}`, { told: { push: 2, email: 2 } }); // prettier-ignore
    await c.capture(crisisIn('messageOnly', c.callId));
    expect(crisisFirst.push()).toBe(true);
  });

  it('flag on, a text sent for it: the crisis held in the summary still goes by push', async () => {
    process.env.CALL_RESULT_ONE_CHANNEL = 'on';
    process.env.CALL_RESULT_TEXT = 'on';
    const c = call();
    await c.capture(crisisIn('summaryOnlyCallback', c.callId));
    expect(text).toHaveBeenCalledTimes(1);
    expect(text.mock.calls[0][0].body).not.toContain('alive'); // the text carries the message only
    expect(emails()[0].text).toContain(`${NAME} asked to pass on:`); // callResultDetails in the email
    expect(crisisFirst.push()).toBe(true);
  });

  it.each(['off', 'on'])(
    'flag %s: a crisis text held for quiet hours goes on a later capture',
    async (flag) => {
      // prettier-ignore
      if (flag === 'on') process.env.CALL_RESULT_ONE_CHANNEL = 'on';
      process.env.CALL_RESULT_TEXT = 'on';
      const c = call({}, undefined, 'Asia/Tokyo');
      const crisis = crisisIn('messageOnlyCallback', c.callId);
      await c.capture(crisis); // 00:00 in Tokyo: held
      expect(text).not.toHaveBeenCalled();
      vi.setSystemTime(new Date('2026-10-30T03:00:00Z')); // noon in Tokyo
      await c.capture(crisis);
      await c.capture(crisis);
      expect(text).toHaveBeenCalledTimes(1);
      expect(text.mock.calls[0][0].body).toContain("don't want to be alive"); // their words, quoted
      expect(push).toHaveBeenCalledTimes(1); // the crisis push, once
    }
  );
});

describe('While You Were Away keeps a callback important', () => {
  it('the "Important" tag and the first place are back, with one email', async () => {
    store.on.value = false; // the in-memory results, read back as the next call's opener does
    const owner = `u-wywa-${++seq}`;
    await call(VOICEMAIL, owner).capture();
    await call({ ...CALLBACK, outcome: 'She wants a call back tonight.' }, owner).capture();
    const block = (await buildPendingResultsContext(owner)) ?? '';
    expect(block).toContain('⭐ Important');
    expect(block.indexOf('She wants a call back tonight.')).toBeLessThan(block.indexOf('voicemail')); // prettier-ignore
  });
});

describe('the in-process claims are bounded', () => {
  it('held for a day: a capture a day later tells again', async () => {
    store.on.value = false;
    const c = call();
    await c.capture();
    await c.capture();
    expect(push).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date('2026-10-30T16:00:00Z'));
    await c.capture();
    expect(push).toHaveBeenCalledTimes(2);
  });

  it('at most 2000 calls: the oldest is let go first', async () => {
    store.on.value = false;
    const first = call();
    await first.capture();
    // eslint-disable-next-line no-await-in-loop -- one call after another, as the cap counts them
    for (let i = 0; i < 2000; i++) await call().capture();
    push.mockClear();
    await first.capture();
    expect(push).toHaveBeenCalledTimes(1);
    const last = seq;
    push.mockClear();
    await captureCallResult(`call-${last}`, { callId: `call-${last}`, status: 'completed', objectiveAchieved: true, outcome: 'x' }, { ...first.request, userId: `u-${last - 1}` }); // prettier-ignore
    expect(push).not.toHaveBeenCalled(); // a recent call is still held
  }, 60_000);
});
