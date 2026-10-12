/**
 * A forgotten memory never becomes searchable through the user-memory index
 * (the index behind the recallFromMemory tool), and a copy indexed before the
 * forget is taken out.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const indexed: string[] = [];
const removed: string[] = [];
let topics: () => Promise<unknown> = async () => [];

vi.mock('../../semantic-rag.js', () => ({
  indexConversationSummary: vi.fn(async (_u: string, s: { id: string }) => {
    indexed.push(s.id);
  }),
  removeConversationDocument: vi.fn(async (id: string) => {
    removed.push(id);
  }),
}));
vi.mock('../../recall/forget.js', () => ({
  firestoreForgetStore: { topics: async () => topics() },
}));
const docs = (rows: Array<[string, Record<string, unknown>]>) => ({
  docs: rows.map(([id, d]) => ({ id, data: () => d })),
});
vi.mock('../../storage/call-summaries.js', () => ({
  readCallSummaries: async () =>
    docs([
      [
        's1',
        { summary: 'Talked through the divorce paperwork and the lawyer', timestamp: '2026-01-05' },
      ],
      ['s2', { summary: 'Planning a trip to Lisbon in the spring', timestamp: '2026-01-06' }],
    ]),
}));
const facts: Array<[string, Record<string, unknown>]> = [
  [
    'f1',
    {
      entityName: 'User',
      key: 'job',
      value: 'Works as a nurse at St. Mary',
      extractedAt: '2026-01-05',
    },
  ],
  [
    'f2',
    {
      entityName: 'User',
      key: 'divorce',
      value: 'Finalised the divorce papers',
      extractedAt: '2026-01-05',
    },
  ],
  [
    'f3',
    {
      entityName: 'Pete',
      key: 'phone',
      value: '435-339-7687 is his number',
      extractedAt: '2026-01-05',
      forgottenAt: '2026-01-07T00:00:00Z',
    },
  ],
];
vi.mock('../../firestore-factory.js', () => ({
  getFirestore: () => ({
    collection: () => ({
      doc: () => ({
        collection: (name: string) => {
          const rows = name === 'dynamic_facts' ? facts : [];
          const q = {
            orderBy: () => q,
            limit: () => q,
            where: () => q,
            get: async () => docs(rows),
          };
          return q;
        },
      }),
    }),
  }),
}));

const { indexUserMemories, readForgottenTopics } = await import('../user-memory-indexer.js');

beforeEach(() => {
  indexed.length = 0;
  removed.length = 0;
  topics = async () => ['divorce'];
});

describe('the user-memory index and forgetting', () => {
  it('never indexes a fact marked forgotten or a memory about a forgotten topic, and removes old copies', async () => {
    const result = await indexUserMemories('u1', {} as never);
    expect(indexed.sort()).toEqual(['fact_f1', 's2']);
    expect(removed.sort()).toEqual(['fact_f2', 'fact_f3', 's1']);
    expect(result.categories['forgotten']).toBe(3);
  });

  it('indexes nothing when the forgotten topics cannot be read', async () => {
    for (const unreadable of [
      async () => null,
      async () => Promise.reject(new Error('down')),
      async () => 'divorce',
      async () => [42],
    ]) {
      topics = unreadable;
      indexed.length = 0;
      const result = await indexUserMemories('u1', {} as never);
      expect(indexed).toEqual([]);
      expect(result.indexed).toBe(0);
    }
  });

  it('reads topics as a list of strings or not at all', async () => {
    expect(await readForgottenTopics('u', { topics: async () => ['a'] })).toEqual(['a']);
    expect(await readForgottenTopics('u', { topics: async () => null as never })).toBeNull();
  });
});
