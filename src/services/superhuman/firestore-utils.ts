/**
 * Firestore utilities for Superhuman services
 *
 * Provides a shared Firestore instance and type-safe helpers for
 * storing and retrieving superhuman service data.
 */

import { Firestore } from '@google-cloud/firestore';
import { createLogger } from '../../utils/safe-logger.js';

// Re-export cleanForFirestore for convenience
export {
  cleanForFirestore,
  removeUndefined,
  deepRemoveUndefined,
} from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'superhuman-firestore' });

let db: Firestore | null = null;
let initialized = false;

/**
 * Get or initialize the Firestore database instance.
 * Returns null if Firestore is not available.
 */
export function getFirestoreDb(): Firestore | null {
  if (initialized) {
    return db;
  }

  try {
    db = new Firestore();
    initialized = true;
    log.debug('Superhuman Firestore initialized');
    return db;
  } catch (error) {
    log.warn({ error: String(error) }, 'Firestore not available for superhuman services');
    initialized = true; // Don't retry
    return null;
  }
}

/**
 * Reset the Firestore instance (for testing).
 */
export function resetFirestoreInstance(): void {
  db = null;
  initialized = false;
}
