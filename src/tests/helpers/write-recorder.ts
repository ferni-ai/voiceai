/**
 * A Firestore and a Redis cache that store nothing and record the path of every
 * write: `set bogle_users/u1/voice_sessions/s1`, `redis.set presence:u1`, and
 * what each Firestore write carried (`payloads`). Reads find nothing, except a
 * doc whose path a test put in `existing` (an empty doc). For tests that ask "what did this code path write, and under
 * whose id?" across many writers at once, without faking each writer.
 *
 * Build one per test file inside vi.hoisted (it imports nothing) and hand
 * `db` / `redis` to the vi.mock factories of the modules that return clients.
 */
type Data = Record<string, unknown>;

export interface WriteRecorder {
  /** Every write so far, as `<op> <path>`, in order. */
  writes: string[];
  /** What each Firestore write carried, as JSON, in order: `<op> <path> <json>`. */
  payloads: string[];
  /** Doc paths a read finds (as an empty doc), e.g. a user's record. */
  existing: Set<string>;
  db: Data;
  redis: Data;
}

export function createWriteRecorder(): WriteRecorder {
  const writes: string[] = [];
  const payloads: string[] = [];
  const existing = new Set<string>();
  let auto = 0;
  const record = (op: string, path: string, data?: unknown): void => {
    writes.push(`${op} ${path}`);
    if (!op.startsWith('redis.')) payloads.push(`${op} ${path} ${JSON.stringify(data) ?? ''}`);
  };
  const emptySnap = { docs: [], empty: true, size: 0, forEach: () => undefined };

  const doc = (path: string): Data => {
    const ref: Data = {
      id: path.split('/').pop(),
      path,
      collection: (name: string) => col(`${path}/${name}`),
      get: async () => {
        const found = existing.has(path);
        return { id: ref.id, ref, exists: found, data: () => (found ? {} : undefined) };
      },
      onSnapshot: () => () => undefined,
    };
    for (const op of ['set', 'update', 'create', 'delete']) {
      ref[op] = async (data?: unknown) => record(op, path, data);
    }
    return ref;
  };

  const col = (path: string): Data => {
    const query: Data = {
      path,
      id: path.split('/').pop(),
      doc: (id?: string) => doc(`${path}/${id ?? `auto-${++auto}`}`),
      add: async (data?: unknown) => {
        const ref = doc(`${path}/auto-${++auto}`);
        record('add', String(ref.path), data);
        return ref;
      },
      get: async () => emptySnap,
      count: () => ({ get: async () => ({ data: () => ({ count: 0 }) }) }),
      onSnapshot: () => () => undefined,
    };
    for (const op of ['where', 'orderBy', 'limit', 'limitToLast', 'select', 'offset']) {
      query[op] = () => query;
    }
    for (const op of ['startAfter', 'startAt', 'endAt', 'endBefore']) query[op] = () => query;
    return query;
  };

  const pathOf = (ref: unknown): string => String((ref as { path?: unknown })?.path);
  const staged = (): Data => {
    const ops: Array<[string, string, unknown]> = [];
    const txn: Data = { get: async (ref: { get: () => unknown }) => ref.get() };
    for (const op of ['set', 'update', 'create', 'delete']) {
      txn[op] = (ref: unknown, data?: unknown) => {
        ops.push([op, pathOf(ref), data]);
        return txn;
      };
    }
    txn.commit = async () => ops.splice(0).forEach(([op, path, data]) => record(op, path, data));
    return txn;
  };

  const db: Data = {
    collection: col,
    collectionGroup: col,
    doc,
    batch: staged,
    bulkWriter: () => ({ ...staged(), close: async () => undefined, flush: async () => undefined }),
    runTransaction: async (fn: (t: Data) => unknown) => {
      const txn = staged();
      const out = await fn(txn);
      await (txn.commit as () => Promise<void>)();
      return out;
    },
    getAll: async (...refs: Data[]) =>
      refs.map((r) => ({ id: r.id, exists: false, data: () => undefined })),
    settings: () => undefined,
    terminate: async () => undefined,
    listCollections: async () => [],
  };

  // Redis: every method that names a key records it; reads miss.
  const WRITES =
    /^(set|setex|setEx|del|delete|deleteSession|incr|incrBy|expire|hset|hSet|lpush|rpush|sadd|zadd|publish|setSession|update)/i;
  const redis = new Proxy<Data>(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'then') return undefined;
        return async (key?: unknown) => {
          if (WRITES.test(String(prop))) record(`redis.${String(prop)}`, String(key));
          return null;
        };
      },
    }
  );

  return { writes, payloads, existing, db, redis };
}
