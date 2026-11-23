/**
 * learnTemporalPattern never makes a user doc with no profile in it (#4293).
 *
 * It merged `temporalPatterns` into bogle_users/{id} whether or not the doc existed, so a caller
 * with no profile under that id (prod: `device:` ids) got a doc holding only temporalPatterns,
 * which failed the stored-profile check on every later read. With DEVICE_PROFILE_PARTIAL_REPAIR
 * on, a caller with no doc is skipped; a stored profile is still updated.
 *
 * Firestore is the in-memory merge fake; learnTemporalPattern and FirestoreStore are real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
  type MergeFakeState,
} from '../../../../tests/helpers/merge-fake-firestore.js';

const fake = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../../../utils/firebase-admin-app.js', () => ({
  getAdminFirestore: () => fake.db,
}));

const { learnTemporalPattern } = await import('../temporal-intelligence.js');
const { FirestoreStore } = await import('../../../../memory/storage/firestore-store.js');
const { resetCallStartReads } = await import('../../../../utils/call-start-reads.js');

const UID = 'device:test-0102';
const PATH = `bogle_users/${UID}`;

let state: MergeFakeState;

beforeEach(() => {
  resetCallStartReads();
  state = newMergeFakeState();
  fake.db = createMergeFakeFirestore(state);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function storeOverFake(): InstanceType<typeof FirestoreStore> {
  const store = new FirestoreStore({ projectId: 'test-project' });
  Object.assign(store as unknown as Record<string, unknown>, { db: fake.db, _initialized: true });
  return store;
}

describe('learnTemporalPattern for a caller with no user doc', () => {
  it('flag on: writes nothing, so no partial profile doc appears', async () => {
    vi.stubEnv('DEVICE_PROFILE_PARTIAL_REPAIR', 'on');

    await learnTemporalPattern(UID);

    expect(state.docs.has(PATH)).toBe(false);
    expect(state.writes).toEqual([]);
  });

  it('flag off: creates the doc with only temporalPatterns, which reads as no profile (as before)', async () => {
    vi.stubEnv('DEVICE_PROFILE_PARTIAL_REPAIR', 'off');

    await learnTemporalPattern(UID);

    expect(Object.keys(state.docs.get(PATH) ?? {})).toEqual(['temporalPatterns']);
    expect(await storeOverFake().getProfile(UID)).toBeNull();
  });
});

describe('learnTemporalPattern for a caller with a stored profile', () => {
  it('flag on: still merges temporalPatterns into the profile', async () => {
    vi.stubEnv('DEVICE_PROFILE_PARTIAL_REPAIR', 'on');
    state.docs.set(PATH, { id: UID, name: 'Robin Testcase', totalConversations: 3 });

    await learnTemporalPattern(UID);

    const doc = state.docs.get(PATH) as Record<string, unknown>;
    expect(doc).toMatchObject({ id: UID, name: 'Robin Testcase', totalConversations: 3 });
    expect(doc.temporalPatterns).toMatchObject({ preferredTimes: { preferenceStrength: 0.1 } });
  });
});
