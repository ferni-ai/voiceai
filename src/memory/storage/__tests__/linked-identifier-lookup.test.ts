import { describe, expect, it, vi } from 'vitest';
import {
  MAX_ANY_VALUES,
  queryProfileByLinkedIdentifier,
  type LinkedIdentifierDb,
} from '../firestore-linked-identifier.js';
import { InMemoryStore } from '../in-memory-store.js';
import type { UserProfile } from '../../../types/user-profile.js';

function fakeDb(docs: Array<Record<string, unknown> | undefined>) {
  const calls: { collection?: string; where?: unknown[]; limit?: number } = {};
  const db: LinkedIdentifierDb = {
    collection: (path) => {
      calls.collection = path;
      return {
        where: (...args) => {
          calls.where = args;
          return {
            limit: (n) => {
              calls.limit = n;
              return { get: async () => ({ docs: docs.map((d) => ({ data: () => d })) }) };
            },
          };
        },
      };
    },
  };
  return { db, calls };
}

const identity = (d: Record<string, unknown>): Record<string, unknown> => d;

describe('queryProfileByLinkedIdentifier (Firestore)', () => {
  it('asks Firestore for linkedIdentifiers containing any candidate, de-duplicated', async () => {
    const { db, calls } = fakeDb([{ id: 'u1', linkedIdentifiers: ['phone:+15551234567'] }]);
    const profile = await queryProfileByLinkedIdentifier(
      db,
      'bogle_users',
      ['phone:+15551234567', '+15551234567', '+15551234567', ''],
      identity
    );
    expect(profile?.id).toBe('u1');
    expect(calls.collection).toBe('bogle_users');
    expect(calls.where).toEqual([
      'linkedIdentifiers',
      'array-contains-any',
      ['phone:+15551234567', '+15551234567'],
    ]);
    expect(calls.limit).toBe(5);
  });

  it('caps the values at Firestore’s array-contains-any limit', async () => {
    const { db, calls } = fakeDb([]);
    const many = Array.from({ length: 40 }, (_, i) => `id-${i}`);
    await queryProfileByLinkedIdentifier(db, 'bogle_users', many, identity);
    expect((calls.where?.[2] as string[]).length).toBe(MAX_ANY_VALUES);
  });

  it('skips documents that are empty or not valid profiles', async () => {
    const { db } = fakeDb([undefined, { name: 'no id' }, { id: 'u2' }]);
    expect((await queryProfileByLinkedIdentifier(db, 'c', ['x'], identity))?.id).toBe('u2');
  });

  it('sends no query for no candidates', async () => {
    const { db, calls } = fakeDb([{ id: 'u1' }]);
    expect(await queryProfileByLinkedIdentifier(db, 'c', ['', ''], identity)).toBeNull();
    expect(calls.collection).toBeUndefined();
  });
});

describe('MemoryStore.findProfileByLinkedIdentifier (default scan)', () => {
  async function storeWith(profiles: Array<Partial<UserProfile> & { linkedIdentifiers?: string[] }>) {
    const store = new InMemoryStore();
    for (const p of profiles) await store.saveProfile({ ...(p as UserProfile) });
    return store;
  }

  it('finds the profile that lists any candidate', async () => {
    const store = await storeWith([
      { id: 'a', name: 'A', linkedIdentifiers: ['phone:+15550000001'] },
      { id: 'b', name: 'B', linkedIdentifiers: ['+15550000002', 'auth:xyz'] },
    ]);
    expect((await store.findProfileByLinkedIdentifier(['nope', '+15550000002']))?.id).toBe('b');
  });

  it('returns null when nothing matches or there are no candidates', async () => {
    const store = await storeWith([{ id: 'a', name: 'A', linkedIdentifiers: ['x'] }]);
    expect(await store.findProfileByLinkedIdentifier(['y'])).toBeNull();
    const list = vi.spyOn(store, 'listProfiles');
    expect(await store.findProfileByLinkedIdentifier([])).toBeNull();
    expect(list).not.toHaveBeenCalled();
  });
});
