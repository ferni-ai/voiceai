/**
 * The Firestore connection behind life-coaching profiles (user-profile.ts), created on
 * first use and bound to the process's database (FIRESTORE_DATABASE). The project is
 * unchanged on purpose: GOOGLE_PROJECT_ID, else 'bogle-voiceai'. Moving these profiles
 * into the main project would start persisting them in prod for the first time, which
 * is a product and data decision, not part of binding the database. Split out of
 * user-profile.ts, which is over the 500-line ratchet.
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

export async function getFirestore(): Promise<Firestore | null> {
  if (db) return db;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = initializeFirestore();
  return dbInitPromise;
}

async function initializeFirestore(): Promise<Firestore | null> {
  try {
    const { Firestore: FirestoreClass } = await import('@google-cloud/firestore');
    // Cast to our minimal interface - the actual implementation is compatible
    db = new FirestoreClass({
      projectId: process.env.GOOGLE_PROJECT_ID || 'bogle-voiceai',
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
