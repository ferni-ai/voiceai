import { describe, expect, it, vi } from 'vitest';
import {
  assertErasableUserId,
  eraseUserRecord,
  findUserRecordRemnants,
} from '../erase-user-record.js';

vi.mock('../../identity/firebase-auth.js', () => ({ ensureFirebaseAdmin: () => false }));

/** A Firestore with one level of documents and named subcollections, enough for the erase. */
function fakeFirestore(seed: Record<string, string[]>, opts: { deleteWorks?: boolean } = {}) {
  const users = new Map(Object.entries(seed).map(([id, subs]) => [id, new Set(subs)]));
  const docRef = (id: string) => ({
    id,
    get: async () => ({ exists: users.has(id) }),
    listCollections: async () => [...(users.get(id) ?? [])].map((sub) => ({ id: sub })),
  });
  const db = {
    collection: vi.fn((name: string) => {
      expect(name).toBe('bogle_users');
      return { doc: docRef };
    }),
    recursiveDelete: vi.fn(async (ref: { id: string }) => {
      if (opts.deleteWorks !== false) users.delete(ref.id);
    }),
  };
  return { db: db as unknown as FirebaseFirestore.Firestore, raw: db, users };
}

describe('eraseUserRecord', () => {
  it('deletes the record and its subcollections, leaving other users alone', async () => {
    const { db, users } = fakeFirestore({
      'u-1': ['dynamic_facts', 'emotional_arcs', 'trust_profiles'],
      'u-2': ['dynamic_facts'],
    });
    expect(await findUserRecordRemnants(db, 'u-1')).toEqual({
      docExists: true,
      subcollections: ['dynamic_facts', 'emotional_arcs', 'trust_profiles'],
    });

    await eraseUserRecord('u-1', db);

    expect(await findUserRecordRemnants(db, 'u-1')).toEqual({ docExists: false, subcollections: [] });
    expect(users.has('u-2')).toBe(true);
  });

  it('throws when anything survives, so no caller reports an erasure that did not happen', async () => {
    const { db } = fakeFirestore({ 'u-1': ['dynamic_facts'] }, { deleteWorks: false });
    await expect(eraseUserRecord('u-1', db)).rejects.toThrow(
      'User record not fully erased: doc=true, subcollections=dynamic_facts'
    );
  });

  it.each(['', 'a/b', 'u-1/dynamic_facts', '.', '..'])(
    'refuses %j without touching Firestore (a "/" would address another path)',
    async (badId) => {
      const { db, raw } = fakeFirestore({ 'u-1': ['dynamic_facts'] });
      expect(() => assertErasableUserId(badId)).toThrow('Refusing to erase an invalid user id');
      await expect(eraseUserRecord(badId, db)).rejects.toThrow('Refusing to erase');
      expect(raw.recursiveDelete).not.toHaveBeenCalled();
    }
  );

  it('fails loudly when Firebase Admin is unavailable instead of skipping the erase', async () => {
    await expect(eraseUserRecord('u-1')).rejects.toThrow('Firebase Admin is not initialized');
  });
});
