/**
 * The real createSessionServices: the prompt reads the counted sessions, and no
 * write of the call's profile lowers the stored counter.
 *
 * Before: with 41 stored and 3 counted, load replaced the counter with 3 and the
 * 30 s auto-save wrote it to the user doc; only the end save put 41 back (writes
 * [3, 41]). A crash between them left 3, the next call's floor. And the end save
 * wrote 41, not 42, so the stored counter stopped advancing.
 *
 * Fakes: Firestore (merge fake under a real FirestoreStore), the Redis profile
 * cache (pass-through), the sessions-together read, the auto-save timer, the
 * summary model.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
  type MergeFakeState,
} from '../../../tests/helpers/merge-fake-firestore.js';

const h = vi.hoisted(() => ({
  store: null as unknown,
  loaded: [] as Array<{ totalConversations: number }>,
  counted: 3,
  autoSave: null as null | ((uid: string) => Promise<void>),
}));
vi.mock('../../data-layer/profile-cache.js', () => ({
  // The object the cache would hand the next reader: recorded to check it is not changed
  getProfileWithCache: async (uid: string, load: (u: string) => Promise<unknown>) => {
    const profile = (await load(uid)) as { totalConversations: number };
    h.loaded.push(profile);
    return profile;
  },
  cacheProfile: async () => {},
  invalidateProfile: async () => {},
}));
vi.mock('../../global-services.js', () => ({
  getGlobalServices: async () => ({ store: h.store }),
}));
vi.mock('../../stores/sessions-together.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../stores/sessions-together.js')>();
  return {
    ...actual,
    getSessionsTogether: async () => ({ ...actual.summarizeSessions([]), count: h.counted }),
  };
});
vi.mock('../../intelligence-persistence.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  startAutoSave: (_uid: string, cb: (uid: string) => Promise<void>) => void (h.autoSave = cb),
}));
vi.mock('../../outreach/session-integration.js', () => ({
  analyzeSessionForOutreach: async () => ({ commitmentsFound: 0, triggersCreated: 0 }),
}));
vi.mock('../../../memory/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  summarizeWithLLM: async (sessionId: string) => ({
    id: `sum-${sessionId}`,
    sessionId,
    timestamp: new Date(),
    duration: 10,
    turnCount: 2,
    mainTopics: [],
    keyPoints: [],
    emotionalArc: '',
  }),
}));

const { FirestoreStore } = await import('../../../memory/storage/firestore-store.js');
const { resetCallStartReads } = await import('../../../utils/call-start-reads.js');
const { createSessionServices } = await import('../session-manager.js');
const { createUserProfile } = await import('../../../types/user-profile.js');

const UID = 'user-sessions-together-save';
const PATH = `bogle_users/${UID}`;

let state: MergeFakeState;
/** totalConversations of every write to the user doc that carried it, in order. */
const counterWrites = () =>
  state.writes
    .filter((w) => w.path === PATH)
    .map((w) => (w.data as Record<string, unknown> | undefined)?.totalConversations)
    .filter((n) => n !== undefined);
const storedCounter = () => (state.docs.get(PATH) as Record<string, unknown>).totalConversations;

function setUp(stored: number, counted: number) {
  h.counted = counted;
  const profile = { ...createUserProfile(UID, 'Robin'), totalConversations: stored };
  state.docs.set(PATH, JSON.parse(JSON.stringify(profile)));
}

async function startCall(sessionId: string) {
  return createSessionServices({ sessionId, userId: UID, deferProfileLoad: false });
}

beforeEach(() => {
  resetCallStartReads();
  h.loaded = [];
  h.autoSave = null;
  state = newMergeFakeState();
  const store = new FirestoreStore({ projectId: 'test-project' });
  Object.assign(store as unknown as Record<string, unknown>, {
    db: createMergeFakeFirestore(state),
    _initialized: true,
  });
  h.store = store;
});

describe('sessions together through the real createSessionServices', () => {
  it('the prompt reads the counted sessions; the loaded (cached) profile keeps the stored 41', async () => {
    setUp(41, 3);
    const services = await startCall('sess-together-prompt');
    expect(services.userProfile?.totalConversations).toBe(3);
    expect(h.loaded.map((p) => p.totalConversations)).toEqual([41]);
  });

  it('stored 41, counted 3: auto-save then the end save write [41, 42], never 3', async () => {
    setUp(41, 3);
    const services = await startCall('sess-together-41-3');
    expect(h.autoSave).not.toBeNull();
    await h.autoSave!(UID);
    expect(storedCounter()).toBe(41); // a crash here leaves 41, not 3

    services.addTurn('user', 'Back again, the garden is finally blooming');
    services.addTurn('assistant', 'Tell me everything.');
    await services.endSession();

    expect(counterWrites()).toEqual([41, 42]);
    expect(storedCounter()).toBe(42);
    expect(Math.min(...(counterWrites() as number[]))).toBeGreaterThanOrEqual(41);
  });

  // endSession starts again from the profile as loaded, so the end save also writes 42 (as on main)
  it('a mid-call saveProfile (a name saved) then the end: [42, 42], never below 41', async () => {
    setUp(41, 3);
    const services = await startCall('sess-together-mid-save');
    await services.saveProfile();
    services.addTurn('user', 'Call me Robin, by the way');
    await services.endSession();
    expect(counterWrites()).toEqual([42, 42]);
  });

  it('stored 21, counted 30: the stored counter catches up, then advances (31)', async () => {
    setUp(21, 30);
    const services = await startCall('sess-together-21-30');
    expect(services.userProfile?.totalConversations).toBe(30);
    await h.autoSave!(UID);
    services.addTurn('user', 'Morning!');
    await services.endSession();
    expect(counterWrites()).toEqual([30, 31]);
  });
});
