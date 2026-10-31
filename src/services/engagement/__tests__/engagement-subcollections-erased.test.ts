/**
 * No engagement subcollection is recreated for an erased person (#2966).
 *
 * Before: only the profile write (engagement_profiles/{uid}) was guarded. Ritual
 * streaks, weather, predictions, team huddles and conversation sessions were set
 * straight onto engagement_profiles/{uid}/..., so a stale token, a live call or a
 * background ritual brought back documents under a deleted person's uid. Each case
 * runs the real store method on an in-memory Firestore.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { erasingMark } from '../../../utils/erasing-mark.js';
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

const USER = 'Hb3Rt8Kq1Wm6Zx4Pn9Lc2Vy7Ds5F';
const UNDER = `engagement_profiles/${USER}/`;
const RECORD = `bogle_users/${USER}`;
const NOW = '2026-10-31T09:00:00.000Z';

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
const writers: Array<[string, () => Promise<unknown>]> = [
  ['saveRitualStreak', async () => (await getEngagementStore()).saveRitualStreak(USER, streak)],
  [
    'recordWeather',
    async () =>
      (await getEngagementStore()).recordWeather(USER, {
        date: NOW,
        weather: 'sunny' as never,
        ritualId: 'morning-sky',
      }),
  ],
  ['savePrediction', async () => (await getEngagementStore()).savePrediction(USER, prediction)],
  [
    'recordTeamHuddle',
    async () =>
      (await getEngagementStore()).recordTeamHuddle(USER, {
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
    async () => (await getEngagementStore()).addConversationSession(USER, { personaId: 'ferni' }),
  ],
];

const written = () => [...firestore.docs.keys()].filter((path) => path.startsWith(UNDER));

beforeEach(() => {
  firestore = createFakeEngagementFirestore();
  fake.db = firestore.db;
  resetEngagementStore();
  vi.clearAllMocks();
});

describe('engagement subcollections after account erasure', () => {
  it.each(writers)(
    '%s writes nothing for an erased uid and logs the drop',
    async (_name, write) => {
      expect(firestore.docs.has(RECORD)).toBe(false); // erasure leaves no record and no profile

      await write();

      expect(written()).toEqual([]);
      expect(log.info).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER }),
        'Engagement write dropped: the account is erased'
      );
    }
  );

  it.each(writers)('%s writes nothing while an erasure is running', async (_name, write) => {
    firestore.docs.set(RECORD, { name: 'going', ...erasingMark() });

    await write();

    expect(written()).toEqual([]);
  });

  it.each(writers)('%s still writes for a live user', async (_name, write) => {
    firestore.docs.set(RECORD, { name: 'live' });

    await write();

    expect(written().length).toBeGreaterThan(0);
  });

  it('scoring a prediction does not bring it back once the account is erased', async () => {
    firestore.docs.set(RECORD, { name: 'live' });
    const store = await getEngagementStore();
    await store.savePrediction(USER, prediction);
    const path = `${UNDER}predictions/${prediction.id}`;
    expect(firestore.docs.has(path)).toBe(true);

    // Erasure has removed the record and the profile; the prediction is read (it is
    // read synchronously as the call starts), then erased before the score is written
    firestore.docs.delete(RECORD);
    firestore.docs.delete(`engagement_profiles/${USER}`);
    const scoring = store.updatePredictionActuals(USER, prediction.id, { mood: 6 });
    firestore.docs.delete(path);
    await scoring;

    expect(written()).toEqual([]);
  });
});
