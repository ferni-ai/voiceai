/**
 * The end-of-call profile save must not put a disconnected token back.
 *
 * session-manager saves a profile it loaded at call start (updateProfileFromSession
 * spreads it), and saveProfile writes with merge:true. Without stripping, a
 * LinkedIn or biometrics disconnect made during the call was undone at hang-up.
 */
import { describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '../../../types/user-profile.js';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
} from '../../../tests/helpers/merge-fake-firestore.js';

const h = vi.hoisted(() => ({ store: null as unknown }));
vi.mock('../../store-factory.js', () => ({ getStore: async () => h.store }));

describe('FirestoreStore.saveProfile and profile token fields', () => {
  it('a stale whole-profile save after a disconnect leaves the token fields gone', async () => {
    const state = newMergeFakeState();
    const { FirestoreStore } = await import('../firestore-store.js');
    const store = new FirestoreStore({ projectId: 'test-project' });
    Object.assign(store as unknown as Record<string, unknown>, {
      db: createMergeFakeFirestore(state),
      _initialized: true,
    });
    h.store = store;
    state.docs.set('bogle_users/u1', {
      id: 'u1',
      name: 'fixture',
      createdAt: '2026-01-03T21:23:55.641Z',
      firstContact: '2026-01-03T21:23:55.641Z',
      lastContact: '2026-10-11T13:08:55.843Z',
      totalConversations: 3,
      linkedInTokens: { encrypted: 'sealed-li' },
      biometricTokens: { encrypted: 'sealed-bio' },
    });

    // Call start: the session caches the profile, token fields included.
    const stale = (await store.getProfile('u1')) as UserProfile;
    expect(stale).toHaveProperty('linkedInTokens');

    // Mid-call: the user disconnects both.
    const { writeProfileTokenField } =
      await import('../../../services/identity/profile-token-field.js');
    await writeProfileTokenField('u1', 'linkedInTokens', null);
    await writeProfileTokenField('u1', 'biometricTokens', null);

    // Hang-up: the stale profile is saved with a changed counter.
    await store.saveProfile({ ...stale, totalConversations: 4 });

    const doc = state.docs.get('bogle_users/u1');
    expect(doc).not.toHaveProperty('linkedInTokens');
    expect(doc).not.toHaveProperty('biometricTokens');
    expect(doc?.totalConversations).toBe(4);

    // Connecting still works: only profile-token-field writes the field.
    await writeProfileTokenField('u1', 'linkedInTokens', { encrypted: 'sealed-new' });
    await store.saveProfile({ ...stale, totalConversations: 5 });
    expect(state.docs.get('bogle_users/u1')?.linkedInTokens).toEqual({ encrypted: 'sealed-new' });
  });
});
