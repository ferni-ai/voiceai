/**
 * The other reasons to reach out, end to end through the per-minute
 * scheduler handler: a reminder that didn't reach them, something they said
 * they'd do (COACH_FOLLOW_THROUGH), and what's due in their world. Firestore
 * is in memory; Firebase Auth, Twilio and the model are stubbed at the edge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pathFirestore } from './path-firestore.js';

const docs = new Map<string, Record<string, unknown>>();
const texts: string[] = [];

vi.mock('../../../superhuman/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => pathFirestore(docs),
}));
// The opt-out stores (opt-outs.ts) import the canonical module.
vi.mock('../../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => pathFirestore(docs),
}));
// commitment-follow-up.ts reads Firestore through the utils module.
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

const { handleDeliverScheduledActions, worldDue } =
  await import('../../../../api/scheduled-jobs/background-delivery-jobs.js');
const { runProactiveChannelsTick } = await import('../proactive-tick.js');
const { defaultProactiveDeps } = await import('../default-deps.js');
const { sendCommitmentPushes } = await import('../../../../api/scheduled-jobs/commitment-push.js');
const { forgetFlagCache } = await import('../../../platform/cohort-flags.js');

const SETH = 'seth-uid';
const HOUR = 3600_000;
const DAY = 24 * HOUR;
// 11:00 in New York.
const NOW = new Date('2026-10-12T15:00:00Z');

async function runHandler(): Promise<void> {
  const res = { writeHead: () => res, setHeader: () => undefined, end: () => undefined };
  await handleDeliverScheduledActions(
    { url: '/api/jobs/deliver-scheduled-actions' } as never,
    res as never
  );
}
const logOf = (id: string) => docs.get(`bogle_users/${SETH}/proactive_outreach_log/${id}`);

beforeEach(() => {
  // Phone-keyed opt-outs are read under this key; without it nothing is texted.
  process.env.LOG_HASH_SECRET = 'test-hash-secret';
  docs.clear();
  texts.length = 0;
  forgetFlagCache();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  process.env.PROACTIVE_CHANNELS = 'on';
  process.env.PROACTIVE_CHANNELS_USERS = SETH;
  docs.set(`bogle_users/${SETH}`, {
    contactInfo: { timezone: 'America/New_York' },
    lastContact: new Date(NOW.getTime() - 30 * HOUR).toISOString(),
    outreachPreferences: { channels: ['sms'] },
  });
});
afterEach(() => {
  delete process.env.LOG_HASH_SECRET;
  vi.useRealTimers();
  delete process.env.PROACTIVE_CHANNELS;
  delete process.env.PROACTIVE_CHANNELS_USERS;
  delete process.env.COACH_FOLLOW_THROUGH;
  delete process.env.COHORT_FLAGS;
});

function seedReminder(id: string, r: Record<string, unknown>) {
  docs.set(`bogle_users/${SETH}/reminders/${id}`, {
    message: 'call the pharmacy',
    status: 'missed',
    scheduledFor: new Date(NOW.getTime() - 3 * HOUR).toISOString(),
    ...r,
  });
}

describe('a reminder that did not reach them', () => {
  it('Ferni owns up the same day, once', async () => {
    seedReminder('r1', {});
    await runHandler();
    expect(texts).toEqual([
      "Hey, it's Ferni. I was meant to remind you earlier: call the pharmacy. Sorry that slipped. Did it happen?",
    ]);
    expect(logOf('reminder:r1')).toMatchObject({ kind: 'reminder', channel: 'sms' });
    await runHandler();
    expect(texts).toHaveLength(1);
  });

  it('one left in the app with nobody told counts as not reaching them', async () => {
    seedReminder('inbox', { status: 'in_app_unnotified' });
    await runHandler();
    expect(texts).toEqual([
      "Hey, it's Ferni. I was meant to remind you earlier: call the pharmacy. Sorry that slipped. Did it happen?",
    ]);
  });

  it('not after 12 hours, not for delivered ones, not for reminders to a contact', async () => {
    seedReminder('old', { scheduledFor: new Date(NOW.getTime() - 13 * HOUR).toISOString() });
    seedReminder('ok', { status: 'delivered' });
    seedReminder('mom', { isDirectToContact: true, status: 'failed' });
    await runHandler();
    expect(texts).toHaveLength(0);
  });

  it("Ferni's own promise goes first", async () => {
    seedReminder('r1', {});
    docs.set(`bogle_users/${SETH}/ferni_commitments/p1`, {
      type: 'check_in',
      relatedTopic: 'the move',
      madeAt: new Date(NOW.getTime() - 20 * HOUR).toISOString(),
      outcome: 'open',
    });
    await runHandler();
    expect(texts[0]).toContain('check in about the move');
  });
});

describe('what they said they would do (COACH_FOLLOW_THROUGH)', () => {
  function seedCommitment() {
    docs.set(`bogle_users/${SETH}/commitments/c1`, {
      status: 'active',
      statement: 'I will send the resume to Dana by Thursday',
      createdAt: NOW.getTime() - 4 * DAY,
      followUpAfter: NOW.getTime() - HOUR,
      followUpCount: 0,
    });
  }

  it('off: nothing', async () => {
    seedCommitment();
    await runHandler();
    expect(texts).toHaveLength(0);
  });

  it('on: asks how it went, and records the follow-up so it is not asked again soon', async () => {
    process.env.COACH_FOLLOW_THROUGH = 'on';
    seedCommitment();
    await runHandler();
    expect(texts).toEqual([
      "Hey, it's Ferni. Last time you said you'd send the resume to Dana by Thursday. How did it go?",
    ]);
    expect(docs.get(`bogle_users/${SETH}/commitments/c1`)).toMatchObject({
      followUpCount: 1,
      lastFollowUp: NOW.getTime(),
    });
    await runHandler();
    expect(texts).toHaveLength(1);
  });

  it("on for one person through their cohort flags, read per user (the server's env stays off)", async () => {
    seedCommitment();
    docs.set(`feature_flag_overrides/${SETH}`, { flags: { COACH_FOLLOW_THROUGH: 'on' } });
    await runHandler();
    expect(texts).toHaveLength(0); // COHORT_FLAGS off on this server: not read
    process.env.COHORT_FLAGS = 'on';
    await runHandler();
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain('How did it go?');
    expect(process.env.COACH_FOLLOW_THROUGH).toBeUndefined();
  });

  it('the between-call push leaves cohort-listed proactive users to the proactive run', async () => {
    delete process.env.PROACTIVE_CHANNELS_USERS;
    process.env.COHORT_FLAGS = 'on';
    docs.set('feature_flag_overrides/cohort-uid', { flags: { PROACTIVE_CHANNELS: 'on' } });
    const commitment = {
      id: 'c1',
      statement: 'x',
      createdAt: 0,
      followUpAfter: 0,
      followUpCount: 0,
    };
    const pushed: string[] = [];
    await sendCommitmentPushes({
      scan: async () => [
        { userId: 'cohort-uid', commitment },
        { userId: 'other', commitment },
      ],
      send: async (userId) => (pushed.push(userId), true),
      store: { active: async () => [], markFollowedUp: async () => undefined },
    });
    expect(pushed).toEqual(['other']);
  });

  it('the between-call push leaves allowlisted users to the proactive run', async () => {
    const commitment = {
      id: 'c1',
      statement: 'x',
      createdAt: 0,
      followUpAfter: 0,
      followUpCount: 0,
    };
    const pushed: string[] = [];
    const sent = await sendCommitmentPushes({
      scan: async () => [
        { userId: SETH, commitment },
        { userId: 'other', commitment },
      ],
      send: async (userId) => (pushed.push(userId), true),
      store: { active: async () => [], markFollowedUp: async () => undefined },
    });
    expect(pushed).toEqual(['other']);
    expect(sent).toBe(1);
  });
});

describe("what's due in their world", () => {
  it('a due item becomes a check-in', async () => {
    const deps = {
      ...defaultProactiveDeps(),
      worldDue: async () => [{ factId: 'f1', text: 'Mindy (sister): knee surgery, today.' }],
    };
    await runProactiveChannelsTick(deps);
    expect(texts).toEqual([
      "Hey, it's Ferni. Thinking of you today (Mindy (sister): knee surgery, today). How's it going?",
    ]);
    expect(logOf('world:f1:2026-10-12')).toMatchObject({ kind: 'world_due' });
  });

  it('without the temporal world model on this server, the loader finds nothing', async () => {
    await expect(worldDue(SETH, 'America/New_York')).resolves.toEqual([]);
  });
});
