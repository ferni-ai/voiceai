/**
 * The Firestore connection behind life-coaching profiles (user-profile.ts): created on
 * first use through getAdminFirestore(), so it binds the default app's project and the
 * process's database. It used to fall back to project 'bogle-voiceai' when
 * GOOGLE_PROJECT_ID was unset, quietly sending profiles to another project. Split out
 * of user-profile.ts, which is over the 500-line ratchet.
 *
 * @module tools/domains/life-coaching-shared/user-profile-firestore
 */

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

export async function getFirestore(): Promise<Firestore | null> {
  if (db) return db;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = initializeFirestore();
  return dbInitPromise;
}

async function initializeFirestore(): Promise<Firestore | null> {
  try {
    // The default app's project (getAdminApp) and the process's database, never a
    // hardcoded fallback project. Cast to our minimal interface - it is compatible.
    const { getAdminFirestore } = await import('../../../utils/firebase-admin-app.js');
    db = getAdminFirestore() as unknown as Firestore;
    log.info('Firestore initialized for life coaching profiles');
    return db;
  } catch (error) {
    log.warn({ error: String(error) }, 'Firestore not available - using memory-only mode');
    dbInitPromise = null; // Allow retry
    return null;
  }
}
