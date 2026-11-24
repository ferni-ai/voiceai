/**
 * recentContext honours a topic forgotten on another process's call (#2755,
 * FORGET_FRESH_READ).
 *
 * Two processes, one caller: this test is process 2. Process 1's forget is
 * modelled as the store's topics changing underneath (the stored-topics read
 * starts returning "divorce") with no forgetTopic here, so nothing in this
 * process bumps the forget generation or the in-process list: only what the
 * store says can hide the line. A first recentContext call primes the shared
 * 15 s topics cache; the forget lands 5 s later; a second call follows.
 * Off: the cached list (no "divorce") is used and the line comes back (main).
 * On: the store is read again and the line is left out.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const history = vi.hoisted(() => ({
  get: (async () => ({ sessions: [] })) as (userId: string) => Promise<unknown>,
}));
// The stored-topics read the real path makes (forgottenTopicsOrNull with no store); counts calls.
const storeRead = vi.hoisted(() => ({
  topics: [] as string[] | null,
  hang: false,
  calls: 0,
}));
vi.mock('../../../../memory/recall/forget.js', async (original) => {
  const real = await original<typeof import('../../../../memory/recall/forget.js')>();
  return {
    ...real,
    forgottenTopicsOrNull: async () => {
      storeRead.calls++;
      if (storeRead.hang) return new Promise<never>(() => {});
      return storeRead.topics && [...storeRead.topics];
    },
  };
});
vi.mock('../../../../services/superhuman/semantic-intelligence/promise-keeper.js', () => ({
  recordReminderPromise: vi.fn(async () => {}),
}));
vi.mock('../../../../memory/profile-store.js', () => ({
  getProfileStore: async () => ({ getProfile: async () => null }),
}));
vi.mock('../../../../services/stores/conversation-history.js', () => ({
  getConversationHistoryService: () => ({ getHistory: (userId: string) => history.get(userId) }),
}));
vi.mock('../../../../memory/firestore-store.js', () => ({
  getFirestoreStore: () => ({ getDatabase: async () => null }),
}));

import { resetForgetTopicsSource } from '../../../../memory/recall/forget-topics-source.js';
import { essentialsToolDefinitions } from '../essentials-tools.js';
import { flagOn } from '../../../../config/env-flag.js';

const FLAG = 'FORGET_FRESH_READ' as const;
interface Exec {
  execute: (args: Record<string, unknown>) => Promise<string>;
}

function recentContext(userId: string): Exec {
  const def = essentialsToolDefinitions.find((d) => d.id === 'recentContext')!;
  return def.create({ userId, agentId: 'ferni', agentDisplayName: 'Ferni' } as never) as never;
}

const SESSIONS = {
  sessions: [
    {
      date: '2026-10-20T12:00:00Z',
      insights: ['we went over the divorce papers together'],
      topicsDiscussed: ['divorce papers'],
    },
    {
      date: '2026-10-21T12:00:00Z',
      insights: ['planning the spring garden'],
      topicsDiscussed: ['garden'],
    },
  ],
};

const T0 = 7_000_000;

/** Process 2 primes its cache at T0; process 1 forgets "divorce" at T0+5 s; process 2 asks again. */
async function forgetInOtherProcessThenAsk(
  userId: string
): Promise<{ before: string; after: string }> {
  history.get = async () => SESSIONS;
  vi.useFakeTimers({ toFake: ['Date'], now: T0 });
  storeRead.topics = [];
  const before = await recentContext(userId).execute({ timeframe: 'all-time' });

  vi.setSystemTime(T0 + 5_000); // well inside the 15 s cache
  storeRead.topics = ['divorce']; // written by process 1; nothing in this process knows
  const after = await recentContext(userId).execute({ timeframe: 'all-time' });
  return { before, after };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  resetForgetTopicsSource();
  storeRead.topics = [];
  storeRead.hang = false;
  storeRead.calls = 0;
  history.get = async () => ({ sessions: [] });
});

describe('recentContext and a forget made in another process (#2755)', () => {
  it('the flag is off by default', () => {
    expect(flagOn(FLAG, {})).toBe(false);
    expect(flagOn(FLAG, { [FLAG]: 'on' })).toBe(true);
  });

  it('off: the cached list is used for 15 s, so the forgotten line still comes back (main)', async () => {
    vi.stubEnv(FLAG, 'off');
    const { before, after } = await forgetInOtherProcessThenAsk('u-2755-off');
    expect(before).toContain('divorce papers');
    expect(after).toContain('divorce papers');
    expect(storeRead.calls).toBe(1); // the second call never asked the store
  });

  it('on: the store is read on every call, so the forget counts at once', async () => {
    vi.stubEnv(FLAG, 'on');
    const { before, after } = await forgetInOtherProcessThenAsk('u-2755-on');
    expect(before).toContain('divorce papers');
    expect(after).not.toMatch(/divorce papers|went over/);
    expect(after).toContain('garden');
    expect(storeRead.calls).toBe(2);
  });

  it('on: still bounded at 300 ms and fail closed when the store never answers', async () => {
    vi.stubEnv(FLAG, 'on');
    history.get = async () => SESSIONS;
    const userId = 'u-2755-hung';
    storeRead.topics = [];
    expect(await recentContext(userId).execute({ timeframe: 'all-time' })).toContain('garden');

    storeRead.hang = true; // an earlier good read must not be served in its place
    const started = Date.now();
    const said = await recentContext(userId).execute({ timeframe: 'all-time' });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(said).toContain("I can't pull up our past conversations right now");
    expect(said).not.toMatch(/divorce|garden/);
  }, 5_000);

  it('on: fail closed when the store read fails', async () => {
    vi.stubEnv(FLAG, 'on');
    history.get = async () => SESSIONS;
    storeRead.topics = null;
    const said = await recentContext('u-2755-failed').execute({ timeframe: 'all-time' });
    expect(said).toContain("I can't pull up our past conversations right now");
    expect(said).not.toMatch(/divorce|garden/);
  });
});
