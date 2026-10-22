/**
 * The Firestore memory-control store (memory-control-store.ts) against an in-memory Firestore: a fact
 * forgotten or corrected in the app leaves the indexes per-turn memory search
 * reads (not only the fact list), and a correction is one write, both halves
 * or neither. Writes outside a batch apply at once, so a non-atomic correction
 * would show here as half a write.
 */
import { FieldValue } from '@google-cloud/firestore';
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
/** An update as Firestore applies it: FieldValue.delete() removes the field. */
function patched(prev: Data | undefined, patch: Data): Data {
  const out = { ...prev, ...patch };
  for (const [k, v] of Object.entries(patch)) {
    if (v instanceof FieldValue && v.isEqual(FieldValue.delete())) delete out[k];
  }
  return out;
}
const db = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  failCommit: false,
  limits: [] as number[],
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
      db.docs.set(path, patched(db.docs.get(path), patch));
    },
    create: async (data: Data) => {
      if (db.docs.has(path)) throw new Error('exists');
      db.docs.set(path, data);
    },
  };
}
type Row = [string, Data];
/** A Firestore query over the docs right under `path`: where (==), orderBy (one field), limit. */
function query(path: string, rows: (all: Row[]) => Row[] = (all) => all) {
  const run = (): Row[] =>
    rows(
      [...db.docs.entries()].filter(
        ([p]) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/')
      ) as Row[]
    );
  return {
    get: async () => ({
      docs: run().map(([p, data]) => ({ id: p.split('/').pop()!, data: () => data })),
    }),
    where: (field: string, _op: string, value: unknown) =>
      query(path, (all) => rows(all).filter(([, d]) => d[field] === value)),
    // like Firestore, ordering by a field leaves out docs without it
    orderBy: (field: string, dir: string) =>
      query(path, (all) =>
        rows(all)
          .filter(([, d]) => d[field] !== undefined)
          .sort(
            ([, a], [, b]) =>
              (dir === 'desc' ? -1 : 1) * String(a[field]).localeCompare(String(b[field]))
          )
      ),
    limit: (n: number) => {
      db.limits.push(n);
      return query(path, (all) => rows(all).slice(0, n));
    },
  };
}
function collection(path: string) {
  return {
    ...query(path),
    doc: (id: string) => ({
      ...docRef(`${path}/${id}`),
      collection: (c: string) => collection(`${path}/${id}/${c}`),
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
          ops.push(() => db.docs.set(ref.path, patched(db.docs.get(ref.path), patch))),
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
const { RECALL_READS } = await import('../../recall/memory-control.js');

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

describe('a stored vector (RECALL_VECTOR_INDEX)', () => {
  it('is deleted in the write that forgets or corrects the fact, so a vector search misses it', async () => {
    const withVector = { ...dog, embedding: FieldValue.vector([0.1, 0.2]) };
    db.docs.set(`${FACTS}/dog`, { ...withVector });
    expect(await forgetRemembered('u1', 'dog', store)).toBe(true);
    expect(db.docs.get(`${FACTS}/dog`)).not.toHaveProperty('embedding');
    expect(db.docs.get(`${FACTS}/dog`)).toHaveProperty('forgottenAt');

    db.docs.set(`${FACTS}/dog`, { ...withVector });
    const result = await correctRemembered('u1', 'dog', 'labradoodle', store);
    expect(result.kind).toBe('corrected');
    expect(db.docs.get(`${FACTS}/dog`)).not.toHaveProperty('embedding');
    expect(db.docs.get(`${FACTS}/dog`)).toHaveProperty('correctedBy');
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
      syncedToSpanner: false, // or the graph sync never picks the corrected fact up
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
  const fact = (n: number, extractedAt?: string) => ({
    entityName: 'User',
    key: `k${n}`,
    value: `v${n}`,
    confidence: 0.9,
    ...(extractedAt && { extractedAt }),
  });

  it('reads what recall reads: the newest RECALL_READS dated facts', async () => {
    db.docs.clear();
    // ids in the opposite order to their dates: an id-ordered read would get the oldest
    for (let n = 0; n < RECALL_READS + 20; n++) {
      const day = String(1 + (n % 28)).padStart(2, '0');
      const month = String(1 + Math.floor(n / 28)).padStart(2, '0');
      db.docs.set(
        `${FACTS}/a${String(999 - n).padStart(3, '0')}`,
        fact(n, `2026-${month}-${day}T00:00:00Z`)
      );
    }
    db.docs.set(`${FACTS}/undated`, fact(999));
    const listed = await listRemembered('u1', store);
    expect(listed).toHaveLength(RECALL_READS);
    expect(listed.map((f) => f.detail)).toContain(`k${RECALL_READS + 19}: v${RECALL_READS + 19}`);
    expect(listed.map((f) => f.detail)).not.toContain('k0: v0');
    expect(listed.map((f) => f.id)).not.toContain('undated'); // as recall: dated ones exist
  });

  it('lists undated facts when none is dated, as recall does', async () => {
    db.docs.clear();
    db.docs.set(`${FACTS}/old`, fact(1));
    expect((await listRemembered('u1', store)).map((f) => f.id)).toEqual(['old']);
  });
});

describe('a fact stored more than once', () => {
  const copy = { ...dog, confidence: 0.6, extractedAt: '2026-09-01T00:00:00Z' };

  it('a correction forgets every copy of the wrong one, in one write', async () => {
    db.docs.set(`${FACTS}/dogCopy`, { ...copy });
    const result = await correctRemembered('u1', 'dog', 'labradoodle', store);
    const newId = result.kind === 'corrected' ? result.fact.id : '';
    for (const id of ['dog', 'dogCopy']) {
      expect(db.docs.get(`${FACTS}/${id}`)).toMatchObject({ correctedBy: newId });
    }
    expect((await listRemembered('u1', store)).map((f) => f.detail)).toEqual([
      'breed: labradoodle',
    ]);
  });

  it('a forget that failed on a copy finishes when retried', async () => {
    db.docs.set(`${FACTS}/dogCopy`, { ...copy });
    db.docs.set(`${FACTS}/dog`, { ...dog, forgottenAt: '2026-10-11T00:00:00Z' }); // first try
    expect(await forgetRemembered('u1', 'dog', store)).toBe(true);
    expect(db.docs.get(`${FACTS}/dogCopy`)!.forgottenAt).toBeDefined();
    expect(await forgetRemembered('u1', 'dog', store)).toBe(false); // nothing live left
  });
});
