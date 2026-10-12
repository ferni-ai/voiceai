import { describe, expect, it, vi } from 'vitest';

const removed: string[] = [];
vi.mock('../../retrieval/semantic-rag.js', () => ({
  removeConversationDocument: async (id: string) => {
    removed.push(id);
  },
}));
vi.mock('../../retrieval/semantic-memory-search.js', () => ({
  removeIndexedMemory: async (source: string, id: string) => {
    removed.push(`${source}_${id}`);
  },
}));
vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({}) }) }) }),
    batch: () => ({ update: () => undefined, commit: async () => undefined }),
  }),
}));

const { firestoreForgetStore } = await import('../forget.js');

describe('forgetting a fact', () => {
  it('removes the index copies at once (memory tool and graph sync), for dynamic facts', async () => {
    await firestoreForgetStore.markForgotten(
      'u1',
      [
        { collection: 'dynamic_facts', id: 'f1', data: {} },
        { collection: 'extracted_facts', id: 'e1', data: {} },
      ],
      '2026-01-07T00:00:00Z'
    );
    expect(removed).toEqual(['fact_f1', 'fact_fact_u1_f1']); // user-memory index, graph sync's index
  });
});
