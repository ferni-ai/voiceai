/**
 * An in-memory Firestore for the CALLBACK_MEANS_ASKED suites, keyed by document path: get,
 * set (merge / mergeFields), update, sub-collections, where/orderBy/limit (ignored), add and
 * batch. No imports, so a test can load it inside vi.hoisted before its mocks.
 */
export function callbackFakeStore() {
  const docs = new Map<string, Record<string, unknown>>();
  type Snap = { id: string; data: () => Record<string, unknown> };
  interface Opts {
    merge?: boolean;
    mergeFields?: string[];
  }
  const write = (path: string, data: Record<string, unknown>, opts?: Opts): void => {
    const before = opts?.merge || opts?.mergeFields ? (docs.get(path) ?? {}) : {};
    docs.set(path, { ...before, ...data });
  };
  const ref = (path: string): Record<string, unknown> => ({
    path,
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
    set: async (data: Record<string, unknown>, opts?: Opts) => write(path, data, opts),
    update: async (data: Record<string, unknown>) => write(path, data, { merge: true }),
    collection: (name: string) => col(`${path}/${name}`),
  });
  const col = (path: string): Record<string, unknown> => {
    const children = (): Snap[] =>
      [...docs]
        .filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'))
        .map(([key, data]) => ({ id: key.slice(path.length + 1), data: () => data }));
    const query: Record<string, unknown> = {
      where: () => query,
      orderBy: () => query,
      limit: () => query,
      get: async () => ({
        docs: children(),
        empty: children().length === 0,
        forEach: (each: (snap: Snap) => void) => children().forEach(each),
      }),
    };
    const doc = (id: string) => ref(`${path}/${id}`);
    return { ...query, doc, add: async () => ({ id: 'n-1' }) };
  };
  const db = {
    collection: (name: string) => col(name),
    batch: () => ({ update: () => undefined, commit: async () => undefined }),
  };
  return { docs, db };
}
