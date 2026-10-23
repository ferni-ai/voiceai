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
let adminAppImport: Promise<{ getAdminFirestore(): FirebaseFirestore.Firestore }> | null = null;

/**
 * The Firestore client on the process's database (FIRESTORE_DATABASE), or null
 * when firebase-admin can't initialize. admin.firestore() used to serve this and
 * is always '(default)', so the ferni-dev agent read every aggregate from prod.
 */
export async function getFirestoreDb(): Promise<FirebaseFirestore.Firestore | null> {
  try {
    adminAppImport ??= import('../../utils/firebase-admin-app.js');
    return (await adminAppImport).getAdminFirestore();
  } catch (error) {
    log.debug({ error: String(error) }, 'Firestore not available');
    return null;
  }
}
