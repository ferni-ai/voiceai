import { describe, expect, it } from 'vitest';
import { matchesFilter } from '../helpers.js';
import { ownedBy, ownerId } from '../../retrieval/vector-ownership.js';
import { FallbackCache } from '../fallback-cache.js';

const doc = (userId?: string, source = 'conversation') => ({
  metadata: { source, ...(userId !== undefined && { userId }) },
});

describe('vector store owner rule (fail safe)', () => {
  it("matches only a caller's own documents", () => {
    expect(matchesFilter(doc('alice'), { userId: 'alice' })).toBe(true);
    expect(matchesFilter(doc('bob'), { userId: 'alice' })).toBe(false);
    expect(matchesFilter(doc(undefined, 'persona'), { userId: 'alice' })).toBe(false); // as the query does
  });

  it('without a real userId, only documents with no owner', () => {
    for (const filter of [
      undefined,
      {},
      { userId: '' },
      { userId: '  ' },
      { userId: 'anonymous' },
    ]) {
      expect(matchesFilter(doc('alice'), filter), JSON.stringify(filter)).toBe(false);
      expect(matchesFilter(doc(undefined, 'persona'), filter), JSON.stringify(filter)).toBe(true);
    }
  });

  it('never shares documents owned by "anonymous"', () => {
    expect(ownedBy(doc('anonymous'), { userId: 'anonymous' })).toBe(false);
    expect(ownedBy(doc('anonymous'), {})).toBe(false);
    expect(ownerId('anonymous')).toBeUndefined();
  });

  it('refuses every placeholder owner, in any case, but keeps a unique session id', () => {
    for (const id of ['shared', 'default', 'unknown', 'Anonymous', ' SHARED ']) {
      expect(ownerId(id), id).toBeUndefined();
      expect(ownedBy(doc(id.trim()), { userId: id }), id).toBe(false);
    }
    // An anon: id only ever matches documents under that same id.
    expect(ownerId('anon:3f2a')).toBe('anon:3f2a');
    expect(ownedBy(doc('alice'), { userId: 'anon:3f2a' })).toBe(false);
  });

  it('the in-memory fallback applies it too', () => {
    const cache = new FallbackCache();
    for (const [id, userId] of [
      ['a1', 'alice'],
      ['b1', 'bob'],
      ['p1', undefined],
    ] as const) {
      cache.add(id, { id, text: id, metadata: doc(userId).metadata } as never, [1, 0, 0]);
    }
    expect(cache.list({ userId: 'alice' }).map((d) => d.id)).toEqual(['a1']);
    expect(cache.list({ userId: '' }).map((d) => d.id)).toEqual(['p1']);
    expect(cache.list().map((d) => d.id)).toEqual(['p1']);
  });
});
