/**
 * Unlock streaks count the days calls were actually saved, not the profile's
 * conversationSummaries field, which nothing on the live path writes.
 *
 * Dev 2026-10-11: the owner had 647 conversations over 281 days and 318 saved
 * summaries with a 12-day longest streak, and was computed "getting-started"
 * (Ferni and Maya only) because the streak read an empty array.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { calculateStreaks, getTeamUnlockState } from '../../../services/social/team-unlocks.js';
import type { UserProfile } from '../../../types/user-profile.js';
import { fakeRunTransaction } from '../../../tests/helpers/fake-transaction.js';
import {
  dayOf,
  distinctDays,
  readConversationDays,
  streakFromSummariesEnabled,
} from '../conversation-days.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number): string => new Date(Date.now() - n * DAY_MS).toISOString().slice(0, 10);
/** `count` consecutive days ending `endAgo` days ago, oldest first. */
const run = (count: number, endAgo: number): string[] =>
  Array.from({ length: count }, (_, i) => daysAgo(endAgo + count - 1 - i));

/** The owner's profile as stored: many conversations, no conversationSummaries. */
const ownerProfile = (conversationDays?: string[]): UserProfile =>
  ({
    id: 'owner',
    totalConversations: 647,
    firstContact: new Date(Date.now() - 281 * DAY_MS),
    conversationSummaries: [],
    ...(conversationDays ? { conversationDays } : {}),
  }) as unknown as UserProfile;

describe('dayOf', () => {
  it('reads every shape a summary timestamp is stored in', () => {
    const iso = '2026-10-11T13:14:17.021Z';
    expect(dayOf(iso)).toBe('2026-10-11');
    expect(dayOf(new Date(iso))).toBe('2026-10-11');
    expect(dayOf({ toDate: () => new Date(iso) })).toBe('2026-10-11');
    expect(dayOf({ _seconds: Date.parse(iso) / 1000, _nanoseconds: 0 })).toBe('2026-10-11');
    expect(dayOf({ seconds: Date.parse(iso) / 1000 })).toBe('2026-10-11');
  });

  it('is null for anything unreadable instead of throwing', () => {
    expect(dayOf('not a date')).toBeNull();
    expect(dayOf(undefined)).toBeNull();
    expect(dayOf({})).toBeNull();
  });
});

describe('distinctDays', () => {
  it('collapses several calls on one day and sorts oldest first', () => {
    expect(
      distinctDays(['2026-10-11T20:00:00Z', '2026-10-09T01:00:00Z', '2026-10-11T07:00:00Z', null])
    ).toEqual(['2026-10-09', '2026-10-11']);
  });
});

describe('calculateStreaks from the days calls were saved', () => {
  it('without the days, an owner with 647 conversations has no streak (the bug)', () => {
    expect(calculateStreaks(ownerProfile())).toEqual({ currentStreak: 0, longestStreak: 0 });
  });

  it('counts the longest and current runs in conversationDays', () => {
    const days = [...run(12, 30), ...run(2, 0)];
    expect(calculateStreaks(ownerProfile(days))).toEqual({ currentStreak: 2, longestStreak: 12 });
  });
});

describe('the owner unlock stage', () => {
  it('was "getting-started" (Ferni and Maya) with no days on the profile', () => {
    const state = getTeamUnlockState(ownerProfile(), 'free');
    expect(state.stage).toBe('getting-started');
    expect(state.unlockedMembers).toEqual(['ferni', 'maya-santos']);
  });

  it('is "established" with a 12-day streak: Peter, Alex and Jordan open, Nayan still earned', () => {
    const state = getTeamUnlockState(ownerProfile([...run(12, 30), ...run(2, 0)]), 'free');
    expect(state.stage).toBe('established');
    expect(state.unlockedMembers).toEqual(
      expect.arrayContaining(['ferni', 'maya-santos', 'peter-john', 'alex-chen', 'jordan-taylor'])
    );
    // Nayan needs deep partnership (a 14-day streak) or the Partner tier: not removed here
    expect(state.unlockedMembers).not.toContain('nayan-patel');
  });

  it('reaches deep partnership, Nayan included, at a 14-day streak', () => {
    const state = getTeamUnlockState(ownerProfile(run(14, 1)), 'free');
    expect(state.stage).toBe('deep-partnership');
    expect(state.unlockedMembers).toContain('nayan-patel');
  });
});

describe('readConversationDays', () => {
  it('reads only the timestamps of the most recent summaries', async () => {
    const calls: string[] = [];
    const docs = ['2026-10-11T13:14:17Z', '2026-10-11T07:57:25Z', '2026-10-10T22:59:40Z'].map(
      (timestamp) => ({ get: (field: string) => (field === 'timestamp' ? timestamp : undefined) })
    );
    const query = {
      orderBy: (field: string, dir: string) => (calls.push(`orderBy:${field}:${dir}`), query),
      select: (...fields: string[]) => (calls.push(`select:${fields.join(',')}`), query),
      limit: (n: number) => (calls.push(`limit:${n}`), query),
      get: async () => ({ docs }),
    };
    const db = {
      collection: (name: string) => (
        calls.push(`collection:${name}`),
        {
          doc: (id: string) => (
            calls.push(`doc:${id}`),
            { collection: (sub: string) => (calls.push(`sub:${sub}`), query) }
          ),
        }
      ),
    };
    const days = await readConversationDays(
      db as unknown as Parameters<typeof readConversationDays>[0],
      'bogle_users',
      'owner'
    );
    expect(days).toEqual(['2026-10-10', '2026-10-11']);
    expect(calls).toEqual([
      'collection:bogle_users',
      'doc:owner',
      'sub:summaries',
      'orderBy:timestamp:desc',
      'select:timestamp',
      'limit:400',
    ]);
  });
});

describe('STREAK_FROM_SUMMARIES', () => {
  it('is off unless set to on', () => {
    expect(streakFromSummariesEnabled({})).toBe(false);
    expect(streakFromSummariesEnabled({ STREAK_FROM_SUMMARIES: 'off' })).toBe(false);
    expect(streakFromSummariesEnabled({ STREAK_FROM_SUMMARIES: 'on' })).toBe(true);
  });
});

describe('FirestoreStore profile load and save', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** A fake db: one profile document and its summaries subcollection; records writes. */
  function fakeDb(writes: unknown[], summaryReads: string[] = []) {
    const profile = {
      id: 'owner',
      name: 'Seth',
      createdAt: '2026-01-03T21:23:55.641Z',
      firstContact: '2026-01-03T21:23:55.641Z',
      lastContact: '2026-10-11T13:08:55.843Z',
      totalConversations: 647,
      conversationSummaries: [],
    };
    const summaries = ['2026-10-11T13:14:17Z', '2026-10-10T22:59:40Z'].map((timestamp) => ({
      get: (field: string) => (field === 'timestamp' ? timestamp : undefined),
    }));
    const query = {
      orderBy: () => query,
      select: () => query,
      limit: () => query,
      get: async () => ({ docs: summaries }),
    };
    const doc = {
      id: 'owner',
      get: async () => ({ exists: true, id: 'owner', data: () => ({ ...profile }) }),
      set: async (data: unknown) => {
        writes.push(data);
      },
      collection: (name: string) => {
        summaryReads.push(name);
        return query;
      },
    };
    return {
      collection: () => ({ doc: () => doc }),
      runTransaction: fakeRunTransaction,
      terminate: async () => undefined,
    };
  }

  it('getProfile puts the summary days on the profile, saveProfile leaves them out', async () => {
    vi.stubEnv('STREAK_FROM_SUMMARIES', 'on');
    const { FirestoreStore } = await import('../firestore-store.js');
    const writes: unknown[] = [];
    const store = new FirestoreStore({ projectId: 'test-project' });
    Object.assign(store as unknown as Record<string, unknown>, {
      db: fakeDb(writes),
      _initialized: true,
    });

    const profile = await store.getProfile('owner');
    expect(profile?.conversationDays).toEqual(['2026-10-10', '2026-10-11']);

    await store.saveProfile(profile as UserProfile);
    expect(writes).toHaveLength(1);
    expect(writes[0]).not.toHaveProperty('conversationDays');
    // The in-memory profile keeps them for the rest of the call
    expect(profile?.conversationDays).toHaveLength(2);
  });

  it('with the flag unset, getProfile reads no summaries and adds no days', async () => {
    const { FirestoreStore } = await import('../firestore-store.js');
    const writes: unknown[] = [];
    const summaryReads: string[] = [];
    const store = new FirestoreStore({ projectId: 'test-project' });
    Object.assign(store as unknown as Record<string, unknown>, {
      db: fakeDb(writes, summaryReads),
      _initialized: true,
    });

    const profile = await store.getProfile('owner');
    expect(profile?.totalConversations).toBe(647);
    expect(summaryReads).toEqual([]);
    expect(profile).not.toHaveProperty('conversationDays');
  });
});
