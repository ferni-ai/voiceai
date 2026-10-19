/**
 * Just enough Firestore for bogle_users/{uid}/{collection}: where('==')/
 * orderBy/limit/get, doc(id).get/set, batch set (merge)/update/commit and a
 * transaction's get/set. Shared by the call-memory tests.
 */
export type Doc = { uid: string; collection: string; id: string; data: Record<string, unknown> };

export function fakeUserDb(docs: Doc[]) {
  type Ref = { uid: string; collection: string; id: string };
  const find = (r: Ref) =>
    docs.find((d) => d.uid === r.uid && d.collection === r.collection && d.id === r.id);
  const put = (r: Ref, data: Record<string, unknown>, merge = false) => {
    const existing = find(r);
    if (existing) existing.data = merge ? { ...existing.data, ...data } : { ...data };
    else docs.push({ ...r, data: { ...data } });
  };
  const docRef = (uid: string, collection: string, id: string) => ({
    uid,
    collection,
    id,
    get: async () => {
      const d = find({ uid, collection, id });
      return { exists: d !== undefined, data: () => d?.data };
    },
    set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) =>
      put({ uid, collection, id }, data, opts?.merge),
  });
  const query = (uid: string, collection: string, filters: Array<[string, unknown]>, n = 1e9) => ({
    where: (f: string, _op: string, v: unknown) => query(uid, collection, [...filters, [f, v]], n),
    orderBy: () => query(uid, collection, filters, n),
    limit: (k: number) => query(uid, collection, filters, k),
    get: async () => {
      const hits = docs
        .filter((d) => d.uid === uid && d.collection === collection)
        .filter((d) => filters.every(([f, v]) => d.data[f] === v))
        .slice(0, n);
      return { docs: hits.map((d) => ({ id: d.id, data: () => d.data })), size: hits.length };
    },
    doc: (id: string) => docRef(uid, collection, id),
  });
  return {
    collection: () => ({
      doc: (uid: string) => ({ collection: (c: string) => query(uid, c, []) }),
    }),
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        set: (r: Ref, data: Record<string, unknown>, opts?: { merge?: boolean }) =>
          ops.push(() => put(r, data, opts?.merge)),
        update: (r: Ref, patch: Record<string, unknown>) =>
          ops.push(() => {
            const d = find(r);
            if (!d) throw new Error(`NOT_FOUND: ${r.collection}/${r.id}`);
            Object.assign(d.data, patch);
          }),
        commit: async () => ops.forEach((op) => op()),
      };
    },
    runTransaction: async (fn: (tx: unknown) => Promise<void>) =>
      fn({
        get: (r: ReturnType<typeof docRef>) => r.get(),
        set: (r: Ref, data: Record<string, unknown>, opts?: { merge?: boolean }) =>
          put(r, data, opts?.merge),
      }),
  };
}
