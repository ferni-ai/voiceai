/**
 * A path-keyed Map standing in for the Firestore calls the passkey service
 * makes. Transactions behave like Firestore's optimistic ones: a commit whose
 * read documents changed since they were read is retried, so two concurrent
 * transactions over the same document can't both act on the same state.
 */
import type { Firestore } from '@google-cloud/firestore';

export function fakePasskeysDb(): { db: Firestore; docs: Map<string, Record<string, unknown>> } {
  const docs = new Map<string, Record<string, unknown>>();
  const versions = new Map<string, number>();
  const bump = (path: string) => versions.set(path, (versions.get(path) ?? 0) + 1);
  const write = (path: string, data: Record<string, unknown> | undefined) => {
    if (data === undefined) docs.delete(path);
    else docs.set(path, structuredClone(data));
    bump(path);
  };
  const doc = (path: string): Record<string, unknown> => ({
    path,
    set: async (data: Record<string, unknown>) => write(path, data),
    get: async () => ({ exists: docs.has(path), data: () => structuredClone(docs.get(path)) }),
    delete: async () => write(path, undefined),
    collection: (name: string) => collection(`${path}/${name}`),
  });
  const collection = (path: string) => ({
    doc: (id: string) => doc(`${path}/${id}`),
    get: async () => ({
      docs: [...docs.entries()]
        .filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'))
        .map(([, data]) => ({ data: () => structuredClone(data) })),
    }),
  });
  type Ref = { path: string; get: () => Promise<unknown> };
  const db = {
    collection,
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const reads = new Map<string, number>();
        const writes: Array<() => void> = [];
        const tx = {
          get: async (ref: Ref) => {
            reads.set(ref.path, versions.get(ref.path) ?? 0);
            return ref.get();
          },
          set: (ref: Ref, data: Record<string, unknown>) =>
            writes.push(() => write(ref.path, data)),
          delete: (ref: Ref) => writes.push(() => write(ref.path, undefined)),
          update: (ref: Ref, patch: Record<string, unknown>) =>
            writes.push(() => write(ref.path, { ...docs.get(ref.path), ...patch })),
        };
        const result = await fn(tx);
        // Check and commit with no await in between: atomic, like Firestore's commit.
        const stale = [...reads].some(([path, seen]) => (versions.get(path) ?? 0) !== seen);
        if (stale) continue;
        for (const apply of writes) apply();
        return result;
      }
      throw new Error('transaction contention');
    },
  };
  return { db: db as unknown as Firestore, docs };
}
