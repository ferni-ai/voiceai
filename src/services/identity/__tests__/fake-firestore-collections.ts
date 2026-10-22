/**
 * A tiny in-memory Firestore for the revocation tests: collections of
 * documents with set / update / delete, and where(field, '<=', n).limit().get().
 * Snapshots carry `empty`: paging loops elsewhere stop on it.
 */
export type FakeDocs = Map<string, Map<string, Record<string, unknown>>>;

export function fakeFirestore(docs: FakeDocs) {
  const col = (name: string) => {
    const docsOf = () => docs.get(name) ?? docs.set(name, new Map()).get(name)!;
    const ref = (id: string) => ({
      id,
      set: async (value: Record<string, unknown>) => void docsOf().set(id, { ...value }),
      update: async (value: Record<string, unknown>) =>
        void docsOf().set(id, { ...docsOf().get(id), ...value }),
      delete: async () => void docsOf().delete(id),
      get: async () => ({ exists: docsOf().has(id), data: () => docsOf().get(id) }),
    });
    const query = (filter?: { field: string; max: number }, max = Infinity) => ({
      limit: (n: number) => query(filter, n),
      get: async () => {
        const docs = [...docsOf()]
          .filter(([, d]) => !filter || (d[filter.field] as number) <= filter.max)
          .slice(0, max)
          .map(([id, d]) => ({ id, data: () => d, ref: ref(id) }));
        return { docs, size: docs.length, empty: docs.length === 0 };
      },
    });
    return {
      doc: (id: string) => ref(id),
      where: (field: string, _op: string, max: number) => query({ field, max }),
      get: () => query().get(),
    };
  };
  return { collection: col };
}
