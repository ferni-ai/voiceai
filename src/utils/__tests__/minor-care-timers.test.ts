/**
 * MINOR_CARE=on: the per-user stores that also write on a timer mid-call check the hold at write
 * time, so a held caller under 18 (not a verified owner) is never written on a tick, and a hold
 * that starts mid-call stops the next tick. Each writer runs for real with only Firestore faked:
 * the 5-minute periodic sync (deep understanding), the unified trust batch sync, the predictive
 * ML flush, the superhuman and embedding saves, music learning's store sync and the game memory
 * flush. A verified owner and the flag off still write.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const stored = vi.hoisted(() => [] as string[]);

/** A fake Firestore that records every write path. */
const fakeDb = vi.hoisted(() => {
  const empty = {
    exists: false,
    empty: true,
    docs: [],
    size: 0,
    data: () => undefined,
    forEach: () => undefined,
  };
  const write = (path: string) => async () => {
    stored.push(path);
    return { id: 'stored-1' };
  };
  const ref = (path: string): Record<string, unknown> =>
    new Proxy(
      {
        path,
        id: path.split('/').at(-1),
        collection: (name: string) => ref(`${path}/${name}`),
        doc: (id = 'auto') => ref(`${path}/${id}`),
        get: async () => empty,
        set: write(path),
        add: write(path),
        update: write(path),
        create: write(path),
        delete: write(path),
      } as Record<string | symbol, unknown>,
      { get: (t, k) => (k in t ? t[k] : k === 'then' ? undefined : () => ref(path)) }
    );
  const tx = (r: { path: string }) => void stored.push(r.path);
  return Object.assign(ref(''), {
    runTransaction: async (fn: (t: unknown) => unknown) =>
      fn({ get: async () => empty, set: tx, update: tx, create: tx, delete: tx }),
    batch: () => ({ set: tx, update: tx, create: tx, delete: tx, commit: async () => undefined }),
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
vi.mock('../firebase-admin-app.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getAdminFirestore: () => fakeDb,
}));
const deepSync = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../../intelligence/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  deepUnderstandingPeriodicSync: deepSync,
}));
const engagement = vi.hoisted(() => ({
  getProfile: vi.fn(async () => ({})),
  saveProfile: vi.fn(async () => undefined),
}));
vi.mock('../../services/engagement/engagement-store.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getEngagementStore: async () => engagement,
}));

import {
  startPeriodicSync,
  stopPeriodicSync,
} from '../../agents/voice-agent/periodic-sync-handler.js';
import {
  flushPendingChanges,
  saveSystemData,
} from '../../services/trust-systems/unified-persistence.js';
import {
  flushDirtyUsers,
  markDirty,
  markUserLoaded,
} from '../../intelligence/predictive/persistence.js';
import { saveAvoidanceState } from '../../intelligence/predictive/superhuman-persistence.js';
import { saveSemanticAvoidance } from '../../intelligence/predictive/embeddings/embedding-persistence.js';
import {
  ensureProfileLoaded,
  saveProfile as saveMusicProfile,
} from '../../audio/music-learning-persistence.js';
import { getUserProfile as musicProfile } from '../../audio/music-user-learning.js';
import { loadGameMemory, saveGameMemory } from '../../services/games/game-store.js';
import { getFirestoreDb as superhumanDb } from '../../services/superhuman/firestore-utils.js';
import {
  bindSessionUser,
  heldAfter,
  resetMinorCare,
  setVerifiedOwnerCheck,
} from '../minor-care.js';

type Case = 'held' | 'owner' | 'off';
let n = 0;

/** A caller in the given state. `said` false: nothing said yet (the hold can start later). */
function caller(c: Case | 'mid'): { sessionId: string; userId: string; hold: () => void } {
  const sessionId = `timers-${c}-${++n}`;
  const userId = `user-${sessionId}`;
  vi.stubEnv('MINOR_CARE', c === 'off' ? 'off' : 'on');
  if (c === 'owner') setVerifiedOwnerCheck((id) => id === sessionId);
  // transcript-handler reads every final caller turn this way, with the userId
  const hold = () => void heldAfter(sessionId, "I'm 16 years old and kind of bored", { userId });
  if (c !== 'mid') hold();
  return { sessionId, userId, hold };
}

const ML_DATA = { transitionCounts: {}, lastState: 'x' } as never;
const getters = [() => ML_DATA, () => null, () => null] as const;

/** One write through each timer's real path, for this user; returns the paths it stored. */
const WRITERS: Record<string, (who: { sessionId: string; userId: string }) => Promise<void>> = {
  'periodic sync (deep understanding, every 5 min)': async ({ sessionId, userId }) => {
    startPeriodicSync(sessionId, userId, 60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    stopPeriodicSync(sessionId);
  },
  'unified trust batch sync': async ({ userId }) => {
    await saveSystemData(userId, 'growth', { milestones: ['started a band'] });
    await flushPendingChanges(); // the batch-sync interval's whole body
  },
  'predictive ML flush': async ({ userId }) => {
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 1); // past the per-user flush interval
    markUserLoaded(userId); // the models load a user before they learn (stores write only those)
    markDirty(userId);
    await flushDirtyUsers(...getters); // the 5-minute interval's whole body
  },
  'superhuman save': async ({ userId }) => {
    await saveAvoidanceState(userId, { topics: ['school'] } as never);
  },
  'embedding save': async ({ userId }) => {
    await saveSemanticAvoidance(userId, { topics: ['school'] } as never);
  },
  'music learning store sync (10 s)': async ({ userId }) => {
    await ensureProfileLoaded(userId);
    musicProfile(userId);
    saveMusicProfile(userId);
    await vi.advanceTimersByTimeAsync(10_000);
  },
  'game memory flush (3 s)': async ({ userId }) => {
    await loadGameMemory(userId);
    await saveGameMemory(userId, { gameStats: {}, desertIslandPicks: ['a song'] } as never);
    await vi.advanceTimersByTimeAsync(3_000);
    await vi.dynamicImportSettled(); // the flush imports the engagement store lazily
  },
};

/** How many writes this writer made: Firestore paths, or the mocked writer's calls. */
const writes = (name: string): number =>
  name.startsWith('periodic')
    ? deepSync.mock.calls.length
    : name.startsWith('game')
      ? engagement.saveProfile.mock.calls.length
      : stored.length;

// One fake clock for the file: the music store and game store keep their timers across tests.
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
  vi.stubEnv('REQUIRE_FIX_MEMORY', 'on');
  stored.length = 0;
  deepSync.mockClear();
  engagement.saveProfile.mockClear();
});
afterEach(() => {
  resetMinorCare();
  vi.unstubAllEnvs();
});

describe('periodic sync: held whenever any session of the same user is held (userHeld)', () => {
  it.each<[string, boolean]>([
    ['another session of this user is held', false],
    ['no session of this user is held', true],
  ])('%s: syncs = %s', async (_name, syncs) => {
    const other = caller(syncs ? 'off' : 'held');
    vi.stubEnv('MINOR_CARE', 'on');
    const sessionId = `${other.sessionId}-second`;
    bindSessionUser(sessionId, other.userId); // session-init-handler, before startPeriodicSync
    startPeriodicSync(sessionId, other.userId, 60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    stopPeriodicSync(sessionId);
    expect(deepSync.mock.calls.length > 0).toBe(syncs);
  });
});

describe.each(Object.keys(WRITERS))('%s', (name) => {
  it.each<[Case, boolean]>([
    ['held', false],
    ['owner', true],
    ['off', true],
  ])('%s: writes = %s', async (c, writesExpected) => {
    await WRITERS[name]!(caller(c));
    if (writesExpected) expect(writes(name)).toBeGreaterThan(0);
    else expect(writes(name)).toBe(0);
  });

  it('a hold that starts mid-call stops the next write', async () => {
    const who = caller('mid');
    await WRITERS[name]!(who);
    const before = writes(name);
    expect(before).toBeGreaterThan(0);
    who.hold();
    await WRITERS[name]!(who);
    expect(writes(name)).toBe(before);
  });
});
