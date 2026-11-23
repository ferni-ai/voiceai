/**
 * The FinOpsSettingsStore on Firestore: one document, finops_settings/current, in the
 * process's database (getFirestoreDb honours FIRESTORE_DATABASE, so dev writes ferni-dev).
 * Company-wide, not per person. Server only: firestore.rules denies every client.
 *
 * @module services/observability/finops-settings/adapters/firestore-finops-settings-store
 */
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { cleanForFirestore, getFirestoreDb } from '../../../../utils/firestore-utils.js';
import { parseFinOpsSettings } from '../domain/finops-settings.js';
import type { FinOpsSettingsStore } from '../ports/finops-settings-store.js';

const FINOPS_SETTINGS_COLLECTION = 'finops_settings';
const FINOPS_SETTINGS_DOC = 'current';

/** The store over the database `getDb` returns when first used; with none, every call throws. */
export function firestoreFinOpsSettingsStore(
  getDb: () => Firestore | null = getFirestoreDb
): FinOpsSettingsStore {
  const ref = (): DocumentReference => {
    const db = getDb();
    if (!db) throw new Error('Firestore is not configured on this server');
    return db.collection(FINOPS_SETTINGS_COLLECTION).doc(FINOPS_SETTINGS_DOC);
  };
  return {
    async read() {
      const snap = await ref().get();
      return snap.exists ? parseFinOpsSettings(snap.data()) : null;
    },
    async merge(patch, meta) {
      // merge: true merges nested maps too, so one threshold leaves the others as saved
      await ref().set(cleanForFirestore({ ...patch, ...meta }), { merge: true });
    },
  };
}
