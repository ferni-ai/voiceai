/**
 * The memory single-use store (the Firestore one is exercised through the
 * OAuth link-state and account-deletion suites): a record is taken once, the
 * cap holds, expired records make room, and deletion is per user.
 */
import { describe, expect, it } from 'vitest';
import { memorySingleUseStore, sha256Hex } from '../single-use-records.js';

const later = () => Date.now() + 60_000;

describe('memorySingleUseStore', () => {
  it('gives a record back once from take, and never again', async () => {
    const store = memorySingleUseStore<{ uid: string; expiresAt: number }>(10);
    expect(await store.put('k', { uid: 'u1', expiresAt: later() })).toBe(true);
    expect(await store.get('k')).toEqual({ uid: 'u1', expiresAt: expect.any(Number) });
    expect((await store.take('k'))?.uid).toBe('u1');
    expect(await store.take('k')).toBeNull();
    expect(await store.get('k')).toBeNull();
  });

  it('refuses a record past the cap, until expired ones are swept', async () => {
    const store = memorySingleUseStore<{ uid: string; expiresAt: number }>(1);
    expect(await store.put('a', { uid: 'u1', expiresAt: Date.now() - 1 })).toBe(true);
    // 'a' has expired, so the sweep on put frees its slot
    expect(await store.put('b', { uid: 'u1', expiresAt: later() })).toBe(true);
    expect(await store.put('c', { uid: 'u1', expiresAt: later() })).toBe(false);
  });

  it("deletes one user's records and leaves the others", async () => {
    const store = memorySingleUseStore<{ uid: string; expiresAt: number }>(10);
    await store.put('a', { uid: 'u1', expiresAt: later() });
    await store.put('b', { uid: 'u1', expiresAt: later() });
    await store.put('c', { uid: 'u2', expiresAt: later() });
    expect(await store.deleteForUser('u1')).toBe(2);
    expect(await store.get('a')).toBeNull();
    expect((await store.get('c'))?.uid).toBe('u2');
  });
});

describe('sha256Hex', () => {
  it('is the hex SHA-256 of the secret', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });
});
