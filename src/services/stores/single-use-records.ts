/**
 * Short-lived records that are each used at most once, such as OAuth connect
 * states (servers/token/oauth-link-state.ts). Moved out of that module so the
 * one-tap connect-moment invites can share it.
 *
 * Records are keyed by a hash the caller makes from its secret (sha256Hex), so
 * the store never holds the secret itself. `take` reads and deletes in one
 * step (a Firestore transaction), so two redemptions can't both succeed. Every
 * record names the uid it belongs to, so account deletion can remove them all.
 * The Firestore copy carries `ttlAt` (a Timestamp) for a TTL policy to sweep
 * abandoned records; TTL ignores numeric fields like expiresAt.
 *
 * @module services/stores/single-use-records
 */
import crypto from 'node:crypto';
import { getFirestoreDb } from '../../utils/firestore-utils.js';

/** What every single-use record carries. */
export interface SingleUseRecord {
  uid: string;
  expiresAt: number;
}

export interface SingleUseStore<R extends SingleUseRecord> {
  put(key: string, record: R): Promise<boolean>;
  get(key: string): Promise<R | null>;
  /** Read and delete in one step, so a record is used at most once. */
  take(key: string): Promise<R | null>;
  /** Delete every record of `uid` (account deletion). Throws when it can't. */
  deleteForUser(uid: string): Promise<number>;
}

/** The key for a secret: its SHA-256, hex. */
export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** One process's records (local dev, tests); refuses new ones past maxRecords. */
export function memorySingleUseStore<R extends SingleUseRecord>(
  maxRecords: number
): SingleUseStore<R> {
  const records = new Map<string, R>();
  return {
    async put(key, record) {
      const now = Date.now();
      for (const [k, r] of records) if (r.expiresAt < now) records.delete(k);
      if (records.size >= maxRecords) return false;
      records.set(key, record);
      return true;
    },
    async get(key) {
      return records.get(key) ?? null;
    },
    async take(key) {
      const record = records.get(key) ?? null;
      records.delete(key);
      return record;
    },
    async deleteForUser(uid) {
      const keys = [...records].filter(([, r]) => r.uid === uid).map(([k]) => k);
      for (const k of keys) records.delete(k);
      return keys.length;
    },
  };
}

/** Records shared by every instance, in one Firestore collection. */
export function firestoreSingleUseStore<R extends SingleUseRecord>(
  collectionName: string
): SingleUseStore<R> {
  const collection = () => getFirestoreDb()?.collection(collectionName) ?? null;
  return {
    async put(key, record) {
      const col = collection();
      if (!col) return false;
      await col.doc(key).set({ ...record, ttlAt: new Date(record.expiresAt) });
      return true;
    },
    async get(key) {
      const snap = await collection()?.doc(key).get();
      return snap?.exists ? (snap.data() as R) : null;
    },
    async take(key) {
      const db = getFirestoreDb();
      if (!db) return null;
      const ref = db.collection(collectionName).doc(key);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return null;
        tx.delete(ref);
        return snap.data() as R;
      });
    },
    async deleteForUser(uid) {
      const db = getFirestoreDb();
      if (!db) throw new Error('Firestore unavailable');
      const snap = await db.collection(collectionName).where('uid', '==', uid).get();
      // A batch holds at most 500 writes; abandoned records can pile up until a TTL sweep.
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = db.batch();
        for (const doc of snap.docs.slice(i, i + 400)) batch.delete(doc.ref);
        await batch.commit();
      }
      return snap.docs.length;
    },
  };
}
