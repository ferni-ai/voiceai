/**
 * A remembered fact's index copy records the extracted_facts doc it copies,
 * so a forget reaches the copy by id (firestore-vector-store/forget-filter.ts).
 */
import { describe, expect, it, vi } from 'vitest';

const added: Array<{ id: string; metadata: Record<string, unknown> }> = [];
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: () => ({
      doc: () => ({ collection: () => ({ add: async () => ({ id: 'stored-123' }) }) }),
    }),
  }),
}));
vi.mock('../../../../memory/embeddings.js', () => ({ embed: async () => [0.1, 0.2] }));
vi.mock('../../../../memory/firestore-vector-store.js', () => ({
  getFirestoreVectorStore: () => ({
    addDocument: async (d: { id: string; metadata: Record<string, unknown> }) => {
      added.push(d);
    },
  }),
}));

const { memoryExecutor } = await import('../memory-executor.js');

describe('remembering a fact', () => {
  it('records the stored fact in its index copy', async () => {
    await memoryExecutor.execute(
      'rememberAboutUser',
      { fact: 'Steve is my brother', category: 'relationship' },
      { userId: 'u1', sessionId: 's1', personaId: 'ferni' } as never
    );
    expect(added[0]?.metadata).toMatchObject({
      userId: 'u1',
      sourceCollection: 'extracted_facts',
      sourceDocId: 'stored-123',
    });
  });
});
