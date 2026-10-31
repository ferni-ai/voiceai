/**
 * The Firestore connection behind life-coaching profiles (user-profile.ts), created on
 * first use in GOOGLE_PROJECT_ID's project and bound to the process's database
 * (FIRESTORE_DATABASE).
 *
 * With GOOGLE_PROJECT_ID unset there is no client and profiles stay in memory. The
 * client used to fall back to a hardcoded project id that nobody on our side can see.
 * Project ids are global, so if that project doesn't exist, anyone could create it,
 * grant our service account access, and receive emotional-state, attachment and
 * boundary data. Persisting these profiles in the main project is a separate product
 * and data decision. Split out of user-profile.ts, which is over the 500-line ratchet.
 *
 * @module tools/domains/life-coaching-shared/user-profile-firestore
 */

import { getFirestoreDatabase } from '../../../config/environment.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'LifeCoachingProfile' });

// Minimal Firestore types (to avoid hard dependency)
export interface Firestore {
  collection: (path: string) => CollectionReference;
}

export interface CollectionReference {
  doc: (id: string) => DocumentReference;
}

export interface DocumentReference {
  collection: (path: string) => CollectionReference;
  get: () => Promise<DocumentSnapshot>;
  set: (data: unknown, options?: { merge?: boolean }) => Promise<void>;
}

export interface DocumentSnapshot {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
}

// ============================================================================
// FIRESTORE CONNECTION
// ============================================================================

let db: Firestore | null = null;
// FIX: Promise-based singleton to prevent race condition
let dbInitPromise: Promise<Firestore | null> | null = null;
let persistenceOffLogged = false;

export async function getFirestore(): Promise<Firestore | null> {
  if (db) return db;
  if (dbInitPromise) return dbInitPromise;

  // Fail closed: with no project there is no client and no guessed project id.
  // Checked on every call, so setting GOOGLE_PROJECT_ID later turns persistence on.
  const projectId = process.env.GOOGLE_PROJECT_ID?.trim();
  if (!projectId) {
    if (!persistenceOffLogged) {
      persistenceOffLogged = true;
      log.warn('GOOGLE_PROJECT_ID is unset: life-coaching persistence is off (memory-only)');
    }
    return null;
  }

  dbInitPromise = initializeFirestore(projectId);
  return dbInitPromise;
}

async function initializeFirestore(projectId: string): Promise<Firestore | null> {
  try {
    const { Firestore: FirestoreClass } = await import('@google-cloud/firestore');
    // Cast to our minimal interface - the actual implementation is compatible
    db = new FirestoreClass({
      projectId,
      databaseId: getFirestoreDatabase(),
    }) as unknown as Firestore;
    log.info('Firestore initialized for life coaching profiles');
    return db;
  } catch (error) {
    log.warn({ error: String(error) }, 'Firestore not available - using memory-only mode');
    dbInitPromise = null; // Allow retry
    return null;
  }
}
