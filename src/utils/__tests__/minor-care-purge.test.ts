/**
 * MINOR_CARE=on: at the end of a held call (a caller under 18, not a verified owner) every
 * per-user store's in-memory state for that user is purged, with its loaded markers, and a store
 * never writes a user it hasn't loaded from storage in this process. So nothing learned during
 * the held call is written later, and no store writes an empty or partial document over the
 * stored one. Placeholder ids are never held or purged. Each store runs for real; only Firestore
 * and the engagement store are faked.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const stored = vi.hoisted(() => [] as { path: string; data: unknown }[]);
/** Documents as stored, by path; a read of a path containing a `failReads` entry throws. */
const docs = vi.hoisted(() => new Map<string, Record<string, unknown>>());
const failReads = vi.hoisted(() => new Set<string>());
const reads = vi.hoisted(() => [] as string[]);

/** A fake Firestore that records every write (path and data) and serves `docs`. */
const fakeDb = vi.hoisted(() => {
  const empty = { exists: false, empty: true, docs: [], size: 0, data: () => undefined };
  const ref = (path: string): Record<string, unknown> =>
    new Proxy(
      {
        path,
        collection: (name: string) => ref(`${path}/${name}`),
        doc: (id = 'auto') => ref(`${path}/${id}`),
        get: async () => {
          reads.push(path);
          if ([...failReads].some((f) => path.includes(f))) throw new Error('unavailable');
          const doc = docs.get(path);
          return doc ? { exists: true, data: () => structuredClone(doc) } : empty;
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
  getProfile: vi.fn(async (userId: string) => ({ userId, gameMemory: { totalGamesPlayed: 7 } })),
  saveProfile: vi.fn(async (_profile: unknown) => undefined),
}));
vi.mock('../../services/engagement/engagement-store.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getEngagementStore: async () => engagement,
}));

const semantic = vi.hoisted(() => ({ cleared: [] as (string | undefined)[] }));
vi.mock('../../services/superhuman/semantic-intelligence/index.js', () => ({
  clearSemanticIntelligenceCache: (userId?: string) => void semantic.cleared.push(userId),
}));

import { purgeHeldUser } from '../../agents/voice-agent/minor-care-purge.js';
import {
  getThinkingRecordsForPersistence,
  loadThinkingRecords,
} from '../../services/trust-systems/between-session-thinking.js';
import {
  getCuriosityProfileForPersistence,
  loadCuriosityProfile,
} from '../../services/trust-systems/curiosity-memory.js';
import {
  getPersonaGrowthForPersistence,
  loadPersonaGrowthProfile,
} from '../../services/trust-systems/persona-growth.js';
import {
  getTonalProfileForPersistence,
  loadTonalProfile,
} from '../../services/trust-systems/tonal-memory.js';
import { getUserGraph, recordMention } from '../../services/social-graph/index.js';
import {
  purgeUnifiedUser,
  saveSystemData,
} from '../../services/trust-systems/unified-persistence.js';
import {
  forceSaveGameMemory,
  getCachedGameMemory,
  loadGameMemory,
  saveGameMemory,
  updateCachedGameMemory,
} from '../../services/games/game-store.js';
import {
  ensureProfileLoaded,
  isMusicLearningLoaded,
} from '../../audio/music-learning-persistence.js';
import {
  flushDirtyUsers,
  isUserLoaded,
  markDirty,
  markUserLoaded,
} from '../../intelligence/predictive/persistence.js';
import {
  getRelationshipEngine,
  initializeRelationship,
} from '../../intelligence/relationship/engine.js';
import {
  checkForOurSong,
  getAllOurSongs,
  getProactiveRememberWhen,
  recordOurSong,
} from '../../services/trust-systems/our-songs.js';
import {
  bindSessionUser,
  heldAfter,
  resetMinorCare,
  setVerifiedOwnerCheck,
  userHeld,
} from '../minor-care.js';

let n = 0;
const SIXTEEN = "I'm 16 years old and kind of bored";
const HOLD_LAPSES_MS = 7 * 60 * 60 * 1000; // past the 6 h hold
const unifiedPath = (userId: string) => `/bogle_users/${userId}/trust/unified_profile`;
const writesFor = (userId: string) => stored.filter((w) => w.path.includes(userId));

/** A user with a session that will say they're 16 (hold()), flag on. */
function caller(userId = `user-purge-${++n}`): {
  userId: string;
  sessionId: string;
  hold: () => void;
} {
  const sessionId = `session-${userId}`;
  vi.stubEnv('MINOR_CARE', 'on');
  bindSessionUser(sessionId, userId); // session-init-handler does this at session start
  return { userId, sessionId, hold: () => void heldAfter(sessionId, SIXTEEN, { userId }) };
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
  stored.length = 0;
  reads.length = 0;
  failReads.clear();
  engagement.saveProfile.mockClear();
});
afterEach(() => {
  resetMinorCare();
  vi.unstubAllEnvs();
});

describe('placeholder ids and other users', () => {
  it.each(['anonymous', 'default', 'unknown', ' '])(
    '%j is never held, bound or purged',
    async (id) => {
      vi.stubEnv('MINOR_CARE', 'on');
      heldAfter(`session-${id}-${++n}`, SIXTEEN, { userId: id });
      expect(userHeld(id)).toBe(false);
      await saveGameMemory(id, { totalGamesPlayed: 1 } as never);
      purgeHeldUser(id);
      expect(getCachedGameMemory(id)).not.toBeNull(); // one bucket for many people: left alone
    }
  );

  it('holding and purging one user never touches another', async () => {
    const a = caller();
    const b = caller();
    await saveGameMemory(b.userId, { totalGamesPlayed: 2 } as never);
    await initializeRelationship(a.userId, 'ferni');
    await initializeRelationship(b.userId, 'ferni');
    a.hold();
    semantic.cleared.length = 0;
    purgeHeldUser(a.userId);
    expect(semantic.cleared).toEqual([a.userId]); // only theirs, never every user's
    expect(getRelationshipEngine(a.userId, 'ferni')).toBeUndefined();
    expect(getRelationshipEngine(b.userId, 'ferni')).toBeDefined();
    expect(userHeld(a.userId)).toBe(true);
    expect(userHeld(b.userId)).toBe(false);
    expect(getCachedGameMemory(b.userId)).not.toBeNull();
  });
});

describe('purge: every store drops the user and their loaded markers', () => {
  it('predictive and music: loaded markers cleared, so the next session reloads', async () => {
    const who = caller();
    markUserLoaded(who.userId, 'markov');
    await ensureProfileLoaded(who.userId);
    expect([isUserLoaded(who.userId, 'markov'), isMusicLearningLoaded(who.userId)]).toEqual([
      true,
      true,
    ]);
    who.hold();
    purgeHeldUser(who.userId);
    expect([isUserLoaded(who.userId, 'markov'), isMusicLearningLoaded(who.userId)]).toEqual([
      false,
      false,
    ]);
  });

  it('game: after a purge, memory cached without a reload is never written', async () => {
    const who = caller();
    await loadGameMemory(who.userId);
    purgeHeldUser(who.userId);
    updateCachedGameMemory(who.userId, { totalGamesPlayed: 0 } as never);
    await forceSaveGameMemory(who.userId);
    expect(engagement.saveProfile).not.toHaveBeenCalled();
  });

  it('unified trust: after a purge, a failed reload writes nothing (no empty profile)', async () => {
    const who = caller();
    await saveSystemData(who.userId, 'boundaries', { topics: ['before'] }); // loads, writes through
    expect(writesFor(who.userId).length).toBe(1);
    purgeUnifiedUser(who.userId);
    failReads.add(who.userId);
    await saveSystemData(who.userId, 'boundaries', { topics: ['after'] });
    expect(writesFor(who.userId).length).toBe(1);
  });
});

describe('relationship engine: phrases recorded during the held call', () => {
  // recordMoment keeps the caller's phrase in the cached engine; a held call's cleanup never
  // ends its session, so a later call from the same id (hold lapsed) would save it
  it.each([false, true])(
    'a later call saves none of them once purged (purged: %s)',
    async (purged) => {
      const who = caller();
      const held = await initializeRelationship(who.userId, 'ferni');
      held.startSession();
      held.recordMoment('vulnerability', 'opened up about a fight', {
        userPhrase: 'my best friend Riley and I had a fight',
      });
      who.hold();
      if (purged) purgeHeldUser(who.userId);
      await vi.advanceTimersByTimeAsync(HOLD_LAPSES_MS);
      const later = await initializeRelationship(who.userId, 'ferni'); // the next call
      later.startSession();
      await later.endSession('neutral', []);
      const saved = JSON.stringify(writesFor(who.userId).map((w) => w.data));
      expect(writesFor(who.userId).length).toBeGreaterThan(0); // the later call did save
      expect(saved.includes('Riley')).toBe(!purged);
    }
  );
});

describe("caches a later call saves: the caller's quotes and the people they mentioned", () => {
  /** What each cache holds for a user: thinking, curiosity, growth, tonal, social graph. */
  const held = (userId: string) => [
    getThinkingRecordsForPersistence(userId).length > 0,
    getCuriosityProfileForPersistence(userId) !== null,
    getPersonaGrowthForPersistence(userId, 'ferni') !== null,
    getTonalProfileForPersistence(userId) !== null,
    getUserGraph(userId) !== undefined,
  ];
  const fill = (userId: string) => {
    const at = new Date();
    loadThinkingRecords(userId, [{ id: `t-${userId}`, createdAt: at }] as never);
    loadCuriosityProfile(userId, { userId, mentions: [], lastUpdated: at } as never);
    loadPersonaGrowthProfile(userId, 'ferni', { growthRecords: [], lastUpdated: at } as never);
    loadTonalProfile(userId, { userId, patterns: [], lastUpdated: at } as never);
    recordMention(userId, 'Jess', 'my best friend Jess moved away', -0.4);
  };

  it("purge drops all five for the held caller and none of another caller's", () => {
    const a = caller();
    const b = caller();
    fill(a.userId);
    fill(b.userId);
    expect(held(a.userId)).toEqual([true, true, true, true, true]);
    a.hold();
    purgeHeldUser(a.userId);
    expect(held(a.userId)).toEqual([false, false, false, false, false]);
    expect(held(b.userId)).toEqual([true, true, true, true, true]);
  });
});

describe('our songs: a moment the held call made before its age statement', () => {
  const song = { name: 'Harbor Lights', artist: 'The Synthetic Band' };
  const learn = (userId: string, sessionId: string) =>
    recordOurSong({
      userId,
      sessionId,
      song,
      momentType: 'celebration',
      emotion: 'excited',
      context: 'joy',
    });

  it('is never spoken back on a later call, and another caller keeps theirs', async () => {
    const a = caller();
    const b = caller();
    expect(learn(a.userId, a.sessionId)).not.toBeNull(); // learned before they said their age
    expect(learn(b.userId, b.sessionId)).not.toBeNull();
    a.hold();
    purgeHeldUser(a.userId, a.sessionId);
    await vi.advanceTimersByTimeAsync(HOLD_LAPSES_MS); // a later call, the hold lapsed
    bindSessionUser(`later-${a.userId}`, a.userId);
    expect(getAllOurSongs(a.userId)).toEqual([]);
    expect(checkForOurSong(a.userId, song.name, song.artist)).toBeNull();
    expect(getProactiveRememberWhen(a.userId)).toBeNull();
    expect(checkForOurSong(b.userId, song.name, song.artist)).not.toBeNull();
  });
});

describe('a store never writes a user it has not loaded in this process', () => {
  it('unified trust: the read failed, so no empty profile replaces the stored one', async () => {
    const who = caller();
    failReads.add(who.userId);
    await saveSystemData(who.userId, 'boundaries', { topics: ['x'] }); // write-through system
    expect(writesFor(who.userId)).toEqual([]);
  });

  it('predictive: a dirty user never loaded is not flushed', async () => {
    const who = caller();
    const markov = vi.fn(() => ({ transitionCounts: {}, lastState: 'x' }) as never);
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 1);
    markDirty(who.userId);
    await flushDirtyUsers(
      markov,
      () => null,
      () => null
    );
    expect(markov).not.toHaveBeenCalled();
  });

  it('game: forceSaveGameMemory writes nothing for a held caller (pin)', async () => {
    const who = caller();
    await loadGameMemory(who.userId);
    updateCachedGameMemory(who.userId, { totalGamesPlayed: 8 } as never);
    who.hold();
    await forceSaveGameMemory(who.userId);
    expect(engagement.saveProfile).not.toHaveBeenCalled();
  });
});

describe('Decision: purge during a live owner session', () => {
  it("the owner's next write reloads from storage first and has none of the held call's data", async () => {
    const userId = `user-owner-live-${++n}`;
    docs.set(unifiedPath(userId), { version: 3, systems: { growth: { note: 'stored' } } });
    const owner = `owner-${userId}`;
    setVerifiedOwnerCheck((s) => s === owner);
    bindSessionUser(owner, userId);
    const held = caller(userId);
    // The held session's first turn, before it said its age: cached, waiting for the batch sync
    await saveSystemData(userId, 'growth', { note: 'from the held call' });
    held.hold();
    purgeHeldUser(userId); // its cleanup, while the owner session is still live
    await vi.advanceTimersByTimeAsync(HOLD_LAPSES_MS);
    reads.length = 0;
    await saveSystemData(userId, 'boundaries', { topics: ['owner change'] });
    expect(reads).toContain(unifiedPath(userId)); // reloaded before writing
    const [w] = writesFor(userId);
    expect(JSON.stringify(w?.data)).toContain('stored');
    expect(JSON.stringify(w?.data)).toContain('owner change');
    expect(JSON.stringify(w?.data)).not.toContain('from the held call');
  });
});
