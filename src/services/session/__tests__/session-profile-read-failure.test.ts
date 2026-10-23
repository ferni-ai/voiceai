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

const h = vi.hoisted(() => ({ store: null as unknown, cached: [] as unknown[] }));
vi.mock('../../data-layer/profile-cache.js', () => ({
  getProfileWithCache: async (uid: string, load: (u: string) => Promise<unknown>) => load(uid),
  cacheProfile: async (_uid: string, p: unknown) => void h.cached.push(p),
  invalidateProfile: async () => {},
}));
vi.mock('../../global-services.js', () => ({
  getGlobalServices: async () => ({ store: h.store }),
}));

const { FirestoreStore } = await import('../../../memory/storage/firestore-store.js');
const { resetCallStartReads } = await import('../../../utils/call-start-reads.js');
const { isUnsavedProfile, UnsavedProfileError } =
  await import('../../../memory/storage/profile-read-failure.js');
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

  it('a returning member loads as stored, with no write', async () => {
    const profile = await loadSessionProfile(store, UID, 'Dana');
    expect(profile.totalConversations).toBe(41);
    expect(profileWrites()).toEqual([]);
  });
});

describe('createSessionServices after a failed profile read', () => {
  it('the call runs; its end-of-call save is refused like any failed save, nothing reset', async () => {
    state.failReads?.add(PATH);
    const services = await createSessionServices({
      sessionId: 'sess-read-failure',
      userId: UID,
      deferProfileLoad: false,
    });
    expect(services.userProfile?.id).toBe(UID);

    await expect(services.saveProfile()).rejects.toBeInstanceOf(UnsavedProfileError);
    expect(profileWrites()).toEqual([]);
    expect(state.docs.get(PATH)).toMatchObject({ totalConversations: 41 });
  });
});
