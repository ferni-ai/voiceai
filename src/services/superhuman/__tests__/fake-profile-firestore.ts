/**
 * An in-memory Firestore for the superhuman profile modules' read-failure
 * tests: nested collection/doc paths, get, and set (whole-doc or merge).
 * Setting failReads makes every get() throw, as a transient outage would.
 */
type Json = Record<string, unknown>;

export interface FakeProfileFirestore {
  db: { collection: (name: string) => unknown };
  /** Every stored document, by path. */
  docs: Map<string, Json>;
  /** Paths written, in order. */
  writes: string[];
  failReads: { on: boolean };
}

export function createFakeProfileFirestore(): FakeProfileFirestore {
  const docs = new Map<string, Json>();
  const writes: string[] = [];
  const failReads = { on: false };

  const collection = (path: string) => ({ doc: (id: string) => docRef(`${path}/${id}`) });
  const docRef = (path: string) => ({
    path,
    collection: (name: string) => collection(`${path}/${name}`),
    get: async () => {
      if (failReads.on) throw new Error('14 UNAVAILABLE: fake outage');
      const data = docs.get(path);
      return { exists: data !== undefined, data: () => data && structuredClone(data) };
    },
    set: async (data: Json, opts?: { merge?: boolean }) => {
      writes.push(path);
      const next = structuredClone(data);
      docs.set(path, opts?.merge ? { ...(docs.get(path) ?? {}), ...next } : next);
    },
  });

  return { db: { collection }, docs, writes, failReads };
}
