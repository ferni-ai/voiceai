/**
 * A small in-memory Firestore for tests that run several "API instances"
 * (separate module loads) against one database.
 *
 * Keep the state in the test file (vi.hoisted) and pass it in, so it survives
 * vi.resetModules. Covers what services/social/shared-records uses: doc
 * get/set/delete, collection queries (where '==' or '>', orderBy, limit,
 * count), and runTransaction (get/set/delete) with
 * Firestore's optimistic concurrency: if a document a transaction read was
 * written by someone else before it commits, the transaction runs again. A
 * read-then-write outside a transaction gets no such protection, so racing
 * callers can lose updates, as they would in production.
 *
 * Stored values keep Dates as Dates (Firestore Timestamps), like the real SDK.
 */
type Json = Record<string, unknown>;

export interface FakeFirestoreState {
  docs: Map<string, Json>;
  versions: Map<string, number>;
  up: boolean;
  /** Every data object written, by path, in order (for asserting what was written). */
  writes: Array<{ path: string; data: Json }>;
  /** Documents returned by queries so far (to prove a query was bounded). */
  reads: number;
}

export function newFakeFirestoreState(): FakeFirestoreState {
  return { docs: new Map(), versions: new Map(), up: true, writes: [], reads: 0 };
}

export function resetFakeFirestore(state: FakeFirestoreState): void {
  state.docs.clear();
  state.versions.clear();
  state.writes.length = 0;
  state.reads = 0;
  state.up = true;
}

/** Let other pending work run, so concurrent callers interleave. */
const tick = async () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

export function createFakeFirestore(state: FakeFirestoreState) {
  const version = (path: string) => state.versions.get(path) ?? 0;
  const write = (path: string, data: Json | null) => {
    if (data) {
      state.docs.set(path, structuredClone(data));
      state.writes.push({ path, data: structuredClone(data) });
    } else state.docs.delete(path);
    state.versions.set(path, version(path) + 1);
  };
  const snapshot = (path: string) => {
    const data = state.docs.get(path);
    return {
      id: path.split('/').pop() ?? '',
      exists: data !== undefined,
      data: () => (data ? structuredClone(data) : undefined),
    };
  };
  const ref = (path: string) => ({
    path,
    get: async () => {
      await tick();
      return snapshot(path);
    },
    set: async (data: Json) => {
      await tick();
      write(path, data);
    },
    delete: async () => {
      await tick();
      write(path, null);
    },
  });
  type Ref = ReturnType<typeof ref>;
  const inCollection = (name: string) =>
    [...state.docs.keys()].filter(
      (p) => p.startsWith(`${name}/`) && !p.slice(name.length + 1).includes('/')
    );
  interface QuerySpec {
    filters: Array<[string, '==' | '>', unknown]>;
    order?: [string, 'asc' | 'desc'];
    limit?: number;
  }
  /** A field by dotted path ('gameStats.guess.totalScore'), as Firestore reads it. */
  const at = (doc: Json | undefined, path: string): unknown =>
    path.split('.').reduce<unknown>((v, k) => (v as Json | undefined)?.[k], doc);
  const matching = (name: string, spec: QuerySpec) => {
    let paths = inCollection(name).filter((p) =>
      spec.filters.every(([f, op, v]) => {
        const value = at(state.docs.get(p), f);
        return op === '==' ? value === v : Number(value) > Number(v);
      })
    );
    if (spec.order) {
      const [f, dir] = spec.order;
      const key = (p: string) => Number(at(state.docs.get(p), f));
      // Like Firestore, orderBy leaves out documents without the field.
      paths = paths
        .filter((p) => at(state.docs.get(p), f) !== undefined)
        .sort((x, y) => (dir === 'desc' ? key(y) - key(x) : key(x) - key(y)));
    }
    return spec.limit === undefined ? paths : paths.slice(0, spec.limit);
  };
  /** A query: filters (== or >), one orderBy, a limit, count(); counts documents read. */
  const query = (name: string, spec: QuerySpec) => ({
    where: (field: string, op: '==' | '>', value: unknown) =>
      query(name, { ...spec, filters: [...spec.filters, [field, op, value]] }),
    orderBy: (field: string, direction: 'asc' | 'desc' = 'asc') =>
      query(name, { ...spec, order: [field, direction] }),
    limit: (n: number) => query(name, { ...spec, limit: n }),
    count: () => ({
      get: async () => {
        await tick();
        const count = matching(name, spec).length;
        return { data: () => ({ count }) };
      },
    }),
    get: async () => {
      await tick();
      const paths = matching(name, spec);
      state.reads += paths.length;
      const docs = paths.map(snapshot);
      return { empty: docs.length === 0, size: docs.length, docs };
    },
  });
  const collection = (name: string) => ({
    doc: (id: string) => ref(`${name}/${id}`),
    ...query(name, { filters: [] }),
  });
  const db = {
    collection,
    doc: ref,
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        delete: (r: Ref) => ops.push(() => write(r.path, null)),
        commit: async () => {
          for (const op of ops) op();
        },
      };
    },
    async runTransaction<T>(
      fn: (tx: {
        get: (r: Ref) => Promise<ReturnType<typeof snapshot>>;
        set: (r: Ref, data: Json) => void;
        delete: (r: Ref) => void;
      }) => Promise<T>
    ): Promise<T> {
      for (let attempt = 0; attempt < 500; attempt++) {
        const read = new Map<string, number>();
        const pending: Array<[string, Json | null]> = [];
        const result = await fn({
          get: async (r) => {
            read.set(r.path, version(r.path));
            await tick();
            return snapshot(r.path);
          },
          set: (r, data) => {
            pending.push([r.path, data]);
          },
          delete: (r) => {
            pending.push([r.path, null]);
          },
        });
        if ([...read].every(([path, v]) => version(path) === v)) {
          for (const [path, data] of pending) write(path, data);
          return result;
        }
      }
      throw new Error('fake firestore: too much contention');
    },
  };
  return () => (state.up ? db : null);
}
