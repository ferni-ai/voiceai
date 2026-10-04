/**
 * An in-memory Firestore for tests that walk real document paths:
 * db.collection('bogle_users').doc(uid).collection('reminders').doc(id), plus
 * collectionGroup queries, where ('==', '<=', 'in'), orderBy, limit, doc
 * get/set(merge)/update, and runTransaction (get/update). A ref knows its
 * parent chain (ref.parent.parent.id is the owning user), like the real SDK.
 *
 * Use one shared instance per test file (import it from a vi.mock factory)
 * and clear `store` between tests.
 */
type Data = Record<string, unknown>;
type Op = '==' | '<=' | 'in';

const cmp = (a: unknown, b: unknown): number => {
  const v = (x: unknown) => (x instanceof Date ? x.getTime() : x) as number | string;
  const [x, y] = [v(a), v(b)];
  return x === y ? 0 : x < y ? -1 : 1;
};

function matches(value: unknown, op: Op, target: unknown): boolean {
  if (value === undefined) return false;
  if (op === '==') return value === target;
  if (op === 'in') return (target as unknown[]).includes(value);
  return cmp(value, target) <= 0;
}

export function createNestedFirestore() {
  const store = new Map<string, Data>();

  interface DocRef {
    id: string;
    path: string;
    parent: { id: string; parent: DocRef | null };
    collection: (name: string) => ReturnType<typeof collectionRef>;
    get: () => Promise<{ id: string; exists: boolean; data: () => Data | undefined }>;
    set: (data: Data, opts?: { merge?: boolean }) => Promise<void>;
    update: (patch: Data) => Promise<void>;
  }

  const write = (path: string, patch: Data) => {
    const current = store.get(path);
    if (!current) throw new Error(`NOT_FOUND: no document to update at ${path}`);
    store.set(path, { ...current, ...patch });
  };

  function docRef(path: string): DocRef {
    const parts = path.split('/');
    return {
      id: parts[parts.length - 1],
      path,
      parent: {
        id: parts[parts.length - 2],
        parent: parts.length >= 4 ? docRef(parts.slice(0, -2).join('/')) : null,
      },
      collection: (name) => collectionRef(`${path}/${name}`),
      get: async () => {
        const data = store.get(path);
        return { id: parts[parts.length - 1], exists: !!data, data: () => data && { ...data } };
      },
      set: async (data, opts) => {
        store.set(path, opts?.merge ? { ...(store.get(path) ?? {}), ...data } : { ...data });
      },
      update: async (patch) => write(path, patch),
    };
  }

  function query(
    inScope: (path: string) => boolean,
    filters: Array<[string, Op, unknown]> = [],
    order?: [string, 'asc' | 'desc'],
    max = Infinity
  ) {
    return {
      where: (f: string, op: Op, v: unknown) =>
        query(inScope, [...filters, [f, op, v]], order, max),
      orderBy: (f: string, dir: 'asc' | 'desc' = 'asc') => query(inScope, filters, [f, dir], max),
      limit: (n: number) => query(inScope, filters, order, n),
      get: async () => {
        let rows = [...store.entries()]
          .filter(([p]) => inScope(p))
          .filter(([, d]) => filters.every(([f, op, v]) => matches(d[f], op, v)));
        if (order) {
          const [f, dir] = order;
          rows = rows
            .filter(([, d]) => d[f] !== undefined)
            .sort(([, a], [, b]) => (dir === 'desc' ? -1 : 1) * cmp(a[f], b[f]));
        }
        const docs = rows.slice(0, max).map(([p, d]) => ({
          id: p.split('/').pop() as string,
          ref: docRef(p),
          data: () => ({ ...d }),
        }));
        return { docs, size: docs.length, empty: docs.length === 0 };
      },
    };
  }

  function collectionRef(path: string) {
    const depth = path.split('/').length + 1;
    return {
      ...query((p) => p.startsWith(`${path}/`) && p.split('/').length === depth),
      doc: (id: string) => docRef(`${path}/${id}`),
    };
  }

  const db = {
    collection: (name: string) => collectionRef(name),
    collectionGroup: (name: string) =>
      query((p) => {
        const parts = p.split('/');
        return parts[parts.length - 2] === name;
      }),
    runTransaction: async <T>(
      fn: (tx: {
        get: (r: DocRef) => ReturnType<DocRef['get']>;
        update: (r: DocRef, patch: Data) => void;
      }) => Promise<T>
    ): Promise<T> => fn({ get: (r) => r.get(), update: (r, patch) => write(r.path, patch) }),
  };

  /** The documents in one collection (path like 'bogle_users/u1/reminders'). */
  const docsIn = (path: string): Data[] =>
    [...store.entries()]
      .filter(
        ([p]) => p.startsWith(`${path}/`) && p.split('/').length === path.split('/').length + 1
      )
      .map(([, d]) => d);

  return { store, db, docsIn };
}

/** One instance shared by a test file's mocks (firebase-admin and firestore-utils). */
export const sharedNestedFirestore = createNestedFirestore();
