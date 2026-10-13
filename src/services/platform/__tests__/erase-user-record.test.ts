import { describe, expect, it, vi } from 'vitest';
import {
  assertErasableUserId,
  eraseUserRecord,
  findUserRecordRemnants,
} from '../erase-user-record.js';
import type { OwnedStore } from '../user-stores.js';

vi.mock('../../identity/firebase-auth.js', () => ({ ensureFirebaseAdmin: () => false }));

const STORES: OwnedStore[] = [
  { collection: 'bogle_users', doc: 'uid' },
  { collection: 'users', doc: 'uid' },
  { collection: 'contact_relationships', field: 'userId' },
];

/**
 * A Firestore holding documents by path ("users/u-1", "users/u-1/journal/j1") with
 * their fields: enough for doc reads, subcollection listing, equality queries and
 * recursive deletes.
 */
function fakeFirestore(seed: Record<string, Record<string, string>>, opts = { deleteWorks: true }) {
  const docs = new Map(Object.entries(seed));
  const under = (path: string) => [...docs.keys()].filter((p) => p.startsWith(`${path}/`));
  const docRef = (path: string) => ({
    path,
    get: async () => ({ exists: docs.has(path) }),
    listCollections: async () =>
      [...new Set(under(path).map((p) => p.slice(path.length + 1).split('/')[0]))].map((id) => ({
        id,
      })),
  });
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => docRef(`${name}/${id}`),
      where: (field: string, _op: string, value: string) => ({
        limit: () => ({
          get: async () => {
            const hits = [...docs.entries()].filter(
              ([p, d]) =>
                p.split('/').length === 2 && p.startsWith(`${name}/`) && d[field] === value
            );
            return { empty: hits.length === 0, docs: hits.map(([p]) => ({ ref: docRef(p) })) };
          },
        }),
      }),
    }),
    recursiveDelete: vi.fn(async (ref: { path: string }) => {
      if (!opts.deleteWorks) return;
      for (const p of [ref.path, ...under(ref.path)]) docs.delete(p);
    }),
  };
  return { db: db as unknown as FirebaseFirestore.Firestore, raw: db, docs };
}

const seedTwoUsers = () =>
  fakeFirestore({
    'bogle_users/u-1': {},
    'bogle_users/u-1/dynamic_facts/f1': {},
    'users/u-1/calendar_events/e1': {}, // a subcollection under a record with no document
    'contact_relationships/r1': { userId: 'u-1' },
    'bogle_users/u-2/dynamic_facts/f1': {},
    'users/u-2/journal/j1': {},
    'contact_relationships/r2': { userId: 'u-2' },
  });

describe('eraseUserRecord', () => {
  it('erases both records, their subcollections and the stores kept elsewhere, leaving other users alone', async () => {
    const { db, docs } = seedTwoUsers();
    expect(await findUserRecordRemnants(db, 'u-1', STORES)).toEqual([
      'bogle_users/{uid}',
      'users/{uid}',
      'contact_relationships[userId]',
    ]);

    await eraseUserRecord('u-1', db, STORES);

    expect(await findUserRecordRemnants(db, 'u-1', STORES)).toEqual([]);
    expect([...docs.keys()].sort()).toEqual([
      'bogle_users/u-2/dynamic_facts/f1',
      'contact_relationships/r2',
      'users/u-2/journal/j1',
    ]);
  });

  it('throws when anything survives, so no caller reports an erasure that did not happen', async () => {
    const { db } = fakeFirestore(
      { 'users/u-1/journal/j1': {}, 'contact_relationships/r1': { userId: 'u-1' } },
      { deleteWorks: false }
    );
    await expect(eraseUserRecord('u-1', db, STORES)).rejects.toThrow(
      'User record not fully erased: users/{uid},contact_relationships[userId]'
    );
  });

  it('throws when a store cannot be reached, after erasing the rest', async () => {
    const { db, raw, docs } = seedTwoUsers();
    const original = raw.collection;
    raw.collection = (name: string) => {
      if (name === 'contact_relationships') throw new Error('unavailable');
      return original(name);
    };
    await expect(eraseUserRecord('u-1', db, STORES.slice(0, 3))).rejects.toThrow(
      'contact_relationships[userId]'
    );
    expect(docs.has('users/u-1/calendar_events/e1')).toBe(false);
  });

  it.each(['', 'a/b', 'u-1/dynamic_facts', '.', '..'])(
    'refuses %j without touching Firestore (a "/" would address another path)',
    async (badId) => {
      const { db, raw } = seedTwoUsers();
      expect(() => assertErasableUserId(badId)).toThrow('Refusing to erase an invalid user id');
      await expect(eraseUserRecord(badId, db)).rejects.toThrow('Refusing to erase');
      expect(raw.recursiveDelete).not.toHaveBeenCalled();
    }
  );

  it('fails loudly when Firebase Admin is unavailable instead of skipping the erase', async () => {
    await expect(eraseUserRecord('u-1')).rejects.toThrow('Firebase Admin is not initialized');
  });
});
