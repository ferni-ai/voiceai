/**
 * MINOR_CARE purge coverage beyond the stores in minor-care-purge.test.ts: per-user in-memory
 * state that a held call fills and a later write would flush.
 * - the trust systems session cleanup saves through saveSystemData (thinking, tonal, curiosity,
 *   persona growth): purged;
 * - the engagement store: a held caller's profile is neither cached nor written, ritual and
 *   prediction writes are refused, and the purge drops the cached profile.
 * Only Firestore is faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stored = vi.hoisted(() => [] as { path: string; data: unknown }[]);
const fakeDb = vi.hoisted(() => {
  const empty = { exists: false, empty: true, docs: [], size: 0, data: () => undefined };
  const ref = (path: string): Record<string, unknown> =>
    new Proxy(
      {
        path,
        collection: (name: string) => ref(`${path}/${name}`),
        doc: (id = 'auto') => ref(`${path}/${id}`),
        get: async () => empty,
        set: async (data: unknown) => void stored.push({ path, data }),
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
