/**
 * No engagement subcollection is written for an account being erased, or erased by this
 * process (#2966), and a brand-new caller's writes land (#3208 review).
 *
 * Before: only the profile write (engagement_profiles/{uid}) was guarded. Ritual
 * streaks, weather, predictions, team huddles and conversation sessions were set
 * straight onto engagement_profiles/{uid}/..., so a stale token, a live call or a
 * background ritual brought back documents under a deleted person's uid. Each case
 * runs the real store method on an in-memory Firestore. Only an explicit erasure blocks
 * a write: the record's `erasing` mark, or this process having erased the account. A uid
 * with no record is a new caller.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { erasingMark, noteErasedHere } from '../../../utils/erasing-mark.js';
import {
  createFakeEngagementFirestore,
  type FakeEngagementFirestore,
} from './fake-engagement-firestore.js';

const fake = vi.hoisted(() => ({ db: null as unknown }));
const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    constructor() {
      return fake.db as object;
    }
  },
}));
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => log,
  getLogger: () => log,
}));

import { getEngagementStore, resetEngagementStore } from '../engagement-store.js';

const NOW = '2026-10-31T09:00:00.000Z';
let uids = 0;
/** A fresh uid per test: an account noted as erased stays erased for the process */
const newUid = () => `Hb3Rt8Kq1Wm6Zx4Pn9Lc2Vy7D${(uids += 1).toString().padStart(3, '0')}`;

let firestore: FakeEngagementFirestore;

const streak = {
  ritualId: 'morning-sky',
  personaId: 'ferni',
  currentStreak: 3,
  longestStreak: 3,
  lastCompletedAt: NOW,
  totalCompletions: 3,
  streakHistory: [],
};
const prediction = { id: 'week-44', weekOf: NOW, predictions: { mood: 7 }, createdAt: NOW };

/** Every subcollection writer the store has that can create a document */
const writers: Array<[string, (uid: string) => Promise<unknown>]> = [
  ['saveRitualStreak', async (uid) => (await getEngagementStore()).saveRitualStreak(uid, streak)],
  [
    'recordWeather',
    async (uid) =>
      (await getEngagementStore()).recordWeather(uid, {
        date: NOW,
        weather: 'sunny' as never,
        ritualId: 'morning-sky',
      }),
  ],
  ['savePrediction', async (uid) => (await getEngagementStore()).savePrediction(uid, prediction)],
  [
    'recordTeamHuddle',
    async (uid) =>
      (await getEngagementStore()).recordTeamHuddle(uid, {
        id: 'huddle-1',
        participatingPersonas: ['ferni'],
        topic: 'the week',
        userHighlights: [],
        celebratedMilestones: [],
        occurredAt: NOW,
      }),
  ],
  [
    'addConversationSession',
    async (uid) => (await getEngagementStore()).addConversationSession(uid, { personaId: 'ferni' }),
  ],
];

const writtenFor = (uid: string) =>
  [...firestore.docs.keys()].filter((path) => path.startsWith(`engagement_profiles/${uid}/`));

beforeEach(() => {
  firestore = createFakeEngagementFirestore();
  fake.db = firestore.db;
  resetEngagementStore();
  vi.clearAllMocks();
});

describe('engagement subcollections and account erasure', () => {
  it.each(writers)(
    '%s writes nothing for an account this process erased, its record gone, and logs the drop',
    async (_name, write) => {
      const uid = newUid();
      noteErasedHere(uid); // what markErasing does here; the sweep then deletes the record

      await write(uid);

      expect(writtenFor(uid)).toEqual([]);
      expect(log.info).toHaveBeenCalledWith(
        expect.objectContaining({ userId: uid }),
        'Engagement write dropped: the account is erased'
      );
    }
  );

  it.each(writers)('%s writes nothing while an erasure is running', async (_name, write) => {
    const uid = newUid();
    firestore.docs.set(`bogle_users/${uid}`, { name: 'going', ...erasingMark() });

    await write(uid);

    expect(writtenFor(uid)).toEqual([]);
  });

  it.each(writers)('%s still writes for a live user', async (_name, write) => {
    const uid = newUid();
    firestore.docs.set(`bogle_users/${uid}`, { name: 'live' });

    await write(uid);

    expect(writtenFor(uid).length).toBeGreaterThan(0);
  });

  it.each(writers)('%s writes for a brand-new uid with no record yet', async (_name, write) => {
    const uid = newUid();
    expect(firestore.docs.has(`bogle_users/${uid}`)).toBe(false);

    await write(uid);

    expect(writtenFor(uid).length).toBeGreaterThan(0);
  });

  it("a brand-new web caller's session and its insights land (the history panel)", async () => {
    const uid = newUid(); // no record and no engagement profile: a first web call
    const store = await getEngagementStore();

    await store.addConversationSession(uid, { personaId: 'ferni', date: NOW });
    await store.addInsightToLatestSession(uid, 'likes walking by the water');

    const [session] = await store.getConversationSessions(uid, 1);
    expect(session).toMatchObject({ personaId: 'ferni', insights: ['likes walking by the water'] });
  });

  it('scoring a prediction is not written once an erasure has marked the record', async () => {
    const uid = newUid();
    firestore.docs.set(`bogle_users/${uid}`, { name: 'live' });
    const store = await getEngagementStore();
    await store.savePrediction(uid, prediction);
    const path = `engagement_profiles/${uid}/predictions/${prediction.id}`;

    // The prediction is read (synchronously, as the call starts), then the erasure marks
    // the record and sweeps the prediction before the score is written
    const scoring = store.updatePredictionActuals(uid, prediction.id, { mood: 6 });
    firestore.docs.set(`bogle_users/${uid}`, { name: 'live', ...erasingMark() });
    firestore.docs.delete(path);
    await scoring;

    expect(firestore.docs.has(path)).toBe(false);
  });
});
