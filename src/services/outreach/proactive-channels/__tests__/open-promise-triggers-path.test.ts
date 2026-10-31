/**
 * OPEN_PROMISE_TRIGGERS, end to end through the per-minute scheduler handler: a
 * promise Ferni didn't keep on the next call is still open, and with the flag on it
 * still sends its check-in; off, talking since stands it down (today's rule).
 * A promise asked about in a call is settled kept, so it never triggers. Flag or not,
 * nothing goes out within CRISIS_QUIET_DAYS of a crisis-level signal.
 * Firestore is in memory; Firebase Auth and the Twilio send are stubbed at the SDK edge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pathFirestore } from './path-firestore.js';

const docs = new Map<string, Record<string, unknown>>();
const texts: Array<{ to: string; body: string }> = [];

vi.mock('../../../superhuman/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => pathFirestore(docs),
}));
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
  getFirebaseUser: vi.fn(async () => ({ phoneNumber: PHONE })),
}));
vi.mock('../../delivery/sms-delivery.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isSMSDeliveryAvailable: () => true,
  sendSMS: vi.fn(async ({ to, body }: { to: string; body: string }) => {
    texts.push({ to, body });
    return { success: true, messageSid: 'SM1' };
  }),
}));
// No model: the promise line itself goes out, so the words are deterministic.
vi.mock('../../../llm-utils.js', () => ({ callLLM: vi.fn(async () => null) }));

const { handleDeliverScheduledActions } =
  await import('../../../../api/scheduled-jobs/background-delivery-jobs.js');
const { justTalked, JUST_TALKED_HOURS } = await import('../../outreach-cadence.js');
const { crisisFromSignal } = await import('../../../human-transfer/crisis-signals.js');

const UID = 'member-uid-1';
const PHONE = '+15555550123';
const HOUR = 3600_000;
// 11:00 in New York: outside quiet hours.
const NOW = new Date('2026-10-12T15:00:00Z');
const CHECK_IN = "Hey, it's Ferni. I said I'd check in about the move. How's it going?";

/** They last talked `hoursAgo` hours ago: the call after the promise. */
function seedUser(hoursAgo: number) {
  docs.set(`bogle_users/${UID}`, {
    contactInfo: { timezone: 'America/New_York' },
    lastContact: new Date(NOW.getTime() - hoursAgo * HOUR).toISOString(),
    outreachPreferences: { channels: ['sms'] },
  });
}
/** "I'll check in about the move", said `hoursAgo` hours ago (two days by default). */
function seedPromise(outcome = 'open', hoursAgo = 48) {
  docs.set(`bogle_users/${UID}/ferni_commitments/p1`, {
    type: 'check_in',
    commitment: "I'll check in about the move",
    relatedTopic: 'the move',
    madeAt: new Date(NOW.getTime() - hoursAgo * HOUR).toISOString(),
    outcome,
  });
}
const CRISIS_PATH = `bogle_users/${UID}/crisis_signals/c1`;
/** A crisis-level signal `hoursAgo` hours ago, as logCrisisSignal writes it. */
function seedCrisis(hoursAgo: number) {
  const signal = {
    timestamp: new Date(NOW.getTime() - hoursAgo * HOUR).toISOString(),
    signals: { suicidalIdeation: true, severity: 9 },
    sessionId: 'session-1',
  };
  expect(crisisFromSignal(UID, signal)?.escalationType).toBe('crisis_immediate');
  docs.set(CRISIS_PATH, signal);
}

async function runHandler(): Promise<void> {
  const res = { writeHead: () => res, setHeader: () => undefined, end: () => undefined };
  await handleDeliverScheduledActions(
    { url: '/api/jobs/deliver-scheduled-actions' } as never,
    res as never
  );
}

beforeEach(() => {
  process.env.LOG_HASH_SECRET = 'test-hash-secret';
  docs.clear();
  texts.length = 0;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  process.env.PROACTIVE_CHANNELS = 'on';
  process.env.PROACTIVE_CHANNELS_USERS = UID;
});
afterEach(() => {
  vi.useRealTimers();
  for (const k of [
    'LOG_HASH_SECRET',
    'PROACTIVE_CHANNELS',
    'PROACTIVE_CHANNELS_USERS',
    'OPEN_PROMISE_TRIGGERS',
  ]) {
    delete process.env[k];
  }
});

describe('a promise still open after the next call (OPEN_PROMISE_TRIGGERS)', () => {
  it('off: talking since stands it down; on: it still sends its check-in', async () => {
    seedUser(20); // a call a day after the promise, where Ferni never asked
    seedPromise();

    await runHandler();
    expect(texts).toEqual([]);

    process.env.OPEN_PROMISE_TRIGGERS = 'on';
    await runHandler();
    expect(texts).toEqual([{ to: PHONE, body: CHECK_IN }]);
    expect(docs.get(`bogle_users/${UID}/proactive_outreach_log/promise:p1`)).toMatchObject({
      channel: 'sms',
      outcome: 'sent',
    });
  });

  it('on: a promise Ferni kept on that call is settled, so nothing is sent', async () => {
    process.env.OPEN_PROMISE_TRIGGERS = 'on';
    seedUser(20);
    seedPromise('kept');

    await runHandler();
    expect(texts).toEqual([]);
  });

  it(`on: waits ${JUST_TALKED_HOURS} h after a call, then sends`, async () => {
    process.env.OPEN_PROMISE_TRIGGERS = 'on';
    seedUser(2);
    seedPromise();

    await runHandler();
    expect(texts).toEqual([]);

    seedUser(JUST_TALKED_HOURS + 1);
    await runHandler();
    expect(texts).toEqual([{ to: PHONE, body: CHECK_IN }]);
  });

  it('on: someone who never called back still gets it, as before', async () => {
    process.env.OPEN_PROMISE_TRIGGERS = 'on';
    seedUser(60); // last talked before the promise was made
    seedPromise();

    await runHandler();
    expect(texts).toEqual([{ to: PHONE, body: CHECK_IN }]);
  });
});

describe('the crisis quiet window holds promise check-ins', () => {
  it('on: a crisis on the call 13 h ago sends nothing; without it, the check-in goes', async () => {
    process.env.OPEN_PROMISE_TRIGGERS = 'on';
    seedUser(13);
    seedPromise();
    seedCrisis(13);

    await runHandler();
    expect(texts).toEqual([]);

    docs.delete(CRISIS_PATH);
    await runHandler();
    expect(texts).toEqual([{ to: PHONE, body: CHECK_IN }]);
  });

  it('off: a crisis on the call where the promise was made sends nothing the next day', async () => {
    seedUser(19.5); // that call ended half an hour after the promise
    seedPromise('open', 20);
    seedCrisis(20);

    await runHandler();
    expect(texts).toEqual([]);

    docs.delete(CRISIS_PATH);
    await runHandler();
    expect(texts).toEqual([{ to: PHONE, body: CHECK_IN }]);
  });
});

describe('justTalked', () => {
  const at = NOW.getTime();
  it('is true inside the window and false at its edge or with no call on record', () => {
    expect(justTalked(at - (JUST_TALKED_HOURS * HOUR - 1), at)).toBe(true);
    expect(justTalked(at - JUST_TALKED_HOURS * HOUR, at)).toBe(false);
    expect(justTalked(undefined, at)).toBe(false);
  });
});
