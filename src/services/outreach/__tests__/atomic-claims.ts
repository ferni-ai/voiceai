/** Test double for guarded-text's claim store (TextStore claim/markSent/release). */
import type { CheckinRecord } from '../checkin-replies.js';

/**
 * claim/markSent/release over `records`, with claim() atomic as Firestore's
 * create() is: a second claim of the same id fails while the first holds it.
 */
export function atomicClaims(records: CheckinRecord[]) {
  const claimed = new Map<string, CheckinRecord>();
  return {
    claim: async (id: string, r: CheckinRecord) => {
      if (claimed.has(id)) return false;
      const copy = { ...r, id };
      claimed.set(id, copy);
      records.push(copy);
      return true;
    },
    markSent: async (id: string) => {
      const r = claimed.get(id);
      if (r) r.status = 'sent';
    },
    release: async (id: string) => {
      const r = claimed.get(id);
      claimed.delete(id);
      if (r) records.splice(records.indexOf(r), 1);
    },
  };
}
