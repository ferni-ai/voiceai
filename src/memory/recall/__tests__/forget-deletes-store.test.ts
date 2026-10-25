/**
 * firestoreForgetStore.deleteFacts (FORGET_DELETES on), without the emulator:
 * the facts the graph sync can't have copied are deleted along with their index
 * copies, and the rest come back to be marked instead. Pre/post on a fake db.
 * The decision is made on each fact as re-read in the deleting transaction,
 * not on the snapshot the forget matched: a fact synced or edited in between
 * is marked, never deleted.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const docs = new Map<string, Record<string, unknown>>();
const indexRemoved: string[] = [];
const txReads: string[] = [];

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
      // Reads see the docs as they are now; writes land only when fn resolves.
      runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
        const ops: Array<() => void> = [];
        const tx = {
          getAll: async (...refs: Array<{ _path: string }>) =>
            refs.map((r) => {
              txReads.push(r._path);
              const d = docs.get(r._path);
              return { exists: d !== undefined, data: () => (d ? { ...d } : undefined) };
            }),
          delete: (r: { _path: string }) => ops.push(() => docs.delete(r._path)),
        };
        const out = await fn(tx);
        ops.forEach((op) => op());
        return out;
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

const { firestoreForgetStore, forgetTopic, forgetDone } = await import('../forget.js');
type ForgetStore = import('../forget.js').ForgetStore;

const at = (c: string, id: string) => `bogle_users/u1/${c}/${id}`;
const refOf = (collection: string, id: string) => ({
  collection,
  id,
  data: docs.get(at(collection, id)) ?? {},
});

beforeEach(() => {
  docs.clear();
  indexRemoved.length = 0;
  txReads.length = 0;
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

describe('firestoreForgetStore.deleteFacts decides on the fact as it is at the write', () => {
  it('marks, never deletes, a fact the graph sync copied after the forget read it', async () => {
    const stale = refOf('dynamic_facts', 'd1'); // read while syncedToSpanner was false
    docs.set(at('dynamic_facts', 'd1'), { key: 'divorce', syncedToSpanner: true }); // the sync ran

    const kept = await firestoreForgetStore.deleteFacts!('u1', [stale]);

    expect(kept).toEqual([
      { collection: 'dynamic_facts', id: 'd1', data: { key: 'divorce', syncedToSpanner: true } },
    ]);
    expect(docs.get(at('dynamic_facts', 'd1'))).toEqual({ key: 'divorce', syncedToSpanner: true });
    expect(indexRemoved).toEqual([]);
  });

  it('marks, never deletes, a fact edited after the forget read it', async () => {
    const stale = refOf('extracted_facts', 'e1');
    docs.set(at('extracted_facts', 'e1'), { fact: 'Divorce is final, moving to Austin' });

    const kept = await firestoreForgetStore.deleteFacts!('u1', [stale]);

    expect(kept.map((r) => r.data)).toEqual([{ fact: 'Divorce is final, moving to Austin' }]);
    expect(docs.has(at('extracted_facts', 'e1'))).toBe(true);
  });

  it('judges the fresh fact, not the snapshot: one with no graph copy by now is deleted', async () => {
    // Read while it still had a copy; the copy was removed and the fact is live and unsynced.
    const stale = {
      collection: 'dynamic_facts',
      id: 'd3',
      data: { key: 'dog', syncedToSpanner: true },
    };
    expect(docs.get(at('dynamic_facts', 'd3'))).toEqual({ key: 'dog', syncedToSpanner: false });

    const kept = await firestoreForgetStore.deleteFacts!('u1', [stale]);

    expect(kept).toEqual([]);
    expect(docs.has(at('dynamic_facts', 'd3'))).toBe(false);
    expect(indexRemoved).toEqual(['conversation:fact_d3', 'fact:fact_u1_d3']);
  });

  it('a fact already gone is neither deleted again nor handed back to be marked', async () => {
    const stale = refOf('dynamic_facts', 'd1');
    docs.delete(at('dynamic_facts', 'd1'));
    expect(await firestoreForgetStore.deleteFacts!('u1', [stale])).toEqual([]);
  });

  it("reads and deletes only the caller's facts", async () => {
    docs.set('bogle_users/u2/dynamic_facts/d1', { key: 'divorce', syncedToSpanner: false });

    await firestoreForgetStore.deleteFacts!('u1', [refOf('dynamic_facts', 'd1')]);

    expect(txReads).toEqual([at('dynamic_facts', 'd1')]);
    expect(docs.has(at('dynamic_facts', 'd1'))).toBe(false);
    expect(docs.get('bogle_users/u2/dynamic_facts/d1')).toEqual({
      key: 'divorce',
      syncedToSpanner: false,
    });
  });

  it('forget that: a fact synced between the read and the write is hidden, and he does not say deleted', async () => {
    const topics: string[] = [];
    const store: ForgetStore = {
      // The snapshot the forget matches on; the graph sync copies d1 right after it.
      facts: async () => {
        const snapshot = [refOf('dynamic_facts', 'd1'), refOf('extracted_facts', 'e1')];
        docs.set(at('dynamic_facts', 'd1'), { key: 'divorce', syncedToSpanner: true });
        return snapshot;
      },
      markForgotten: firestoreForgetStore.markForgotten,
      deleteFacts: firestoreForgetStore.deleteFacts,
      addTopic: async (_u, t) => void topics.push(t),
      topics: async () => topics,
    };

    const result = await forgetTopic('u1', 'my divorce', store, new Date(), {
      FORGET_DELETES: 'on',
    });

    expect(result).toEqual({ kind: 'forgotten', marked: 2, deleted: 1, hidden: 1 });
    expect(docs.has(at('extracted_facts', 'e1'))).toBe(false);
    const d1 = docs.get(at('dynamic_facts', 'd1'));
    expect(typeof d1?.forgottenAt).toBe('string');
    expect(d1?.syncedToSpanner).toBe(false); // the sync takes its copy back out
    if (result.kind !== 'forgotten') throw new Error('not forgotten');
    expect(forgetDone(result)).toBe("I won't bring that up again.");
  });
});
