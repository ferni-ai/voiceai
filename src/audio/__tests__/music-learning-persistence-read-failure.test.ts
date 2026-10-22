/**
 * A failed music learning read never overwrites the stored profile or memories.
 *
 * Before: the persistence store's non-strict load logged a read error and
 * answered null, the same as "nothing stored", so the user was marked loaded
 * with an empty profile. The next save (after a transition, or the flush at
 * session end) wrote that empty state over the user's Thompson Sampling arms
 * and music memories.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeEngagementFirestore,
  type FakeEngagementFirestore,
} from '../../services/engagement/__tests__/fake-engagement-firestore.js';

const fake = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    constructor() {
      return fake.db as object;
    }
  },
}));

import {
  clearUserCache,
  ensureMusicLearningLoaded,
  flushMusicLearning,
  isMusicLearningLoaded,
} from '../music-learning-persistence.js';
import { clearAllProfiles, exportUserProfile, getUserProfile } from '../music-user-learning.js';
import {
  clearAllMusicMemories,
  importUserMusicMemories,
  type MusicHelpedMemory,
} from '../music-memory-integration.js';

const USER = 'user-1';
const PROFILE_PATH = `bogle_users/${USER}/music_learning/profile`;
const MEMORIES_PATH = `bogle_users/${USER}/music_learning/memories`;

const storedProfile = {
  userId: USER,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-10-18T08:00:00.000Z',
  totalTransitions: 41,
  transitionArms: { silence: { alpha: 9, beta: 2, pulls: 11 } },
  contextPreferences: {},
  musicMemory: [],
};

const storedMemories = {
  userId: USER,
  updatedAt: '2026-10-18T08:00:00.000Z',
  memories: [
    {
      id: 'm1',
      createdAt: '2026-10-01T00:00:00.000Z',
      emotionalContext: { emotion: 'sad' },
      music: { genre: 'piano' },
      evidence: { userSaid: 'that helped' },
      effectiveTransition: 'gentle',
      confidence: 0.9,
      tags: ['calm'],
    },
  ],
  preferences: [],
};

const newMemory = {
  id: 'm-new',
  userId: USER,
  createdAt: Date.now(),
  emotionalContext: { emotion: 'happy' },
  music: { genre: 'pop' },
  evidence: {},
  effectiveTransition: 'upbeat',
  confidence: 0.5,
  tags: [],
} as unknown as MusicHelpedMemory;

const firestore: FakeEngagementFirestore = createFakeEngagementFirestore();
fake.db = firestore.db;

beforeEach(() => {
  firestore.docs.clear();
  firestore.failReads.match = null;
  clearUserCache(USER);
  clearAllProfiles();
  clearAllMusicMemories();
});

describe('music learning reads', () => {
  it('a read that throws leaves the stored profile and memories unwritten', async () => {
    firestore.docs.set(PROFILE_PATH, structuredClone(storedProfile));
    firestore.docs.set(MEMORIES_PATH, structuredClone(storedMemories));
    firestore.failReads.match = new RegExp(`^bogle_users/${USER}/music_learning/`);

    await ensureMusicLearningLoaded(USER);
    expect(isMusicLearningLoaded(USER)).toBe(false);

    // The session learns on top of an empty profile, then flushes at session end.
    getUserProfile(USER).totalTransitions++;
    importUserMusicMemories(USER, { memories: [newMemory], preferences: [] });
    await flushMusicLearning(USER);

    expect(firestore.docs.get(PROFILE_PATH)).toEqual(storedProfile);
    expect(firestore.docs.get(MEMORIES_PATH)).toEqual(storedMemories);
  });

  it('a missing document still saves the new profile', async () => {
    await ensureMusicLearningLoaded(USER);
    expect(isMusicLearningLoaded(USER)).toBe(true);

    getUserProfile(USER).totalTransitions = 1;
    importUserMusicMemories(USER, { memories: [newMemory], preferences: [] });
    await flushMusicLearning(USER);

    expect(firestore.docs.get(PROFILE_PATH)).toMatchObject({ userId: USER, totalTransitions: 1 });
    expect(firestore.docs.get(MEMORIES_PATH)).toMatchObject({ memories: [{ id: 'm-new' }] });
  });

  it('a profile that loaded saves its changes', async () => {
    firestore.docs.set(PROFILE_PATH, structuredClone(storedProfile));

    await ensureMusicLearningLoaded(USER);
    expect(exportUserProfile(USER)?.totalTransitions).toBe(41);
    getUserProfile(USER).totalTransitions = 42;
    await flushMusicLearning(USER);

    expect(firestore.docs.get(PROFILE_PATH)).toMatchObject({
      totalTransitions: 42,
      transitionArms: storedProfile.transitionArms,
    });
  });

  it('a later read that succeeds allows saving again', async () => {
    firestore.docs.set(PROFILE_PATH, structuredClone(storedProfile));
    firestore.failReads.match = new RegExp(`^${PROFILE_PATH}$`);
    await ensureMusicLearningLoaded(USER);
    getUserProfile(USER).totalTransitions++;
    await flushMusicLearning(USER);
    expect(firestore.docs.get(PROFILE_PATH)).toEqual(storedProfile);

    firestore.failReads.match = null;
    await ensureMusicLearningLoaded(USER);
    expect(isMusicLearningLoaded(USER)).toBe(true);
    expect(exportUserProfile(USER)?.totalTransitions).toBe(41);
    getUserProfile(USER).totalTransitions = 43;
    await flushMusicLearning(USER);

    expect(firestore.docs.get(PROFILE_PATH)).toMatchObject({ totalTransitions: 43 });
  });
});
