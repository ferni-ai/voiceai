/**
 * The Firestore connection behind Peter's user data service: one client per process,
 * created on first use and bound to the process's database (getFirestoreDatabase()).
 * Split out of user-data-service.ts, which is over the 500-line ratchet.
 *
 * @module tools/domains/research/user-data/user-data-firestore
 */

import { getFirestoreDatabase } from '../../../../config/environment.js';
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
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || 'johnb-2025',
      databaseId: getFirestoreDatabase(),
    });
    log.info('User data Firestore initialized');
    return db;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to initialize Firestore');
    dbInitPromise = null; // Allow retry
    throw error;
  }
}
