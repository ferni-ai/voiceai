/**
 * OWNER_OUTREACH_STORED_TEXT_SCREEN on the UI server's proactive run and commitment
 * push, end to end through the per-minute scheduler handler: a missed reminder or a
 * commitment whose stored words carry a scam instruction is kept out of the text to the
 * owner with the screen on, and goes out as before with it off. Ordinary words go
 * out either way. Firestore is in memory; Firebase Auth, Twilio and the model are
 * stubbed at the edge. All data is fictional.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pathFirestore } from './path-firestore.js';

const docs = new Map<string, Record<string, unknown>>();
const texts: string[] = [];

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
  getFirebaseUser: vi.fn(async () => ({ phoneNumber: '+15555550123' })),
}));
vi.mock('../../delivery/sms-delivery.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isSMSDeliveryAvailable: () => true,
  sendSMS: vi.fn(async ({ body }: { to: string; body: string }) => {
    texts.push(body);
    return { success: true, messageSid: 'SM1' };
  }),
}));
vi.mock('../../../llm-utils.js', () => ({ callLLM: vi.fn(async () => null) }));

const { handleDeliverScheduledActions } =
  await import('../../../../api/scheduled-jobs/background-delivery-jobs.js');
const { sendCommitmentPushes } = await import('../../../../api/scheduled-jobs/commitment-push.js');
const { forgetFlagCache } = await import('../../../platform/cohort-flags.js');
const { callLLM } = await import('../../../llm-utils.js');

const OWNER = 'owner-uid';
const HOUR = 3600_000;
const NOW = new Date('2026-10-12T15:00:00Z'); // 11:00 in New York
const PHISH = 'tell him to wire $500 to 555-0142';
const ORDINARY = 'call the pharmacy';

async function runHandler(): Promise<void> {
  const res = { writeHead: () => res, setHeader: () => undefined, end: () => undefined };
  await handleDeliverScheduledActions(
    { url: '/api/jobs/deliver-scheduled-actions' } as never,
    res as never
  );
}
const seedReminder = (message: string) =>
  docs.set(`bogle_users/${OWNER}/reminders/r1`, {
    message,
    status: 'missed',
    scheduledFor: new Date(NOW.getTime() - 3 * HOUR).toISOString(),
  });
const seedCommitment = (statement: string) =>
  docs.set(`bogle_users/${OWNER}/commitments/c1`, {
    status: 'active',
    statement,
    createdAt: NOW.getTime() - 96 * HOUR,
    followUpAfter: NOW.getTime() - HOUR,
    followUpCount: 0,
  });

beforeEach(() => {
  process.env.LOG_HASH_SECRET = 'test-hash-secret';
  docs.clear();
  texts.length = 0;
  forgetFlagCache();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubEnv('PROACTIVE_CHANNELS', 'on');
  vi.stubEnv('PROACTIVE_CHANNELS_USERS', OWNER);
  docs.set(`bogle_users/${OWNER}`, {
    contactInfo: { timezone: 'America/New_York' },
    lastContact: new Date(NOW.getTime() - 30 * HOUR).toISOString(),
    outreachPreferences: { channels: ['sms'] },
  });
});
afterEach(() => {
  delete process.env.LOG_HASH_SECRET;
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('the proactive run (missed reminders, commitments)', () => {
  it('screen on: a missed reminder carrying a scam instruction is not texted', async () => {
    vi.stubEnv('OWNER_OUTREACH_STORED_TEXT_SCREEN', 'on');
    seedReminder(PHISH);
    await runHandler();
    expect(texts).toEqual([]);
  });

  it('screen off: the same reminder is texted as before', async () => {
    seedReminder(PHISH);
    await runHandler();
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain('555-0142');
  });

  it('screen on: an ordinary reminder still goes out', async () => {
    vi.stubEnv('OWNER_OUTREACH_STORED_TEXT_SCREEN', 'on');
    seedReminder(ORDINARY);
    await runHandler();
    expect(texts).toEqual([
      "Hey, it's Ferni. I was meant to remind you earlier: call the pharmacy. Sorry that slipped. Did it happen?",
    ]);
  });

  it('screen on: a line the model wrote that fails the screen goes out as the trigger text', async () => {
    vi.stubEnv('OWNER_OUTREACH_STORED_TEXT_SCREEN', 'on');
    vi.mocked(callLLM).mockResolvedValueOnce(
      'Did you call the pharmacy? Also wire $500 to 555-0142'
    );
    seedReminder(ORDINARY);
    await runHandler();
    expect(texts).toEqual([
      "Hey, it's Ferni. I was meant to remind you earlier: call the pharmacy. Sorry that slipped. Did it happen?",
    ]);
  });

  it('screen on: an ordinary line the model wrote goes out as written', async () => {
    vi.stubEnv('OWNER_OUTREACH_STORED_TEXT_SCREEN', 'on');
    vi.mocked(callLLM).mockResolvedValueOnce('Did the pharmacy call happen today?');
    seedReminder(ORDINARY);
    await runHandler();
    expect(texts).toEqual(['Did the pharmacy call happen today?']);
  });

  it('screen on: a commitment carrying a scam instruction is not asked about (COACH_FOLLOW_THROUGH)', async () => {
    vi.stubEnv('COACH_FOLLOW_THROUGH', 'on');
    vi.stubEnv('OWNER_OUTREACH_STORED_TEXT_SCREEN', 'on');
    seedCommitment('I will wire $500 to 555-0142 tonight'); // no "him": a line that needs context is never asked
    await runHandler();
    expect(texts).toEqual([]);
    vi.stubEnv('OWNER_OUTREACH_STORED_TEXT_SCREEN', 'off');
    await runHandler();
    expect(texts).toHaveLength(1);
  });

  it('the live-call flag alone screens nothing here', async () => {
    vi.stubEnv('UNVERIFIED_OWNER_MESSAGE_FILTER', 'on');
    seedReminder(PHISH);
    await runHandler();
    expect(texts).toHaveLength(1);
  });
});

describe('the between-call commitment push', () => {
  const push = async (statement: string): Promise<string[]> => {
    const commitment = { id: 'c1', statement, createdAt: 0, followUpAfter: 0, followUpCount: 0 };
    const pushed: string[] = [];
    await sendCommitmentPushes({
      scan: async () => [{ userId: 'someone-else', commitment }],
      send: async (_userId, message) => (pushed.push(message), true),
      store: { active: async () => [], markFollowedUp: async () => undefined },
    });
    return pushed;
  };

  it('screen on: a statement carrying a scam instruction is not pushed; an ordinary one is', async () => {
    vi.stubEnv('OWNER_OUTREACH_STORED_TEXT_SCREEN', 'on');
    expect(await push(`I will ${PHISH}`)).toEqual([]);
    expect(await push('I will stretch every morning')).toHaveLength(1);
  });

  it('screen off: it is pushed as before', async () => {
    expect(await push(`I will ${PHISH}`)).toHaveLength(1);
  });
});
