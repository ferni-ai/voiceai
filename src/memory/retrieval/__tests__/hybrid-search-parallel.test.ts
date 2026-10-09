/**
 * Turn memory retrieval timed out on 103 of 103 dev turns: keyword, vector
 * and entity search ran one after another (~280 ms) against a 245 ms limit.
 * They are independent, so they now run together.
 */
import { describe, expect, it, vi } from 'vitest';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
vi.mock('../bm25-search.js', () => ({
  searchEntitiesBM25: async () => {
    await wait(150);
    return [{ id: 'e1', score: 2, text: 'Biscuit the dog', metadata: {} }];
  },
}));
vi.mock('../semantic-memory-search.js', () => ({
  searchMemories: async () => {
    await wait(150);
    return { results: [{ documentId: 'm1', score: 0.8, text: 'walked Biscuit', source: 's', sourceId: 'x' }] };
  },
}));
vi.mock('../../entity-store/storage.js', () => ({
  findEntityByAlias: async () => {
    await wait(150);
    return null;
  },
  searchEntities: async () => [],
}));

describe('hybridSearch', () => {
  it('runs its three searches together, not one after another', async () => {
    const { hybridSearch } = await import('../hybrid-search.js');
    const started = Date.now();
    const { results, metrics } = await hybridSearch('u1', 'how is Biscuit', { topK: 5, minScore: 0 });
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(300); // sequential would be ~450 ms
    expect(metrics.sourceCounts.bm25).toBe(1);
    expect(metrics.sourceCounts.vector).toBe(1);
    expect(results.map((r) => r.id).sort()).toEqual(['e1', 'm1']);
  });
});
