/**
 * FirestoreStore.saveProfile never recreates an erased account's record, and still
 * creates a brand-new caller's (#2966).
 *
 * Before: saveProfile set bogle_users/{uid} with merge whatever the record's state, so the
 * end-of-call save of a profile loaded at call start brought the record back after an
 * erasure during the call, and the engagement guard then took the person for live.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUserProfile, type UserProfile } from '../../../types/user-profile.js';
import { erasingMark } from '../../../utils/erasing-mark.js';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
  type MergeFakeState,
} from '../../../tests/helpers/merge-fake-firestore.js';

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', () => ({ createLogger: () => log, getLogger: () => log }));

const UID = 'Pc4Wn8Rk2Tz6Lm1Qx9Vb3Hy7Js5D';
const RECORD = `bogle_users/${UID}`;

let state: MergeFakeState;
let store: {
  saveProfile: (p: UserProfile) => Promise<void>;
  getOrCreateProfile: (id: string) => Promise<UserProfile>;
};

beforeEach(async () => {
  vi.clearAllMocks();
  state = newMergeFakeState();
  const { FirestoreStore } = await import('../firestore-store.js');
  const s = new FirestoreStore({ projectId: 'test-project' });
  Object.assign(s as unknown as Record<string, unknown>, {
    db: createMergeFakeFirestore(state),
    _initialized: true,
  });
  store = s;
});

/** The profile a call loaded at its start, after the call counted itself */
const afterACall = (): UserProfile => ({
  ...createUserProfile(UID, 'Robin'),
  totalConversations: 4,
});

describe('saveProfile and account erasure', () => {
  it("a brand-new caller's first save creates their record (call start)", async () => {
    expect(state.docs.has(RECORD)).toBe(false);

    await store.saveProfile(createUserProfile(UID, 'Robin'));

    expect(state.docs.get(RECORD)).toMatchObject({ id: UID, name: 'Robin', totalConversations: 0 });
  });

  it('getOrCreateProfile still creates a first-time visitor', async () => {
    await store.getOrCreateProfile(UID);

    expect(state.docs.has(RECORD)).toBe(true);
  });

  it('the end-of-call save writes nothing once the account was erased mid-call', async () => {
    await store.saveProfile(afterACall());

    expect(state.docs.has(RECORD)).toBe(false);
    expect(log.info).toHaveBeenCalledWith(
      { userId: UID },
      'Profile write dropped: the account is erased'
    );
  });

  it('nothing is written while an erasure is running, even for a fresh profile', async () => {
    state.docs.set(RECORD, { id: UID, name: 'Robin', ...erasingMark() });

    await store.saveProfile(createUserProfile(UID, 'Robin'));
    await store.saveProfile(afterACall());

    expect(state.docs.get(RECORD)).not.toHaveProperty('totalConversations'); // nothing merged in
    expect(state.docs.get(RECORD)).toMatchObject({ erasing: true });
  });

  it('a live record still takes the end-of-call save', async () => {
    state.docs.set(RECORD, { id: UID, name: 'Robin', totalConversations: 3 });

    await store.saveProfile(afterACall());

    expect(state.docs.get(RECORD)).toMatchObject({ totalConversations: 4 });
  });
});
