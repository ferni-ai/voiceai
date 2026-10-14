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
  removeConversationDocument: async (id: string) => {
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
    get: async () => ({
      docs: [...db.docs.entries()]
        .filter(([p]) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/'))
        .map(([p, data]) => ({ id: p.split('/').pop()!, data: () => data })),
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

const { correctRemembered, forgetRemembered, listRemembered } =
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

describe('listing facts', () => {
  it('includes a fact recall uses that has no extractedAt, after the dated ones', async () => {
    db.docs.set(`${FACTS}/old`, {
      entityName: 'User',
      key: 'home',
      value: 'Leeds',
      confidence: 0.9,
    });
    expect((await listRemembered('u1', store)).map((f) => f.id)).toEqual(['dog', 'old']);
  });
});
