/**
 * An in-memory Firestore with the write semantics token storage depends on:
 * set() replaces, set(..., { merge: true }) deep-merges maps, update()
 * replaces each named field (and fails NOT_FOUND on a missing doc), and
 * FieldValue.delete() removes a field. Subcollections, collectionGroup and
 * where(field, '!=', null) are enough for the token migration; batch() runs
 * its queued set/delete writes in order on commit().
 */
import { FieldValue } from '@google-cloud/firestore';

type Json = Record<string, unknown>;

export interface MergeFakeState {
  docs: Map<string, Json>;
  /** Every write, by path, in order. */
  writes: Array<{ path: string; op: 'set' | 'update' | 'delete'; data?: Json }>;
  /** Paths whose writes throw UNAVAILABLE (code 14), to test per-doc failure handling. */
  failWrites: Set<string>;
  /** Paths whose doc reads throw UNAVAILABLE (code 14), to test read-failure handling. */
  failReads?: Set<string>;
  /** Write count per path, served as the snapshot's updateTime. */
  versions: Map<string, number>;
  /** Runs before every write (e.g. to simulate a token refresh racing the migration). */
  beforeWrite?: (path: string) => void;
}

export function newMergeFakeState(): MergeFakeState {
  return { docs: new Map(), writes: [], failWrites: new Set(), versions: new Map() };
}

const isDelete = (v: unknown) => v instanceof FieldValue && v.isEqual(FieldValue.delete());
const isMap = (v: unknown): v is Json =>
  !!v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;

function apply(target: Json, data: Json, deep: boolean): Json {
  const out: Json = { ...target };
  for (const [k, v] of Object.entries(data)) {
    if (isDelete(v)) delete out[k];
    else if (deep && isMap(v) && isMap(out[k])) out[k] = apply(out[k] as Json, v, true);
    else if (isMap(v))
      out[k] = apply({}, v, true); // strip nested sentinels
    else out[k] = v;
  }
  return out;
}

/** Stand-in for Firestore's updateTime: equal only to the same write. */
export interface FakeTime {
  v: number;
  isEqual: (other: { v?: number }) => boolean;
}

export interface FakeSnapshot {
  id: string;
  exists: boolean;
  data: () => Json | undefined;
  updateTime: FakeTime;
  ref: FakeDocRef;
}

export interface FakeQuery {
  where: (field: string, op: string, value: unknown) => FakeQuery;
  limit: (n: number) => FakeQuery;
  get: () => Promise<{ empty: boolean; size: number; docs: FakeSnapshot[] }>;
}

export interface FakeCollection extends FakeQuery {
  doc: (id: string) => FakeDocRef;
}

export interface FakeDocRef {
  path: string;
  id: string;
  get: () => Promise<FakeSnapshot>;
  set: (data: Json, opts?: { merge?: boolean }) => Promise<void>;
  update: (data: Json, pre?: { lastUpdateTime?: FakeTime }) => Promise<void>;
  delete: () => Promise<void>;
  collection: (name: string) => FakeCollection;
}

export function createMergeFakeFirestore(state: MergeFakeState) {
  const time = (path: string): FakeTime => {
    const v = state.versions.get(path) ?? 0;
    return { v, isEqual: (other: { v?: number }) => other.v === v };
  };
  /** Before every write: the hook, then any injected failure. */
  const guard = (path: string) => {
    state.beforeWrite?.(path);
    if (state.failWrites.has(path)) {
      throw Object.assign(new Error('simulated write failure'), { code: 14 });
    }
  };
  /** After every write: a new version (Firestore's updateTime). */
  const bump = (path: string) => state.versions.set(path, (state.versions.get(path) ?? 0) + 1);
  const snapshot = (path: string): FakeSnapshot => {
    const data = state.docs.get(path);
    return {
      id: path.split('/').pop() ?? '',
      exists: data !== undefined,
      data: () => (data ? structuredClone(data) : undefined),
      updateTime: time(path),
      ref: doc(path),
    };
  };
  function doc(path: string): FakeDocRef {
    return {
      path,
      id: path.split('/').pop() ?? '',
      get: async () => {
        if (state.failReads?.has(path)) {
          throw Object.assign(new Error('simulated read failure'), { code: 14 });
        }
        return snapshot(path);
      },
      set: async (data, opts) => {
        guard(path);
        const base = opts?.merge ? (state.docs.get(path) ?? {}) : {};
        state.docs.set(path, apply(base, data, !!opts?.merge));
        state.writes.push({ path, op: 'set', data });
        bump(path);
      },
      update: async (data, pre) => {
        const cur = state.docs.get(path);
        if (!cur) throw Object.assign(new Error('NOT_FOUND'), { code: 5 });
        guard(path);
        // Firestore checks the precondition against the doc as it is now.
        if (pre?.lastUpdateTime && !pre.lastUpdateTime.isEqual(time(path))) {
          throw Object.assign(new Error('FAILED_PRECONDITION'), { code: 9 });
        }
        state.docs.set(path, apply(cur, data, false));
        state.writes.push({ path, op: 'update', data });
        bump(path);
      },
      delete: async () => {
        guard(path);
        state.docs.delete(path);
        state.writes.push({ path, op: 'delete' });
        bump(path);
      },
      collection: (name: string) => collection(`${path}/${name}`),
    };
  }
  const depth = (p: string) => p.split('/').length;
  const query = (
    paths: () => string[],
    filters: Array<[string, unknown]> = [],
    max = Infinity
  ): FakeQuery => ({
    where: (field, op, value) => {
      if (op !== '!=' || value !== null) throw new Error(`fake supports only != null, got ${op}`);
      return query(paths, [...filters, [field, value]], max);
    },
    limit: (n) => query(paths, filters, n),
    get: async () => {
      const docs = paths()
        .filter((p) =>
          filters.every(([f]) => {
            const v = f
              .split('.')
              .reduce<unknown>((o, k) => (o as Json | undefined)?.[k], state.docs.get(p));
            return v !== undefined && v !== null;
          })
        )
        .slice(0, max)
        .map(snapshot);
      return { empty: docs.length === 0, size: docs.length, docs };
    },
  });
  function collection(name: string): FakeCollection {
    return {
      doc: (id: string) => doc(`${name}/${id}`),
      ...query(() =>
        [...state.docs.keys()].filter(
          (p) => p.startsWith(`${name}/`) && depth(p) === depth(name) + 1
        )
      ),
    };
  }
  /** A write batch: the queued writes apply in order on commit(). */
  const batch = () => {
    const ops: Array<() => Promise<void>> = [];
    return {
      set: (ref: FakeDocRef, data: Json, opts?: { merge?: boolean }) =>
        void ops.push(() => ref.set(data, opts)),
      delete: (ref: FakeDocRef) => void ops.push(() => ref.delete()),
      commit: async () => {
        for (const op of ops) await op();
      },
    };
  };
  return {
    collection,
    doc,
    batch,
    collectionGroup: (name: string) =>
      query(() => [...state.docs.keys()].filter((p) => p.split('/').at(-2) === name)),
  };
}
