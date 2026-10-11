/** A Map-backed stand-in for the few Firestore calls the approvals services make. */
import type { Firestore } from '@google-cloud/firestore';

export function fakeFirestore(): { db: Firestore; docs: Map<string, Record<string, unknown>> } {
  const docs = new Map<string, Record<string, unknown>>();
  const ref = (name: string, id: string) => ({
    key: `${name}/${id}`,
    set: async (data: Record<string, unknown>) =>
      void docs.set(`${name}/${id}`, structuredClone(data)),
    get: async () => {
      const data = docs.get(`${name}/${id}`);
      return { exists: data !== undefined, data: () => structuredClone(data) };
    },
  });
  type Ref = ReturnType<typeof ref>;
  const db = {
    collection: (name: string) => ({ doc: (id: string) => ref(name, id) }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const writes: Array<() => void> = [];
      const tx = {
        get: async (r: Ref) => r.get(),
        update: (r: Ref, patch: Record<string, unknown>) =>
          writes.push(() => docs.set(r.key, { ...docs.get(r.key), ...structuredClone(patch) })),
      };
      const result = await fn(tx);
      for (const write of writes) write();
      return result;
    },
  };
  return { db: db as unknown as Firestore, docs };
}
