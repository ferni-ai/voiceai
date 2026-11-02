/**
 * One root-doc read per call start, shared by the store and the language check.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const rootDocs = new Map<string, Record<string, unknown>>();
  const get = vi.fn(async (id: string) => {
    const data = rootDocs.get(id);
    return { exists: data !== undefined, data: () => (data ? structuredClone(data) : undefined) };
  });
  // A merge write, as Firestore does it (top-level fields only, enough here)
  const set = vi.fn(
    async (id: string, data: Record<string, unknown>, opts?: { merge?: boolean }) => {
      rootDocs.set(id, opts?.merge ? { ...(rootDocs.get(id) ?? {}), ...data } : data);
    }
  );
  const db = {
    runTransaction: async (fn: never) =>
      (await import('../../../tests/helpers/fake-transaction.js')).fakeRunTransaction(fn),
    collection: (_name: string) => ({
      doc: (id: string) => ({
        get: () => get(id),
        set: (data: Record<string, unknown>, opts?: { merge?: boolean }) => set(id, data, opts),
        delete: vi.fn(async () => undefined),
        collection: () => ({}),
      }),
    }),
  };
  return { rootDocs, get, set, db };
});

vi.mock('../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fake.db,
}));

import { FirestoreStore } from '../firestore-store.js';
import { createUserProfile, type UserProfile } from '../../../types/user-profile.js';
import {
  openCallStartReadWindow,
  readUserDocOnce,
  resetCallStartReads,
} from '../../../utils/call-start-reads.js';
import {
  loadUserLanguagePreference,
  persistUserLanguagePreference,
} from '../../../services/language/language-service.js';

function storeWithFakeDb(): FirestoreStore {
  const store = new FirestoreStore({ projectId: 'test', databaseId: 'test' });
  Object.assign(store, { db: fake.db, _initialized: true });
  return store;
}

function seed(store: FirestoreStore, userId: string): void {
  const profile = createUserProfile(userId, 'Ana');
  const serialized = (
    store as unknown as { serializeForFirestore(p: UserProfile): Record<string, unknown> }
  ).serializeForFirestore(profile);
  fake.rootDocs.set(userId, { ...serialized, preferences: { spokenLanguage: 'es' } });
}

describe('call-start root-doc reads', () => {
  beforeEach(() => {
    resetCallStartReads();
    fake.rootDocs.clear();
    fake.get.mockClear();
  });
  afterEach(() => resetCallStartReads());

  it('reads the root doc once for every call-start reader, each with its own copy', async () => {
    const store = storeWithFakeDb();
    seed(store, 'u-dedupe');
    openCallStartReadWindow();

    // identify, session profile load, warm-up, intelligent loader, then the language check
    const profiles = await Promise.all([1, 2, 3, 4].map(() => store.getProfile('u-dedupe')));
    const language = await loadUserLanguagePreference('u-dedupe');

    expect(fake.get).toHaveBeenCalledTimes(1);
    expect(language).toBe('es');
    expect(profiles.every((p) => p?.name === 'Ana')).toBe(true);
    expect(profiles[0]).not.toBe(profiles[1]);
    profiles[0]!.name = 'changed by one reader';
    expect(profiles[1]!.name).toBe('Ana');
  });

  it('reads again after the profile is saved, and returns the saved value', async () => {
    const store = storeWithFakeDb();
    seed(store, 'u-save');
    openCallStartReadWindow();

    const before = await store.getProfile('u-save');
    expect(before?.name).toBe('Ana');
    await store.saveProfile({ ...before!, name: 'Ana Maria' });
    const after = await store.getProfile('u-save');

    expect(after?.name).toBe('Ana Maria');
    // the read before, the save's own erasure check (profile-write-unless-erased.ts), the read after
    expect(fake.get).toHaveBeenCalledTimes(3);
  });

  it('reads again after a language preference is saved', async () => {
    const store = storeWithFakeDb();
    seed(store, 'u-lang');
    openCallStartReadWindow();

    await store.getProfile('u-lang');
    await persistUserLanguagePreference('u-lang', 'fr');
    const after = (await store.getProfile('u-lang')) as {
      preferences?: { spokenLanguage?: string };
    };

    expect(after.preferences?.spokenLanguage).toBe('fr');
    expect(fake.get).toHaveBeenCalledTimes(2);
  });

  it('gives every raw-doc reader its own deep copy', async () => {
    openCallStartReadWindow();
    const doc = { preferences: { spokenLanguage: 'es' } };
    const ref = { get: vi.fn(async () => ({ data: () => doc })) };

    const [a, b] = await Promise.all([
      readUserDocOnce('u-raw', ref),
      readUserDocOnce('u-raw', ref),
    ]);

    expect(ref.get).toHaveBeenCalledTimes(1);
    a!.preferences.spokenLanguage = 'changed by one reader';
    expect(b!.preferences.spokenLanguage).toBe('es');
    expect(doc.preferences.spokenLanguage).toBe('es');
  });

  it('outside a call-start window every read goes to Firestore, as before', async () => {
    const store = storeWithFakeDb();
    seed(store, 'u-api');

    await store.getProfile('u-api');
    await store.getProfile('u-api');

    expect(fake.get).toHaveBeenCalledTimes(2);
  });

  it('does not keep a failed read', async () => {
    const store = storeWithFakeDb();
    seed(store, 'u-flaky');
    openCallStartReadWindow();
    fake.get.mockRejectedValueOnce(new Error('UNAVAILABLE'));

    expect(await store.getProfile('u-flaky')).toBeNull();
    expect((await store.getProfile('u-flaky'))?.name).toBe('Ana');
    expect(fake.get).toHaveBeenCalledTimes(2);
  });
});
