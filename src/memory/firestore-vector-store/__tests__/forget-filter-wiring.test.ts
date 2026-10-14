/**
 * Every owned vector search goes through the forget filter (both search
 * paths); ownerless searches don't need it (no one's memories come back).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../embeddings.js', () => ({
  embed: async () => [1, 0, 0],
  embedBatch: async (t: string[]) => t.map(() => [1, 0, 0]),
}));
vi.mock('../../rust-accelerator.js', () => ({
  topKSimilar: (_q: number[], c: number[][], k: number) => ({
    indices: c.map((_, i) => i).slice(0, k),
    similarities: c.map(() => 0.9).slice(0, k),
  }),
}));
const filtered: string[] = [];
vi.mock('../forget-filter.js', () => ({
  // Stands in for the real filter: drops everything, so wiring is visible.
  withoutForgotten: async (owner: string) => {
    filtered.push(owner);
    return [];
  },
}));

const { FirestoreVectorStore } = await import('../core.js');

const rows = [
  { id: 'a1', text: 'alice memory', metadata: { source: 'conversation', userId: 'alice' } },
];
function store() {
  const query = (): Record<string, unknown> => ({
    where: () => query(),
    findNearest: () => ({
      get: async () => ({
        docs: rows.map((r) => ({
          id: r.id,
          data: () => ({ text: r.text, embedding: [1, 0, 0], metadata: r.metadata }),
        })),
      }),
    }),
  });
  const s = new FirestoreVectorStore({ embeddingDimension: 3 } as never);
  Object.assign(s as unknown as Record<string, unknown>, {
    db: { collection: () => query() },
    useFallback: false,
    _initialized: true,
  });
  return s;
}

describe('forget filter wiring in the vector store', () => {
  it('filters both search paths for an owner', async () => {
    expect(await store().search('q', { filter: { userId: 'alice' } })).toEqual([]);
    expect(await store().searchByEmbedding([1, 0, 0], { filter: { userId: 'alice' } })).toEqual([]);
    expect(filtered).toEqual(['alice', 'alice']);
  });
});
