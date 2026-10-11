/** A path-keyed Map standing in for the Firestore calls the passkey service makes. */
import type { Firestore } from '@google-cloud/firestore';

export function fakePasskeysDb(): { db: Firestore; docs: Map<string, Record<string, unknown>> } {
  const docs = new Map<string, Record<string, unknown>>();
  const doc = (path: string): Record<string, unknown> => ({
    path,
    set: async (data: Record<string, unknown>) => void docs.set(path, structuredClone(data)),
    get: async () => ({ exists: docs.has(path), data: () => structuredClone(docs.get(path)) }),
    delete: async () => void docs.delete(path),
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
      const writes: Array<() => void> = [];
      const tx = {
        get: async (ref: Ref) => ref.get(),
        delete: (ref: Ref) => writes.push(() => docs.delete(ref.path)),
        update: (ref: Ref, patch: Record<string, unknown>) =>
          writes.push(() =>
            docs.set(ref.path, { ...docs.get(ref.path), ...structuredClone(patch) })
          ),
      };
      const result = await fn(tx);
      for (const write of writes) write();
      return result;
    },
  };
  return { db: db as unknown as Firestore, docs };
}
