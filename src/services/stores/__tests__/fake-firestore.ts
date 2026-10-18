import type { Firestore } from '@google-cloud/firestore';

// A Firestore fake with only the calls the follow-through and errand stores make:
// documents by path, where (==, in, >=, <, <=), orderBy, limit, collectionGroup and
// transactions. Transactions are optimistic like Firestore's: writes are buffered,
// a read after a write throws, and if a document read inside one changed before it
// commits, it runs again.
type Cond = [string, string, unknown];
export function fakeFirestore() {
  const docs = new Map<string, Record<string, unknown>>();
  const versions = new Map<string, number>();
  const version = (path: string): number => versions.get(path) ?? 0;
  const snapOf = (path: string) => ({
    id: path.split('/').pop() ?? '',
    ref: docRef(path),
    exists: docs.has(path),
    data: () => docs.get(path),
  });
  const docRef = (path: string): Record<string, unknown> => ({
    path,
    id: path.split('/').pop() ?? '',
    collection: (name: string) => coll(`${path}/${name}`),
    get: async () => snapOf(path),
  });
  const matches = (data: Record<string, unknown>, [f, op, v]: Cond): boolean => {
    const x = data[f];
    if (op === 'in') return (v as unknown[]).includes(x);
    if (op === '==') return x === v;
    if (typeof x !== 'string') return false;
    if (op === '>=') return x >= String(v);
    if (op === '<') return x < String(v);
    if (op === '<=') return x <= String(v);
    throw new Error(`op ${op} not faked`);
  };
  const query = (
    pick: (path: string) => boolean,
    conds: Cond[] = [],
    order?: string,
    max?: number
  ): Record<string, unknown> => ({
    where: (f: string, op: string, v: unknown) => query(pick, [...conds, [f, op, v]], order, max),
    orderBy: (f: string) => query(pick, conds, f, max),
    limit: (n: number) => query(pick, conds, order, n),
    get: async () => {
      let hits = [...docs.entries()].filter(
        ([p, d]) => pick(p) && conds.every((c) => matches(d, c))
      );
      if (order) hits = hits.sort((a, b) => String(a[1][order]).localeCompare(String(b[1][order])));
      if (max !== undefined) hits = hits.slice(0, max);
      return { docs: hits.map(([p]) => snapOf(p)) };
    },
  });
  const coll = (path: string): Record<string, unknown> => ({
    ...query((p) => p.startsWith(`${path}/`) && p.split('/').length === path.split('/').length + 1),
    doc: (id: string) => docRef(`${path}/${id}`),
  });
  const db = {
    collection: (name: string) => coll(name),
    collectionGroup: (name: string) => query((p) => p.split('/').slice(-2, -1)[0] === name),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const reads = new Map<string, number>();
        const writes: Array<[string, Record<string, unknown>]> = [];
        const result = await fn({
          get: async (ref: { path: string }) => {
            if (writes.length) throw new Error('fake transaction: a read after a write');
            reads.set(ref.path, version(ref.path));
            return snapOf(ref.path);
          },
          set: (ref: { path: string }, data: Record<string, unknown>) =>
            void writes.push([ref.path, structuredClone(data)]),
        });
        if ([...reads].every(([path, v]) => version(path) === v)) {
          for (const [path, data] of writes) {
            docs.set(path, data);
            versions.set(path, version(path) + 1);
          }
          return result;
        }
      }
      throw new Error('fake transaction: too much contention');
    },
  };
  return { db: db as unknown as Firestore, docs };
}
