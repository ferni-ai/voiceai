/**
 * An in-memory WaitlistStore with the Firestore store's semantics: merge
 * writes, counting over the stored derived fields (inQueue, laneRank,
 * priorityKey) the composite index serves, and a once-only referral credit.
 */
import { queueFields, readEntry } from '../queue.js';
import { readSettings } from '../settings.js';
import type { WaitlistStore } from '../store.js';

export function memoryStore(settings: Record<string, unknown> = {}) {
  const docs = new Map<string, Record<string, unknown>>();
  const find = (pred: (d: Record<string, unknown>) => boolean) => {
    const hit = [...docs.entries()].find(([, d]) => pred(d));
    return hit ? readEntry(hit[0], hit[1]) : null;
  };
  const every = (pred: (d: Record<string, unknown>) => boolean) =>
    [...docs.entries()]
      .filter(([, d]) => pred(d))
      .reverse()
      .map(([id, d]) => readEntry(id, d));
  const merge = (id: string, data: Record<string, unknown>) => {
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    docs.set(id, { ...docs.get(id), ...clean });
  };
  const store: WaitlistStore = {
    get: async (id) => (docs.has(id) ? readEntry(id, docs.get(id)!) : null),
    // Newest first: not the order the code wants, so a test catches anyone relying on it
    byCanonical: async (c) => every((d) => d.emailCanonical === c),
    findByInviteCode: async (code) => find((d) => d.inviteCode === code),
    byUid: async (uid) => every((d) => d.uid === uid),
    countAhead: async (rank, key) =>
      [...docs.values()].filter(
        (d) =>
          d.inQueue === true &&
          ((d.laneRank as number) < rank ||
            (d.laneRank === rank && (d.priorityKey as number) < key))
      ).length,
    merge: async (id, data) => merge(id, data),
    creditReferral: async (inviterId, referredId) => {
      if (!docs.has(inviterId) || docs.get(referredId)?.referralCredited === true) return false;
      const e = readEntry(inviterId, docs.get(inviterId)!);
      const verifiedReferrals = e.verifiedReferrals + 1;
      merge(inviterId, { verifiedReferrals, ...queueFields({ ...e, verifiedReferrals }) });
      merge(referredId, { referralCredited: true });
      return true;
    },
    settings: async () => readSettings(settings),
  };
  return { docs, store };
}
