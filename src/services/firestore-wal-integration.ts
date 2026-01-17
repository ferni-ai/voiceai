/**
 * Firestore Write-Ahead Log Integration
 *
 * Provides non-blocking Firestore writes for latency-critical paths.
 * Uses WAL to queue writes and batch flush them in the background.
 *
 * Benefits:
 * - Voice agent turns return instantly (no 100-500ms write latency)
 * - Batched writes reduce Firestore API calls and costs
 * - Automatic retry on transient failures
 * - Priority-based write ordering (high > normal > low)
 *
 * Usage:
 * ```typescript
 * // Non-blocking write (returns immediately)
 * queueUserProfileUpdate(userId, { lastSeen: Date.now() });
 *
 * // Await specific flush if needed
 * await flushUserWrites(userId);
 * ```
 *
 * @module services/firestore-wal-integration
 */

import { createLogger } from '../utils/safe-logger.js';
import {
  getWriteAheadLog,
  initializeWriteAheadLog,
  shutdownWriteAheadLog,
  type WALStats,
} from './write-ahead-log.js';

const log = createLogger({ module: 'FirestoreWALIntegration' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Firestore collection paths */
const COLLECTIONS = {
  USERS: 'bogle_users',
  MEMORIES: 'memories',
  SESSIONS: 'sessions',
  ANALYTICS: 'analytics',
} as const;

/** Write priority levels */
export type WritePriority = 'high' | 'normal' | 'low';

// ============================================================================
// INITIALIZATION
// ============================================================================

let initialized = false;

/**
 * Initialize the WAL integration.
 * Call once at application startup.
 */
export async function initializeFirestoreWAL(): Promise<void> {
  if (initialized) return;

  try {
    await initializeWriteAheadLog();
    initialized = true;
    log.info('Firestore WAL integration initialized');
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to initialize Firestore WAL');
    throw error;
  }
}

/**
 * Shutdown the WAL integration.
 * Flushes all pending writes before returning.
 */
export async function shutdownFirestoreWAL(): Promise<void> {
  if (!initialized) return;

  try {
    await shutdownWriteAheadLog();
    initialized = false;
    log.info('Firestore WAL integration shutdown complete');
  } catch (error) {
    log.error({ error: String(error) }, 'Error during Firestore WAL shutdown');
    throw error;
  }
}

// ============================================================================
// USER PROFILE WRITES (Non-blocking)
// ============================================================================

/**
 * Queue a user profile update (non-blocking).
 * Returns immediately - write happens in background.
 *
 * @param userId - User ID
 * @param updates - Fields to update (merge with existing)
 * @param priority - Write priority (default: normal)
 * @returns WAL entry ID for tracking
 */
export function queueUserProfileUpdate(
  userId: string,
  updates: Record<string, unknown>,
  priority: WritePriority = 'normal'
): string {
  const wal = getWriteAheadLog();
  return wal.merge(COLLECTIONS.USERS, userId, updates, { userId, priority });
}

/**
 * Queue a user profile set (replaces entire document).
 * Use with caution - prefer merge updates.
 */
export function queueUserProfileSet(
  userId: string,
  profile: Record<string, unknown>,
  priority: WritePriority = 'normal'
): string {
  const wal = getWriteAheadLog();
  return wal.set(COLLECTIONS.USERS, userId, profile, { userId, priority });
}

// ============================================================================
// SUBCOLLECTION WRITES (Non-blocking)
// ============================================================================

/**
 * Queue a write to a user subcollection (non-blocking).
 *
 * @param userId - User ID
 * @param subcollection - Name of subcollection (e.g., 'memories', 'sessions')
 * @param docId - Document ID within subcollection
 * @param data - Document data
 * @param options - Write options
 */
export function queueSubcollectionWrite(
  userId: string,
  subcollection: string,
  docId: string,
  data: Record<string, unknown>,
  options?: {
    operation?: 'set' | 'merge' | 'update';
    priority?: WritePriority;
  }
): string {
  const wal = getWriteAheadLog();
  const collection = `${COLLECTIONS.USERS}/${userId}/${subcollection}`;
  const operation = options?.operation || 'set';
  const priority = options?.priority || 'normal';

  switch (operation) {
    case 'merge':
      return wal.merge(collection, docId, data, { userId, priority });
    case 'update':
      return wal.update(collection, docId, data, { userId, priority });
    default:
      return wal.set(collection, docId, data, { userId, priority });
  }
}

/**
 * Queue a memory write (non-blocking).
 */
export function queueMemoryWrite(
  userId: string,
  memoryId: string,
  memory: Record<string, unknown>,
  priority: WritePriority = 'normal'
): string {
  return queueSubcollectionWrite(userId, 'memories', memoryId, memory, {
    operation: 'set',
    priority,
  });
}

/**
 * Queue a session data write (non-blocking).
 */
export function queueSessionWrite(
  userId: string,
  sessionId: string,
  sessionData: Record<string, unknown>,
  priority: WritePriority = 'normal'
): string {
  return queueSubcollectionWrite(userId, 'sessions', sessionId, sessionData, {
    operation: 'merge',
    priority,
  });
}

// ============================================================================
// HIGH-PRIORITY WRITES (For critical data)
// ============================================================================

/**
 * Queue a high-priority write.
 * High-priority writes are flushed first and retried more aggressively.
 */
export function queueHighPriorityWrite(
  collection: string,
  docId: string,
  data: Record<string, unknown>,
  userId?: string
): string {
  const wal = getWriteAheadLog();
  return wal.set(collection, docId, data, { userId, priority: 'high' });
}

/**
 * Queue a deletion (non-blocking).
 */
export function queueDeletion(
  collection: string,
  docId: string,
  priority: WritePriority = 'normal',
  userId?: string
): string {
  const wal = getWriteAheadLog();
  return wal.delete(collection, docId, { userId, priority });
}

// ============================================================================
// ANALYTICS / TELEMETRY (Low priority)
// ============================================================================

/**
 * Queue an analytics event (low priority).
 * Analytics writes never block user experience.
 */
export function queueAnalyticsEvent(
  eventId: string,
  event: Record<string, unknown>,
  userId?: string
): string {
  const wal = getWriteAheadLog();
  return wal.set(COLLECTIONS.ANALYTICS, eventId, event, { userId, priority: 'low' });
}

// ============================================================================
// FLUSH CONTROL
// ============================================================================

/**
 * Force flush all pending writes for a specific user.
 * Use when you need to ensure data is persisted (e.g., session end).
 */
export async function flushUserWrites(
  _userId?: string
): Promise<{ flushed: number; failed: number }> {
  // Note: Current WAL doesn't support per-user flush
  // Flush all pending writes
  const wal = getWriteAheadLog();
  return wal.flush();
}

/**
 * Force flush all pending writes.
 */
export async function flushAllWrites(): Promise<{ flushed: number; failed: number }> {
  const wal = getWriteAheadLog();
  return wal.flush();
}

// ============================================================================
// MONITORING
// ============================================================================

/**
 * Get WAL statistics for monitoring.
 */
export function getWALStatistics(): WALStats {
  const wal = getWriteAheadLog();
  return wal.getStats();
}

/**
 * Check if WAL is healthy.
 */
export function isWALHealthy(): boolean {
  const stats = getWALStatistics();

  // Unhealthy if:
  // - Too many pending writes (queue backing up)
  // - High failure rate
  // - Flush in progress for too long

  const MAX_PENDING = 100;
  const MAX_FAILURE_RATE = 0.1; // 10%

  if (stats.queueSize > MAX_PENDING) {
    log.warn({ queueSize: stats.queueSize }, 'WAL queue is backing up');
    return false;
  }

  const totalProcessed = stats.totalFlushed + stats.totalFailed;
  if (totalProcessed > 0) {
    const failureRate = stats.totalFailed / totalProcessed;
    if (failureRate > MAX_FAILURE_RATE) {
      log.warn({ failureRate, totalFailed: stats.totalFailed }, 'WAL failure rate too high');
      return false;
    }
  }

  return true;
}

// ============================================================================
// RE-EXPORTS for convenience
// ============================================================================

export { getWriteAheadLog, type WALStats } from './write-ahead-log.js';
