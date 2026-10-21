/**
 * Ferni rings the user, end to end: the per-minute scheduler handler → the
 * run → the channel policy → placeSelfCall → LiveKit (room, signed agent
 * dispatch, SIP dial) → the outreach log. Firestore is in memory; the
 * LiveKit SDK, Firebase Auth, Twilio and the model are stubbed at the edge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pathFirestore } from './path-firestore.js';

const docs = new Map<string, Record<string, unknown>>();
const texts: string[] = [];
const dispatches: Array<{ room: string; agent: string; metadata: string }> = [];
const dials: Array<{ trunk: string; phone: string; room: string }> = [];
/** What the phone does: answer, or a SIP status that ends the call. */
let phoneDoes: 'answer' | number = 'answer';
let logWhileRinging: unknown;

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
  getFirebaseUser: vi.fn(async () => ({ phoneNumber: '+15555550123' })),
}));
vi.mock('../../../communication-service.js', () => ({
  sendSMS: vi.fn(async (_to: string, body: string) => void texts.push(body)),
}));
vi.mock('../../../llm/llm-utils.js', () => ({ callLLM: vi.fn(async () => null) }));
vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: class {
    async createRoom() {}
  },
  AgentDispatchClient: class {
    async createDispatch(room: string, agent: string, opts: { metadata: string }) {
      dispatches.push({ room, agent, metadata: opts.metadata });
    }
  },
  SipClient: class {
    async createSipParticipant(trunk: string, phone: string, room: string) {
      dials.push({ trunk, phone, room });
      logWhileRinging = docs.get('bogle_users/seth-uid/proactive_outreach_log/promise:p1');
      if (phoneDoes !== 'answer') {
        throw Object.assign(new Error('twirp error unknown: INVITE failed'), {
          metadata: { sip_status_code: String(phoneDoes) },
        });
      }
    }
  },
}));

const { handleDeliverScheduledActions } =
  await import('../../../../api/scheduled-jobs/background-delivery-jobs.js');
const { verifyOnBehalfDispatch } = await import('../../on-behalf-dispatch.js');

const SETH = 'seth-uid';
const SECRET = 'lk-secret';
const HOUR = 3600_000;
// 11:00 in New York.
const NOW = new Date('2026-10-12T15:00:00Z');

async function runHandler(): Promise<void> {
  const res = { writeHead: () => res, setHeader: () => undefined, end: () => undefined };
  await handleDeliverScheduledActions(
    { url: '/api/jobs/deliver-scheduled-actions' } as never,
    res as never
  );
}
function seedPromisedCall(id: string, topic = 'the move') {
  docs.set(`bogle_users/${SETH}/ferni_commitments/${id}`, {
    type: 'check_in',
    commitment: `I'll call you tomorrow to check in about ${topic}`,
    relatedTopic: topic,
    madeAt: new Date(NOW.getTime() - 20 * HOUR).toISOString(),
    outcome: 'open',
  });
}
const logOf = (id: string) => docs.get(`bogle_users/${SETH}/proactive_outreach_log/${id}`);
const notes = () =>
  [...docs.keys()].filter((p) => p.startsWith(`bogle_users/${SETH}/pending_messages/`));

beforeEach(() => {
  // Phone-keyed opt-outs are read under this key; without it nothing is texted.
  process.env.LOG_HASH_SECRET = 'test-hash-secret';
  docs.clear();
  texts.length = 0;
  dispatches.length = 0;
  dials.length = 0;
  phoneDoes = 'answer';
  logWhileRinging = undefined;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  Object.assign(process.env, {
    PROACTIVE_CHANNELS: 'on',
    PROACTIVE_CHANNELS_USERS: SETH,
    SIP_TRUNK_ID: 'ST_test',
    LIVEKIT_URL: 'wss://lk.test',
    LIVEKIT_API_KEY: 'key',
    LIVEKIT_API_SECRET: SECRET,
  });
  docs.set(`bogle_users/${SETH}`, {
    contactInfo: { timezone: 'America/New_York' },
    lastContact: new Date(NOW.getTime() - 30 * HOUR).toISOString(),
    outreachPreferences: { channels: ['sms', 'voice_call'] },
  });
});
afterEach(() => {
  delete process.env.LOG_HASH_SECRET;
  vi.useRealTimers();
  for (const k of [
    'PROACTIVE_CHANNELS',
    'PROACTIVE_CHANNELS_USERS',
    'SIP_TRUNK_ID',
    'LIVEKIT_URL',
    'LIVEKIT_API_KEY',
    'LIVEKIT_API_SECRET',
  ]) {
    delete process.env[k];
  }
});

describe('Ferni calls the user', () => {
  it('a promised call rings the verified phone with a signed dispatch that says why', async () => {
    seedPromisedCall('p1');
    await runHandler();

    expect(dials).toEqual([{ trunk: 'ST_test', phone: '+15555550123', room: dispatches[0].room }]);
    const [{ metadata, agent }] = dispatches;
    expect(agent).toBe('voice-agent');
    expect(JSON.parse(metadata)).toMatchObject({
      type: 'proactive_outreach',
      userId: SETH,
      triggerReason: "I said I'd check in about the move",
    });
    expect(verifyOnBehalfDispatch(metadata, SECRET)).toBe(true);
    const forged = metadata.replace(SETH, 'someone-else');
    expect(verifyOnBehalfDispatch(forged, SECRET)).toBe(false);

    expect(texts).toHaveLength(0);
    expect(logOf('promise:p1')).toMatchObject({ channel: 'voice_call', outcome: 'answered' });
  });

  it('logs the call before it rings, so the next run cannot ring again', async () => {
    seedPromisedCall('p1');
    await runHandler();
    expect(logWhileRinging).toMatchObject({ channel: 'voice_call', outcome: 'pending' });
  });

  it('no answer: logged, the words left in the app, and calls back off', async () => {
    phoneDoes = 480;
    seedPromisedCall('p1');
    await runHandler();
    expect(logOf('promise:p1')).toMatchObject({ channel: 'voice_call', outcome: 'no_answer' });
    expect(notes()).toHaveLength(1);
    expect(texts).toHaveLength(0);

    vi.setSystemTime(new Date(NOW.getTime() + 26 * HOUR));
    seedPromisedCall('p2', 'the interview');
    docs.set(`bogle_users/${SETH}/ferni_commitments/p2`, {
      ...docs.get(`bogle_users/${SETH}/ferni_commitments/p2`),
      madeAt: new Date(NOW.getTime() + 2 * HOUR).toISOString(),
    });
    await runHandler();
    expect(dials).toHaveLength(1);
    expect(logOf('promise:p2')).toMatchObject({ channel: 'sms' });
  });

  it('busy and declined are told apart', async () => {
    phoneDoes = 486;
    seedPromisedCall('p1');
    await runHandler();
    expect(logOf('promise:p1')).toMatchObject({ outcome: 'busy' });
  });

  it('a call that cannot be placed goes out as a text instead, and still counts as the call', async () => {
    phoneDoes = 503;
    seedPromisedCall('p1');
    await runHandler();
    expect(texts).toHaveLength(1);
    expect(logOf('promise:p1')).toMatchObject({
      channel: 'voice_call',
      outcome: 'failed',
      fallbackChannel: 'sms',
    });

    // Later the same day, another promised call: no second call today.
    vi.setSystemTime(new Date(NOW.getTime() + 2 * HOUR));
    seedPromisedCall('p2', 'the interview');
    await runHandler();
    expect(dials).toHaveLength(1);
    expect(logOf('promise:p2')).toMatchObject({ channel: 'sms' });
  });

  it("a failed call's stand-in text counts toward the day's texts", async () => {
    phoneDoes = 503;
    docs.set(`bogle_users/${SETH}/proactive_outreach_log/t1`, {
      sourceId: 't1',
      channel: 'sms',
      at: new Date(NOW.getTime() - HOUR).toISOString(),
      outcome: 'replied',
    });
    seedPromisedCall('p1');
    await runHandler();
    expect(texts).toHaveLength(1);

    // A light check-in later today: two texts already (one stood in for the call).
    vi.setSystemTime(new Date(NOW.getTime() + HOUR));
    docs.set(`bogle_users/${SETH}/ferni_commitments/p2`, {
      type: 'check_in',
      relatedTopic: 'the interview',
      madeAt: new Date(NOW.getTime() - 20 * HOUR).toISOString(),
      outcome: 'open',
    });
    await runHandler();
    expect(texts).toHaveLength(1);
    expect(logOf('promise:p2')).toMatchObject({
      channel: 'in_app',
      why: 'text limit reached today',
    });
  });

  it('the fallback for a failed call obeys the text opt-in: calls only means a note', async () => {
    phoneDoes = 503;
    docs.set(`bogle_users/${SETH}`, {
      ...docs.get(`bogle_users/${SETH}`),
      outreachPreferences: { channels: ['voice_call'] },
    });
    seedPromisedCall('p1');
    await runHandler();
    expect(dials).toHaveLength(1);
    expect(texts).toHaveLength(0);
    expect(notes()).toHaveLength(1);
    expect(logOf('promise:p1')).toMatchObject({ outcome: 'failed', fallbackChannel: 'in_app' });
  });

  it('the fallback for a failed call obeys the daily text cap', async () => {
    phoneDoes = 503;
    for (const id of ['t1', 't2']) {
      docs.set(`bogle_users/${SETH}/proactive_outreach_log/${id}`, {
        sourceId: id,
        channel: 'sms',
        at: new Date(NOW.getTime() - HOUR).toISOString(),
        outcome: 'replied',
      });
    }
    seedPromisedCall('p1');
    await runHandler();
    expect(texts).toHaveLength(0);
    expect(logOf('promise:p1')).toMatchObject({ outcome: 'failed', fallbackChannel: 'in_app' });
  });

  it('without SIP_TRUNK_ID nothing is dialed; it is a text', async () => {
    delete process.env.SIP_TRUNK_ID;
    seedPromisedCall('p1');
    await runHandler();
    expect(dials).toHaveLength(0);
    expect(dispatches).toHaveLength(0);
    // The policy never chose a call: a text from the start, not a failed call's fallback.
    expect(logOf('promise:p1')).toMatchObject({ channel: 'sms', why: 'timely' });
    expect(logOf('promise:p1')?.fallbackFrom).toBeUndefined();
  });

  it('without calls turned on, a promised call is a text', async () => {
    docs.set(`bogle_users/${SETH}`, {
      ...docs.get(`bogle_users/${SETH}`),
      outreachPreferences: { channels: ['sms'] },
    });
    seedPromisedCall('p1');
    await runHandler();
    expect(dials).toHaveLength(0);
    expect(texts).toHaveLength(1);
  });
});
