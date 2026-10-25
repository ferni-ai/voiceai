/**
 * firestoreForgetStore.deleteFacts (FORGET_DELETES on), without the emulator:
 * the facts the graph sync can't have copied are deleted along with their index
 * copies, and the rest come back to be marked instead. Pre/post on a fake db.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const docs = new Map<string, Record<string, unknown>>();
const indexRemoved: string[] = [];

vi.mock('../../../utils/firestore-utils.js', () => {
  const path = (parts: string[]) => parts.join('/');
  const ref = (parts: string[]): Record<string, unknown> => ({
    collection: (name: string) => ref([...parts, name]),
    doc: (id: string) => ref([...parts, id]),
    _path: path(parts),
  });
  return {
    getFirestoreDb: () => ({
      ...ref([]),
      batch: () => {
        const ops: Array<() => void> = [];
        return {
          delete: (r: { _path: string }) => ops.push(() => docs.delete(r._path)),
          update: (r: { _path: string }, data: Record<string, unknown>) =>
            ops.push(() => docs.set(r._path, { ...docs.get(r._path), ...data })),
          commit: async () => ops.forEach((op) => op()),
        };
      },
    }),
  };
});
vi.mock('../../retrieval/conversation-index.js', () => ({
  removeConversationDocument: async (id: string) => {
    indexRemoved.push(`conversation:${id}`);
  },
}));
vi.mock('../../retrieval/semantic-memory-search.js', () => ({
  removeIndexedMemory: async (source: string, id: string) => {
    indexRemoved.push(`${source}:${id}`);
  },
}));

const { firestoreForgetStore } = await import('../forget.js');

const at = (c: string, id: string) => `bogle_users/u1/${c}/${id}`;
const refOf = (collection: string, id: string) => ({
  collection,
  id,
  data: docs.get(at(collection, id)) ?? {},
});

beforeEach(() => {
  docs.clear();
  indexRemoved.length = 0;
  docs.set(at('dynamic_facts', 'd1'), { key: 'divorce', syncedToSpanner: false });
  docs.set(at('extracted_facts', 'e1'), { fact: 'Going through a divorce' });
  docs.set(at('dynamic_facts', 'd2'), { key: 'divorce lawyer', syncedToSpanner: true });
  docs.set(at('dynamic_facts', 'd3'), { key: 'dog', syncedToSpanner: false });
});

describe('firestoreForgetStore.deleteFacts', () => {
  it('deletes facts with no graph copy, and their index copies', async () => {
    expect(docs.has(at('dynamic_facts', 'd1'))).toBe(true);
    expect(docs.has(at('extracted_facts', 'e1'))).toBe(true);
    const kept = await firestoreForgetStore.deleteFacts!('u1', [
      refOf('dynamic_facts', 'd1'),
      refOf('extracted_facts', 'e1'),
    ]);
    expect(kept).toEqual([]);
    expect(docs.has(at('dynamic_facts', 'd1'))).toBe(false);
    expect(docs.has(at('extracted_facts', 'e1'))).toBe(false);
    expect(docs.has(at('dynamic_facts', 'd3'))).toBe(true); // not asked about
    expect(indexRemoved).toEqual(['conversation:fact_d1', 'fact:fact_u1_d1']);
  });

  it('hands back a fact the graph may have copied, untouched, for marking', async () => {
    const kept = await firestoreForgetStore.deleteFacts!('u1', [
      refOf('dynamic_facts', 'd1'),
      refOf('dynamic_facts', 'd2'),
    ]);
    expect(kept.map((r) => r.id)).toEqual(['d2']);
    expect(docs.has(at('dynamic_facts', 'd1'))).toBe(false);
    expect(docs.get(at('dynamic_facts', 'd2'))).toEqual({
      key: 'divorce lawyer',
      syncedToSpanner: true,
    });
    expect(indexRemoved).toEqual(['conversation:fact_d1', 'fact:fact_u1_d1']);
  });
});
