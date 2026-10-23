/**
 * getStats counts vectors with an aggregation and never reads the docs: the
 * full read pulled all 93,381 vectors (~0.5 GB of floats) into the agent on
 * every health probe (2026-10-22 audit, gap 6).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../embeddings.js', () => ({
  embed: async () => [1, 0, 0],
  embedBatch: async (t: string[]) => t.map(() => [1, 0, 0]),
}));

const { FirestoreVectorStore } = await import('../core.js');

/** A collection whose full read would hand back docs, and whose count() reports 93,381. */
function fakeDb(countFails = false) {
  const fullReads = vi.fn(async () => ({
    empty: false,
    size: 1,
    docs: [{ id: 'v1', data: () => ({ metadata: { source: 'conversation' } }) }],
  }));
  const counts = vi.fn(async () => {
    if (countFails) throw new Error('UNAVAILABLE');
    return { data: () => ({ count: 93_381 }) };
  });
  const collection = vi.fn(() => ({ get: fullReads, count: () => ({ get: counts }) }));
  return { db: { collection }, collection, fullReads, counts };
}

function storeWith(db: unknown, useFallback = false) {
  const store = new FirestoreVectorStore({ embeddingDimension: 3 } as never);
  Object.assign(store as unknown as Record<string, unknown>, {
    db,
    useFallback,
    _initialized: true,
  });
  return store;
}

describe('FirestoreVectorStore.getStats', () => {
  it('counts the collection with one aggregation and reads no documents', async () => {
    const fake = fakeDb();
    const stats = await storeWith(fake.db).getStats();

    expect(fake.fullReads).not.toHaveBeenCalled();
    expect(fake.counts).toHaveBeenCalledTimes(1);
    expect(fake.collection).toHaveBeenCalledWith('vectors');
    expect(stats).toEqual({
      documentCount: 93_381,
      bySource: null,
      byCategory: null,
      usingFallback: false,
    });
  });

  it('in fallback mode touches no Firestore and breaks down the in-memory cache', async () => {
    const fake = fakeDb();
    const store = storeWith(fake.db, true);
    await store.addDocument({
      id: 'c1',
      text: 'walks the dog at six',
      embedding: [1, 0, 0],
      metadata: { source: 'persona', category: 'knowledge' },
    });

    const stats = await store.getStats();

    expect(fake.fullReads).not.toHaveBeenCalled();
    expect(fake.counts).not.toHaveBeenCalled();
    expect(stats).toEqual({
      documentCount: 1,
      bySource: { persona: 1 },
      byCategory: { knowledge: 1 },
      usingFallback: true,
    });
  });

  it('when the count fails, reports the cache alone and still reads no documents', async () => {
    const fake = fakeDb(true);
    const stats = await storeWith(fake.db).getStats();

    expect(fake.fullReads).not.toHaveBeenCalled();
    expect(stats).toEqual({ documentCount: 0, bySource: {}, byCategory: {}, usingFallback: false });
  });
});
