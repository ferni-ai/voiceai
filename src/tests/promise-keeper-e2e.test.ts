/**
 * Ferni's promises, end to end, with the real services (Firestore and the SMS
 * sender are the only fakes):
 * - "I'll remind you" (the real setReminder tool) → the real every-minute
 *   delivery job sends it → the promise is kept → Trust's "I follow through"
 *   factor (the real getTogetherHealth the route serves) counts it;
 * - a promise whose due time passes without delivery is marked missed by that
 *   same job, stays missed, and Ferni is prompted to own it once;
 * - asking about it in conversation (the real reply hook) keeps a check-in promise.
 *
 * Before: nothing recorded reminder promises, nothing set an outcome except a
 * manual API route, and nothing ran the overdue check, so the factor never appeared.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sharedNestedFirestore as fs } from './helpers/nested-firestore.js';

vi.mock('firebase-admin/firestore', async () => {
  const { sharedNestedFirestore } = await import('./helpers/nested-firestore.js');
  return {
    getFirestore: () => sharedNestedFirestore.db,
    FieldValue: { serverTimestamp: () => 'server-timestamp' },
  };
});
vi.mock('../utils/firestore-utils.js', async (importOriginal) => {
  const { sharedNestedFirestore } = await import('./helpers/nested-firestore.js');
  return {
    ...(await importOriginal<typeof import('../utils/firestore-utils.js')>()),
    getFirestoreDb: () => sharedNestedFirestore.db,
  };
});
vi.mock('../services/superhuman/firestore-utils.js', async (importOriginal) => {
  const { sharedNestedFirestore } = await import('./helpers/nested-firestore.js');
  return {
    ...(await importOriginal<typeof import('../services/superhuman/firestore-utils.js')>()),
    getFirestoreDb: () => sharedNestedFirestore.db,
  };
});
// External senders: Twilio SMS, and the credential lookup that says it's configured.
const sendSms = vi.fn(async (_to: string, _text: string) => 'Reminder sent');
vi.mock('../services/communication-service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/communication-service.js')>()),
  sendReminder: (to: string, text: string) => sendSms(to, text),
}));
vi.mock('../services/outreach/unified-delivery.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/outreach/unified-delivery.js')>()),
  getChannelStatus: async () => ({
    sms: { available: true },
    voice_call: { available: true },
    email: { available: true },
    push: { available: false },
    in_app: { available: true },
  }),
}));
vi.mock('@livekit/agents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@livekit/agents')>();
  return { ...actual, llm: { ...actual.llm, tool: <T>(config: T) => config } };
});

const { reminderTools } = await import('../tools/domains/productivity/reminders.js');
const { deliverDueReminders } = await import('../services/scheduling/reminder-delivery-job.js');
const { trackFerniCommitments } =
  await import('../services/superhuman/semantic-intelligence/integration.js');
const { clearCommitmentCache } =
  await import('../services/superhuman/semantic-intelligence/ferni-commitments.js');
const { buildPromiseContext, resetOfferedMisses } =
  await import('../services/superhuman/semantic-intelligence/promise-keeper.js');
const { writeTrustDoc } = await import('../services/trust-systems/trust-doc.js');
const { TIMELINE_DOC } = await import('../services/trust-systems/dashboard-history.js');
const { getTogetherHealth } = await import('../services/trust-systems/together-store.js');

const UID = 'pat';
const TZ = 'America/New_York';
const DAY = 24 * 60 * 60 * 1000;
const START = new Date('2026-09-28T23:00:00Z'); // Monday 7pm in New York

const promises = () => fs.docsIn(`bogle_users/${UID}/ferni_commitments`);
const at = (ms: number) => new Date(START.getTime() + ms);

/** Four evenings of calls, so the together read has a score. */
async function seedConversations(): Promise<void> {
  const snapshots = [0, 1, 2, 3].map((d) => ({
    id: `snap_${d}`,
    timestamp: at(d * DAY),
    primaryEmotion: 'joy',
    secondaryEmotions: [],
    intensity: 0.6,
    valence: 0.5,
    arousal: 0.5,
    source: 'detected',
  }));
  await writeTrustDoc(UID, TIMELINE_DOC, {
    userId: UID,
    snapshots,
    dailySummaries: [],
    trends: [],
    peaks: [],
    currentMood: null,
  });
}

async function setReminder(when: string): Promise<string> {
  const def = reminderTools.find((t) => t.id === 'setReminder');
  const tool = def?.create({ userId: UID, agentId: 'ferni' } as never) as unknown as {
    execute: (p: Record<string, string>) => Promise<string>;
  };
  return tool.execute({
    message: 'call mom',
    when,
    deliveryMethod: 'sms',
    deliveryAddress: '+18015550123',
  });
}

/** The "I follow through" factor as the Trust tab reads it on `day` (past its 5-min cache). */
async function followsThrough(day = 5): Promise<{ kept: number; total: number } | undefined> {
  const health = await getTogetherHealth(UID, TZ, at(day * DAY));
  const factor = health.factors.find((f) => f.id === 'promises');
  return factor?.detail as { kept: number; total: number } | undefined;
}

beforeEach(() => {
  fs.store.clear();
  clearCommitmentCache();
  resetOfferedMisses();
  sendSms.mockClear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(START);
});

describe('Ferni keeps her promises', () => {
  it('a reminder she promised is sent, the promise is kept, and Trust shows it', async () => {
    await seedConversations();
    const said = await setReminder('in 30 minutes');
    expect(said).toMatch(/I'll text you/);

    const [promise] = promises();
    expect(promise).toMatchObject({ type: 'remind', outcome: 'open', fulfilled: false });
    expect(await followsThrough()).toBeUndefined(); // open isn't counted either way

    const run = await deliverDueReminders({ now: at(31 * 60 * 1000) });
    expect(run).toMatchObject({ delivered: 1, promiseErrors: 0 });
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(promises()[0]).toMatchObject({
      outcome: 'kept',
      fulfilled: true,
      fulfilledHow: 'reminder delivered (sms)',
    });
    expect(await followsThrough(6)).toEqual({ kept: 1, total: 1 });
  });

  it('a promise whose due time passes with no delivery is marked missed, and stays missed', async () => {
    await seedConversations();
    await trackFerniCommitments(
      UID,
      "Good luck at the interview tomorrow! I'll check in about that.",
      {}
    );
    expect(promises()[0]).toMatchObject({ type: 'check_in', outcome: 'open' });

    // Nothing asks about it. A week later the every-minute job finds it overdue.
    const run = await deliverDueReminders({ now: at(7 * DAY + 60_000) });
    expect(run.promises).toMatchObject({ overdue: 1, missed: 1 });
    expect(promises()[0]).toMatchObject({ outcome: 'missed', violated: true, fulfilled: false });

    // Asking about it now doesn't rewrite the miss, and a later run leaves it alone.
    vi.setSystemTime(at(8 * DAY));
    await trackFerniCommitments(UID, 'How did the interview go?', {});
    await deliverDueReminders({ now: at(8 * DAY) });
    expect(promises()[0]).toMatchObject({ outcome: 'missed', fulfilled: false });
    expect(await followsThrough()).toEqual({ kept: 0, total: 1 });
  });

  it('a reminder that could not be sent is a missed promise; a cancelled one is released', async () => {
    sendSms.mockResolvedValueOnce('trouble sending');
    await setReminder('in 30 minutes');
    await setReminder('in 2 hours');
    const [failing, cancelled] = promises().sort((a, b) =>
      String(a.dueBy).localeCompare(String(b.dueBy))
    );
    const cancelledPath = `bogle_users/${UID}/reminders/${String(cancelled.reminderId)}`;
    await fs.db
      .collection('bogle_users')
      .doc(UID)
      .collection('reminders')
      .doc(String(cancelled.reminderId))
      .update({ status: 'cancelled' });
    expect(fs.store.get(cancelledPath)?.status).toBe('cancelled');

    await deliverDueReminders({ now: at(31 * 60 * 1000) });
    await deliverDueReminders({ now: at(5 * 60 * 60 * 1000) });

    const byId = new Map(promises().map((p) => [p.id, p]));
    expect(byId.get(failing.id)).toMatchObject({
      outcome: 'missed',
      missedReason: 'reminder could not be delivered',
    });
    expect(byId.get(cancelled.id)).toMatchObject({ outcome: 'released', fulfilled: false });
    expect(byId.get(cancelled.id)?.violated).toBeUndefined();
  });

  it('asking about it in a later conversation keeps a check-in promise', async () => {
    await trackFerniCommitments(
      UID,
      "Good luck at the interview tomorrow! I'll check in about that.",
      {}
    );
    vi.setSystemTime(at(2 * DAY));
    await trackFerniCommitments(
      UID,
      'Hey, I was thinking about you. How did the interview go?',
      {}
    );

    expect(promises()[0]).toMatchObject({ outcome: 'kept', fulfilled: true });
    const run = await deliverDueReminders({ now: at(8 * DAY) });
    expect(run.promises).toMatchObject({ overdue: 0 });
  });

  it('Ferni is prompted to own a missed promise once, not every call', async () => {
    await trackFerniCommitments(
      UID,
      "Good luck at the interview tomorrow! I'll check in about that.",
      {}
    );
    await deliverDueReminders({ now: at(7 * DAY + 60_000) });
    vi.setSystemTime(at(8 * DAY));

    const firstCall = await buildPromiseContext(UID);
    expect(firstCall).toContain("PROMISES YOU DIDN'T KEEP");
    expect(firstCall).toContain("I'll check in about that");
    expect(promises()[0]).toMatchObject({
      outcome: 'missed',
      ownOfferedAt: at(8 * DAY).toISOString(),
    });

    resetOfferedMisses(); // a new call, a new process
    clearCommitmentCache();
    const nextCall = await buildPromiseContext(UID);
    expect(nextCall).not.toContain("PROMISES YOU DIDN'T KEEP");
  });
});
