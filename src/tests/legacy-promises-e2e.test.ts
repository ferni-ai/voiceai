/**
 * Promises from before outcomes were tracked (no `outcome` field), through the
 * real every-minute job, Trust read and promise context (Firestore is the only fake):
 * - long past due with nothing recorded → 'unknown': not kept, not missed, not
 *   counted by "I follow through", never owned as a miss;
 * - still due later → adopted 'open'; kept if Ferni follows through, else 'unknown';
 * - "remember"/"avoid" (never due) and ones already marked kept are left alone;
 * - the pass pages through, resumes from its checkpoint, and finishes once.
 *
 * Before: the sweep only looked at outcome == 'open', so these sat forever.
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
const { resetLegacyPass, settleLegacyPromises } =
  await import('../services/superhuman/semantic-intelligence/legacy-promises.js');
const { writeTrustDoc } = await import('../services/trust-systems/trust-doc.js');
const { TIMELINE_DOC } = await import('../services/trust-systems/dashboard-history.js');
const { getTogetherHealth } = await import('../services/trust-systems/together-store.js');

const UID = 'lee';
const TZ = 'America/New_York';
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-04T15:00:00Z');
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();
const path = (id: string) => `bogle_users/${UID}/ferni_commitments/${id}`;
const doc = (id: string) => fs.store.get(path(id));

/** A promise as the old code wrote it: no outcome field. */
function seedLegacy(id: string, fields: Record<string, unknown>): void {
  fs.store.set(path(id), {
    id,
    userId: UID,
    type: 'check_in',
    commitment: `I'll check in about ${id}`,
    context: `the ${id}`,
    madeAt: ago(60),
    fulfilled: false,
    ...fields,
  });
}

async function seedConversations(): Promise<void> {
  const snapshots = [1, 2, 3, 4].map((d) => ({
    id: `snap_${d}`,
    timestamp: new Date(NOW.getTime() - d * DAY),
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

async function followsThrough(at: Date): Promise<{ kept: number; total: number } | undefined> {
  const health = await getTogetherHealth(UID, TZ, at);
  return health.factors.find((f) => f.id === 'promises')?.detail as
    { kept: number; total: number } | undefined;
}

beforeEach(() => {
  fs.store.clear();
  clearCommitmentCache();
  resetOfferedMisses();
  resetLegacyPass();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

describe('legacy promises (no outcome) are settled honestly', () => {
  it('long past due with nothing recorded → unknown, not counted, never owned', async () => {
    await seedConversations();
    seedLegacy('interview', { dueBy: ago(50) }); // the honest unknown
    seedLegacy('recital', { dueBy: ago(40), fulfilled: true, fulfilledAt: ago(41) }); // recorded kept
    seedLegacy('diet', { type: 'remember', dueBy: undefined }); // never due
    seedLegacy('miss', { dueBy: ago(2), outcome: 'open' }); // a tracked one, for contrast

    const run = await deliverDueReminders({ now: NOW });
    expect(run.promises).toMatchObject({
      overdue: 1,
      missed: 1,
      legacy: { scanned: 4, unknown: 1, adopted: 0, done: true },
    });
    expect(doc('interview')).toMatchObject({
      outcome: 'unknown',
      unknownReason: 'made before promise outcomes were tracked',
      fulfilled: false,
    });
    expect(doc('interview')?.violated).toBeUndefined();
    expect(doc('recital')?.outcome).toBeUndefined();
    expect(doc('diet')?.outcome).toBeUndefined();

    // Trust counts the recorded keep and the real miss; the unknown is in neither.
    expect(await followsThrough(new Date(NOW.getTime() + DAY))).toEqual({ kept: 1, total: 2 });

    // Ferni owns the real miss once, and never the unknown.
    const context = await buildPromiseContext(UID);
    expect(context).toContain("PROMISES YOU DIDN'T KEEP");
    expect(context).toContain("I'll check in about miss");
    expect(context).not.toContain('interview');
  });

  it('still due later → adopted open; kept if Ferni follows through, else unknown, not missed', async () => {
    seedLegacy('surgery', { dueBy: new Date(NOW.getTime() + 3 * DAY) });
    seedLegacy('move', { dueBy: new Date(NOW.getTime() + 3 * DAY) }); // a Timestamp-like Date

    await deliverDueReminders({ now: NOW });
    expect(doc('surgery')).toMatchObject({
      outcome: 'open',
      legacy: true,
      dueBy: new Date(NOW.getTime() + 3 * DAY).toISOString(),
    });

    vi.setSystemTime(new Date(NOW.getTime() + DAY));
    await trackFerniCommitments(UID, 'How did the surgery go? Thinking of you.', {});
    expect(doc('surgery')).toMatchObject({ outcome: 'kept', fulfilled: true });

    const later = await deliverDueReminders({ now: new Date(NOW.getTime() + 4 * DAY) });
    expect(later.promises).toMatchObject({ overdue: 1, unknown: 1, missed: 0 });
    expect(doc('move')).toMatchObject({ outcome: 'unknown', fulfilled: false });
    expect(doc('move')?.violated).toBeUndefined();
  });

  it('pages through from its checkpoint, finishes once, and re-running changes nothing', async () => {
    for (const id of ['a', 'b', 'c']) seedLegacy(id, { dueBy: ago(30) });
    const db = fs.db as unknown as FirebaseFirestore.Firestore;

    expect(await settleLegacyPromises(db, NOW, 2)).toMatchObject({ scanned: 2, done: false });
    expect([doc('a')?.outcome, doc('b')?.outcome, doc('c')?.outcome]).toEqual([
      'unknown',
      'unknown',
      undefined,
    ]);
    resetLegacyPass(); // a new process: it resumes from the checkpoint, not the start
    expect(await settleLegacyPromises(db, NOW, 2)).toMatchObject({
      scanned: 1,
      unknown: 1,
      done: true,
    });
    const checkpoint = fs.store.get('migration_checkpoints/legacy_promise_outcomes');
    expect(checkpoint).toMatchObject({ doneAt: NOW.toISOString(), after: path('c') });

    // Finished: this process skips it, and a fresh one reads the checkpoint and stops.
    expect(await settleLegacyPromises(db, NOW, 2)).toBeNull();
    resetLegacyPass();
    seedLegacy('d', { dueBy: ago(30) });
    expect(await settleLegacyPromises(db, NOW, 2)).toBeNull();
    expect(doc('d')?.outcome).toBeUndefined();
  });
});
