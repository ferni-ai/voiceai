/**
 * A Map-backed stand-in for the few Firestore calls the approvals services
 * make. Transactions behave like Firestore's optimistic ones: a commit whose
 * read documents changed since they were read is retried, so two concurrent
 * transactions over the same document can't both act on the same state.
 */
import type { Firestore } from '@google-cloud/firestore';

export function fakeFirestore(): { db: Firestore; docs: Map<string, Record<string, unknown>> } {
  const docs = new Map<string, Record<string, unknown>>();
  const versions = new Map<string, number>();
  const write = (key: string, data: Record<string, unknown> | undefined) => {
    if (data === undefined) docs.delete(key);
    else docs.set(key, structuredClone(data));
    versions.set(key, (versions.get(key) ?? 0) + 1);
  };
  const ref = (name: string, id: string) => ({
    key: `${name}/${id}`,
    set: async (data: Record<string, unknown>) => write(`${name}/${id}`, data),
    get: async () => {
      const data = docs.get(`${name}/${id}`);
      return { exists: data !== undefined, data: () => structuredClone(data) };
    },
  });
  type Ref = ReturnType<typeof ref>;
  const db = {
    collection: (name: string) => ({ doc: (id: string) => ref(name, id) }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const reads = new Map<string, number>();
        const writes: Array<() => void> = [];
        const tx = {
          get: async (r: Ref) => {
            reads.set(r.key, versions.get(r.key) ?? 0);
            return r.get();
          },
          update: (r: Ref, patch: Record<string, unknown>) =>
            writes.push(() => write(r.key, { ...docs.get(r.key), ...patch })),
          delete: (r: Ref) => writes.push(() => write(r.key, undefined)),
        };
        const result = await fn(tx);
        // Check and commit with no await in between: atomic, like Firestore's commit.
        if ([...reads].some(([key, seen]) => (versions.get(key) ?? 0) !== seen)) continue;
        for (const apply of writes) apply();
        return result;
      }
      throw new Error('transaction contention');
    },
  };
  return { db: db as unknown as Firestore, docs };
}
