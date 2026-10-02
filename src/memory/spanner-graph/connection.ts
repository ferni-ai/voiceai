/**
 * Spanner Graph - connection
 *
 * Process-wide Spanner client and database handle (lazy), opt-in check,
 * startup connectivity check and shutdown. Used by client.ts.
 *
 * @module memory/spanner-graph/connection
 */

import { Spanner, type Database } from '@google-cloud/spanner';
import { createLogger } from '../../utils/safe-logger.js';
import { SPANNER_CONFIG } from './schema.js';

const log = createLogger({ module: 'SpannerGraphClient' });

// ============================================================================
// SINGLETON CLIENT
// ============================================================================

let spannerInstance: Spanner | null = null;
let databaseInstance: Database | null = null;
let initialized = false;

/**
 * Get or create the Spanner client instance
 */
function getSpannerClient(): Spanner {
  if (!spannerInstance) {
    spannerInstance = new Spanner({
      projectId: SPANNER_CONFIG.projectId,
    });
    log.debug('Spanner client created');
  }
  return spannerInstance;
}

/**
 * Get or create the Database instance
 */
export function getDatabase(): Database {
  if (!databaseInstance) {
    const spanner = getSpannerClient();
    const instance = spanner.instance(SPANNER_CONFIG.instanceId);
    databaseInstance = instance.database(SPANNER_CONFIG.databaseId);
    log.debug('Spanner database connection established');
  }
  return databaseInstance;
}

/**
 * Check if Spanner is ready
 */
export function isSpannerReady(): boolean {
  return initialized;
}

/**
 * Initialize Spanner connection
 * Call this at startup to verify connectivity
 */
/**
 * Spanner Graph (L3) is opt-in: SPANNER_ENABLED=true once a ferni-memory
 * instance is provisioned (or SPANNER_EMULATOR_HOST for local work).
 */
export function isSpannerConfigured(): boolean {
  return process.env.SPANNER_ENABLED === 'true' || !!process.env.SPANNER_EMULATOR_HOST;
}

export async function initializeSpanner(): Promise<boolean> {
  if (initialized) return true;

  // Without an instance, don't create a client at all: opening a database
  // starts a background session pool whose failed gRPC calls reject where no
  // caller can catch them (unhandled rejections, and credential lookups).
  if (!isSpannerConfigured()) {
    log.debug('Spanner not enabled (SPANNER_ENABLED!=true) - using Firestore fallback');
    return false;
  }

  try {
    const db = getDatabase();
    // Simple query to verify connectivity
    const [rows] = await db.run({ sql: 'SELECT 1' });
    if (rows.length > 0) {
      initialized = true;
      log.info('Spanner connection verified');
      return true;
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Spanner not available (will use Firestore fallback)');
  }

  return false;
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Close Spanner connections
 */
export async function closeSpanner(): Promise<void> {
  if (databaseInstance) {
    await databaseInstance.close();
    databaseInstance = null;
  }
  if (spannerInstance) {
    spannerInstance.close();
    spannerInstance = null;
  }
  initialized = false;
  log.debug('Spanner connections closed');
}
