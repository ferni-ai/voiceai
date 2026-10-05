import { beforeEach, describe, expect, it, vi } from 'vitest';

// A fake Firestore that counts commitment queries, so the test can tell a cache
// hit from a fresh read.
const firestore = vi.hoisted(() => ({ queries: 0, fail: false }));

vi.mock('../firestore-utils.js', () => {
  const query = {
    where: () => query,
    orderBy: () => query,
    limit: () => query,
    get: async () => {
      firestore.queries++;
      if (firestore.fail) throw new Error('UNAVAILABLE');
      return { docs: [{ data: () => ({ id: 'c1', summary: 'finish the report' }) }] };
    },
  };
  const db = { collection: () => ({ doc: () => ({ collection: () => query }) }) };
  return {
    getFirestoreDb: () => db,
    cleanForFirestore: <T>(v: T) => v,
    recordDegradation: vi.fn(),
  };
});

const { prefetchUserCommitments } = await import('../commitment-prefetch.js');
const { loadUserCommitments } = await import('../commitment-keeper.js');

describe('prefetchUserCommitments', () => {
  beforeEach(() => {
    firestore.queries = 0;
    firestore.fail = false;
  });

  it('loads the commitments the first turn reads, so that read is a cache hit', async () => {
    // Control: a user nobody prefetched costs the turn a Firestore query.
    await loadUserCommitments('not-prefetched');
    expect(firestore.queries).toBe(1);

    await prefetchUserCommitments('user-1');
    expect(firestore.queries).toBe(2);

    const commitments = await loadUserCommitments('user-1');
    expect(commitments).toEqual([{ id: 'c1', summary: 'finish the report' }]);
    expect(firestore.queries).toBe(2);
  });

  it('does nothing for an unidentified user', async () => {
    await prefetchUserCommitments(undefined);
    expect(firestore.queries).toBe(0);
  });

  it('resolves when Firestore fails, and the turn retries the read', async () => {
    firestore.fail = true;
    await expect(prefetchUserCommitments('user-2')).resolves.toBeUndefined();
    expect(firestore.queries).toBe(1);

    firestore.fail = false;
    await loadUserCommitments('user-2');
    expect(firestore.queries).toBe(2);
  });
});
