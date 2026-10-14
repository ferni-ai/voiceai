/**
 * The Firestore memory-control store (memory-control-store.ts) against an in-memory Firestore: a fact
 * forgotten or corrected in the app leaves the indexes per-turn memory search
 * reads (not only the fact list), and a correction is one write, both halves
 * or neither. Writes outside a batch apply at once, so a non-atomic correction
 * would show here as half a write.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const removed: string[] = [];
vi.mock('../../retrieval/conversation-index.js', () => ({
  removeOwnedConversationDocument: async (id: string, _userId: string) => {
    removed.push(`conversation:${id}`);
  },
}));
vi.mock('../../retrieval/semantic-memory-search.js', () => ({
  removeIndexedMemory: async (source: string, id: string) => {
    removed.push(`semantic:${source}_${id}`);
  },
}));

type Data = Record<string, unknown>;
const db = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  failCommit: false,
  queries: [] as Array<{ path: string; field: string; dir: string; limit: number }>,
}));

function docRef(path: string) {
  return {
    path,
    get: async () => ({
      id: path.split('/').pop()!,
      exists: db.docs.has(path),
      data: () => db.docs.get(path),
    }),
    update: async (patch: Data) => {
      db.docs.set(path, { ...db.docs.get(path), ...patch });
    },
    create: async (data: Data) => {
      if (db.docs.has(path)) throw new Error('exists');
      db.docs.set(path, data);
    },
  };
}
function collection(path: string) {
  return {
    doc: (id: string) => ({
      ...docRef(`${path}/${id}`),
      collection: (c: string) => collection(`${path}/${id}/${c}`),
    }),
    orderBy: (field: string, dir: string) => ({
      limit: (n: number) => {
        db.queries.push({ path, field, dir, limit: n });
        return {
          get: async () => ({
            docs: [...db.docs.entries()]
              .filter(([p]) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/'))
              .slice(0, n)
              .map(([p, data]) => ({ id: p.split('/').pop()!, data: () => data })),
          }),
        };
      },
    }),
  };
}
vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection,
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        update: (ref: { path: string }, patch: Data) =>
          ops.push(() => db.docs.set(ref.path, { ...db.docs.get(ref.path), ...patch })),
        create: (ref: { path: string }, data: Data) =>
          ops.push(() => {
            if (db.docs.has(ref.path)) throw new Error('exists');
            db.docs.set(ref.path, data);
          }),
        commit: async () => {
          if (db.failCommit) throw new Error('commit failed');
          for (const op of ops) op();
        },
      };
    },
  }),
}));

const { MAX_LISTED, correctRemembered, forgetRemembered, listRemembered } =
  await import('../../recall/memory-control.js');
const { firestoreMemoryControlStore: store } = await import('../memory-control-store.js');

const FACTS = 'bogle_users/u1/dynamic_facts';
const dog = {
  entityName: 'Biscuit',
  key: 'breed',
  value: 'golden retriever',
  confidence: 0.9,
  extractedAt: '2026-10-05T18:00:00Z',
  syncedToSpanner: true,
};

beforeEach(() => {
  removed.length = 0;
  db.docs.clear();
  db.failCommit = false;
  db.queries.length = 0;
  db.docs.set(`${FACTS}/dog`, { ...dog });
});

describe('forgetting a fact in the app', () => {
  it('takes it out of the memory index and the graph copy, not only the list', async () => {
    expect(await forgetRemembered('u1', 'dog', store, new Date('2026-10-11T12:00:00Z'))).toBe(true);
    expect(db.docs.get(`${FACTS}/dog`)).toMatchObject({
      forgottenAt: '2026-10-11T12:00:00.000Z',
      syncedToSpanner: false, // the next graph sync removes the copy it made
    });
    expect(removed).toEqual(['conversation:fact_dog', 'semantic:fact_fact_u1_dog']);
  });
});

describe('correcting a fact in the app', () => {
  it('takes the wrong one out of the indexes and writes the right one', async () => {
    const at = new Date('2026-10-11T12:00:00Z');
    const result = await correctRemembered('u1', 'dog', 'labradoodle', store, at);
    expect(result.kind).toBe('corrected');
    const newId = result.kind === 'corrected' ? result.fact.id : '';
    expect(db.docs.get(`${FACTS}/dog`)).toMatchObject({
      forgottenAt: at.toISOString(),
      correctedBy: newId,
      syncedToSpanner: false,
    });
    expect(db.docs.get(`${FACTS}/${newId}`)).toMatchObject({
      value: 'labradoodle',
      corrects: 'dog',
    });
    expect(removed).toEqual(['conversation:fact_dog', 'semantic:fact_fact_u1_dog']);
  });

  it('writes neither half when the write fails, and leaves the indexes alone', async () => {
    db.failCommit = true;
    await expect(correctRemembered('u1', 'dog', 'labradoodle', store)).rejects.toThrow(
      'commit failed'
    );
    expect([...db.docs.keys()]).toEqual([`${FACTS}/dog`]); // no corrected fact
    expect(db.docs.get(`${FACTS}/dog`)).toEqual(dog); // the old one still live
    expect(removed).toEqual([]);
  });
});

describe("another caller's fact", () => {
  it('is not found by id: no write, no index removal, their fact untouched', async () => {
    const theirs = `bogle_users/u2/dynamic_facts/dog2`;
    db.docs.set(theirs, { ...dog });
    expect(await forgetRemembered('u1', 'dog2', store)).toBe(false);
    expect(await correctRemembered('u1', 'dog2', 'labradoodle', store)).toEqual({
      kind: 'not-found',
    });
    expect(db.docs.get(theirs)).toEqual(dog);
    expect([...db.docs.keys()].sort()).toEqual([`${FACTS}/dog`, theirs].sort());
    expect(removed).toEqual([]);
  });
});

describe('listing facts', () => {
  it('reads a bounded page under the caller, newest first', async () => {
    await listRemembered('u1', store);
    expect(db.queries).toEqual([
      { path: FACTS, field: 'extractedAt', dir: 'desc', limit: MAX_LISTED * 2 },
    ]);
  });
});
