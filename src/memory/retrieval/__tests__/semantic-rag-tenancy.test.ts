import { describe, expect, it } from 'vitest';
import { semanticSearch, setActiveVectorStore } from '../semantic-rag.js';

const doc = (id: string, userId?: string) => ({
  document: {
    id,
    text: id,
    metadata: { source: userId ? 'conversation' : 'persona', ...(userId && { userId }) },
  },
  score: 0.9,
});

describe('semanticSearch tenancy', () => {
  // A store that returns everything (as the Firestore store did for several sources).
  setActiveVectorStore({
    search: async () => [doc('alice-1', 'alice'), doc('bob-1', 'bob'), doc('persona-1')],
  } as never);

  it("returns only a caller's own memories, never another user's (as the store's query does)", async () => {
    const r = await semanticSearch('q', { userId: 'alice', sources: ['conversation', 'persona'] });
    expect(r.map((x) => x.content)).toEqual(['alice-1']);
  });

  it('treats an empty or "anonymous" userId as none', async () => {
    for (const userId of ['', 'anonymous']) {
      const r = await semanticSearch('q', { userId });
      expect(r.map((x) => x.content)).toEqual(['persona-1']);
    }
  });

  it('without a userId returns only shared documents', async () => {
    const r = await semanticSearch('q', { topK: 5 });
    expect(r.map((x) => x.content)).toEqual(['persona-1']);
  });
});
