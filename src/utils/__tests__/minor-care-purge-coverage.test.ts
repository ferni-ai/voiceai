/**
 * MINOR_CARE purge coverage beyond the stores in minor-care-purge.test.ts: per-user in-memory
 * state that a held call fills and a later write would flush.
 * - the trust systems session cleanup saves through saveSystemData (thinking, tonal, curiosity,
 *   persona growth): purged;
 * - deep understanding (ten systems): each forgets the user; a write needs a reload and no hold;
 * - the engagement store: a held caller's profile is neither cached nor written, ritual and
 *   prediction writes are refused, and the purge drops the cached profile.
 * Only Firestore is faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stored = vi.hoisted(() => [] as { path: string; data: unknown }[]);
/** Per user: called after each of their writes lands, with how many have landed. */
const afterWrite = vi.hoisted(() => new Map<string, (count: number) => unknown>());
const fakeDb = vi.hoisted(() => {
  const empty = { exists: false, empty: true, docs: [], size: 0, data: () => undefined };
  const ref = (path: string): Record<string, unknown> =>
    new Proxy(
      {
        path,
        collection: (name: string) => ref(`${path}/${name}`),
        doc: (id = 'auto') => ref(`${path}/${id}`),
        get: async () => empty,
        set: async (data: unknown) => {
          stored.push({ path, data });
          for (const [userId, fn] of afterWrite)
            if (path.includes(userId))
              await fn(stored.filter((w) => w.path.includes(userId)).length);
        },
        add: async (data: unknown) => void stored.push({ path, data }),
        update: async (data: unknown) => void stored.push({ path, data }),
      } as Record<string | symbol, unknown>,
      { get: (t, k) => (k in t ? t[k] : k === 'then' ? undefined : () => ref(path)) }
    );
  return ref('');
});
vi.mock('@google-cloud/firestore', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  Firestore: class {
    constructor() {
      return fakeDb;
    }
  },
}));
vi.mock('firebase-admin/firestore', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getFirestore: () => fakeDb,
}));

import { purgeHeldUser } from '../../agents/voice-agent/minor-care-purge.js';
import {
  recordThinkingMoment,
  getThinkingRecordsForPersistence,
} from '../../services/trust-systems/between-session-thinking.js';
import {
  recordTonalObservation,
  getTonalProfileForPersistence,
} from '../../services/trust-systems/tonal-memory.js';
import {
  recordPassingMention,
  getCuriosityProfileForPersistence,
} from '../../services/trust-systems/curiosity-memory.js';
import {
  recordPersonaGrowth,
  getPersonaGrowthForPersistence,
} from '../../services/trust-systems/persona-growth.js';
import {
  loadDeepUnderstandingProfiles,
  saveDeepUnderstandingProfiles,
} from '../../intelligence/deep-understanding/persistence.js';
import {
  importSilencePattern,
  getSilencePattern,
} from '../../intelligence/deep-understanding/silence.js';
import {
  importRelationalNetwork,
  getRelationalNetwork,
} from '../../intelligence/deep-understanding/relationships.js';
import {
  importLifeRhythmProfile,
  getLifeRhythmProfile,
} from '../../intelligence/deep-understanding/life-rhythm.js';
import {
  importResistanceProfile,
  getResistanceProfile,
} from '../../intelligence/deep-understanding/resistance.js';
import {
  importEnergyPattern,
  getEnergyPattern,
} from '../../intelligence/deep-understanding/energy.js';
import {
  importSubconsciousProfile,
  getSubconsciousProfile,
} from '../../intelligence/deep-understanding/subconscious.js';
import { importFlowProfile, getFlowProfile } from '../../intelligence/deep-understanding/flow.js';
import {
  importRepairProfile,
  getRepairProfile,
} from '../../intelligence/deep-understanding/repair.js';
import { importHopeProfile, getHopeProfile } from '../../intelligence/deep-understanding/hope.js';
import {
  importChapterProfile,
  getChapterProfile,
} from '../../intelligence/deep-understanding/life-chapter.js';
import { getEngagementStore } from '../../services/engagement/engagement-store.js';
import { heldAfter, resetMinorCare } from '../minor-care.js';

type Store = Awaited<ReturnType<typeof getEngagementStore>>;

let n = 0;
const user = () => `user-coverage-${++n}`;
const writesFor = (userId: string) => stored.filter((w) => w.path.includes(userId));
const hold = (userId: string) =>
  heldAfter(`session-${userId}`, "I'm 16 years old and kind of bored", { userId });

beforeEach(() => {
  vi.stubEnv('MINOR_CARE', 'on');
  stored.length = 0;
});
afterEach(() => {
  resetMinorCare();
  vi.unstubAllEnvs();
});

describe('trust systems saved through saveSystemData: per-user maps purged', () => {
  it('thinking, tonal, curiosity and persona growth hold nothing after the purge', () => {
    const userId = user();
    const said = { userId, personaId: 'ferni', sessionId: 's1', sourceSessionId: 's1' };
    recordThinkingMoment({
      ...said,
      topic: 'school',
      context: 'x',
      emotionalWeight: 'heavy',
      thinkingType: 'reflection',
    } as never);
    recordTonalObservation({ userId, topic: 'school', voiceSignals: { pitch: 200, energy: 0.8 } });
    recordPassingMention({ ...said, type: 'event', name: 'the dance', context: 'x' } as never);
    recordPersonaGrowth({
      userId,
      personaId: 'ferni',
      growthType: 'perspective_shift',
      topic: 'school',
      beforeThinking: 'a',
      afterThinking: 'b',
      userContribution: 'c',
    } as never);
    const state = () => [
      getThinkingRecordsForPersistence(userId).length > 0,
      getTonalProfileForPersistence(userId) !== null,
      getCuriosityProfileForPersistence(userId) !== null,
      getPersonaGrowthForPersistence(userId, 'ferni') !== null,
    ];
    expect(state()).toEqual([true, true, true, true]);
    purgeHeldUser(userId);
    expect(state()).toEqual([false, false, false, false]);
  });
});

describe('deep understanding: each system forgets the user; writes need a reload and no hold', () => {
  const systems = [
    [importSilencePattern, getSilencePattern],
    [importRelationalNetwork, getRelationalNetwork],
    [importLifeRhythmProfile, getLifeRhythmProfile],
    [importResistanceProfile, getResistanceProfile],
    [importEnergyPattern, getEnergyPattern],
    [importSubconsciousProfile, getSubconsciousProfile],
    [importFlowProfile, getFlowProfile],
    [importRepairProfile, getRepairProfile],
    [importHopeProfile, getHopeProfile],
    [importChapterProfile, getChapterProfile],
  ] as unknown as [(p: unknown) => void, (userId: string) => unknown][];
  const marked = (userId: string) =>
    systems.map(([, get]) => JSON.stringify(get(userId) ?? null).includes('held-call-marker'));

  it('after a purge, no system has an entry for the user', () => {
    const userId = user();
    for (const [put] of systems) put({ userId, note: 'held-call-marker' });
    expect(marked(userId).every(Boolean)).toBe(true);
    purgeHeldUser(userId);
    expect(marked(userId)).toEqual(systems.map(() => false));
  });

  it('a live owner session writes only after it reloads from storage', async () => {
    const userId = user();
    await loadDeepUnderstandingProfiles(userId);
    purgeHeldUser(userId);
    expect((await saveDeepUnderstandingProfiles(userId)).saved).toEqual([]); // not reloaded yet
    expect(writesFor(userId)).toEqual([]);
    await loadDeepUnderstandingProfiles(userId);
    expect((await saveDeepUnderstandingProfiles(userId)).saved.length).toBeGreaterThan(0);
  });

  it('a hold that starts after the 3rd write stops the remaining writes', async () => {
    const userId = user();
    await loadDeepUnderstandingProfiles(userId);
    afterWrite.set(userId, (count) => void (count === 3 && hold(userId)));
    await saveDeepUnderstandingProfiles(userId);
    afterWrite.delete(userId);
    expect(writesFor(userId)).toHaveLength(3);
  });

  it('a purge (and a reload) after the 3rd write stops the save that began before it', async () => {
    const userId = user();
    await loadDeepUnderstandingProfiles(userId);
    afterWrite.set(userId, async (count) => {
      if (count !== 3) return;
      purgeHeldUser(userId);
      await loadDeepUnderstandingProfiles(userId); // loaded again: only the generation stops it
    });
    await saveDeepUnderstandingProfiles(userId);
    afterWrite.delete(userId);
    expect(writesFor(userId)).toHaveLength(3);
  });

  it("a held user's write is refused at write time", async () => {
    const userId = user();
    await loadDeepUnderstandingProfiles(userId);
    hold(userId);
    expect((await saveDeepUnderstandingProfiles(userId)).saved).toEqual([]);
    expect(writesFor(userId)).toEqual([]);
  });
});

describe('engagement store', () => {
  it('a held caller: the profile is neither cached nor written; predictions refused', async () => {
    const store = await getEngagementStore();
    const userId = user();
    hold(userId);
    await store.saveProfile({ userId, stats: {} } as never);
    expect(writesFor(userId)).toEqual([]);
    expect(
      (store as unknown as { memoryCache: Map<string, unknown> }).memoryCache.has(userId)
    ).toBe(false);
    expect(await store.savePrediction(userId, { id: 'p1' } as never)).toBe(false);
    await store.recordWeather(userId, { date: new Date().toISOString() } as never);
    expect(writesFor(userId)).toEqual([]);
  });

  it.each([
    [
      'addConversationSession',
      (st: Store, u: string) => st.addConversationSession(u, { summary: 'what they said' }),
    ],
    [
      'addInsightToLatestSession',
      (st: Store, u: string) => st.addInsightToLatestSession(u, 'what they said'),
    ],
    [
      'addHighlightToLatestSession',
      (st: Store, u: string) => st.addHighlightToLatestSession(u, 'what they said'),
    ],
    ['updateSessionMood', (st: Store, u: string) => st.updateSessionMood(u, 's1', 'stormy')],
  ] as const)('%s: refused for a held caller, written for an adult', async (_name, write) => {
    const store = await getEngagementStore();
    vi.spyOn(store, 'getConversationSessions').mockResolvedValue([{ id: 's1' }] as never);
    const [held, adult] = [user(), user()];
    hold(held);
    await write(store, held);
    await write(store, adult);
    expect(writesFor(held)).toEqual([]);
    expect(writesFor(adult).length).toBe(1);
  });

  it('the purge drops a cached profile (a held call may have changed it in place)', async () => {
    const store = await getEngagementStore();
    const userId = user();
    await store.saveProfile({ userId, stats: {} } as never); // cached, not held yet
    const cache = (store as unknown as { memoryCache: Map<string, unknown> }).memoryCache;
    expect(cache.has(userId)).toBe(true);
    purgeHeldUser(userId);
    await vi.waitFor(() => expect(cache.has(userId)).toBe(false));
  });
});
