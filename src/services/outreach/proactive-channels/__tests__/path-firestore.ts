/**
 * An in-memory Firestore keyed by document path, with nested subcollections:
 * doc get/set (with merge)/update, runTransaction (serialized; create), collection where (==, >=,
 * <=, array-contains; dotted field paths), select, orderBy (asc/desc, or '__name__' for the document id),
 * startAfter/startAt/endAt(id), limit. Enough for the
 * proactive check-in run and the daily outreach run end to end.
 */
type Json = Record<string, unknown>;

const cmp = (a: unknown, b: unknown): number => {
  const v = (x: unknown) => (x instanceof Date ? x.getTime() : x) as number | string;
  const [x, y] = [v(a), v(b)];
  return x === y ? 0 : x < y ? -1 : 1;
};

/** One transaction queue per database, however many handles open it. */
const queues = new WeakMap<Map<string, Json>, Promise<unknown>>();

const isMap = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date);

/** set(..., { merge: true }): nested maps merge, everything else is replaced. */
function deepMerge(base: Json, patch: Json): Json {
  const out: Json = structuredClone(base);
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isMap(v) && isMap(out[k]) ? deepMerge(out[k] as Json, v) : structuredClone(v);
  }
  return out;
}

/** A field, or a nested one by dotted path ('flags.CANDOR'). */
const fieldOf = (doc: Json | undefined, f: string): unknown =>
  doc && f in doc
    ? doc[f]
    : f.split('.').reduce<unknown>((v, k) => (isMap(v) ? v[k] : undefined), doc);

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
      set: async (data: Json, opts?: { merge?: boolean }) =>
        void docs.set(
          path,
          opts?.merge ? deepMerge(docs.get(path) ?? {}, data) : structuredClone(data)
        ),
      update: async (patch: Json) => void docs.set(path, { ...docs.get(path), ...patch }),
      collection: (name: string) => collectionRef(`${path}/${name}`),
    };
  }
  type Filter = [string, string, unknown];
  function query(
    prefix: string,
    filters: Filter[],
    order?: [string, string],
    n = Infinity,
    after?: string,
    range: { from?: string; to?: string } = {}
  ): Json {
    return {
      where: (f: string, op: string, v: unknown) =>
        query(prefix, [...filters, [f, op, v]], order, n, after, range),
      // Field masks are a read optimisation; whole documents come back here.
      select: () => query(prefix, filters, order, n, after, range),
      orderBy: (f: string, dir = 'asc') => query(prefix, filters, [f, dir], n, after, range),
      limit: (k: number) => query(prefix, filters, order, k, after, range),
      startAfter: (id: string) => query(prefix, filters, order, n, id, range),
      startAt: (id: string) => query(prefix, filters, order, n, after, { ...range, from: id }),
      endAt: (id: string) => query(prefix, filters, order, n, after, { ...range, to: id }),
      get: async () => {
        let paths = [...docs.keys()].filter(
          (p) => p.startsWith(`${prefix}/`) && !p.slice(prefix.length + 1).includes('/')
        );
        paths = paths.filter((p) =>
          filters.every(([f, op, v]) => {
            const x = fieldOf(docs.get(p), f);
            if (op === '==') return x === v;
            if (op === 'array-contains') return Array.isArray(x) && x.includes(v);
            if (x === undefined) return false;
            return op === '>=' ? cmp(x, v) >= 0 : op === '<=' ? cmp(x, v) <= 0 : false;
          })
        );
        const idOf = (p: string) => p.split('/').pop() ?? '';
        if (order) {
          const [f, dir] = order;
          const key = (p: string) => (f === '__name__' ? idOf(p) : docs.get(p)?.[f]);
          paths.sort((a, b) => cmp(key(a), key(b)) * (dir === 'desc' ? -1 : 1));
        }
        if (after !== undefined) paths = paths.filter((p) => idOf(p) > after);
        const { from, to } = range;
        if (from !== undefined) paths = paths.filter((p) => idOf(p) >= from);
        if (to !== undefined) paths = paths.filter((p) => idOf(p) <= to);
        const out = paths.slice(0, n).map(snap);
        return { docs: out, size: out.length, empty: out.length === 0 };
      },
    };
  }
  function collectionRef(path: string): Json {
    return { ...query(path, []), doc: (id: string) => docRef(`${path}/${id}`) };
  }
  // Transactions run one at a time (Firestore's serializable guarantee for
  // overlapping read-then-write); create fails when the document exists.
  type Ref = { path: string; get: () => Promise<unknown>; set: (d: Json) => Promise<void> };
  const tx = {
    get: async (r: { get: () => Promise<unknown> }) => r.get(),
    create: (r: Ref, d: Json) => {
      if (docs.has(r.path)) throw new Error('6 ALREADY_EXISTS: Document already exists');
      docs.set(r.path, structuredClone(d));
    },
    set: (r: Ref, d: Json) => void docs.set(r.path, structuredClone(d)),
  };
  const runTransaction = async <T>(fn: (t: typeof tx) => Promise<T>): Promise<T> => {
    const run = (queues.get(docs) ?? Promise.resolve()).then(async () => fn(tx));
    queues.set(
      docs,
      run.catch(() => undefined)
    );
    return run;
  };
  return { collection: (name: string) => collectionRef(name), runTransaction };
}
