/**
 * An in-memory Firestore for the engagement store's tests: nested
 * collections (engagement_profiles/{uid}/predictions/{id}), set with merge,
 * and queries with where (== or >=), orderBy and limit. Field values compare
 * as strings, which is how the store's ISO dates sort.
 */
type Json = Record<string, unknown>;

export interface FakeEngagementFirestore {
  db: { collection: (name: string) => unknown; runTransaction: unknown };
  /** Every stored document, by path. */
  docs: Map<string, Json>;
  /** Writes to a path this matches throw, as an unavailable Firestore would. */
  failWrites: { match: RegExp | null };
  /** Reads of a document path this matches throw, as a timed-out Firestore would. */
  failReads: { match: RegExp | null };
  /** Reads of a document path this matches never settle, as a hung connection would. */
  hangReads: { match: RegExp | null };
}

export function createFakeEngagementFirestore(): FakeEngagementFirestore {
  const docs = new Map<string, Json>();
  const failWrites: FakeEngagementFirestore['failWrites'] = { match: null };
  const failReads: FakeEngagementFirestore['failReads'] = { match: null };
  const hangReads: FakeEngagementFirestore['hangReads'] = { match: null };
  let autoIds = 0; // doc() with no id: a new document, as Firestore's auto id

  const docRef = (path: string) => ({
    path,
    collection: (name: string) => query(`${path}/${name}`, []),
    get: async () => {
      if (failReads.match?.test(path)) throw new Error('4 DEADLINE_EXCEEDED: fake timeout');
      if (hangReads.match?.test(path)) await new Promise<never>(() => {});
      const data = docs.get(path);
      return {
        id: path.split('/').pop(),
        exists: data !== undefined,
        data: () => data && structuredClone(data),
      };
    },
    set: async (data: Json, opts?: { merge?: boolean }) => {
      if (failWrites.match?.test(path)) throw new Error('14 UNAVAILABLE: fake outage');
      const next = structuredClone(data);
      docs.set(path, opts?.merge ? { ...(docs.get(path) ?? {}), ...next } : next);
    },
    /** As Firestore's: merges top-level fields, and the document must exist */
    update: async (data: Json) => {
      const current = docs.get(path);
      if (!current) throw Object.assign(new Error('5 NOT_FOUND'), { code: 5 });
      docs.set(path, { ...current, ...structuredClone(data) });
    },
  });

  const query = (
    path: string,
    filters: Array<[string, string, unknown]>,
    order?: [string, 'asc' | 'desc'],
    limit?: number
  ) => ({
    doc: (id = `auto-${(autoIds += 1)}`) => docRef(`${path}/${id}`),
    where: (field: string, op: string, value: unknown) =>
      query(path, [...filters, [field, op, value]], order, limit),
    orderBy: (field: string, dir: 'asc' | 'desc' = 'asc') =>
      query(path, filters, [field, dir], limit),
    limit: (n: number) => query(path, filters, order, n),
    get: async () => {
      let rows = [...docs].filter(
        ([p]) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/')
      );
      rows = rows.filter(([, d]) =>
        filters.every(([f, op, v]) => (op === '>=' ? String(d[f]) >= String(v) : d[f] === v))
      );
      if (order) {
        const [f, dir] = order;
        rows.sort(
          ([, a], [, b]) => String(a[f]).localeCompare(String(b[f])) * (dir === 'desc' ? -1 : 1)
        );
      }
      if (limit !== undefined) rows = rows.slice(0, limit);
      return {
        docs: rows.map(([p, d]) => ({ id: p.split('/').pop(), data: () => structuredClone(d) })),
      };
    },
  });

  type Ref = ReturnType<typeof docRef>;
  /** Reads go straight through; writes apply once the function resolves, as a commit does */
  const runTransaction = async <T>(
    fn: (tx: {
      get: (ref: Ref) => ReturnType<Ref['get']>;
      set: (ref: Ref, data: Json, opts?: { merge?: boolean }) => void;
    }) => Promise<T>
  ): Promise<T> => {
    const writes: Array<() => Promise<void>> = [];
    const result = await fn({
      get: async (ref) => ref.get(),
      set: (ref, data, opts) => {
        writes.push(async () => ref.set(data, opts));
      },
    });
    for (const write of writes) await write();
    return result;
  };

  return {
    db: { collection: (name: string) => query(name, []), runTransaction },
    docs,
    failWrites,
    failReads,
    hangReads,
  };
}
