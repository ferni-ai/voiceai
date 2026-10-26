/** The real reads behind GET /api/on-it, with only the stores faked. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  followUps: true,
  errandStore: true,
  topics: [] as string[] | null,
  openCalls: [] as string[],
}));
vi.mock('../../services/stores/follow-through-store.js', () => ({
  firestoreFollowUpStore: () =>
    fake.followUps ? { live: async () => [], changedBetween: async () => [] } : null,
}));
vi.mock('../../services/stores/errand-store.js', () => ({
  firestoreErrandStore: () =>
    fake.errandStore
      ? {
          open: async (userId: string) => {
            fake.openCalls.push(userId);
            return [];
          },
        }
      : null,
}));
vi.mock('../../memory/recall/forget.js', () => ({
  forgottenTopicsOrNull: async () => fake.topics,
}));

const { firestoreOnItDeps } = await import('../on-it-deps.js');

beforeEach(() => {
  Object.assign(fake, { followUps: true, errandStore: true, topics: [], openCalls: [] });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('firestoreOnItDeps', () => {
  it('ERRANDS off: no errands read at all (null, not an empty list)', async () => {
    vi.stubEnv('ERRANDS', 'off');

    expect(await (await firestoreOnItDeps()).openErrands('uid-A')).toBeNull();
    expect(fake.openCalls).toEqual([]);
  });

  it('ERRANDS on: reads the open errands of that person', async () => {
    vi.stubEnv('ERRANDS', 'on');

    expect(await (await firestoreOnItDeps()).openErrands('uid-A')).toEqual([]);
    expect(fake.openCalls).toEqual(['uid-A']);
  });

  it('ERRANDS on with no store is a failed read, not "no errands"', async () => {
    vi.stubEnv('ERRANDS', 'on');
    fake.errandStore = false;

    await expect((await firestoreOnItDeps()).openErrands('uid-A')).rejects.toThrow(
      'Errand store unavailable'
    );
  });

  it('forgotten topics that cannot be read throw (fail closed)', async () => {
    fake.topics = null;

    await expect((await firestoreOnItDeps()).forgottenMatcher('uid-A')).rejects.toThrow(
      'Forgotten topics unreadable'
    );
  });

  it('no follow-through store throws', async () => {
    fake.followUps = false;

    await expect(firestoreOnItDeps()).rejects.toThrow();
  });
});
