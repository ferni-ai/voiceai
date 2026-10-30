/**
 * Firestore store for letters to future you: bogle_users/{uid}/future_letters/{id}.
 *
 * Implements FutureLetterStore (tools/domains/engagement/future-letters.ts);
 * the rules for when a letter is read back live there. A read back letter is
 * kept, marked delivered, so it isn't read back twice.
 *
 * @module services/stores/future-letter-store
 */

import { randomUUID } from 'crypto';
import type { CollectionReference, Firestore } from '@google-cloud/firestore';
import type {
  FutureLetter,
  FutureLetterStore,
} from '../../tools/domains/engagement/future-letters.js';

const str = (x: unknown): string | undefined => (typeof x === 'string' ? x : undefined);

/** A stored document as a sealed letter, or null if it isn't one. */
function toFutureLetter(id: string, data: unknown): FutureLetter | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  const body = str(d.body);
  const writtenAt = str(d.writtenAt);
  const deliverAt = str(d.deliverAt);
  if (!body || !writtenAt || !deliverAt || d.status !== 'sealed') return null;
  const offeredAt = str(d.offeredAt);
  return { id, body, writtenAt, deliverAt, ...(offeredAt ? { offeredAt } : {}) };
}

export function createFutureLetterStore(db: Firestore): FutureLetterStore {
  const mine = (userId: string): CollectionReference =>
    db.collection('bogle_users').doc(userId).collection('future_letters');

  return {
    async seal(userId, letter) {
      const id = randomUUID();
      await mine(userId)
        .doc(id)
        .set({ ...letter, status: 'sealed' });
      return { id, ...letter };
    },
    async sealed(userId) {
      const snap = await mine(userId).where('status', '==', 'sealed').get();
      return snap.docs.flatMap((d) => {
        const letter = toFutureLetter(d.id, d.data());
        return letter ? [letter] : [];
      });
    },
    async delivered(userId, id, at) {
      await mine(userId).doc(id).update({ status: 'delivered', deliveredAt: at });
    },
    async offered(userId, id, at) {
      await mine(userId).doc(id).update({ offeredAt: at });
    },
    async drop(userId, id) {
      await mine(userId).doc(id).delete();
    },
  };
}
