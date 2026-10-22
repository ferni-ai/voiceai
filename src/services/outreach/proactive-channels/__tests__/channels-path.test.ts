/**
 * Which channel a proactive check-in takes, end to end: the per-minute
 * scheduler handler → the run → the channel policy → the text or in-app
 * adapter → the outreach log. Firestore is in memory; Firebase Auth (the
 * verified phone) and the Twilio send are stubbed at the SDK boundary.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pathFirestore } from './path-firestore.js';
import type { ProactiveTrigger } from '../types.js';

const docs = new Map<string, Record<string, unknown>>();
const authUsers = new Map<string, { phoneNumber?: string }>();
const texts: Array<{ to: string; body: string }> = [];
let twilioDown = false;
/** What the model writes; null means it is unavailable. */
let modelReply: string | null | Error = null;
const prompts: string[] = [];
/** Runs while the model writes the words: after the run read the opt-outs, before the send. */
let whileWriting: (() => void) | null = null;

vi.mock('../../../superhuman/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => pathFirestore(docs),
}));
// The opt-out stores (opt-outs.ts) import the canonical module.
vi.mock('../../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => pathFirestore(docs),
}));
vi.mock('../../../workflows/scheduled-actions.js', () => ({
  deliverDueScheduledActions: vi.fn(async () => ({ due: 0, delivered: 0 })),
}));
vi.mock('../../../data-layer/hooks/superhuman-hooks.js', () => ({
  onCommitmentKeeperChange: vi.fn(async () => undefined),
}));
vi.mock('../../../identity/firebase-auth.js', () => ({
  getFirebaseUser: vi.fn(async (uid: string) => authUsers.get(uid) ?? null),
}));
// Proactive texts go through the guarded sender; Twilio is stubbed at its transport.
vi.mock('../../delivery/sms-delivery.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isSMSDeliveryAvailable: () => true,
  sendSMS: vi.fn(async ({ to, body }: { to: string; body: string }) => {
    if (twilioDown) return { success: false, error: 'Twilio error: 503' };
    texts.push({ to, body });
    return { success: true, messageSid: 'SM1' };
  }),
}));

vi.mock('../../../llm-utils.js', () => ({
  callLLM: vi.fn(async (prompt: string) => {
    prompts.push(prompt);
    whileWriting?.();
    if (modelReply instanceof Error) throw modelReply;
    return modelReply;
  }),
}));

const { handleDeliverScheduledActions } =
  await import('../../../../api/scheduled-jobs/background-delivery-jobs.js');
const { phoneHash } = await import('../../checkin-replies.js');

const SETH = 'seth-uid';
const PHONE = '+15555550123';
const HOUR = 3600_000;
// 11:00 in New York, 08:00 in Los Angeles.
const NOW = new Date('2026-10-12T15:00:00Z');
const TEXTS_AND_CALLS = { channels: ['sms', 'voice_call'] };

function seedUser(extra: Record<string, unknown> = {}) {
  docs.set(`bogle_users/${SETH}`, {
    contactInfo: { timezone: 'America/New_York' },
    lastContact: new Date(NOW.getTime() - 30 * HOUR).toISOString(),
    outreachPreferences: TEXTS_AND_CALLS,
    ...extra,
  });
}
function seedPromise(id: string, topic = 'the move') {
  docs.set(`bogle_users/${SETH}/ferni_commitments/${id}`, {
    type: 'check_in',
    commitment: `I'll check in about ${topic}`,
    relatedTopic: topic,
    madeAt: new Date(NOW.getTime() - 20 * HOUR).toISOString(),
    outcome: 'open',
  });
}
function seedLog(id: string, entry: Record<string, unknown>) {
  docs.set(`bogle_users/${SETH}/proactive_outreach_log/${id}`, {
    sourceId: id,
    kind: 'promise',
    reason: 'earlier',
    why: 'timely',
    outcome: 'sent',
    ...entry,
  });
}
const under = (prefix: string) =>
  [...docs.entries()].filter(([p]) => p.startsWith(prefix)).map(([, d]) => d);
const notes = () => under(`bogle_users/${SETH}/pending_messages/`);
const logOf = (id: string) => docs.get(`bogle_users/${SETH}/proactive_outreach_log/${id}`);

async function runHandler(): Promise<{ status: string; channel?: string; why?: string }> {
  let body = '';
  const res = { writeHead: () => res, setHeader: () => undefined, end: (b: string) => (body = b) };
  await handleDeliverScheduledActions(
    { url: '/api/jobs/deliver-scheduled-actions' } as never,
    res as never
  );
  return (JSON.parse(body) as { proactive: { users: Array<{ status: string }> } }).proactive
    .users[0];
}

beforeEach(() => {
  // Phone-keyed opt-outs are read under this key; without it nothing is texted.
  process.env.LOG_HASH_SECRET = 'test-hash-secret';
  docs.clear();
  authUsers.clear();
  texts.length = 0;
  twilioDown = false;
  modelReply = null;
  prompts.length = 0;
  whileWriting = null;
  authUsers.set(SETH, { phoneNumber: PHONE });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  process.env.PROACTIVE_CHANNELS = 'on';
  process.env.PROACTIVE_CHANNELS_USERS = SETH;
});
afterEach(() => {
  delete process.env.LOG_HASH_SECRET;
  vi.useRealTimers();
  delete process.env.PROACTIVE_CHANNELS;
  delete process.env.PROACTIVE_CHANNELS_USERS;
});

describe('proactive check-in channel', () => {
  it('texts a timely promise to the verified phone and logs the text', async () => {
    seedUser();
    seedPromise('p1');
    expect(texts).toHaveLength(0);

    const result = await runHandler();
    expect(texts).toEqual([
      { to: PHONE, body: "Hey, it's Ferni. I said I'd check in about the move. How's it going?" },
    ]);
    expect(notes()).toHaveLength(0);
    expect(logOf('promise:p1')).toMatchObject({ channel: 'sms', outcome: 'sent', why: 'timely' });
    expect(result).toMatchObject({ status: 'sent', channel: 'sms' });
  });

  it('never texts a number that is not on the Firebase account', async () => {
    authUsers.delete(SETH);
    seedUser({ phone: PHONE, contactInfo: { timezone: 'America/New_York', phone: PHONE } });
    seedPromise('p1');
    await runHandler();
    expect(texts).toHaveLength(0);
    expect(notes()).toHaveLength(1);
    expect(logOf('promise:p1')).toMatchObject({ channel: 'in_app', why: 'no verified phone' });
  });

  it('without texts turned on, it is a note in the app', async () => {
    seedUser({ outreachPreferences: {} });
    seedPromise('p1');
    await runHandler();
    expect(texts).toHaveLength(0);
    expect(logOf('promise:p1')).toMatchObject({ channel: 'in_app', why: 'texts not turned on' });
  });

  it('holds during quiet hours in their own time zone, then sends after', async () => {
    // 22:30 in New York is quiet; it would be 19:30 on the old Los Angeles default.
    vi.setSystemTime(new Date('2026-10-13T02:30:00Z'));
    seedUser();
    seedPromise('p1');
    expect(await runHandler()).toMatchObject({ status: 'held', why: 'quiet hours' });
    expect(texts).toHaveLength(0);
    expect(logOf('promise:p1')).toBeUndefined();

    vi.setSystemTime(new Date('2026-10-13T12:30:00Z')); // 08:30 New York
    await runHandler();
    expect(texts).toHaveLength(1);
  });

  it('21:00-08:00 is always quiet; their own window only adds to it', async () => {
    // 21:30 New York (18:30 Los Angeles).
    const at = new Date('2026-10-13T01:30:00Z');
    const cases: Array<[Record<string, unknown>, boolean]> = [
      [{}, false], // the floor starts at 21:00
      [{ quietHours: { enabled: false } }, false], // turning theirs off doesn't lift it
      [{ quietHours: { enabled: true, start: '23:00', end: '07:00' } }, false], // nor does a later one
      [{ quietHoursStart: 23, quietHoursEnd: 7 }, false],
      [{ timezone: 'America/Los_Angeles' }, true], // the setting's zone beats the profile's
    ];
    for (const [prefs, sends] of cases) {
      docs.clear();
      texts.length = 0;
      vi.setSystemTime(at);
      seedUser({ outreachPreferences: { ...TEXTS_AND_CALLS, ...prefs } });
      seedPromise('p1');
      // eslint-disable-next-line no-await-in-loop
      await runHandler();
      expect([prefs, texts.length]).toEqual([prefs, sends ? 1 : 0]);
    }
  });

  it('an early-morning window of their own still leaves 22:00 quiet', async () => {
    vi.setSystemTime(new Date('2026-10-13T02:00:00Z')); // 22:00 New York
    seedUser({
      outreachPreferences: {
        ...TEXTS_AND_CALLS,
        quietHours: { enabled: true, start: '01:00', end: '02:00' },
      },
    });
    seedPromise('p1');
    expect(await runHandler()).toMatchObject({ status: 'held', why: 'quiet hours' });
    expect(texts).toHaveLength(0);
  });

  it('two overlapping runs send a check-in once', async () => {
    seedUser();
    seedPromise('p1');
    // The run the per-minute job makes, twice at once (a call can keep one going 40 s).
    const { runProactiveChannelsTick } = await import('../proactive-tick.js');
    const { defaultProactiveDeps } = await import('../default-deps.js');
    const runs = await Promise.all([
      runProactiveChannelsTick(defaultProactiveDeps()),
      runProactiveChannelsTick(defaultProactiveDeps()),
    ]);
    expect(runs.map((r) => r.users[0].status).sort()).toEqual(['idle', 'sent']);
    expect(texts).toHaveLength(1);
    expect(logOf('promise:p1')).toMatchObject({ channel: 'sms', outcome: 'sent' });
  });

  it('their own quiet hours win over the default', async () => {
    // 11:00 New York, inside a 10:00-12:00 quiet window they set.
    seedUser({
      outreachPreferences: {
        ...TEXTS_AND_CALLS,
        quietHours: { enabled: true, start: '10:00', end: '12:00' },
      },
    });
    seedPromise('p1');
    expect(await runHandler()).toMatchObject({ status: 'held', why: 'quiet hours' });
    expect(texts).toHaveLength(0);
  });

  it('gentle: the third text of the day becomes a note in the app', async () => {
    seedUser();
    seedLog('a', {
      channel: 'sms',
      at: new Date(NOW.getTime() - 3 * HOUR).toISOString(),
      outcome: 'replied',
    });
    seedLog('b', {
      channel: 'sms',
      at: new Date(NOW.getTime() - 2 * HOUR).toISOString(),
      outcome: 'replied',
    });
    seedPromise('p1');
    await runHandler();
    expect(texts).toHaveLength(0);
    expect(logOf('promise:p1')).toMatchObject({
      channel: 'in_app',
      why: 'text limit reached today',
    });
  });

  it('normal frequency allows that third text', async () => {
    seedUser({ outreachPreferences: { ...TEXTS_AND_CALLS, proactiveFrequency: 'normal' } });
    seedLog('a', {
      channel: 'sms',
      at: new Date(NOW.getTime() - 3 * HOUR).toISOString(),
      outcome: 'replied',
    });
    seedLog('b', {
      channel: 'sms',
      at: new Date(NOW.getTime() - 2 * HOUR).toISOString(),
      outcome: 'replied',
    });
    seedPromise('p1');
    await runHandler();
    expect(texts).toHaveLength(1);
  });

  it('backs off texts after two went unanswered since they last talked', async () => {
    seedUser({ lastContact: new Date(NOW.getTime() - 60 * HOUR).toISOString() });
    seedLog('a', { channel: 'sms', at: new Date(NOW.getTime() - 50 * HOUR).toISOString() });
    seedLog('b', { channel: 'sms', at: new Date(NOW.getTime() - 26 * HOUR).toISOString() });
    seedPromise('p1');
    await runHandler();
    expect(texts).toHaveLength(0);
    expect(logOf('promise:p1')).toMatchObject({
      channel: 'in_app',
      why: 'last texts went unanswered',
    });
  });

  it('a text that fails goes to the app instead and the log says so', async () => {
    twilioDown = true;
    seedUser();
    seedPromise('p1');
    await runHandler();
    expect(notes()).toHaveLength(1);
    expect(logOf('promise:p1')).toMatchObject({
      channel: 'in_app',
      fallbackFrom: 'sms',
      outcome: 'sent',
    });
  });

  it('"stop" (frequency off) sends nothing on any channel', async () => {
    seedUser({ outreachPreferences: { ...TEXTS_AND_CALLS, proactiveFrequency: 'off' } });
    seedPromise('p1');
    expect(await runHandler()).toMatchObject({ status: 'skipped' });
    expect(texts).toHaveLength(0);
    expect(notes()).toHaveLength(0);
  });

  it('a snooze holds everything until it ends', async () => {
    const until = new Date(NOW.getTime() + 2 * HOUR).toISOString();
    seedUser({ outreachPreferences: { ...TEXTS_AND_CALLS, proactiveSnoozeUntil: until } });
    seedPromise('p1');
    expect(await runHandler()).toMatchObject({ status: 'held', why: 'snoozed' });
    vi.setSystemTime(new Date(NOW.getTime() + 3 * HOUR));
    await runHandler();
    expect(texts).toHaveLength(1);
  });
});

describe('proactive check-in words', () => {
  it('Gemini writes the text from the reason, and the log says so', async () => {
    modelReply = "Hey, it's Ferni. How's the move coming along?";
    seedUser();
    seedPromise('p1');
    await runHandler();
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("Why you're reaching out: I said I'd check in about the move.");
    expect(texts.map((t) => t.body)).toEqual(["Hey, it's Ferni. How's the move coming along?"]);
    expect(logOf('promise:p1')).toMatchObject({
      text: "Hey, it's Ferni. How's the move coming along?",
      textSource: 'llm',
    });
  });

  it('a reply that calls Ferni an assistant is not sent; the promise line goes instead', async () => {
    modelReply = 'Hi! As your assistant, I wanted to check in about the move.';
    seedUser();
    seedPromise('p1');
    await runHandler();
    expect(texts.map((t) => t.body)).toEqual([
      "Hey, it's Ferni. I said I'd check in about the move. How's it going?",
    ]);
    expect(logOf('promise:p1')).toMatchObject({ textSource: 'template' });
  });

  it('when the model call throws, the promise line goes out', async () => {
    modelReply = new Error('Vertex 503');
    seedUser();
    seedPromise('p1');
    await runHandler();
    expect(texts).toHaveLength(1);
    expect(logOf('promise:p1')).toMatchObject({ textSource: 'template' });
  });

  it('never sends the same words twice in a row', async () => {
    const last = "Hey, it's Ferni. I said I'd check in about the move. How's it going?";
    seedUser();
    seedLog('earlier', {
      channel: 'in_app',
      at: new Date(NOW.getTime() - 26 * HOUR).toISOString(),
      text: last,
    });
    modelReply = last;
    seedPromise('p1');
    await runHandler();
    expect(texts).toHaveLength(1);
    expect(texts[0].body).not.toBe(last);
    expect(logOf('promise:p1')).toMatchObject({ textSource: 'fallback' });
  });
});

describe('proactive texts go through the guarded sender', () => {
  const PROMISE_TEXT = "Hey, it's Ferni. I said I'd check in about the move. How's it going?";
  const stopFrom = (phone: string) => {
    docs.set(`feature_checkin_optouts/${phoneHash(phone)}`, {
      at: NOW.toISOString(),
      via: 'reply',
    });
  };
  const records = () => under('feature_checkins/');

  it('an opted-in member gets the same words, recorded as a proactive text', async () => {
    seedUser();
    seedPromise('p1');
    expect(records()).toHaveLength(0);

    await runHandler();

    expect(texts).toEqual([{ to: PHONE, body: PROMISE_TEXT }]);
    expect(records()).toEqual([
      expect.objectContaining({
        kind: 'proactive',
        refId: 'promise:p1',
        status: 'sent',
        userId: SETH,
        question: PROMISE_TEXT,
      }),
    ]);
  });

  it('a STOP that lands while the words are written stops the text; the words go to the app', async () => {
    seedUser();
    seedPromise('p1');
    // Opted in when the run reads the opt-outs; the STOP arrives before the send.
    whileWriting = () => stopFrom(PHONE);

    await runHandler();

    expect(texts).toHaveLength(0);
    expect(records()).toHaveLength(0);
    expect(notes()).toEqual([expect.objectContaining({ text: PROMISE_TEXT })]);
    expect(logOf('promise:p1')).toMatchObject({ channel: 'in_app', fallbackFrom: 'sms' });
  });

  it('the text edge itself never texts a number that sent STOP', async () => {
    seedUser();
    stopFrom(PHONE);
    const { defaultProactiveDeps } = await import('../default-deps.js');
    const trigger: ProactiveTrigger = {
      sourceId: 'promise:p1',
      kind: 'promise',
      weight: 'light',
      timely: true,
      reason: 'a promise',
      text: PROMISE_TEXT,
    };

    expect(await defaultProactiveDeps().sendSms(SETH, trigger)).toBe(false);
    expect(texts).toHaveLength(0);
  });
});
