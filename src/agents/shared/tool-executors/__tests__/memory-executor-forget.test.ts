/**
 * recallFromMemory never says back something the caller asked to forget,
 * from the vector index (copies made before the forget) or from
 * extracted_facts, and recalls nothing when the topics can't be read.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

let topics: string[] | null = ['divorce'];
vi.mock('../../../../memory/signals/user-memory-indexer.js', () => ({
  readForgottenTopics: async () => topics,
}));
vi.mock('../../../../memory/semantic-rag.js', () => ({
  getRAGContext: vi.fn().mockResolvedValue({
    results: [
      { content: 'Finalised the divorce papers last week', source: 'conversation', score: 0.9 },
      { content: 'Planning a trip to Lisbon in spring', source: 'conversation', score: 0.8 },
    ],
  }),
}));
const extracted = [
  {
    fact: 'Pete moved to Denver for work',
    extractedAt: { toDate: () => new Date() },
    forgottenAt: '2026-01-07',
  },
  { fact: 'The divorce lawyer is called Hayes', extractedAt: { toDate: () => new Date() } },
];
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: () => ({
      doc: () => ({
        collection: () => ({
          orderBy: () => ({
            limit: () => ({
              get: async () => ({
                empty: false,
                docs: extracted.map((d) => ({ data: () => d })),
              }),
            }),
          }),
        }),
      }),
    }),
  }),
}));
vi.mock('../../../../memory/embeddings.js', () => ({
  embed: vi.fn().mockRejectedValue(new Error('no embeddings in tests')),
  cosineSimilarity: vi.fn(),
}));
vi.mock('../../performance/session-optimizations.js', () => ({
  getCachedMemoryResult: vi.fn().mockReturnValue(null),
  cacheMemoryResult: vi.fn(),
}));

const { memoryExecutor } = await import('../memory-executor.js');
const ctx = { userId: 'u1', sessionId: 's1', personaId: 'ferni' } as never;

beforeEach(() => {
  topics = ['divorce'];
});

describe('recallFromMemory and forgetting', () => {
  it('leaves out index results about a forgotten topic', async () => {
    const said = await memoryExecutor.execute('recallFromMemory', { topic: 'Lisbon' }, ctx);
    expect(said).toContain('Lisbon');
    expect(said).not.toMatch(/divorce/i);
  });

  it('leaves out extracted facts marked forgotten or about a forgotten topic', async () => {
    // Keyword recall (no embeddings): each query names its fact.
    expect(await memoryExecutor.execute('recallFromMemory', { topic: 'denver' }, ctx)).not.toMatch(
      /Denver/
    );
    expect(await memoryExecutor.execute('recallFromMemory', { topic: 'hayes' }, ctx)).not.toMatch(
      /Hayes/
    );
    topics = [];
    expect(await memoryExecutor.execute('recallFromMemory', { topic: 'hayes' }, ctx)).toMatch(
      /Hayes/
    ); // not vacuous
  });

  it('recalls nothing when the forgotten topics cannot be read', async () => {
    topics = null;
    const said = await memoryExecutor.execute('recallFromMemory', { topic: 'Lisbon' }, ctx);
    expect(said).not.toContain('Lisbon');
  });
});
