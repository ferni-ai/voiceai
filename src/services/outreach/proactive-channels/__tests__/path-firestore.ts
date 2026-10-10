/**
 * An in-memory Firestore keyed by document path, with nested subcollections:
 * doc get/set/update, collection where (==, >=, <=), orderBy (asc/desc),
 * limit. Enough for the proactive check-in run end to end.
 */
type Json = Record<string, unknown>;

const cmp = (a: unknown, b: unknown): number => {
  const v = (x: unknown) => (x instanceof Date ? x.getTime() : x) as number | string;
  const [x, y] = [v(a), v(b)];
  return x === y ? 0 : x < y ? -1 : 1;
};

export function pathFirestore(docs: Map<string, Json>) {
  const snap = (path: string) => {
    const data = docs.get(path);
    return {
      id: path.split('/').pop() ?? '',
      exists: data !== undefined,
      ref: docRef(path),
      data: () => (data ? structuredClone(data) : undefined),
    };
  };
  function docRef(path: string): Json {
    return {
      id: path.split('/').pop(),
      path,
      get: async () => snap(path),
      set: async (data: Json) => void docs.set(path, structuredClone(data)),
      update: async (patch: Json) => void docs.set(path, { ...docs.get(path), ...patch }),
      collection: (name: string) => collectionRef(`${path}/${name}`),
    };
  }
  type Filter = [string, string, unknown];
  function query(prefix: string, filters: Filter[], order?: [string, string], n = Infinity): Json {
    return {
      where: (f: string, op: string, v: unknown) =>
        query(prefix, [...filters, [f, op, v]], order, n),
      orderBy: (f: string, dir = 'asc') => query(prefix, filters, [f, dir], n),
      limit: (k: number) => query(prefix, filters, order, k),
      get: async () => {
        let paths = [...docs.keys()].filter(
          (p) => p.startsWith(`${prefix}/`) && !p.slice(prefix.length + 1).includes('/')
        );
        paths = paths.filter((p) =>
          filters.every(([f, op, v]) => {
            const x = docs.get(p)?.[f];
            if (op === '==') return x === v;
            if (x === undefined) return false;
            return op === '>=' ? cmp(x, v) >= 0 : op === '<=' ? cmp(x, v) <= 0 : false;
          })
        );
        if (order) {
          const [f, dir] = order;
          paths.sort((a, b) => cmp(docs.get(a)?.[f], docs.get(b)?.[f]) * (dir === 'desc' ? -1 : 1));
        }
        const out = paths.slice(0, n).map(snap);
        return { docs: out, size: out.length, empty: out.length === 0 };
      },
    };
  }
  function collectionRef(path: string): Json {
    return { ...query(path, []), doc: (id: string) => docRef(`${path}/${id}`) };
  }
  return { collection: (name: string) => collectionRef(name) };
}
