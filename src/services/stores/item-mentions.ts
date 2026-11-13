/**
 * Which of a person's todos they talked about, and when: one small document per
 * item at bogle_users/{uid}/item_mentions/{id}, holding the item's store, ref,
 * when it was last named and the item's version then. Never any words: not the
 * item's, not theirs.
 *
 * The morning brief leaves an item out once after they talked about it ("I
 * already gave you an update"), then consumes the mention, so "still haven't
 * done it" brings it back the morning after (morning-brief/freshness.ts).
 * The after-call writer lands separately; until it does, nothing is recorded
 * and rule (c) drops nothing.
 *
 * @module services/stores/item-mentions
 */

import type { Firestore } from '@google-cloud/firestore';
import type { FollowUp } from '../follow-through/index.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { followUpId } from './follow-through-store.js';

type SourceRef = FollowUp['source'];

export interface ItemMention {
  readonly store: string;
  readonly ref: string;
  /** UTC ISO instant it was last named. */
  readonly at: string;
  /** The item's version when named (a reminder's due time, a task's updatedAt). */
  readonly version?: string;
}

export interface ItemMentionStore {
  /** Mentions at or after `since`. */
  recent: (userId: string, since: Date) => Promise<ItemMention[]>;
  /** The brief left these out once: their mentions are spent. */
  consume: (userId: string, sources: readonly SourceRef[]) => Promise<void>;
}

function createItemMentionStore(db: Firestore): ItemMentionStore {
  const mine = (userId: string) =>
    db.collection('bogle_users').doc(userId).collection('item_mentions');
  return {
    async recent(userId, since) {
      const snap = await mine(userId).where('at', '>=', since.toISOString()).get();
      return snap.docs.flatMap((d) => {
        const { store, ref, at, version } = d.data() as Record<string, unknown>;
        if (typeof store !== 'string' || typeof ref !== 'string' || typeof at !== 'string')
          return [];
        return [{ store, ref, at, ...(typeof version === 'string' ? { version } : {}) }];
      });
    },
    async consume(userId, sources) {
      if (sources.length === 0) return;
      const batch = db.batch();
      for (const source of sources) batch.delete(mine(userId).doc(followUpId(source)));
      await batch.commit();
    },
  };
}

export function firestoreItemMentionStore(): ItemMentionStore | null {
  const db = getFirestoreDb();
  return db ? createItemMentionStore(db) : null;
}
