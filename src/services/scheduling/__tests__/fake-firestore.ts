/**
 * Just enough Firestore for collection-group "due items" queries and claim
 * transactions: where ==/<=, orderBy, limit, runTransaction(get/update).
 */
export type Row = { id: string; userId: string; collection: string; data: Record<string, unknown> };

const cmp = (a: unknown, b: unknown): number => {
  const v = (x: unknown) => (x instanceof Date ? x.getTime() : x);
  const [x, y] = [v(a), v(b)];
  return x === y ? 0 : (x as number | string) < (y as number | string) ? -1 : 1;
};

export function fakeFirestore(rows: Row[]) {
  const ref = (row: Row) => ({ id: row.id, parent: { parent: { id: row.userId } }, _row: row });
  const query = (
    collection: string,
    filters: Array<[string, string, unknown]> = [],
    order?: string,
    n = Infinity
  ) => ({
    where: (f: string, op: string, v: unknown) =>
      query(collection, [...filters, [f, op, v]], order, n),
    orderBy: (f: string) => query(collection, filters, f, n),
    limit: (k: number) => query(collection, filters, order, k),
    get: async () => {
      const docs = rows
        .filter((r) => r.collection === collection)
        .filter((r) =>
          filters.every(([f, op, v]) =>
            op === '==' ? r.data[f] === v : op === '<=' ? cmp(r.data[f], v) <= 0 : false
          )
        )
        .sort((a, b) => (order ? cmp(a.data[order], b.data[order]) : 0))
        .slice(0, n)
        .map((r) => ({ id: r.id, ref: ref(r), data: () => r.data }));
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
  });
  // bogle_users/{uid}/{collection}/{id}.set(): replaces the matching row's data.
  const userDoc = (uid: string) => ({
    collection: (c: string) => ({
      doc: (id: string) => ({
        set: async (data: Record<string, unknown>) => {
          const existing = rows.find((r) => r.collection === c && r.id === id);
          if (existing) existing.data = { ...data };
          else rows.push({ id, userId: uid, collection: c, data: { ...data } });
        },
        // Like Firestore's create(): fails when the document already exists.
        create: async (data: Record<string, unknown>) => {
          if (rows.some((r) => r.collection === c && r.id === id && r.userId === uid)) {
            throw new Error(`ALREADY_EXISTS: ${c}/${id}`);
          }
          rows.push({ id, userId: uid, collection: c, data: { ...data } });
        },
      }),
    }),
  });
  // Top-level documents (e.g. call_opt_outs/{id}) are rows with an empty userId.
  const topDoc = (c: string) => (id: string) => ({
    ...userDoc(id),
    get: async () => ({ exists: rows.some((r) => r.collection === c && r.id === id && !r.userId) }),
    set: async (data: Record<string, unknown>) => {
      rows.push({ id, userId: '', collection: c, data: { ...data } });
    },
  });
  return {
    collection: (c: string) => ({ doc: c === 'bogle_users' ? userDoc : topDoc(c) }),
    collectionGroup: (c: string) => query(c),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) =>
      fn({
        get: async (r: { _row: Row }) => ({ data: () => r._row.data }),
        update: (r: { _row: Row }, patch: Record<string, unknown>) =>
          Object.assign(r._row.data, patch),
      }),
  };
}
