/**
 * A proactive check-in never texts a phone that opted out of texts, never rings
 * one on the do-not-call list, and sends nothing when those lists can't be read.
 * End to end: the per-minute scheduler handler → the run → the opt-out stores
 * the guarded senders read (feature_checkin_optouts, consent/{phoneHash},
 * outreach_profiles.allowedChannels, call_opt_outs) → the channel policy →
 * Twilio / LiveKit → the outreach log. Firestore is in memory; the SDKs are
 * stubbed at the edge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pathFirestore } from './path-firestore.js';

const docs = new Map<string, Record<string, unknown>>();
/** Top-level collections whose reads throw, as when Firestore is unreachable. */
const unreadable = new Set<string>();
const texts: Array<{ to: string; body: string }> = [];
const dials: string[] = [];
/** The trunk refuses the dial outright (not a SIP status): the call 'failed'. */
let trunkDown = false;

/** The in-memory database, with reads of `unreadable` collections failing. */
function db() {
  const real = pathFirestore(docs);
  const failing = { get: async () => Promise.reject(new Error('14 UNAVAILABLE')) };
  const broken = { ...failing, where: () => failing, doc: () => failing };
  return {
    ...real,
    collection: (name: string) => (unreadable.has(name) ? broken : real.collection(name)),
  };
}

// Both paths: the opt-out stores import the canonical module, the run the re-export.
vi.mock('../../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => db(),
}));
vi.mock('../../../superhuman/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => db(),
}));
vi.mock('../../../workflows/scheduled-actions.js', () => ({
  deliverDueScheduledActions: vi.fn(async () => ({ due: 0, delivered: 0 })),
}));
vi.mock('../../../data-layer/hooks/superhuman-hooks.js', () => ({
  onCommitmentKeeperChange: vi.fn(async () => undefined),
}));
vi.mock('../../../identity/firebase-auth.js', () => ({
  getFirebaseUser: vi.fn(async () => ({ phoneNumber: '+15555550123' })),
}));
vi.mock('../../../communication-service.js', () => ({
  sendSMS: vi.fn(async (to: string, body: string) => void texts.push({ to, body })),
}));
vi.mock('../../../llm-utils.js', () => ({ callLLM: vi.fn(async () => null) }));
vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: class {
    async createRoom() {}
  },
  AgentDispatchClient: class {
    async createDispatch() {}
  },
  SipClient: class {
    async createSipParticipant(_trunk: string, phone: string) {
      if (trunkDown) throw new Error('trunk unavailable');
      dials.push(phone);
    }
  },
}));

const { handleDeliverScheduledActions } =
  await import('../../../../api/scheduled-jobs/background-delivery-jobs.js');
const { phoneHash } = await import('../../checkin-replies.js');

const SETH = 'seth-uid';
const PHONE = '+15555550123';
const HOUR = 3600_000;
// 11:00 in New York.
const NOW = new Date('2026-10-12T15:00:00Z');
const ENV = {
  PROACTIVE_CHANNELS: 'on',
  PROACTIVE_CHANNELS_USERS: SETH,
  LOG_HASH_SECRET: 'test-hash-secret',
  SIP_TRUNK_ID: 'ST_test',
  LIVEKIT_URL: 'wss://lk.test',
  LIVEKIT_API_KEY: 'key',
  LIVEKIT_API_SECRET: 'lk-secret',
};
const hash = () => phoneHash(PHONE, ENV) ?? '';

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
/** A promise to check in; `call` makes it a promised call (meaningful). */
function seedPromise(id: string, call = false) {
  docs.set(`bogle_users/${SETH}/ferni_commitments/${id}`, {
    type: 'check_in',
    commitment: call
      ? "I'll call you tomorrow to check in about the move"
      : "I'll check in about the move",
    relatedTopic: 'the move',
    madeAt: new Date(NOW.getTime() - 20 * HOUR).toISOString(),
    outcome: 'open',
  });
}
const textOptOut = () => docs.set(`feature_checkin_optouts/${hash()}`, { at: NOW.toISOString() });
const doNotCall = () => docs.set(`call_opt_outs/${PHONE}`, { phone: PHONE });
const logOf = (id: string) => docs.get(`bogle_users/${SETH}/proactive_outreach_log/${id}`);
const notes = () =>
  [...docs.keys()].filter((p) => p.startsWith(`bogle_users/${SETH}/pending_messages/`));

beforeEach(() => {
  docs.clear();
  unreadable.clear();
  texts.length = 0;
  dials.length = 0;
  trunkDown = false;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  Object.assign(process.env, ENV);
  docs.set(`bogle_users/${SETH}`, {
    contactInfo: { timezone: 'America/New_York' },
    lastContact: new Date(NOW.getTime() - 30 * HOUR).toISOString(),
    outreachPreferences: { channels: ['sms', 'voice_call'] },
  });
});
afterEach(() => {
  vi.useRealTimers();
  for (const k of Object.keys(ENV)) delete process.env[k];
});

describe('proactive texts honour STOP', () => {
  it('a phone that texted STOP (feature_checkin_optouts) gets no text; the log says why', async () => {
    textOptOut();
    seedPromise('p1');
    const result = await runHandler();

    expect(texts).toHaveLength(0);
    expect(dials).toHaveLength(0);
    expect(notes()).toHaveLength(1);
    expect(result).toMatchObject({ status: 'sent', channel: 'in_app' });
    expect(logOf('promise:p1')).toMatchObject({
      channel: 'in_app',
      why: 'opted out of texts',
      optedOut: ['sms'],
    });
  });

  it('a text opt-out in consent/{phoneHash} stops texts too', async () => {
    docs.set(`consent/${hash()}`, { sms: { state: 'opted-out', source: 'inbound-sms' } });
    seedPromise('p1');
    await runHandler();
    expect(texts).toHaveLength(0);
    expect(logOf('promise:p1')).toMatchObject({ channel: 'in_app', optedOut: ['sms'] });
  });

  it('a global STOP from the old webhook (allowedChannels without sms) stops texts', async () => {
    docs.set(`outreach_profiles/${SETH}`, { state: { allowedChannels: ['email'] } });
    seedPromise('p1');
    await runHandler();
    expect(texts).toHaveLength(0);
    expect(logOf('promise:p1')).toMatchObject({ channel: 'in_app', optedOut: ['sms'] });
  });

  it('with no opt-out on record, the check-in is still texted', async () => {
    seedPromise('p1');
    const result = await runHandler();
    expect(texts).toEqual([
      { to: PHONE, body: "Hey, it's Ferni. I said I'd check in about the move. How's it going?" },
    ]);
    expect(result).toMatchObject({ status: 'sent', channel: 'sms' });
    expect(logOf('promise:p1')).not.toHaveProperty('optedOut');
  });
});

describe('proactive calls honour do-not-call', () => {
  it('a number on call_opt_outs is never rung', async () => {
    doNotCall();
    seedPromise('p1', true);
    await runHandler();

    expect(dials).toHaveLength(0);
    expect(logOf('promise:p1')).toMatchObject({ optedOut: ['voice_call'] });
    expect(logOf('promise:p1')?.channel).not.toBe('voice_call');
  });

  it('a "stop calling me" in consent/{phoneHash} is never rung', async () => {
    docs.set(`consent/${hash()}`, { call: { state: 'opted-out', source: 'inbound-sms' } });
    seedPromise('p1', true);
    await runHandler();
    expect(dials).toHaveLength(0);
    expect(logOf('promise:p1')).toMatchObject({ optedOut: ['voice_call'] });
  });

  it('opted out of both: no call and no text in its place, only a note in the app', async () => {
    doNotCall();
    textOptOut();
    seedPromise('p1', true);
    await runHandler();

    expect(dials).toHaveLength(0);
    expect(texts).toHaveLength(0);
    expect(notes()).toHaveLength(1);
    expect(logOf('promise:p1')).toMatchObject({
      channel: 'in_app',
      optedOut: ['sms', 'voice_call'],
    });
    expect(logOf('promise:p1')?.text).not.toContain('opted');
  });

  it("a call that can't be placed doesn't become a text to a phone that sent STOP", async () => {
    textOptOut();
    trunkDown = true;
    seedPromise('p1', true);
    await runHandler();

    expect(texts).toHaveLength(0);
    expect(notes()).toHaveLength(1);
    expect(logOf('promise:p1')).toMatchObject({
      channel: 'voice_call',
      outcome: 'failed',
      fallbackChannel: 'in_app',
      optedOut: ['sms'],
    });
  });

  it('with no opt-out on record, a promised call still rings', async () => {
    seedPromise('p1', true);
    await runHandler();
    expect(dials).toEqual([PHONE]);
    expect(logOf('promise:p1')).toMatchObject({ channel: 'voice_call', outcome: 'answered' });
  });
});

describe('an opt-out list that cannot be read sends nothing', () => {
  it.each(['feature_checkin_optouts', 'consent', 'outreach_profiles'])(
    '%s unreadable: no text, no call, no note, and the trigger waits for a later run',
    async (collection) => {
      unreadable.add(collection);
      seedPromise('p1');
      const result = await runHandler();

      expect(texts).toHaveLength(0);
      expect(dials).toHaveLength(0);
      expect(notes()).toHaveLength(0);
      expect(logOf('promise:p1')).toBeUndefined();
      expect(result).toMatchObject({ status: 'held', why: 'opt-out list unreadable' });
    }
  );

  it('call_opt_outs unreadable: treated as on the list, so no call', async () => {
    unreadable.add('call_opt_outs');
    seedPromise('p1', true);
    await runHandler();
    expect(dials).toHaveLength(0);
    expect(logOf('promise:p1')).toMatchObject({ optedOut: ['voice_call'] });
  });

  it('without LOG_HASH_SECRET no phone-keyed opt-out can be checked, so nothing is texted', async () => {
    delete process.env.LOG_HASH_SECRET;
    seedPromise('p1');
    const result = await runHandler();
    expect(texts).toHaveLength(0);
    expect(dials).toHaveLength(0);
    expect(result).toMatchObject({ status: 'held', why: 'opt-out list unreadable' });
  });
});
