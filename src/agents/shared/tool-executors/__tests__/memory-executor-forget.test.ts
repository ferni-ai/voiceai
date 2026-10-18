/**
 * recallFromMemory never says back something the caller asked to forget,
 * from the vector index (copies made before the forget) or from
 * extracted_facts, and recalls nothing when the topics can't be read.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

let topics: string[] | null = ['divorce'];
let cached: string | null = null;
vi.mock('../../../../memory/signals/user-memory-indexer.js', () => ({
  readForgottenTopics: async () => topics,
  // The indexed copy of a fact about "Steve" (forgotten by id; its text never names him).
  forgottenFactCopies: async (_u: string, ids: Array<string | undefined>) =>
    new Set(ids.filter((id) => id === 'conversation_fact_steve')),
}));
vi.mock('../../../../memory/semantic-rag.js', () => ({
  getRAGContext: vi.fn().mockResolvedValue({
    results: [
      {
        id: 'conversation_fact_steve',
        content: 'job: plumber in Ogden',
        source: 'conversation',
        score: 0.95,
      },
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
const cleared: string[] = [];
vi.mock('../../performance/session-optimizations.js', () => ({
  getCachedMemoryResult: () => (cached === null ? null : { result: cached }),
  cacheMemoryResult: vi.fn(),
  clearSessionMemoryCache: (sessionId: string) => {
    cleared.push(sessionId);
    cached = null;
  },
}));
vi.mock('../../../../memory/recall/forget.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../memory/recall/forget.js')>()),
  // The real forgetTopic, over a store with no stored facts: it records the topic in process.
  forgetForCaller: async (userId: string, topic: string) =>
    (await importOriginal<typeof import('../../../../memory/recall/forget.js')>()).forgetTopic(
      userId,
      topic,
      {
        facts: async () => [],
        addTopic: async () => undefined,
        markForgotten: async () => undefined,
      } as never
    ),
  forgetProblem: () => "I couldn't remove that just now.",
}));

const { memoryExecutor } = await import('../memory-executor.js');
const { rememberForPacket, turnPacket } =
  await import('../../../personas/context-packet/turn-packet.js');
const ctx = { userId: 'u1', sessionId: 's1', personaId: 'ferni' } as never;

beforeEach(() => {
  topics = ['divorce'];
  cached = null;
});

describe('recallFromMemory and forgetting', () => {
  it('leaves out index results about a forgotten topic, or copies of a forgotten fact by id', async () => {
    const said = await memoryExecutor.execute('recallFromMemory', { topic: 'Lisbon' }, ctx);
    expect(said).toContain('Lisbon');
    expect(said).not.toMatch(/divorce|plumber/i);
  });

  it('never answers from the session cache with something now forgotten', async () => {
    cached = 'I recall: Finalised the divorce papers';
    expect(await memoryExecutor.execute('recallFromMemory', { topic: 'Lisbon' }, ctx)).not.toMatch(
      /divorce/i
    );
    cached = 'I recall: a trip to Lisbon';
    expect(await memoryExecutor.execute('recallFromMemory', { topic: 'Lisbon' }, ctx)).toBe(cached);
    topics = null; // unreadable: not even the cache
    expect(
      await memoryExecutor.execute('recallFromMemory', { topic: 'Lisbon' }, ctx)
    ).not.toContain('Lisbon');
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

  it('says only what happened: hidden, so never "forgotten" or "deleted"', async () => {
    const said = await memoryExecutor.execute('forgetMemory', { topic: 'Lisbon' }, ctx);
    expect(said).toBe("I won't bring that up again.");
  });

  it('forgetting clears what this call already recalled', async () => {
    cached = 'I recall: a trip to Lisbon';
    await memoryExecutor.execute('forgetMemory', { topic: 'Lisbon' }, ctx);
    expect(cleared).toContain('s1');
    expect(cached).toBeNull();
  });

  it('a fact remembered before the forget is absent from the next turn packet', async () => {
    const session = { userData: { userId: 'u1', services: { sessionId: 's1' } } };
    const turn = { words: 'what is my sister called?', notes: [], now: Date.now() };
    rememberForPacket(session, {
      facts: [{ entity: 'Sam', key: 'sister', value: 'Ruth', confidence: 0.9 }],
      rest: null,
    });
    expect(turnPacket(session, turn).text).toContain('Sam sister: Ruth');

    await memoryExecutor.execute('forgetMemory', { topic: 'my sister' }, ctx);
    expect(turnPacket(session, turn).text).not.toContain('Ruth');
  });
});
