/**
 * A failed profile read never becomes a saved default profile.
 *
 * getOrCreateProfile took FirestoreStore.getProfile's null (answered on a read error and on a
 * real not-found alike) for a new user and merge-saved createUserProfile's defaults over the
 * member's doc: totalConversations 0, familyMembers [], relationshipStage 'new_acquaintance'.
 * The trial read the profile twice, so a failed first read paired a 0 ms trial state with a good
 * profile and reset the trial.
 *
 * Firestore is the in-memory merge fake (reads of a path can fail); FirestoreStore and the trial
 * service are real. Every assertion reads the stored document or the write log.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
  type MergeFakeState,
} from '../../../tests/helpers/merge-fake-firestore.js';

const { FirestoreStore } = await import('../firestore-store.js');
const { InMemoryStore } = await import('../in-memory-store.js');
const { setStore, resetStore } = await import('../store-factory.js');
const { resetCallStartReads } = await import('../../../utils/call-start-reads.js');
const { UnsavedProfileError, isUnsavedProfile } = await import('../profile-read-failure.js');
const { recordTrialTime, markTrialConverted } =
  await import('../../../services/billing/first-taste-trial.js');

const PATH = 'bogle_users/u1';
const NOW = '2026-10-01T09:00:00.000Z';
const member = {
  id: 'u1',
  name: 'Dana',
  createdAt: NOW,
  totalConversations: 41,
  relationshipStage: 'trusted_friend',
  familyMembers: [{ name: 'Sam', relationship: 'son' }],
  trialState: { trialStarted: true, trialTimeUsedMs: 240_000, trialCompleted: false },
};

let state: MergeFakeState;
let store: InstanceType<typeof FirestoreStore>;

const profileWrites = () => state.writes.filter((w) => w.path === PATH);
/** The next `n` reads of the member's doc throw UNAVAILABLE, later ones succeed. */
function failNextReads(n: number): void {
  let left = n;
  state.failReads = { has: (p: string) => p === PATH && left-- > 0 } as unknown as Set<string>;
}

beforeEach(() => {
  resetCallStartReads();
  state = newMergeFakeState();
  store = new FirestoreStore({ projectId: 'test-project' });
  Object.assign(store as unknown as Record<string, unknown>, {
    db: createMergeFakeFirestore(state),
    _initialized: true,
  });
  resetStore();
  setStore(store);
  state.docs.set(PATH, structuredClone(member));
});

describe('getOrCreateProfile after a failed read', () => {
  it('creates and saves nothing, and answers a stand-in the store refuses to save', async () => {
    failNextReads(Infinity);
    const profile = await store.getOrCreateProfile('u1', 'Dana');

    expect(isUnsavedProfile(profile)).toBe(true);
    expect(profileWrites()).toEqual([]);
    // A caller that edits and saves it (a spread keeps the mark) is refused, and nothing lands.
    await expect(store.saveProfile({ ...profile, name: 'Dana R' })).rejects.toBeInstanceOf(
      UnsavedProfileError
    );
    expect(profileWrites()).toEqual([]);
    expect(state.docs.get(PATH)).toMatchObject({ totalConversations: 41, familyMembers: [{}] });
  });

  it('every backend refuses the stand-in, the in-memory store too', async () => {
    failNextReads(Infinity);
    const standIn = await store.getOrCreateProfile('u1');
    const memory = new InMemoryStore();
    await expect(memory.saveProfile(standIn)).rejects.toBeInstanceOf(UnsavedProfileError);
    expect(await memory.getProfile('u1')).toBeNull();
  });
});

describe('getOrCreateProfile keeps working when the read succeeds', () => {
  it('a first-time user (no doc) is created and saved as before', async () => {
    state.docs.delete(PATH);
    const profile = await store.getOrCreateProfile('u1', 'Dana');

    expect(isUnsavedProfile(profile)).toBe(false);
    expect(profileWrites()).toHaveLength(1);
    expect(state.docs.get(PATH)).toMatchObject({ id: 'u1', name: 'Dana', totalConversations: 0 });
  });

  it('a stored member comes back as stored, with no write', async () => {
    const profile = await store.getOrCreateProfile('u1');
    expect(profile).toMatchObject({ totalConversations: 41, relationshipStage: 'trusted_friend' });
    expect(profileWrites()).toEqual([]);
  });

  it('a doc first written by a direct writer (no id) is repaired, its fields kept, and saves', async () => {
    state.docs.set(PATH, { language: 'es', smsOptIn: true });
    const profile = await store.getOrCreateProfile('u1');

    expect(isUnsavedProfile(profile)).toBe(false);
    expect(profile).toMatchObject({ id: 'u1', language: 'es', smsOptIn: true });
    await store.saveProfile(profile);
    expect(state.docs.get(PATH)).toMatchObject({ id: 'u1', language: 'es', smsOptIn: true });
    expect(await store.getProfileStrict('u1')).toMatchObject({ id: 'u1', language: 'es' });
  });
});

describe('trial state after a failed read', () => {
  it('a failed first read no longer resets the trial: nothing is written', async () => {
    failNextReads(1);
    await recordTrialTime('u1', 60_000);
    expect(profileWrites()).toEqual([]);
    expect(state.docs.get(PATH)?.trialState).toMatchObject({ trialTimeUsedMs: 240_000 });
  });

  it('a good read adds the session to the stored time', async () => {
    const after = await recordTrialTime('u1', 60_000);
    expect(after.trialTimeUsedMs).toBe(300_000);
    expect(state.docs.get(PATH)?.trialState).toMatchObject({ trialTimeUsedMs: 300_000 });
  });

  it('a failed read while marking converted writes nothing; a good one keeps the time used', async () => {
    failNextReads(1);
    await markTrialConverted('u1');
    expect(profileWrites()).toEqual([]);

    await markTrialConverted('u1');
    expect(state.docs.get(PATH)?.trialState).toMatchObject({
      trialTimeUsedMs: 240_000,
      convertedDuringTrial: true,
    });
  });

  it('a first-time user still gets a profile with their trial time', async () => {
    state.docs.delete(PATH);
    await recordTrialTime('u1', 60_000);
    expect(state.docs.get(PATH)).toMatchObject({
      id: 'u1',
      trialState: { trialTimeUsedMs: 60_000 },
    });
  });
});
