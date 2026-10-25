/**
 * An in-memory consent store for tests: consent docs by hash, plus the two old
 * phone-keyed stores (feature_checkin_optouts by hash, call_opt_outs by number).
 */
import type { ConsentStore } from '../consent.js';

export function memoryConsentStore() {
  const docs = new Map<string, Record<string, unknown>>();
  const legacySms = new Set<string>();
  const legacyCall = new Set<string>();
  const store: ConsentStore = {
    read: async (h) => docs.get(h),
    apply: async (h, change) => {
      docs.set(h, change(docs.get(h)));
    },
    legacySmsOptOut: async (h) => legacySms.has(h),
    setLegacySmsOptOut: async (h, out) => {
      if (out) legacySms.add(h);
      else legacySms.delete(h);
    },
    legacyCallOptOut: async (p) => legacyCall.has(p),
    setLegacyCallOptOut: async (p) => {
      legacyCall.add(p);
    },
  };
  return { store, docs, legacySms, legacyCall };
}

/**
 * Just enough Firestore for firestoreConsentStore and the old phone-keyed
 * stores (top-level docs, get/set/delete, runTransaction get/set, set with merge), so a test
 * can drive the real default deps: mock utils/firestore-utils' getFirestoreDb
 * to return this. `docs` is keyed "collection/id".
 */
export function fakeConsentDb() {
  const docs = new Map<string, Record<string, unknown>>();
  const ref = (c: string, id: string) => ({
    path: `${c}/${id}`,
    get: async () => ({ exists: docs.has(`${c}/${id}`), data: () => docs.get(`${c}/${id}`) }),
    set: async (data: Record<string, unknown>) => {
      docs.set(`${c}/${id}`, { ...data });
    },
    delete: async () => {
      docs.delete(`${c}/${id}`);
    },
  });
  const db = {
    collection: (c: string) => ({ doc: (id: string) => ref(c, id) }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) =>
      fn({
        get: async (r: { path: string }) => ({
          exists: docs.has(r.path),
          data: () => docs.get(r.path),
        }),
        set: (r: { path: string }, data: Record<string, unknown>, opts?: { merge?: boolean }) =>
          docs.set(r.path, opts?.merge ? { ...docs.get(r.path), ...data } : { ...data }),
      }),
  };
  return { db, docs };
}
