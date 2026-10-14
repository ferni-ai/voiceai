/**
 * A forgotten memory never becomes searchable through the user-memory index
 * (the index behind the recallFromMemory tool), and a copy indexed before the
 * forget is taken out.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const indexed: Array<{ id: string; text: string }> = [];
const removed: string[] = [];
let topics: () => Promise<unknown> = async () => [];

vi.mock('../../semantic-rag.js', () => ({
  indexConversationSummary: async (_u: string, s: { id: string; text: string }) => {
    indexed.push({ id: s.id, text: s.text });
  },
}));
vi.mock('../../retrieval/conversation-index.js', () => ({
  removeOwnedConversationDocument: async (id: string, _userId: string) => {
    removed.push(id);
  },
}));
vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/firestore-utils.js')>()),
  // memory_state/forgotten, as the indexer reads it.
  getFirestoreDb: () => ({
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: () => ({
            get: async () => {
              const t = await topics();
              return { exists: true, data: () => ({ topics: t }) };
            },
          }),
        }),
      }),
    }),
  }),
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
const at = '2026-01-05';
const facts: Array<[string, Record<string, unknown>]> = [
  [
    'f1',
    { entityName: 'User', key: 'job', value: 'Works as a nurse at St. Mary', extractedAt: at },
  ],
  [
    'f2',
    { entityName: 'User', key: 'divorce', value: 'Finalised the divorce papers', extractedAt: at },
  ],
  [
    'f3',
    {
      entityName: 'Pete',
      key: 'phone',
      value: '435-339-7687 is his',
      extractedAt: at,
      forgottenAt: '2026-01-07',
    },
  ],
  // The forgotten topic is only the person's name, never in "key: value".
  ['f4', { entityName: 'Steve', key: 'job', value: 'plumber in Ogden', extractedAt: at }],
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

const { indexUserMemories, readForgottenTopics, forgottenFactCopies } =
  await import('../user-memory-indexer.js');

beforeEach(() => {
  indexed.length = 0;
  removed.length = 0;
  topics = async () => ['divorce', 'Steve'];
});

describe('the user-memory index and forgetting', () => {
  it('never indexes a fact marked forgotten or a memory about a forgotten topic, and removes old copies', async () => {
    const result = await indexUserMemories('u1', {} as never);
    expect(indexed.map((d) => d.id).sort()).toEqual(['fact_f1', 's2']);
    expect(removed.sort()).toEqual(['fact_f2', 'fact_f3', 'fact_f4', 's1']);
    expect(result.categories['forgotten']).toBe(4);
  });

  it('names the person in an indexed fact, so a topic that is only a name matches it', async () => {
    topics = async () => [];
    await indexUserMemories('u1', {} as never);
    const texts = indexed.map((d) => d.text);
    expect(texts).toContain('Steve job: plumber in Ogden');
    expect(texts).toContain('job: Works as a nurse at St. Mary'); // the caller is not named
  });

  it('indexes nothing when the forgotten topics cannot be read', async () => {
    for (const unreadable of [
      async () => Promise.reject(new Error('down')),
      async () => 'divorce',
      async () => [42],
      async () => ({ 0: 'divorce' }),
    ]) {
      topics = unreadable;
      indexed.length = 0;
      const result = await indexUserMemories('u1', {} as never);
      expect(indexed).toEqual([]);
      expect(result.indexed).toBe(0);
    }
  });

  it('reads topics as a list of strings, none recorded as [], anything else as unreadable', async () => {
    expect(await readForgottenTopics('u', async () => ['a'])).toEqual(['a']);
    expect(await readForgottenTopics('u', async () => undefined)).toEqual([]);
    expect(await readForgottenTopics('u', async () => 'a')).toBeNull();
    expect(
      await readForgottenTopics('u', async () => Promise.reject(new Error('no db')))
    ).toBeNull();
  });

  it('flags index copies of a forgotten or deleted fact by id, and all of them if facts are unreadable', async () => {
    const stored = new Map<string, Record<string, unknown> | undefined>([
      ['live', { value: 'x' }],
      ['gone', { value: 'x', forgottenAt: '2026-01-07' }],
      ['deleted', undefined],
    ]);
    const ids = [
      'conversation_fact_live',
      'conversation_fact_gone',
      'conversation_fact_deleted',
      'conversation_s1',
      undefined,
    ];
    expect([...(await forgottenFactCopies('u', ids, async () => stored))].sort()).toEqual([
      'conversation_fact_deleted',
      'conversation_fact_gone',
    ]);
    const down = await forgottenFactCopies('u', ids, async () => Promise.reject(new Error('down')));
    expect([...down].sort()).toEqual([
      'conversation_fact_deleted',
      'conversation_fact_gone',
      'conversation_fact_live',
    ]);
  });
});
