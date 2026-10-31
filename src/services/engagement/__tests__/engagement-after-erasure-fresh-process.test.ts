/**
 * The #3208 verifier's probe: a second process, after an account erasure finished.
 *
 * The process has fresh modules, so it holds nothing about the erasure. It finds what an
 * erasure leaves: no user record (bogle_users/{uid}) and no engagement profile. The
 * background writers that reach a uid here (daily-rituals.ts, daily-checkin-handler,
 * weekly-summary-tools, routes/rituals) all go through the engagement store's getProfile,
 * saveProfile and its subcollection writers. None of them may bring back
 * engagement_profiles/{uid}, a conversation session, or anything else under it. That is
 * #2964's rule: with no tombstone, "both gone" is the only sign of an erasure.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeEngagementFirestore,
  type FakeEngagementFirestore,
} from './fake-engagement-firestore.js';

const fake = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    constructor() {
      return fake.db as object;
    }
  },
}));

const UID = 'Rk8Tw2Lm6Zq4Xn1Pv9Hc3Bd7Fs5J';
const NOW = '2026-10-31T09:00:00.000Z';
let firestore: FakeEngagementFirestore;

/** The engagement store as a fresh process loads it */
async function freshStore() {
  vi.resetModules();
  const { getEngagementStore } = await import('../engagement-store.js');
  return getEngagementStore();
}

const leftUnder = () =>
  [...firestore.docs.keys()].filter(
    (path) =>
      path === `engagement_profiles/${UID}` || path.startsWith(`engagement_profiles/${UID}/`)
  );

beforeEach(() => {
  firestore = createFakeEngagementFirestore(); // what the erasure left: nothing for UID
  fake.db = firestore.db;
});

describe('a fresh process after an account erasure', () => {
  it('getProfile and saveProfile do not recreate the engagement profile', async () => {
    const store = await freshStore();

    const profile = await store.getProfile(UID);
    await store.saveProfile({ ...profile, totalRitualDays: 4 });

    expect(leftUnder()).toEqual([]);
  });

  it('addConversationSession does not recreate a conversation session', async () => {
    const store = await freshStore();

    await store.addConversationSession(UID, { personaId: 'ferni', insights: ['a walk'] });

    expect(leftUnder()).toEqual([]);
  });

  it('no subcollection writer recreates anything under the profile', async () => {
    const store = await freshStore();

    await store.saveRitualStreak(UID, {
      ritualId: 'morning-sky',
      personaId: 'ferni',
      currentStreak: 2,
      longestStreak: 2,
      lastCompletedAt: NOW,
      totalCompletions: 2,
      streakHistory: [],
    });
    await store.recordWeather(UID, {
      date: NOW,
      weather: 'sunny' as never,
      ritualId: 'morning-sky',
    });
    await store.savePrediction(UID, {
      id: 'week-44',
      weekOf: NOW,
      predictions: { mood: 7 },
      createdAt: NOW,
    });
    await store.recordTeamHuddle(UID, {
      id: 'huddle-1',
      participatingPersonas: ['ferni'],
      topic: 'the week',
      userHighlights: [],
      celebratedMilestones: [],
      occurredAt: NOW,
    });

    expect(leftUnder()).toEqual([]);
  });
});
