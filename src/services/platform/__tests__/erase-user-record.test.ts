import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertErasableUserId,
  eraseUserRecord,
  findUserRecordRemnants,
} from '../erase-user-record.js';
import { ERASED_STORES, type OwnedStore } from '../user-stores.js';
import { bqHash } from '../../analytics/bq-events.js';

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
/** A field by path ("text.userId" reads the nested field, as Firestore's where does). */
const fieldAt = (d: Record<string, unknown>, path: string): unknown =>
  path.split('.').reduce<unknown>((v, k) => (v as Record<string, unknown> | undefined)?.[k], d);

function fakeFirestore(
  seed: Record<string, Record<string, unknown>>,
  opts = { deleteWorks: true }
) {
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
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ set: (r: { path: string }, d: Record<string, string>) => void docs.set(r.path, d) }),
    collection: (name: string) => ({
      doc: (id: string) => docRef(`${name}/${id}`),
      where: (field: string, _op: string, value: string) => ({
        limit: () => ({
          get: async () => {
            const hits = [...docs.entries()].filter(
              ([p, d]) =>
                p.split('/').length === 2 && p.startsWith(`${name}/`) && fieldAt(d, field) === value
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
    'bogle_users/u-1/mind_model/current': {}, // theory of mind
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

    await eraseUserRecord('u-1', db, STORES, []);

    expect(await findUserRecordRemnants(db, 'u-1', STORES)).toEqual([]);
    expect([...docs.keys()].sort()).toEqual([
      'bogle_users/u-2/dynamic_facts/f1',
      'contact_relationships/r2',
      'users/u-2/journal/j1',
    ]);
  });

  describe('BigQuery erasure queue (BQ_ERASURE)', () => {
    const hash = bqHash('user', 'u-1', { LOG_HASH_SECRET: 'test-secret' });
    const failingQueue = (raw: { runTransaction: unknown }) => {
      raw.runTransaction = vi.fn(async () => {
        throw new Error('firestore down');
      });
      return raw.runTransaction as ReturnType<typeof vi.fn>;
    };
    beforeEach(() => vi.stubEnv('LOG_HASH_SECRET', 'test-secret'));
    afterEach(() => vi.unstubAllEnvs());

    it('off (the default): writes no queue doc and erases as before', async () => {
      const { db, docs } = seedTwoUsers();
      await eraseUserRecord('u-1', db, STORES, []);
      expect([...docs.keys()].filter((p) => p.startsWith('bq_erasure/'))).toEqual([]);
      expect(await findUserRecordRemnants(db, 'u-1', STORES)).toEqual([]);
    });

    it('off: erasure completes even when the queue store would throw', async () => {
      const { db, raw } = seedTwoUsers();
      const tx = failingQueue(raw);
      await expect(eraseUserRecord('u-1', db, STORES, [])).resolves.toBeUndefined();
      expect(tx).not.toHaveBeenCalled();
      expect(await findUserRecordRemnants(db, 'u-1', STORES)).toEqual([]);
    });

    it("on: queues the account's user_hash (never the uid) for the analytics erasure job", async () => {
      vi.stubEnv('BQ_ERASURE', 'on');
      const { db, docs } = seedTwoUsers();
      await eraseUserRecord('u-1', db, STORES, []);
      expect(docs.get(`bq_erasure/${hash}`)).toMatchObject({ attempts: 0, doneTables: [] });
      expect(JSON.stringify([...docs])).not.toContain('"u-1"');
    });

    it('on: a failed queue write fails the erasure before anything is erased', async () => {
      vi.stubEnv('BQ_ERASURE', 'on');
      const { db, raw } = seedTwoUsers();
      const tx = failingQueue(raw);
      await expect(eraseUserRecord('u-1', db, STORES, [])).rejects.toThrow('firestore down');
      expect(tx).toHaveBeenCalled();
      expect(await findUserRecordRemnants(db, 'u-1', STORES)).toEqual([
        'bogle_users/{uid}',
        'users/{uid}',
        'contact_relationships[userId]',
      ]);
    });
  });

  it('erases the relationship memories and flag overrides account deletion used to leave', async () => {
    const stores = ERASED_STORES.filter((s) =>
      ['relationship_memories', 'feature_flag_overrides'].includes(s.collection)
    );
    const { db, docs } = fakeFirestore({
      'relationship_memories/u-1_ferni': { userId: 'u-1' },
      'relationship_memories/u-2_ferni': { userId: 'u-2' },
      'feature_flag_overrides/u-1': { flag: 'on' },
      'feature_flag_overrides/u-2': { flag: 'on' },
    });
    await eraseUserRecord('u-1', db, stores, []);
    expect([...docs.keys()].sort()).toEqual([
      'feature_flag_overrides/u-2',
      'relationship_memories/u-2_ferni',
    ]);
  });

  it("erases the texts held for them (feature_held_texts, by text.userId), not anyone else's", async () => {
    const stores = ERASED_STORES.filter((s) => s.collection === 'feature_held_texts');
    expect(stores).toEqual([{ collection: 'feature_held_texts', field: 'text.userId' }]);
    const held = (userId: string) => ({
      text: { userId, body: 'call my lawyer' },
      reason: 'focus',
    });
    const { db, docs } = fakeFirestore({
      'feature_held_texts/focus-a': held('u-1'),
      'feature_held_texts/auto-b': held('u-1'),
      'feature_held_texts/focus-c': held('u-2'),
    });
    expect(await findUserRecordRemnants(db, 'u-1', stores)).toEqual([
      'feature_held_texts[text.userId]',
    ]);
    await eraseUserRecord('u-1', db, stores, []);
    expect([...docs.keys()]).toEqual(['feature_held_texts/focus-c']);
  });

  it('throws when anything survives, so no caller reports an erasure that did not happen', async () => {
    const { db } = fakeFirestore(
      { 'users/u-1/journal/j1': {}, 'contact_relationships/r1': { userId: 'u-1' } },
      { deleteWorks: false }
    );
    await expect(eraseUserRecord('u-1', db, STORES, [])).rejects.toThrow(
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
    await expect(eraseUserRecord('u-1', db, STORES.slice(0, 3), [])).rejects.toThrow(
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
