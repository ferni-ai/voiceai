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
