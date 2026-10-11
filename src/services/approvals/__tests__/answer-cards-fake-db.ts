/** A Map-backed stand-in for the Firestore calls answer cards make (doc get/set/delete, where ==, limit). */
import type { Firestore } from '@google-cloud/firestore';

export function fakeCardsDb(): { db: Firestore; docs: Map<string, Record<string, unknown>> } {
  const docs = new Map<string, Record<string, unknown>>();
  const ref = (key: string) => ({
    set: async (data: Record<string, unknown>) => void docs.set(key, structuredClone(data)),
    get: async () => ({ exists: docs.has(key), data: () => structuredClone(docs.get(key)) }),
    delete: async () => void docs.delete(key),
  });
  const query = (name: string, field: string, value: unknown, max = Infinity) => ({
    limit: (n: number) => query(name, field, value, n),
    get: async () => {
      const hits = [...docs.entries()]
        .filter(([key, data]) => key.startsWith(`${name}/`) && data[field] === value)
        .slice(0, max)
        .map(([key, data]) => ({ id: key, ref: ref(key), data: () => structuredClone(data) }));
      return { empty: hits.length === 0, docs: hits };
    },
  });
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ref(`${name}/${id}`),
      where: (field: string, _op: '==', value: unknown) => query(name, field, value),
    }),
  };
  return { db: db as unknown as Firestore, docs };
}
