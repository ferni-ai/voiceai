/**
 * Invitations are not promises, through the real reply hook, every-minute job,
 * promise context and Trust read (Firestore is the only fake):
 * - "Let me know how it goes" is remembered while open (pending follow-ups in
 *   the prompt), and when it lapses it is settled 'unknown': never missed,
 *   never an apology, never in "I follow through" (even if Ferni asks about it);
 * - a real promise ("I'll check in about that") still lapses to missed.
 *
 * Before (#275): an invitation was a promise like any other, so a lapsed
 * "let me know how it goes" became a broken promise Ferni apologised for.
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

const UID = 'kai';
const TZ = 'America/New_York';
const DAY = 24 * 60 * 60 * 1000;
const START = new Date('2026-09-28T23:00:00Z');
const at = (ms: number) => new Date(START.getTime() + ms);
const byType = (type: string) =>
  fs.docsIn(`bogle_users/${UID}/ferni_commitments`).filter((p) => p.type === type);

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

/** The "I follow through" factor as the Trust tab reads it (past its 5-min cache). */
async function followsThrough(day: number): Promise<{ kept: number; total: number } | undefined> {
  const health = await getTogetherHealth(UID, TZ, at(day * DAY));
  return health.factors.find((f) => f.id === 'promises')?.detail as
    { kept: number; total: number } | undefined;
}

/** Ferni says something in a call on `day` (the real reply hook). */
async function ferniSays(day: number, reply: string): Promise<void> {
  vi.setSystemTime(at(day * DAY));
  clearCommitmentCache();
  await trackFerniCommitments(UID, reply, {});
}

beforeEach(async () => {
  fs.store.clear();
  clearCommitmentCache();
  resetOfferedMisses();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(START);
  await seedConversations();
});

describe('invitations are remembered, never broken', () => {
  it('a lapsed "let me know how it goes" is not a miss, an apology, or a broken promise', async () => {
    // One real promise, kept: the ratio to compare against.
    await ferniSays(0, "Big day tomorrow with the move. I'll check in about that.");
    await ferniSays(1, 'Hey you. How did the move go?');
    expect(byType('check_in')[0]).toMatchObject({ outcome: 'kept' });
    expect(await followsThrough(2)).toEqual({ kept: 1, total: 1 });

    // The invitation, remembered while open so Ferni can ask about it naturally.
    await ferniSays(1, 'Good luck at the interview! Let me know how it goes.');
    expect(byType('follow_up')[0]).toMatchObject({ outcome: 'open' });
    expect(await buildPromiseContext(UID)).toContain('Let me know how it goes');

    // A week passes and nobody brings it up.
    await deliverDueReminders({ now: at(9 * DAY) });
    const [lapsed] = byType('follow_up');
    expect(lapsed.outcome).not.toBe('missed');
    expect(lapsed).toMatchObject({ outcome: 'unknown', fulfilled: false });
    expect(lapsed.violated).toBeUndefined();

    vi.setSystemTime(at(10 * DAY));
    resetOfferedMisses();
    clearCommitmentCache();
    expect(await buildPromiseContext(UID)).not.toContain("PROMISES YOU DIDN'T KEEP");
    expect(await followsThrough(11)).toEqual({ kept: 1, total: 1 });
  });

  it('asking about an invitation is lovely, but it still is not a kept promise', async () => {
    await ferniSays(0, "Big day tomorrow with the move. I'll check in about that.");
    await ferniSays(1, 'How did the move go?');
    await ferniSays(1, "Your recital is Saturday? I can't wait to hear how it goes!");
    expect(byType('celebrate')[0]).toMatchObject({ outcome: 'open' });

    await ferniSays(3, 'So, how was the recital?');
    expect(byType('celebrate')[0]).toMatchObject({ fulfilled: true });
    expect(await followsThrough(4)).toEqual({ kept: 1, total: 1 });
  });

  it('a real promise still lapses to missed, with the one-time apology', async () => {
    await ferniSays(0, "Big day tomorrow with the move. I'll check in about that.");
    await deliverDueReminders({ now: at(7 * DAY + 60_000) });
    expect(byType('check_in')[0]).toMatchObject({ outcome: 'missed', violated: true });

    vi.setSystemTime(at(8 * DAY));
    expect(await buildPromiseContext(UID)).toContain("PROMISES YOU DIDN'T KEEP");
    expect(await followsThrough(9)).toEqual({ kept: 0, total: 1 });
  });
});
