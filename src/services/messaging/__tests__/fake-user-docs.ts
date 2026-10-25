/**
 * bogle_users/{uid} in memory, with Firestore's `set(data, { merge: true })`
 * semantics (nested maps merge field by field; arrays and values replace),
 * for tests that save through prefs.ts and read back through the real code.
 */
type Doc = Record<string, unknown>;

const isMap = (v: unknown): v is Doc =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date);

function deepMerge(into: Doc, from: Doc): Doc {
  const out: Doc = { ...into };
  for (const [k, v] of Object.entries(from)) {
    out[k] = isMap(v) && isMap(out[k]) ? deepMerge(out[k] as Doc, v) : v;
  }
  return out;
}

export function fakeUserDocs(initial: Record<string, Doc> = {}) {
  const docs = new Map<string, Doc>(Object.entries(structuredClone(initial)));
  /** Updates to bogle_users/{id}/{sub}/{subId} (a held reminder). */
  const subUpdates: Array<{ path: string; data: Doc }> = [];
  const db = {
    collection: (_name: string) => ({
      doc: (id: string) => ({
        get: async () => ({ exists: docs.has(id), data: () => structuredClone(docs.get(id)) }),
        set: async (data: Doc, opts?: { merge?: boolean }) => {
          const clean = JSON.parse(JSON.stringify(data)) as Doc;
          docs.set(id, opts?.merge ? deepMerge(docs.get(id) ?? {}, clean) : clean);
        },
        collection: (sub: string) => ({
          doc: (subId: string) => ({
            update: async (data: Doc) =>
              void subUpdates.push({ path: `${id}/${sub}/${subId}`, data }),
          }),
        }),
      }),
    }),
  };
  return { db, docs, subUpdates };
}
