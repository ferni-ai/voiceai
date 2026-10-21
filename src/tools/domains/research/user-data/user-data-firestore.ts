/**
 * The Firestore connection behind Peter's user data service: created on first use
 * through getAdminFirestore(), so it binds the default app's project and the process's
 * database instead of a hardcoded 'johnb-2025' fallback. Split out of
 * user-data-service.ts, which is over the 500-line ratchet.
 *
 * @module tools/domains/research/user-data/user-data-firestore
 */

import { getLogger } from '../../../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// FIRESTORE INITIALIZATION
// ============================================================================

let db: FirebaseFirestore.Firestore | null = null;
// FIX: Promise-based singleton to prevent race condition
let dbInitPromise: Promise<FirebaseFirestore.Firestore> | null = null;

export async function getFirestore(): Promise<FirebaseFirestore.Firestore> {
  if (db) return db;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = initializeFirestore();
  return dbInitPromise;
}

async function initializeFirestore(): Promise<FirebaseFirestore.Firestore> {
  try {
    // The default app's project (getAdminApp) and the process's database, never a
    // hardcoded fallback project.
    const { getAdminFirestore } = await import('../../../../utils/firebase-admin-app.js');
    db = getAdminFirestore();
    log.info('User data Firestore initialized');
    return db;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to initialize Firestore');
    dbInitPromise = null; // Allow retry
    throw error;
  }
}
