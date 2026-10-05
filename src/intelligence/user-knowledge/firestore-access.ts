/**
 * Firestore access for the user-knowledge aggregator.
 *
 * @module intelligence/user-knowledge/firestore-access
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'UserKnowledgeFirestore' });

// getUserKnowledge runs nine aggregators at once, and each asks for the db.
// They share one import() of firebase-admin: under Vitest 4, when several
// import() calls for a vi.mock'ed module are in flight together, only the first
// gets the mock and the rest get the real module, so tests reached real
// Firestore (and, with no credentials in CI, lost the data they had mocked).
let adminImport: Promise<{ default: typeof import('firebase-admin') }> | undefined;

export async function getFirestoreDb(): Promise<FirebaseFirestore.Firestore | null> {
  try {
    adminImport ??= import('firebase-admin');
    const admin = (await adminImport).default;
    if (admin.apps.length === 0) {
      admin.initializeApp();
    }
    return admin.firestore();
  } catch (error) {
    log.debug({ error: String(error) }, 'Firestore not available');
    return null;
  }
}
