/**
 * Saves a device's Focus post to bogle_users/{uid}.messagingPrefs.focus, in a
 * transaction so two devices posting at once both count. Only this field is
 * replaced (prefs.ts writes the rest of messagingPrefs with a merge, which
 * leaves it alone). The cap is worked out in the zone prefs.ts reads.
 *
 * @module services/messaging/focus-store
 */
import { getFirestoreDb } from '../superhuman/firestore-utils.js';
import { focusFromDoc, nextFocus, type FocusPost, type FocusRecord } from './focus.js';
import { prefsFromDoc } from './prefs.js';

export interface FocusStore {
  save: (userId: string, post: FocusPost, now: Date) => Promise<FocusRecord | 'too-many-devices'>;
}

export const firestoreFocusStore: FocusStore = {
  async save(userId, post, now) {
    const db = getFirestoreDb();
    if (!db) throw new Error('Firestore not available');
    const ref = db.collection('bogle_users').doc(userId);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const doc = snap.exists ? snap.data() : undefined;
      const saved = (doc?.messagingPrefs ?? {}) as { focus?: unknown };
      const next = nextFocus(focusFromDoc(saved.focus), post, now, prefsFromDoc(doc).zone);
      if (next === 'too-many-devices') return next;
      tx.set(ref, { messagingPrefs: { focus: next } }, { mergeFields: ['messagingPrefs.focus'] });
      return next;
    });
  },
};
