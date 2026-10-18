/**
 * Where the waitlist queue lives: `waitlist/{base64(email)}` docs (the id is
 * unchanged, so profile linking and erasure keep working). Behind an
 * interface so the rules can be tested in memory.
 *
 * Index: waitlist (inQueue, laneRank, priorityKey), in firestore.indexes.json.
 *
 * @module services/waitlist/store
 */
import type { Firestore, Query } from '@google-cloud/firestore';
import { queueFields, readEntry, type QueueEntry } from './queue.js';

export interface WaitlistStore {
  get: (id: string) => Promise<QueueEntry | null>;
  findByCanonical: (canonical: string) => Promise<QueueEntry | null>;
  findByUid: (uid: string) => Promise<QueueEntry | null>;
  findByInviteCode: (code: string) => Promise<QueueEntry | null>;
  /** How many people in line sort before (laneRank, priorityKey). */
  countAhead: (laneRank: number, priorityKey: number) => Promise<number>;
  merge: (id: string, data: Record<string, unknown>) => Promise<void>;
  /** Once per referred person: +1 verified referral for the inviter, and their place recomputed. */
  creditReferral: (inviterId: string, referredId: string) => Promise<boolean>;
}

/** Firestore rejects undefined fields; drop them. */
export function defined(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
}

export function firestoreWaitlistStore(db: Firestore): WaitlistStore {
  const col = db.collection('waitlist');
  const first = async (q: Query): Promise<QueueEntry | null> => {
    const doc = (await q.limit(1).get()).docs.at(0);
    return doc ? readEntry(doc.id, doc.data()) : null;
  };
  return {
    async get(id) {
      const snap = await col.doc(id).get();
      return snap.exists ? readEntry(id, snap.data() ?? {}) : null;
    },
    findByCanonical: async (canonical) => first(col.where('emailCanonical', '==', canonical)),
    findByInviteCode: async (code) => first(col.where('inviteCode', '==', code)),
    findByUid: async (uid) => first(col.where('uid', '==', uid)),
    async countAhead(laneRank, priorityKey) {
      const line = col.where('inQueue', '==', true);
      const [lowerLane, sameLane] = await Promise.all([
        line.where('laneRank', '<', laneRank).count().get(),
        line.where('laneRank', '==', laneRank).where('priorityKey', '<', priorityKey).count().get(),
      ]);
      return lowerLane.data().count + sameLane.data().count;
    },
    async merge(id, data) {
      await col.doc(id).set(defined(data), { merge: true });
    },
    async creditReferral(inviterId, referredId) {
      return db.runTransaction(async (tx) => {
        const [inviter, referred] = await tx.getAll(col.doc(inviterId), col.doc(referredId));
        if (!inviter.exists || referred.data()?.referralCredited === true) return false;
        const entry = readEntry(inviterId, inviter.data() ?? {});
        const verifiedReferrals = entry.verifiedReferrals + 1;
        tx.set(inviter.ref, { verifiedReferrals, ...queueFields({ ...entry, verifiedReferrals }) }, { merge: true }); // prettier-ignore
        tx.set(col.doc(referredId), { referralCredited: true }, { merge: true });
        return true;
      });
    },
  };
}
