/**
 * NAME_SAVED at a call's start (#4389): the dispatch name fills a nameless
 * account (load-session-profile.ts) and logs source onboarding; an account that
 * has a name is left alone and logs nothing. Drives the real loadSessionProfile;
 * only the Redis profile cache is a pass-through.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadSessionProfile } from '../../session/load-session-profile.js';
import type { UserProfile } from '../../../types/user-profile.js';

const nameLines = vi.hoisted(() => [] as unknown[][]);
vi.mock('../../data-layer/profile-cache.js', () => ({
  getProfileWithCache: async (uid: string, load: (u: string) => Promise<unknown>) => load(uid),
  cacheProfile: async () => {},
  invalidateProfile: async () => {},
}));
vi.mock('../../../utils/safe-logger.js', async (real) => {
  const actual = await real<typeof import('../../../utils/safe-logger.js')>();
  const caught = { info: (...args: unknown[]) => nameLines.push(args) };
  return {
    ...actual,
    createLogger: (opts: { module?: string }) =>
      opts?.module === 'AccountName' ? caught : actual.createLogger(opts as never),
  };
});

afterEach(() => {
  nameLines.length = 0;
});

function store(existing: Partial<UserProfile> | null) {
  const saves: UserProfile[] = [];
  return {
    saves,
    getProfileForWrite: async () => (existing ? ({ id: 'u1', ...existing } as UserProfile) : null),
    saveProfile: async (p: UserProfile) => void saves.push(p),
  };
}

describe('loadSessionProfile: the dispatch name', () => {
  it('fills a nameless account and logs one words-free NAME_SAVED', async () => {
    const s = store({});
    const profile = await loadSessionProfile(s, 'u1', 'Sam');
    expect(profile.name).toBe('Sam');
    expect(s.saves).toHaveLength(1);
    expect(nameLines).toEqual([
      [{ source: 'onboarding', sessionKind: 'call', hadName: false }, 'NAME_SAVED'],
    ]);
    expect(JSON.stringify(nameLines).toLowerCase()).not.toContain('sam');
  });

  it('names a new account and logs it', async () => {
    const s = store(null);
    const profile = await loadSessionProfile(s, 'u1', 'Sam');
    expect(profile.name).toBe('Sam');
    expect(nameLines).toEqual([
      [{ source: 'onboarding', sessionKind: 'call', hadName: false }, 'NAME_SAVED'],
    ]);
  });

  it('leaves an account that has a name alone, and logs nothing', async () => {
    const s = store({ name: 'Jess' });
    const profile = await loadSessionProfile(s, 'u1', 'Sam');
    expect(profile.name).toBe('Jess');
    expect(s.saves).toHaveLength(0);
    expect(nameLines).toEqual([]);
  });
});
