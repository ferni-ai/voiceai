import type { Firestore } from '@google-cloud/firestore';

// A Firestore fake with only the calls the follow-through, errand and booking-prefs stores
// make: documents by path (get, delete), where (==, in, >=, <, <=), orderBy, limit, collectionGroup and
// transactions. Transactions are optimistic like Firestore's: writes are buffered,
// a read after a write throws, and a transaction whose reads (documents or queries)
// changed before it commits runs again. Every write bumps a document's version, so
// a rewrite with identical data still counts as a change. `writes` counts committed
// document writes and deletes. With `directions`, orderBy(f, 'desc') sorts descending
// (off by default: older tests were written against an ascending-only fake).
type Cond = [string, string, unknown];
interface Snap {
  id: string;
  ref: Record<string, unknown>;
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
}
export function fakeFirestore(opts: { directions?: boolean } = {}) {
  const docs = new Map<string, Record<string, unknown>>();
  const versions = new Map<string, number>();
  const stats = { writes: 0 };
  const version = (path: string): number => versions.get(path) ?? 0;
  const snapOf = (path: string): Snap => ({
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
    delete: async () => {
      if (docs.delete(path)) versions.set(path, version(path) + 1);
      stats.writes++;
    },
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
    max?: number,
    desc = false
  ): Record<string, unknown> => {
    const run = (): { docs: Snap[] } => {
      let hits = [...docs.entries()].filter(
        ([p, d]) => pick(p) && conds.every((c) => matches(d, c))
      );
      if (order) hits = hits.sort((a, b) => String(a[1][order]).localeCompare(String(b[1][order])));
      if (order && desc) hits.reverse();
      if (max !== undefined) hits = hits.slice(0, max);
      return { docs: hits.map(([p]) => snapOf(p)) };
    };
    return {
      where: (f: string, op: string, v: unknown) =>
        query(pick, [...conds, [f, op, v]], order, max, desc),
      orderBy: (f: string, dir?: string) =>
        query(pick, conds, f, max, !!opts.directions && dir === 'desc'),
      limit: (n: number) => query(pick, conds, order, n, desc),
      run,
      get: async () => run(),
    };
  };
  const coll = (path: string): Record<string, unknown> => ({
    ...query((p) => p.startsWith(`${path}/`) && p.split('/').length === path.split('/').length + 1),
    doc: (id: string) => docRef(`${path}/${id}`),
  });
  const seen = (s: { docs: Snap[] }): string =>
    JSON.stringify(s.docs.map((d) => [d.ref.path, version(d.ref.path as string), d.data()]));
  const db = {
    collection: (name: string) => coll(name),
    collectionGroup: (name: string) => query((p) => p.split('/').slice(-2, -1)[0] === name),
    recursiveDelete: async (ref: { path: string }) => {
      for (const p of [...docs.keys()])
        if (p === ref.path || p.startsWith(`${ref.path}/`)) {
          docs.delete(p);
          stats.writes++;
        }
    },
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const unchanged: Array<() => boolean> = [];
        const writes: Array<[string, Record<string, unknown>]> = [];
        const result = await fn({
          get: async (target: { path?: string; run?: () => { docs: Snap[] } }) => {
            if (writes.length) throw new Error('fake transaction: a read after a write');
            const read = (): { docs: Snap[] } =>
              typeof target.path === 'string'
                ? { docs: [snapOf(target.path)] }
                : (target.run as () => { docs: Snap[] })();
            const before = seen(read());
            unchanged.push(() => seen(read()) === before);
            return typeof target.path === 'string' ? snapOf(target.path) : read();
          },
          set: (ref: { path: string }, data: Record<string, unknown>) =>
            void writes.push([ref.path, structuredClone(data)]),
        });
        // Commit: synchronous, so no other transaction runs between check and write
        if (unchanged.every((ok) => ok())) {
          for (const [p, d] of writes) {
            docs.set(p, d);
            versions.set(p, version(p) + 1);
            stats.writes++;
          }
          return result;
        }
      }
      throw new Error('fake transaction: too much contention');
    },
  };
  return { db: db as unknown as Firestore, docs, stats };
}
