/**
 * Minimal in-memory Firestore double for the preference profile tests.
 * Supports nested collection/doc paths, get/set(merge)/delete, collection get,
 * and `where(field, 'array-contains', v).limit(n).get()`.
 */

type Data = Record<string, unknown>;

export interface FakeFirestore {
  readonly store: Map<string, Data>;
  collection(name: string): FakeCollection;
  failWrites: boolean;
}

interface FakeDocSnap {
  id: string;
  exists: boolean;
  data(): Data | undefined;
  ref: FakeDoc;
}

export interface FakeDoc {
  path: string;
  id: string;
  get(): Promise<FakeDocSnap>;
  set(data: Data, opts?: { merge?: boolean }): Promise<void>;
  delete(): Promise<void>;
  collection(name: string): FakeCollection;
}

export interface FakeCollection {
  path: string;
  doc(id: string): FakeDoc;
  get(): Promise<{ docs: FakeDocSnap[]; empty: boolean }>;
  where(field: string, op: string, value: unknown): FakeCollection;
  limit(n: number): FakeCollection;
}

export function createFakeFirestore(): FakeFirestore {
  const store = new Map<string, Data>();
  const fs: FakeFirestore = {
    store,
    failWrites: false,
    collection: (name: string) => makeCollection(name, []),
  };

  function makeDoc(path: string): FakeDoc {
    const id = path.split('/').pop() ?? '';
    const doc: FakeDoc = {
      path,
      id,
      get: async () => {
        const data = store.get(path);
        return {
          id,
          exists: data !== undefined,
          data: () => (data ? structuredClone(data) : undefined),
          ref: doc,
        };
      },
      set: async (data, opts) => {
        if (fs.failWrites) throw new Error('write failed');
        const prev = opts?.merge ? (store.get(path) ?? {}) : {};
        store.set(path, structuredClone({ ...prev, ...data }));
      },
      delete: async () => {
        if (fs.failWrites) throw new Error('write failed');
        store.delete(path);
      },
      collection: (name) => makeCollection(`${path}/${name}`, []),
    };
    return doc;
  }

  function makeCollection(
    path: string,
    filters: ((d: Data) => boolean)[],
    max = Infinity
  ): FakeCollection {
    return {
      path,
      doc: (id: string) => makeDoc(`${path}/${id}`),
      where: (field, op, value) => {
        if (op !== 'array-contains') throw new Error(`unsupported op ${op}`);
        const f = (d: Data) => Array.isArray(d[field]) && (d[field] as unknown[]).includes(value);
        return makeCollection(path, [...filters, f], max);
      },
      limit: (n) => makeCollection(path, filters, n),
      get: async () => {
        const depth = path.split('/').length + 1;
        const docs: FakeDocSnap[] = [];
        for (const [p, data] of store) {
          if (!p.startsWith(`${path}/`) || p.split('/').length !== depth) continue;
          if (!filters.every((f) => f(data))) continue;
          const ref = makeDoc(p);
          docs.push({ id: ref.id, exists: true, data: () => structuredClone(data), ref });
          if (docs.length >= max) break;
        }
        return { docs, empty: docs.length === 0 };
      },
    };
  }

  return fs;
}
