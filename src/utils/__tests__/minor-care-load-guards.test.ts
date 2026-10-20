/**
 * The "never loaded here" guards (MINOR_CARE reload-before-write) must refuse only writes that
 * would replace stored data, and never drop an adult's writes silently:
 * - game memory cached before any read is read from storage on the next load, then written;
 * - a music save made before the user's load finishes waits for it instead of vanishing;
 * - a refused write is logged at warn, once per user;
 * - two stores in one collection each keep their own sync timer;
 * - a predictive model whose load failed is not "loaded": it retries later, with backoff, and
 *   only models that read the user from storage are written.
 * Only Firestore, the engagement store and the logger are faked.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const stored = vi.hoisted(() => [] as { path: string; data: unknown }[]);
const failReads = vi.hoisted(() => new Set<string>());
const fakeDb = vi.hoisted(() => {
  const empty = { exists: false, empty: true, docs: [], size: 0, data: () => undefined };
  const ref = (path: string): Record<string, unknown> =>
    new Proxy(
      {
        path,
        collection: (name: string) => ref(`${path}/${name}`),
        doc: (id = 'auto') => ref(`${path}/${id}`),
        get: async () => {
          if ([...failReads].some((f) => path.includes(f))) throw new Error('unavailable');
          return empty;
        },
        set: async (data: unknown) => void stored.push({ path, data }),
      } as Record<string | symbol, unknown>,
      { get: (t, k) => (k in t ? t[k] : k === 'then' ? undefined : () => ref(path)) }
    );
  const tx = (r: { path: string }, data: unknown) => void stored.push({ path: r.path, data });
  return Object.assign(ref(''), {
    batch: () => ({ set: tx, update: tx, delete: tx, commit: async () => undefined }),
  });
});
vi.mock('@google-cloud/firestore', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  Firestore: class {
    constructor() {
      return fakeDb;
    }
  },
}));
const engagement = vi.hoisted(() => ({
  getProfile: vi.fn(async (userId: string) => ({ userId })),
  saveProfile: vi.fn(async (_profile: unknown) => undefined),
}));
vi.mock('../../services/engagement/engagement-store.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getEngagementStore: async () => engagement,
}));
const logs = vi.hoisted(() => {
  const logger: Record<string, unknown> = {};
  for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) logger[level] = vi.fn();
  logger.child = () => logger;
  return logger as Record<string, ReturnType<typeof vi.fn>> & { child: () => unknown };
});
vi.mock('../../utils/safe-logger.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getLogger: () => logs,
  createLogger: () => logs,
}));

import { createPersistenceStore } from '../../services/persistence/index.js';
import {
  forceSaveGameMemory,
  loadGameMemory,
  saveGameMemory,
  updateCachedGameMemory,
} from '../../services/games/game-store.js';
import { saveProfile as saveMusicProfile } from '../../audio/music-learning-persistence.js';
import { getUserProfile as musicProfile } from '../../audio/music-user-learning.js';
import {
  recordTransition,
  getMarkovDataForPersistence,
} from '../../intelligence/predictive/markov-sequence-predictor.js';
import {
  flushDirtyUsers,
  isUserLoaded,
  markDirty,
  markUserLoaded,
} from '../../intelligence/predictive/persistence.js';
import { getFirestoreDb as superhumanDb } from '../../services/superhuman/firestore-utils.js';

let n = 0;
const user = () => `user-guards-${++n}`;
const writesTo = (userId: string, part: string) =>
  stored.filter((w) => w.path.includes(userId) && w.path.includes(part));
const warnedAbout = (text: string, userId: string) =>
  logs.warn!.mock.calls.filter(
    (c) => JSON.stringify(c).includes(userId) && String(c[1]).includes(text)
  );

async function tick(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await vi.dynamicImportSettled();
  await vi.advanceTimersByTimeAsync(0);
}

beforeAll(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'setInterval', 'clearInterval', 'clearTimeout', 'Date'],
  });
});
afterAll(() => {
  vi.useRealTimers();
});
beforeEach(() => {
  vi.mocked(superhumanDb).mockReturnValue(fakeDb as never);
  stored.length = 0;
  failReads.clear();
  engagement.saveProfile.mockClear();
  logs.warn!.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('game memory', () => {
  it('cached before any read: the next load reads storage, so the write goes through', async () => {
    const userId = user();
    updateCachedGameMemory(userId, { totalGamesPlayed: 1 } as never);
    const memory = await loadGameMemory(userId);
    await saveGameMemory(userId, { ...memory, totalGamesPlayed: 2 } as never);
    await forceSaveGameMemory(userId);
    expect(engagement.saveProfile).toHaveBeenCalledTimes(1);
  });

  it('a refused write (never loaded) is logged at warn, once per user', async () => {
    const userId = user();
    updateCachedGameMemory(userId, { totalGamesPlayed: 1 } as never);
    await forceSaveGameMemory(userId);
    await forceSaveGameMemory(userId);
    expect(engagement.saveProfile).not.toHaveBeenCalled();
    expect(warnedAbout('never loaded', userId)).toHaveLength(1);
  });
});

describe('music learning', () => {
  it('a save made before the load finishes waits for it, then is written', async () => {
    const userId = user();
    musicProfile(userId); // learning has started
    saveMusicProfile(userId); // no load yet: it starts one and saves after it
    await tick(10_000);
    await tick(10_000);
    expect(writesTo(userId, '/music_learning/profile').length).toBeGreaterThan(0);
  });
});

describe('persistence layer', () => {
  it('two stores in one collection each keep their own sync timer', async () => {
    const userId = user();
    const a = createPersistenceStore<{ v: number }>({
      collection: 'shared_coll',
      documentId: 'a',
      syncIntervalMs: 1_000,
    });
    const b = createPersistenceStore<{ v: number }>({
      collection: 'shared_coll',
      documentId: 'b',
      syncIntervalMs: 1_000,
    });
    a.set(userId, { v: 1 });
    b.set(userId, { v: 2 });
    await tick(1_000);
    await tick(1_000);
    expect(writesTo(userId, '/shared_coll/a').length).toBeGreaterThan(0);
    expect(writesTo(userId, '/shared_coll/b').length).toBeGreaterThan(0);
  });
});

describe('predictive models', () => {
  it('a failed load is not "loaded": nothing is written, and it retries after its backoff', async () => {
    const userId = user();
    failReads.add('/predictive_ml/markov');
    recordTransition(userId, 'emotion:anxious', 'emotion:calm');
    await tick(0);
    expect(isUserLoaded(userId, 'markov')).toBe(false);
    failReads.clear();
    recordTransition(userId, 'emotion:calm', 'emotion:anxious'); // inside the backoff: no retry
    await tick(0);
    expect(isUserLoaded(userId, 'markov')).toBe(false);
    await tick(5 * 60_000 + 1);
    markDirty(userId);
    await flushDirtyUsers(getMarkovDataForPersistence, () => null, () => null);
    expect(writesTo(userId, '/predictive_ml/markov')).toEqual([]); // never loaded: not written
    recordTransition(userId, 'emotion:calm', 'emotion:anxious'); // past the backoff: retried
    await tick(0);
    expect(isUserLoaded(userId, 'markov')).toBe(true);
  });

  it('only models that read the user from storage are written', async () => {
    const userId = user();
    markUserLoaded(userId, 'markov');
    const series = vi.fn(() => ({ series: {} }) as never);
    await tick(5 * 60_000 + 1);
    markDirty(userId);
    await flushDirtyUsers(
      () => ({ firstOrder: {}, totalObservations: 1 }) as never,
      series,
      () => null
    );
    expect(writesTo(userId, '/predictive_ml/markov').length).toBe(1);
    expect(series).not.toHaveBeenCalled();
  });
});
