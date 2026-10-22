/**
 * An in-memory Firestore keyed by document path, with the reads and writes
 * identity linking makes: get / set (merge), collection().get(),
 * listCollections and listDocuments at any depth, and batch().set().commit().
 * `failing` makes listCollections, or one collection's get, throw.
 */
export type Data = Record<string, unknown>;

export function fakeFirestoreTree() {
  const docs = new Map<string, Data>();
  const failing = { listCollections: false, collectionGet: null as string | null };
  const childIds = (path: string, depthOffset: number) => [
    ...new Set(
      [...docs.keys()]
        .filter((p) => p.startsWith(`${path}/`))
        .map((p) => p.slice(path.length + 1).split('/')[depthOffset] as string)
    ),
  ];
  const doc = (path: string): Record<string, unknown> => ({
    id: path.split('/').at(-1),
    path,
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path), ref: doc(path) }),
    set: async (data: Data, opts?: { merge?: boolean }) =>
      void docs.set(path, opts?.merge ? { ...docs.get(path), ...data } : data),
    collection: (id: string) => collection(`${path}/${id}`),
    listCollections: async () => {
      if (failing.listCollections) throw new Error('unavailable');
      return childIds(path, 0).map((id) => collection(`${path}/${id}`));
    },
  });
  const collection = (path: string): Record<string, unknown> => ({
    id: path.split('/').at(-1),
    doc: (id: string) => doc(`${path}/${id}`),
    get: async () => {
      if (failing.collectionGet && path.endsWith(`/${failing.collectionGet}`))
        throw new Error('unavailable');
      return {
        docs: [...docs.keys()]
          .filter(
            (p) => p.startsWith(`${path}/`) && p.split('/').length === path.split('/').length + 1
          )
          .map((p) => ({ id: p.split('/').at(-1), data: () => docs.get(p) })),
      };
    },
    listDocuments: async () => childIds(path, 0).map((id) => doc(`${path}/${id}`)),
  });
  const db = {
    collection,
    batch: () => {
      const ops: Array<() => Promise<unknown>> = [];
      return {
        set: (ref: { set: (d: Data, o: unknown) => Promise<unknown> }, d: Data, o: unknown) =>
          ops.push(() => ref.set(d, o)),
        commit: async () => {
          for (const op of ops) await op();
        },
      };
    },
  };
  return { docs, db, failing };
}
