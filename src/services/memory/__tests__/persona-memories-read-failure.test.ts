/**
 * A failed profile read must never be taken for "no persona memories yet".
 *
 * loadMemoriesForUser read with getProfile, which answers null on a read error
 * and on a real not-found alike, and marked the user loaded either way. Once
 * the read recovered, the next save wrote [new] over every stored memory. It
 * now loads with getProfileStrict: a read error leaves the user unloaded,
 * holds back saves, and the next load (or the save itself) retries the read; a
 * profile with no memories still loads as empty.
 *
 * Firestore is the in-memory merge fake (reads of a path can be made to fail);
 * FirestoreStore, the profile store and persona-memories are real. Every
 * assertion reads the stored document.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
  type MergeFakeState,
} from '../../../tests/helpers/merge-fake-firestore.js';

const h = vi.hoisted(() => ({ store: null as unknown }));
vi.mock('../../../memory/storage/store-factory.js', () => ({ getStore: async () => h.store }));

const { FirestoreStore } = await import('../../../memory/storage/firestore-store.js');
const { resetCallStartReads } = await import('../../../utils/call-start-reads.js');
const memories = await import('../persona-memories.js');

const PATH = 'bogle_users/u1';
const NOW = '2026-10-01T09:00:00.000Z';
const storedMemory = {
  id: 'mem_old',
  type: 'preference',
  name: 'oat milk',
  tags: ['preference'],
  createdAt: NOW,
  timesReferenced: 2,
};
const profileDoc = (personaMemories?: Record<string, unknown>) => ({
  id: 'u1',
  name: 'fixture',
  createdAt: NOW,
  ...(personaMemories && { personaMemories }),
});

let state: MergeFakeState;

/** The names of the Ferni memories in the stored document. */
function stored(): string[] {
  const pm = state.docs.get(PATH)?.personaMemories as
    { jackie?: Array<{ name: string }> } | undefined;
  return (pm?.jackie ?? []).map((m) => m.name).sort();
}

beforeEach(() => {
  vi.stubEnv('PERSIST_AGENT_PROFILES', 'true');
  resetCallStartReads();
  memories.clearAllMemoriesCache();
  state = newMergeFakeState();
  state.failReads = new Set();
  const store = new FirestoreStore({ projectId: 'test-project' });
  Object.assign(store as unknown as Record<string, unknown>, {
    db: createMergeFakeFirestore(state),
    _initialized: true,
  });
  h.store = store;
  state.docs.set(PATH, profileDoc({ jackie: [storedMemory] }));
});

describe('persona memories never save over a profile they failed to read', () => {
  it('(a) a read error holds back saves while the read keeps failing: nothing is written', async () => {
    state.failReads?.add(PATH);
    await memories.rememberPreference('u1', 'black coffee');

    expect(state.writes.filter((w) => w.path === PATH)).toEqual([]);
    expect(stored()).toEqual(['oat milk']);
  });

  it('(a) a read error, then the read recovers before the save: the stored memories survive', async () => {
    state.failReads?.add(PATH);
    await memories.rememberPreference('u1', 'black coffee');
    state.failReads?.clear();
    await memories.saveMemoriesForUser('u1'); // e.g. the session-end save

    expect(stored()).toEqual(['black coffee', 'oat milk']);
  });

  it('(b) a profile with no memories yet loads as empty and the save writes', async () => {
    state.docs.set(PATH, profileDoc());
    expect(await memories.getAllUserMemories('u1')).toEqual([]);
    await memories.rememberPreference('u1', 'black coffee');

    expect(stored()).toEqual(['black coffee']);
  });

  it('(c) a good read loads the stored memories and the save keeps them', async () => {
    const loaded = await memories.getAllUserMemories('u1');
    expect(loaded.map((m) => m.name)).toEqual(['oat milk']);
    await memories.rememberPreference('u1', 'black coffee');

    expect(stored()).toEqual(['black coffee', 'oat milk']);
  });

  it('(d) after a failed read the next load retries, and once it succeeds saving resumes', async () => {
    state.failReads?.add(PATH);
    expect(await memories.getAllUserMemories('u1')).toEqual([]);
    state.failReads?.clear();

    const retried = await memories.getAllUserMemories('u1');
    expect(retried.map((m) => m.name)).toEqual(['oat milk']);
    await memories.rememberPreference('u1', 'black coffee');

    expect(stored()).toEqual(['black coffee', 'oat milk']);
  });
});
