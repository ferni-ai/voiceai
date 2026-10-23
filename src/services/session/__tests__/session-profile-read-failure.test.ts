/**
 * Session start never saves a default profile over one it failed to read.
 *
 * loadProfileForSession took a failed read for first contact: createUserProfile + saveProfile
 * (merge) on every call, so a returning member was reset and greeted as a stranger. Drives
 * loadSessionProfile and the real createSessionServices against a real FirestoreStore on the
 * merge fake; only the Redis profile cache is a pass-through.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
  type MergeFakeState,
} from '../../../tests/helpers/merge-fake-firestore.js';

const h = vi.hoisted(() => ({
  store: null as unknown,
  cached: [] as unknown[],
  autoSave: null as null | ((uid: string) => Promise<void>),
  autoSaveErrors: [] as unknown[],
  outreach: [] as unknown[],
}));
vi.mock('../../data-layer/profile-cache.js', () => ({
  getProfileWithCache: async (uid: string, load: (u: string) => Promise<unknown>) => load(uid),
  cacheProfile: async (_uid: string, p: unknown) => void h.cached.push(p),
  invalidateProfile: async () => {},
}));
vi.mock('../../global-services.js', () => ({
  getGlobalServices: async () => ({ store: h.store }),
}));
// The 30 s auto-save timer, captured so a test can run one tick.
vi.mock('../../intelligence-persistence.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  startAutoSave: (_uid: string, cb: (uid: string) => Promise<void>) => void (h.autoSave = cb),
}));
vi.mock('../../analytics/persistence-metrics.js', async (importOriginal) => {
  const actual = await importOriginal<{ persistenceMetrics: Record<string, unknown> }>();
  const metrics = Object.assign(Object.create(actual.persistenceMetrics as object), {
    recordAutoSave: (_s: string, _ms: number, error?: string) =>
      void (error && h.autoSaveErrors.push(error)),
  });
  return { ...actual, persistenceMetrics: metrics };
});
// A teardown step that runs after the profile save in endSession.
vi.mock('../../outreach/session-integration.js', () => ({
  analyzeSessionForOutreach: async (input: unknown) => {
    h.outreach.push(input);
    return { commitmentsFound: 0, triggersCreated: 0 };
  },
}));
vi.mock('../../../memory/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  summarizeWithLLM: async (sessionId: string) => ({
    id: `sum-${sessionId}`,
    sessionId,
    timestamp: new Date(),
    duration: 10,
    turnCount: 1,
    mainTopics: [],
    keyPoints: [],
    emotionalArc: '',
  }),
}));

const { FirestoreStore } = await import('../../../memory/storage/firestore-store.js');
const { resetCallStartReads } = await import('../../../utils/call-start-reads.js');
const { isUnsavedProfile } = await import('../../../memory/storage/profile-read-failure.js');
const { getHistoryTracker } = await import('../../../memory/index.js');
const { loadSessionProfile } = await import('../load-session-profile.js');
const { createSessionServices } = await import('../session-manager.js');

const UID = 'user-dana-20261001';
const PATH = `bogle_users/${UID}`;
const member = {
  id: UID,
  name: 'Dana',
  createdAt: '2026-10-01T09:00:00.000Z',
  totalConversations: 41,
  relationshipStage: 'trusted_friend',
};

let state: MergeFakeState;
let store: InstanceType<typeof FirestoreStore>;
const profileWrites = () => state.writes.filter((w) => w.path === PATH);

beforeEach(() => {
  resetCallStartReads();
  h.cached = [];
  h.autoSave = null;
  h.autoSaveErrors = [];
  h.outreach = [];
  state = newMergeFakeState();
  state.failReads = new Set();
  store = new FirestoreStore({ projectId: 'test-project' });
  Object.assign(store as unknown as Record<string, unknown>, {
    db: createMergeFakeFirestore(state),
    _initialized: true,
  });
  h.store = store;
  state.docs.set(PATH, structuredClone(member));
});

describe('loadSessionProfile', () => {
  it('a failed read: an unsaved stand-in for the call, nothing written or cached', async () => {
    state.failReads?.add(PATH);
    const profile = await loadSessionProfile(store, UID, 'Dana');

    expect(isUnsavedProfile(profile)).toBe(true);
    expect(profile.name).toBe('Dana');
    expect(profileWrites()).toEqual([]);
    expect(h.cached).toEqual([]);
    expect(state.docs.get(PATH)).toEqual(member);
  });

  it('first contact (no doc): created with the onboarding name and saved, as before', async () => {
    state.docs.delete(PATH);
    const profile = await loadSessionProfile(store, UID, 'Dana');

    expect(isUnsavedProfile(profile)).toBe(false);
    expect(state.docs.get(PATH)).toMatchObject({ id: UID, name: 'Dana', totalConversations: 0 });
    expect(h.cached).toHaveLength(1);
  });

  it('a programming error (TypeError) is rethrown, not taken for a failed read', async () => {
    const broken = {
      getProfileForWrite: async () => {
        throw new TypeError('store.getProfileForWrite is not a function');
      },
      saveProfile: async () => undefined,
    };
    await expect(loadSessionProfile(broken, UID, 'Dana')).rejects.toBeInstanceOf(TypeError);
  });

  it('a returning member loads as stored, with no write', async () => {
    const profile = await loadSessionProfile(store, UID, 'Dana');
    expect(profile.totalConversations).toBe(41);
    expect(profileWrites()).toEqual([]);
  });
});

describe('createSessionServices after a failed profile read', () => {
  async function standInSession(sessionId: string) {
    state.failReads?.add(PATH);
    const services = await createSessionServices({
      sessionId,
      userId: UID,
      deferProfileLoad: false,
    });
    expect(isUnsavedProfile(services.userProfile)).toBe(true);
    return services;
  }

  it('saveProfile skips the stand-in without throwing; nothing is written', async () => {
    const services = await standInSession('sess-read-failure');
    await services.saveProfile();
    expect(profileWrites()).toEqual([]);
    expect(state.docs.get(PATH)).toMatchObject({ totalConversations: 41 });
  });

  it('endSession skips the profile save but finishes teardown (outreach analysis runs)', async () => {
    const services = await standInSession('sess-read-failure-end');
    getHistoryTracker('sess-read-failure-end', UID).addUserTurn("I'll call my sister Tuesday.");
    await services.endSession();

    expect(profileWrites()).toEqual([]);
    expect(h.outreach).toHaveLength(1);
  });

  it('auto-save neither writes nor records a failure for a stand-in', async () => {
    await standInSession('sess-read-failure-autosave');
    await h.autoSave?.(UID);
    expect(h.autoSave).not.toBeNull();
    expect(profileWrites()).toEqual([]);
    expect(h.autoSaveErrors).toEqual([]);
  });
});
