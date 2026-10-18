/**
 * An in-memory Firestore with the write semantics token storage depends on:
 * set() replaces, set(..., { merge: true }) deep-merges maps, update()
 * replaces each named field (and fails NOT_FOUND on a missing doc), and
 * FieldValue.delete() removes a field. Subcollections, collectionGroup and
 * where(field, '!=', null) are enough for the token migration.
 */
import { FieldValue } from '@google-cloud/firestore';

type Json = Record<string, unknown>;

export interface MergeFakeState {
  docs: Map<string, Json>;
  /** Every write, by path, in order. */
  writes: Array<{ path: string; op: 'set' | 'update' | 'delete'; data?: Json }>;
  /** Paths whose next write throws (to test per-doc failure handling). */
  failWrites: Set<string>;
}

export function newMergeFakeState(): MergeFakeState {
  return { docs: new Map(), writes: [], failWrites: new Set() };
}

const isDelete = (v: unknown) => v instanceof FieldValue && v.isEqual(FieldValue.delete());
const isMap = (v: unknown): v is Json =>
  !!v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;

function apply(target: Json, data: Json, deep: boolean): Json {
  const out: Json = { ...target };
  for (const [k, v] of Object.entries(data)) {
    if (isDelete(v)) delete out[k];
    else if (deep && isMap(v) && isMap(out[k])) out[k] = apply(out[k] as Json, v, true);
    else if (isMap(v)) out[k] = apply({}, v, true); // strip nested sentinels
    else out[k] = v;
  }
  return out;
}

export function createMergeFakeFirestore(state: MergeFakeState) {
  const guard = (path: string) => {
    if (state.failWrites.has(path)) throw new Error('simulated write failure');
  };
  const snapshot = (path: string) => {
    const data = state.docs.get(path);
    return {
      id: path.split('/').pop() ?? '',
      exists: data !== undefined,
      data: () => (data ? structuredClone(data) : undefined),
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      ref: doc(path),
    };
  };
  function doc(path: string): {
    path: string;
    id: string;
    get(): Promise<ReturnType<typeof snapshot>>;
    set(data: Json, opts?: { merge?: boolean }): Promise<void>;
    update(data: Json): Promise<void>;
    delete(): Promise<void>;
    collection(name: string): ReturnType<typeof collection>;
  } {
    return {
      path,
      id: path.split('/').pop() ?? '',
      get: async () => snapshot(path),
      set: async (data, opts) => {
        guard(path);
        const base = opts?.merge ? (state.docs.get(path) ?? {}) : {};
        state.docs.set(path, apply(base, data, !!opts?.merge));
        state.writes.push({ path, op: 'set', data });
      },
      update: async (data) => {
        guard(path);
        const cur = state.docs.get(path);
        if (!cur) throw Object.assign(new Error('NOT_FOUND'), { code: 5 });
        state.docs.set(path, apply(cur, data, false));
        state.writes.push({ path, op: 'update', data });
      },
      delete: async () => {
        guard(path);
        state.docs.delete(path);
        state.writes.push({ path, op: 'delete' });
      },
      collection: (name: string) => collection(`${path}/${name}`),
    };
  }
  const depth = (p: string) => p.split('/').length;
  const query = (paths: () => string[], filters: Array<[string, unknown]> = []) => ({
    where: (field: string, op: string, value: unknown) => {
      if (op !== '!=' || value !== null) throw new Error(`fake supports only != null, got ${op}`);
      return query(paths, [...filters, [field, value]]);
    },
    get: async () => {
      const docs = paths()
        .filter((p) =>
          filters.every(([f]) => {
            const v = f.split('.').reduce<unknown>((o, k) => (o as Json | undefined)?.[k], state.docs.get(p));
            return v !== undefined && v !== null;
          })
        )
        .map(snapshot);
      return { empty: docs.length === 0, size: docs.length, docs };
    },
  });
  function collection(name: string) {
    return {
      doc: (id: string) => doc(`${name}/${id}`),
      ...query(() =>
        [...state.docs.keys()].filter((p) => p.startsWith(`${name}/`) && depth(p) === depth(name) + 1)
      ),
    };
  }
  return {
    collection,
    doc,
    collectionGroup: (name: string) =>
      query(() => [...state.docs.keys()].filter((p) => p.split('/').at(-2) === name)),
  };
}
