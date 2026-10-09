/**
 * Firestore access for the user knowledge aggregator.
 *
 * @module intelligence/user-knowledge/firestore
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'UserKnowledgeFirestore' });

// One shared import for all aggregators. getUserKnowledge runs them in
// parallel, and Vitest hands the real module (not the vi.mock factory) to every
// concurrent import() after the first, so tests could hit live Firestore.
let firebaseAdminImport: Promise<typeof import('firebase-admin')> | null = null;

/** The Firestore client, or null when firebase-admin can't initialize. */
export async function getFirestoreDb(): Promise<FirebaseFirestore.Firestore | null> {
  try {
    firebaseAdminImport ??= import('firebase-admin').then((m) => m.default);
    const admin = await firebaseAdminImport;
    if (admin.apps.length === 0) {
      admin.initializeApp();
    }
    return admin.firestore();
  } catch (error) {
    log.debug({ error: String(error) }, 'Firestore not available');
    return null;
  }
}
