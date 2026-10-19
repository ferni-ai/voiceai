import type { Firestore } from '@google-cloud/firestore';

// A Firestore fake with only the calls the follow-through store makes: documents by
// path, where (in, >=, <, <=), orderBy, limit, collectionGroup and transactions.
type Cond = [string, string, unknown];
export function fakeFirestore() {
  const docs = new Map<string, Record<string, unknown>>();
  const snapOf = (path: string) => ({
    id: path.split('/').pop() ?? '',
    exists: docs.has(path),
    data: () => docs.get(path),
  });
  const docRef = (path: string): Record<string, unknown> => ({
    path,
    collection: (name: string) => coll(`${path}/${name}`),
    get: async () => snapOf(path),
  });
  const matches = (data: Record<string, unknown>, [f, op, v]: Cond): boolean => {
    const x = data[f];
    if (op === 'in') return (v as unknown[]).includes(x);
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
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
      fn({
        get: async (ref: { path: string }) => snapOf(ref.path),
        set: (ref: { path: string }, data: Record<string, unknown>) =>
          void docs.set(ref.path, { ...data }),
      }),
  };
  return { db: db as unknown as Firestore, docs };
}
