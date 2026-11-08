/**
 * A failed profile read never overwrites the stored profile.
 *
 * Before: getProfile caught a Firestore read error, built a default profile
 * and saved it, so one timed-out read reset the user's ritual days, streak
 * record and stats to zero. Every later getProfile-then-save (sky check,
 * huddle, game memory flush, relationship sync) then wrote on top of that
 * default from the cache.
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

import { getEngagementStore, resetEngagementStore } from '../engagement-store.js';

const USER = 'user-1';
const PROFILE_PATH = `engagement_profiles/${USER}`;

const stored = {
  userId: USER,
  activeRituals: ['morning-pages'],
  totalRitualDays: 41,
  longestOverallStreak: 17,
  lastEngagementAt: '2026-10-18T08:00:00.000Z',
  preferences: { preferredTime: 'evening', reminderEnabled: true },
  stats: {
    totalSkyChecks: 30,
    totalPredictions: 6,
    predictionAccuracy: 72,
    teamHuddlesAttended: 4,
    memoryCallbacksTriggered: 9,
  },
  gameMemory: { totalGamesPlayed: 12 },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-10-18T08:00:00.000Z',
};

let firestore: FakeEngagementFirestore;

beforeEach(() => {
  firestore = createFakeEngagementFirestore();
  fake.db = firestore.db;
  resetEngagementStore();
});

describe('engagement profile reads', () => {
  it('a read that throws returns a default and writes nothing', async () => {
    firestore.docs.set(PROFILE_PATH, structuredClone(stored));
    firestore.failReads.match = new RegExp(`^${PROFILE_PATH}$`);
    const store = await getEngagementStore();

    const profile = await store.getProfile(USER);
    expect(profile.totalRitualDays).toBe(0);
    expect(firestore.docs.get(PROFILE_PATH)).toEqual(stored);

    // The callers' getProfile → mutate → saveProfile shapes, including a spread copy.
    profile.stats.totalSkyChecks++;
    await store.saveProfile(profile);
    await store.saveProfile({ ...profile, activeRituals: ['new-ritual'] });
    await store.recordTeamHuddle(USER, {
      id: 'h1',
      participatingPersonas: ['ferni'],
      topic: 'week',
      userHighlights: [],
      celebratedMilestones: [],
      occurredAt: '2026-10-19T00:00:00.000Z',
    });
    expect(firestore.docs.get(PROFILE_PATH)).toEqual(stored);
    // The huddle's own write reads the profile too (the erased-account guard), so with
    // that read failing it fails closed instead of writing under an unknown account
    expect(firestore.docs.has(`${PROFILE_PATH}/team_huddles/h1`)).toBe(false);

    // The default was not cached: once the read recovers, the real profile loads.
    firestore.failReads.match = null;
    expect((await store.getProfile(USER)).totalRitualDays).toBe(41);
  });

  it('a missing document still creates the default profile', async () => {
    firestore.docs.set(`bogle_users/${USER}`, { name: 'live user' }); // a live user has a record
    const store = await getEngagementStore();

    const profile = await store.getProfile(USER);
    expect(profile.totalRitualDays).toBe(0);
    expect(firestore.docs.get(PROFILE_PATH)).toMatchObject({ userId: USER, totalRitualDays: 0 });
  });

  it('a profile that loaded saves its changes and keeps the other fields', async () => {
    firestore.docs.set(PROFILE_PATH, structuredClone(stored));
    const store = await getEngagementStore();

    const profile = await store.getProfile(USER);
    expect(profile.totalRitualDays).toBe(41);
    profile.totalRitualDays = 42;
    await store.saveProfile(profile);

    expect(firestore.docs.get(PROFILE_PATH)).toMatchObject({
      totalRitualDays: 42,
      longestOverallStreak: 17,
      gameMemory: { totalGamesPlayed: 12 },
    });
  });
});
