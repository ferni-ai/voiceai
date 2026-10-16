/**
 * Vector search never returns another user's memories: searchByEmbedding
 * ran findNearest over the whole collection with no filter, so the nearest
 * vectors of every user came back (2026-10-11 audit: 41k vectors, ~800
 * users in prod's collection).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../embeddings.js', () => ({
  embed: async () => [1, 0, 0],
  embedBatch: async (t: string[]) => t.map(() => [1, 0, 0]),
}));
vi.mock('../../rust-accelerator.js', () => ({
  // Every candidate scores the same; order kept.
  topKSimilar: (_q: number[], c: number[][], k: number) => ({
    indices: c.map((_, i) => i).slice(0, k),
    similarities: c.map(() => 0.9).slice(0, k),
  }),
}));

const { FirestoreVectorStore } = await import('../core.js');

const rows = [
  {
    id: 'a1',
    text: 'Alice: my sister is pregnant',
    metadata: { source: 'conversation', userId: 'alice' },
  },
  {
    id: 'b1',
    text: 'Bob: my divorce is final',
    metadata: { source: 'conversation', userId: 'bob' },
  },
  { id: 'p1', text: 'Ferni loves gardening', metadata: { source: 'persona' } },
];

/** A Firestore fake whose findNearest ignores filters (the worst case), recording the where() calls. */
function fakeDb(wheres: string[]) {
  const query = (): Record<string, unknown> => ({
    where: (field: string, op: string, value: unknown) => {
      wheres.push(`${field} ${op} ${String(value)}`);
      return query();
    },
    findNearest: () => ({
      get: async () => ({
        docs: rows.map((r) => ({
          id: r.id,
          data: () => ({ text: r.text, embedding: [1, 0, 0], metadata: r.metadata }),
        })),
      }),
    }),
  });
  return { collection: () => query() };
}

function storeWith(wheres: string[]) {
  const store = new FirestoreVectorStore({ embeddingDimension: 3 } as never);
  Object.assign(store as unknown as Record<string, unknown>, {
    db: fakeDb(wheres),
    useFallback: false,
    _initialized: true,
  });
  return store;
}

describe('vector search tenancy', () => {
  it("searchByEmbedding filters by user before findNearest and never returns another user's vectors", async () => {
    const wheres: string[] = [];
    const results = await storeWith(wheres).searchByEmbedding([1, 0, 0], {
      topK: 5,
      filter: { userId: 'alice', source: ['conversation'] },
    });
    expect(wheres).toContain('metadata.userId == alice');
    expect(results.map((r) => r.document.id)).toEqual(['a1']);
  });

  it('search post-filters what the query could not express (several sources, the user)', async () => {
    const wheres: string[] = [];
    const results = await storeWith(wheres).search('anything', {
      topK: 5,
      filter: { userId: 'alice', source: ['conversation', 'user_memory'] },
    });
    expect(results.map((r) => r.document.id)).toEqual(['a1']);
  });
});
