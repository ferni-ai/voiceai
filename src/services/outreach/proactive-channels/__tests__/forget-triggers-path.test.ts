/**
 * FORGET_EVERY_READER and what Ferni reaches out about unprompted: a reason
 * about a topic the caller asked to forget never goes out, whichever source
 * found it. Their commitments were already filtered at the store
 * (commitment-forget.ts, #2031); Ferni's own promises, reminders, what is
 * due in their world and pondered notes were not. Topics that can't be read
 * send nothing that run. End to end through the per-minute scheduler
 * handler, as more-triggers-path.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pathFirestore } from './path-firestore.js';

const docs = new Map<string, Record<string, unknown>>();
const topicsRead = vi.hoisted(() => ({ fails: false }));
const pondered = vi.hoisted(() => ({
  notes: [] as Array<{ id: string; text: string; reason: string }>,
}));
// Pondered notes as grounded-checkin.ts plans them: the words, and the caller's quote as the reason.
vi.mock('../pondered-triggers.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ponderedTriggers: async () =>
    pondered.notes.map((n) => ({
      sourceId: `grounded:${n.id}`,
      kind: 'follow_up',
      weight: 'light',
      timely: false,
      text: n.text,
      finalText: true,
      reason: n.reason,
    })),
}));
// The forgotten-topics read itself, made to fail for the fail-closed case.
vi.mock('../../../../memory/recall/forget.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../../memory/recall/forget.js')>();
  return {
    ...real,
    forgottenTopicsOrNull: async (...a: Parameters<typeof real.forgottenTopicsOrNull>) =>
      topicsRead.fails ? null : real.forgottenTopicsOrNull(...a),
  };
});
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
// Proactive texts go through the guarded sender; Twilio is stubbed at its transport.
vi.mock('../../delivery/sms-delivery.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isSMSDeliveryAvailable: () => true,
  sendSMS: vi.fn(async ({ body }: { to: string; body: string }) => {
    texts.push(body);
    return { success: true, messageSid: 'SM1' };
  }),
}));
vi.mock('../../../llm/llm-utils.js', () => ({ callLLM: vi.fn(async () => null) }));

const { handleDeliverScheduledActions } =
  await import('../../../../api/scheduled-jobs/background-delivery-jobs.js');
const { forgetFlagCache } = await import('../../../platform/cohort-flags.js');
const { resetForgetTopicsSource } =
  await import('../../../../memory/recall/forget-topics-source.js');

const SETH = 'member-seth-forget';
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

/** What they asked Ferni to forget, where forget.ts records it; null: the read fails. */
function forgot(topics: string[] | null): void {
  topicsRead.fails = topics === null;
  if (topics) docs.set(`bogle_users/${SETH}/memory_state/forgotten`, { topics });
}

function seedCommitment(id: string, statement: string, ago = HOUR): void {
  docs.set(`bogle_users/${SETH}/commitments/${id}`, {
    status: 'active',
    statement,
    createdAt: NOW.getTime() - 4 * DAY,
    followUpAfter: NOW.getTime() - ago,
    followUpCount: 0,
  });
}

beforeEach(() => {
  process.env.LOG_HASH_SECRET = 'test-hash-secret';
  docs.clear();
  texts.length = 0;
  pondered.notes = [];
  forgetFlagCache();
  resetForgetTopicsSource();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  process.env.PROACTIVE_CHANNELS = 'on';
  process.env.PROACTIVE_CHANNELS_USERS = SETH;
  process.env.COACH_FOLLOW_THROUGH = 'on';
  docs.set(`bogle_users/${SETH}`, {
    contactInfo: { timezone: 'America/New_York' },
    lastContact: new Date(NOW.getTime() - 30 * HOUR).toISOString(),
    outreachPreferences: { channels: ['sms'] },
  });
});
afterEach(() => {
  delete process.env.LOG_HASH_SECRET;
  vi.useRealTimers();
  vi.unstubAllEnvs();
  delete process.env.PROACTIVE_CHANNELS;
  delete process.env.PROACTIVE_CHANNELS_USERS;
  delete process.env.COACH_FOLLOW_THROUGH;
});

function seedPromise(topic: string): void {
  docs.set(`bogle_users/${SETH}/ferni_commitments/p1`, {
    type: 'check_in',
    relatedTopic: topic,
    madeAt: new Date(NOW.getTime() - 20 * HOUR).toISOString(),
    outcome: 'open',
  });
}

function seedReminder(message: string): void {
  docs.set(`bogle_users/${SETH}/reminders/r1`, {
    message,
    status: 'missed',
    scheduledFor: new Date(NOW.getTime() - 3 * HOUR).toISOString(),
  });
}

const PHARMACY =
  "Hey, it's Ferni. I was meant to remind you earlier: call the pharmacy. Sorry that slipped. Did it happen?";

describe('proactive check-ins and a forgotten topic (FORGET_EVERY_READER)', () => {
  it("on: Ferni's own promise about it is never sent; the next reason goes instead", async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    forgot(['the move']);
    seedPromise('the move');
    seedReminder('call the pharmacy');
    await runHandler();
    expect(texts).toEqual([PHARMACY]);
  });

  it('on: a reminder about it is never sent', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    forgot(['divorce papers']);
    seedReminder('sign the divorce papers');
    await runHandler();
    expect(texts).toEqual([]);
  });

  it("on: a pondered note goes only when neither its words nor the caller's quote name it", async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    forgot(['divorce papers']);
    pondered.notes = [
      {
        id: 'quote',
        text: "Hey, it's Ferni. How did Friday go?",
        reason: 'you said "the divorce papers are due Friday" on 2026-10-09',
      },
      {
        id: 'words',
        text: "Hey, it's Ferni. Did the divorce papers go in?",
        reason: 'you said "Friday is the day" on 2026-10-09',
      },
      {
        id: 'clear',
        text: "Hey, it's Ferni. How was the hike?",
        reason: 'you said "hiking Saturday" on 2026-10-10',
      },
    ];
    await runHandler();
    const log = (id: string) =>
      docs.get(`bogle_users/${SETH}/proactive_outreach_log/grounded:${id}`);
    expect(log('quote')).toBeUndefined();
    expect(log('words')).toBeUndefined();
    expect(log('clear')).toBeDefined();
  });

  it('on: topics that cannot be read send nothing this run (fail closed)', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    forgot(null);
    seedReminder('call the pharmacy');
    await runHandler();
    expect(texts).toEqual([]);
  });

  it('a commitment about it stays out, flag or not (the store filters it, #2031)', async () => {
    forgot(['divorce papers']);
    seedCommitment('c1', 'I will file the divorce papers by Friday');
    await runHandler();
    expect(texts).toEqual([]);
  });

  it('off: the promise and the reminder go out as before', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'off');
    forgot(['the move']);
    seedPromise('the move');
    await runHandler();
    expect(texts.join('\n')).toContain('check in about the move');
  });
});
