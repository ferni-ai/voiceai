/**
 * PRIVACY: a per-user store never reads, caches or writes the shared
 * placeholder buckets (`anonymous`, `unknown`, `default`, `shared`, blank).
 *
 * Every caller without an id resolved to the same placeholder, so the store's
 * process cache and its Firestore doc `bogle_users/anonymous/...` handed one
 * caller's data to the next. A member's data is unaffected.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const docs = vi.hoisted(() => new Map<string, unknown>());
const reads = vi.hoisted(() => [] as string[]);

vi.mock('@google-cloud/firestore', () => {
  const ref = (path: string) => ({
    get: vi.fn(async () => {
      reads.push(path);
      return { exists: docs.has(path), data: () => structuredClone(docs.get(path)) };
    }),
    set: vi.fn(async (data: unknown) => void docs.set(path, structuredClone(data))),
    delete: vi.fn(async () => void docs.delete(path)),
    collection: (sub: string) => ({ doc: (id: string) => ref(`${path}/${sub}/${id}`) }),
  });
  return {
    Firestore: vi.fn(function FirestoreMock() {
      return {
        collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
        batch: () => {
          const ops: Array<() => Promise<void>> = [];
          return {
            set: (r: { set: (d: unknown) => Promise<void> }, d: unknown) =>
              ops.push(() => r.set(d)),
            commit: async () => void (await Promise.all(ops.map((op) => op()))),
          };
        },
      };
    }),
  };
});

import { createPersistenceStore, type PersistenceStore } from '../index.js';

interface Notes {
  notes: string[];
}

let store: PersistenceStore<Notes>;

beforeEach(() => {
  docs.clear();
  reads.length = 0;
  store = createPersistenceStore<Notes>({ collection: 'notes_test', syncIntervalMs: 60_000 });
});

afterEach(async () => {
  await store.shutdown();
});

describe('per-user store and the shared placeholder buckets', () => {
  it('two callers without an id never see each other through the store', async () => {
    store.set('anonymous', { notes: ['caller one: my diagnosis'] });
    await store.setImmediate('anonymous', { notes: ['caller one: my diagnosis'] });
    await store.flush();

    expect(await store.get('anonymous')).toBeNull();
    expect(await store.load('anonymous', { fresh: true })).toBeNull();
    expect([...docs.keys()]).toEqual([]);
  });

  it('never reads an existing shared doc, whatever the casing or padding', async () => {
    docs.set('bogle_users/unknown/notes_test/data', { notes: ['someone else'] });
    docs.set('bogle_users/anonymous/notes_test/data', { notes: ['someone else'] });

    docs.set('bogle_users/anon/notes_test/data', { notes: ['someone else'] });
    for (const id of [
      'unknown',
      ' Anonymous ',
      'default',
      'shared',
      '',
      'anon',
      'session',
      'gateway',
      'gateway-recovery',
    ]) {
      expect(await store.load(id)).toBeNull();
      expect(await store.get(id)).toBeNull();
    }
    expect(reads).toEqual([]);
  });

  it('never deletes a shared doc: removing one is a human decision', async () => {
    docs.set('bogle_users/anonymous/notes_test/data', { notes: ['kept'] });
    await store.delete('anonymous');
    await store.delete('anon');
    expect(docs.has('bogle_users/anonymous/notes_test/data')).toBe(true);

    await store.setImmediate('uid-member', { notes: ['mine'] });
    await store.delete('uid-member');
    expect(docs.has('bogle_users/uid-member/notes_test/data')).toBe(false);
  });

  it("keeps a member's data and a per-call anon: id's data as before", async () => {
    store.set('uid-member', { notes: ['mine'] });
    store.set('anon:1234', { notes: ['this call only'] });
    await store.flush();

    expect(await store.get('uid-member')).toEqual({ notes: ['mine'] });
    expect(docs.get('bogle_users/uid-member/notes_test/data')).toMatchObject({ notes: ['mine'] });
    expect(await store.get('anon:1234')).toEqual({ notes: ['this call only'] });
  });
});
