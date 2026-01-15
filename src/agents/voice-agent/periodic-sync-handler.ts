/**
 * Periodic Sync Handler
 *
 * Manages periodic synchronization of deep understanding profiles
 * and other persistent data during long sessions.
 *
 * This ensures that user insights are saved even if the session
 * ends unexpectedly (network drop, crash, etc.).
 *
 * @module agents/voice-agent/periodic-sync-handler
 */

import { diag } from '../../services/diagnostic-logger.js';
import { deepUnderstandingPeriodicSync } from '../../intelligence/index.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'PeriodicSync' });

// ============================================================================
// TYPES
// ============================================================================

interface PeriodicSyncState {
  intervalId: ReturnType<typeof setInterval> | null;
  userId: string;
  sessionId: string;
  syncCount: number;
  lastSyncTime: number;
  isActive: boolean;
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const syncStates = new Map<string, PeriodicSyncState>();

// ============================================================================
// CONFIGURATION
// ============================================================================

const SYNC_CONFIG = {
  /** Default sync interval (5 minutes) */
  DEFAULT_INTERVAL_MS: 5 * 60 * 1000,

  /** Minimum sync interval (1 minute) */
  MIN_INTERVAL_MS: 60 * 1000,

  /** Maximum sync interval (15 minutes) */
  MAX_INTERVAL_MS: 15 * 60 * 1000,

  /** Enable sync by default */
  ENABLED_BY_DEFAULT: true,
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Start periodic sync for a session
 *
 * @param sessionId - Session identifier
 * @param userId - User identifier
 * @param intervalMs - Sync interval in milliseconds (default: 5 minutes)
 * @returns Cleanup function to stop sync
 */
export function startPeriodicSync(
  sessionId: string,
  userId: string,
  intervalMs: number = SYNC_CONFIG.DEFAULT_INTERVAL_MS
): () => void {
  // Validate interval
  const safeInterval = Math.max(
    SYNC_CONFIG.MIN_INTERVAL_MS,
    Math.min(SYNC_CONFIG.MAX_INTERVAL_MS, intervalMs)
  );

  // Stop existing sync for this session
  stopPeriodicSync(sessionId);

  // Create new sync state
  const state: PeriodicSyncState = {
    intervalId: null,
    userId,
    sessionId,
    syncCount: 0,
    lastSyncTime: Date.now(),
    isActive: true,
  };

  // Start interval
  state.intervalId = setInterval(async () => {
    if (!state.isActive) return;

    try {
      await performSync(state);
    } catch (error) {
      log.warn({ error, sessionId, userId }, 'Periodic sync failed');
    }
  }, safeInterval);

  syncStates.set(sessionId, state);

  diag.session('🔄 Periodic sync started', {
    sessionId,
    userId,
    intervalMs: safeInterval,
  });

  // Return cleanup function
  return () => stopPeriodicSync(sessionId);
}

/**
 * Stop periodic sync for a session
 */
export function stopPeriodicSync(sessionId: string): void {
  const state = syncStates.get(sessionId);

  if (state) {
    state.isActive = false;

    if (state.intervalId) {
      clearInterval(state.intervalId);
      state.intervalId = null;
    }

    diag.session('🛑 Periodic sync stopped', {
      sessionId,
      userId: state.userId,
      totalSyncs: state.syncCount,
    });

    syncStates.delete(sessionId);
  }
}

/**
 * Trigger an immediate sync (e.g., before risky operation)
 */
export async function triggerImmediateSync(sessionId: string): Promise<boolean> {
  const state = syncStates.get(sessionId);

  if (!state || !state.isActive) {
    log.debug({ sessionId }, 'No active sync state for immediate sync');
    return false;
  }

  try {
    await performSync(state);
    return true;
  } catch (error) {
    log.warn({ error, sessionId }, 'Immediate sync failed');
    return false;
  }
}

/**
 * Get sync status for a session
 */
export function getSyncStatus(sessionId: string): {
  isActive: boolean;
  syncCount: number;
  lastSyncTime: number;
  timeSinceLastSync: number;
} | null {
  const state = syncStates.get(sessionId);

  if (!state) {
    return null;
  }

  return {
    isActive: state.isActive,
    syncCount: state.syncCount,
    lastSyncTime: state.lastSyncTime,
    timeSinceLastSync: Date.now() - state.lastSyncTime,
  };
}

/**
 * Stop all active syncs (for shutdown)
 */
export function stopAllPeriodicSyncs(): void {
  for (const [sessionId] of syncStates) {
    stopPeriodicSync(sessionId);
  }

  log.info('All periodic syncs stopped');
}

// ============================================================================
// INTERNAL FUNCTIONS
// ============================================================================

/**
 * Perform the actual sync operation
 */
async function performSync(state: PeriodicSyncState): Promise<void> {
  const startTime = Date.now();

  // 1. Sync deep understanding profiles
  await deepUnderstandingPeriodicSync(state.userId);

  // 2. Update state
  state.syncCount++;
  state.lastSyncTime = Date.now();

  const duration = Date.now() - startTime;

  log.debug(
    {
      sessionId: state.sessionId,
      userId: state.userId,
      syncCount: state.syncCount,
      durationMs: duration,
    },
    '✅ Periodic sync complete'
  );

  // Log every 3rd sync for visibility
  if (state.syncCount % 3 === 0) {
    diag.session('🔄 Periodic sync checkpoint', {
      sessionId: state.sessionId,
      totalSyncs: state.syncCount,
    });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  startPeriodicSync,
  stopPeriodicSync,
  triggerImmediateSync,
  getSyncStatus,
  stopAllPeriodicSyncs,
};
