/**
 * Path-keyed in-memory Firestore: just enough for the important-dates store,
 * reminder job and routes (doc get/set/update/delete, collection queries with
 * == / <= / array-contains, orderBy, limit, collection groups, transactions).
 */

type Data = Record<string, unknown>;
type Filter = [string, string, unknown];

export interface FakeDb {
  docs: Map<string, Data>;
  collection: (name: string) => FakeCollection;
  collectionGroup: (name: string) => FakeQuery;
  runTransaction: <T>(fn: (tx: FakeTx) => Promise<T>) => Promise<T>;
  /** Raw read for assertions. */
  read: (path: string) => Data | undefined;
}

export interface FakeTx {
  get: (ref: FakeDocRef) => Promise<FakeDocSnap>;
  set: (ref: FakeDocRef, data: Data) => void;
  update: (ref: FakeDocRef, patch: Data) => void;
  delete: (ref: FakeDocRef) => void;
}

interface FakeDocSnap {
  id: string;
  exists: boolean;
  ref: FakeDocRef;
  data: () => Data | undefined;
}

export interface FakeDocRef {
  id: string;
  path: string;
  parent: { id: string; parent: FakeDocRef | null };
  get: () => Promise<FakeDocSnap>;
  set: (data: Data) => Promise<void>;
  update: (patch: Data) => Promise<void>;
  delete: () => Promise<void>;
  collection: (name: string) => FakeCollection;
}

interface FakeQuery {
  where: (field: string, op: string, value: unknown) => FakeQuery;
  orderBy: (field: string) => FakeQuery;
  limit: (n: number) => FakeQuery;
  get: () => Promise<{ docs: FakeDocSnap[]; size: number; empty: boolean }>;
}

interface FakeCollection extends FakeQuery {
  doc: (id: string) => FakeDocRef;
}

const clone = (d: Data): Data => JSON.parse(JSON.stringify(d)) as Data;

const cmp = (a: unknown, b: unknown): number =>
  a === b ? 0 : (a as string | number) < (b as string | number) ? -1 : 1;

function matches(data: Data, [field, op, value]: Filter): boolean {
  const v = data[field];
  if (op === '==') return v === value;
  if (op === '<=') return typeof v === typeof value && v !== null && cmp(v, value) <= 0;
  if (op === 'array-contains') return Array.isArray(v) && v.includes(value);
  throw new Error(`fake firestore: unsupported op ${op}`);
}

export function createFakeDb(): FakeDb {
  const docs = new Map<string, Data>();

  const docRef = (path: string): FakeDocRef => {
    const parts = path.split('/');
    const id = parts[parts.length - 1];
    const parentDocPath = parts.slice(0, -2).join('/');
    const ref: FakeDocRef = {
      id,
      path,
      parent: { id: parts[parts.length - 2], parent: parentDocPath ? docRef(parentDocPath) : null },
      get: async () => snap(path),
      set: async (data) => void docs.set(path, clone(data)),
      update: async (patch) => {
        const cur = docs.get(path);
        if (!cur) throw new Error(`fake firestore: no document to update at ${path}`);
        docs.set(path, { ...cur, ...clone(patch) });
      },
      delete: async () => void docs.delete(path),
      collection: (name) => collectionRef(`${path}/${name}`),
    };
    return ref;
  };

  const snap = (path: string): FakeDocSnap => {
    const data = docs.get(path);
    const ref = docRef(path);
    return {
      id: ref.id,
      exists: data !== undefined,
      ref,
      data: () => (data ? clone(data) : undefined),
    };
  };

  const query = (
    select: (path: string) => boolean,
    filters: Filter[] = [],
    order?: string,
    n = Infinity
  ): FakeQuery => ({
    where: (f, op, v) => query(select, [...filters, [f, op, v]], order, n),
    orderBy: (f) => query(select, filters, f, n),
    limit: (k) => query(select, filters, order, k),
    get: async () => {
      const found = [...docs.entries()]
        .filter(([p, d]) => select(p) && filters.every((f) => matches(d, f)))
        .sort(([, a], [, b]) => (order ? cmp(a[order], b[order]) : 0))
        .slice(0, n)
        .map(([p]) => snap(p));
      return { docs: found, size: found.length, empty: found.length === 0 };
    },
  });

  const collectionRef = (path: string): FakeCollection => {
    const depth = path.split('/').length + 1;
    const q = query((p) => p.startsWith(`${path}/`) && p.split('/').length === depth);
    return { ...q, doc: (id: string) => docRef(`${path}/${id}`) };
  };

  return {
    docs,
    collection: (name) => collectionRef(name),
    collectionGroup: (name) =>
      query((p) => {
        const parts = p.split('/');
        return parts.length % 2 === 0 && parts[parts.length - 2] === name;
      }),
    runTransaction: async (fn) =>
      fn({
        get: async (ref) => snap(ref.path),
        set: (ref, data) => void docs.set(ref.path, clone(data)),
        update: (ref, patch) => {
          const cur = docs.get(ref.path);
          if (!cur) throw new Error(`fake firestore: no document to update at ${ref.path}`);
          docs.set(ref.path, { ...cur, ...clone(patch) });
        },
        delete: (ref) => void docs.delete(ref.path),
      }),
    read: (path) => docs.get(path),
  };
}
