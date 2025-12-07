/**
 * Store Factory - Provides the appropriate store based on environment
 *
 * This factory abstracts away the store selection logic so services
 * can simply call `getStore()` without knowing about the underlying implementation.
 */

import { getLogger } from '../utils/safe-logger.js';
import type { MemoryStore } from './store.js';
import { getDefaultStore } from './in-memory-store.js';

const logger = getLogger().child({ module: 'StoreFactory' });

let storeInstance: MemoryStore | null = null;

/**
 * Get the active memory store
 *
 * Selection priority:
 * 1. Firestore (if GOOGLE_CLOUD_PROJECT is set in production)
 * 2. Postgres (if DATABASE_URL is set)
 * 3. In-memory (fallback for development)
 */
export async function getStore(): Promise<MemoryStore> {
  if (storeInstance) {
    return storeInstance;
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const hasGCP = Boolean(process.env.GOOGLE_CLOUD_PROJECT);
  const hasPostgres = Boolean(process.env.DATABASE_URL);

  try {
    if (isProduction && hasGCP) {
      const { getFirestoreStore } = await import('./firestore-store.js');
      storeInstance = getFirestoreStore();
      logger.info('Using Firestore store');
    } else if (hasPostgres) {
      const { getPostgresStore } = await import('./postgres-store.js');
      storeInstance = getPostgresStore();
      logger.info('Using Postgres store');
    } else {
      storeInstance = getDefaultStore();
      logger.info('Using in-memory store');
    }
  } catch (error) {
    logger.warn({ error: String(error) }, 'Failed to initialize preferred store, falling back to in-memory');
    storeInstance = getDefaultStore();
  }

  return storeInstance;
}

/**
 * Get store synchronously (returns null if not yet initialized)
 */
export function getStoreSync(): MemoryStore | null {
  return storeInstance;
}

/**
 * Reset the store instance (useful for testing)
 */
export function resetStore(): void {
  storeInstance = null;
}

/**
 * Initialize store with a specific instance (useful for DI)
 */
export function setStore(store: MemoryStore): void {
  storeInstance = store;
}

export default {
  getStore,
  getStoreSync,
  resetStore,
  setStore,
};

